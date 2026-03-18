# E4b: Ontologi — automatiskt växande kunskapstaxonomi

## Bakgrund

E4 skapade Knowledge Library med artiklar som syntetiseras från fakta. Varje artikel extraherar **concepts** (3-7 nyckelbegrepp) och LLM:en föreslår **conceptHierarchy** (vilka begrepp som hör under vilka). Men i E4 sparas bara concept-namnen som strängar i article properties — ingen struktur, inga noder, ingen navigerbar hierarki.

E4b tar steget vidare: begreppen blir **riktiga noder** i grafen med hierarkiska relationer. Resultatet är en **ontologi** — ett begreppsträd som växer automatiskt varje gång en artikel skapas eller importeras.

### Vad som redan finns (från E4)

- `article.properties.concepts: string[]` — extraherade begrepp per artikel
- `conceptHierarchy` — LLM:ens förslag på parent-begrepp (loggas men sparas inte)
- `broader_than` edge-typ — skapad i migration 013 men oanvänd
- Index på `aurora_nodes` för type-filtrering

### Vad E4b lägger till

1. **Concept-noder** — ny nodtyp `concept` i aurora_nodes
2. **Hierarkiska kanter** — `broader_than` kopplar begrepp i träd-struktur
3. **Artikel→concept-kanter** — `about` kopplar artiklar till sina begrepp
4. **Auto-extraktion** — vid artikel-skapande skapas/återanvänds concept-noder
5. **Ontologi-merge** — nya begrepp matchas semantiskt mot befintliga (undvik dubbletter)
6. **Browse-kommando** — navigera kunskapsträdet via CLI och MCP
7. **Standard-alignment** — SKOS/Schema.org/DC-mappning via `standardRefs` i properties
8. **Metadata-referensdokument** — `docs/metadata-standards.md` som levande referens

> **Se:** `docs/metadata-standards.md` för komplett standard-mappning och framtida planerade standarder.

## Datamodell

### Concept-noder

```typescript
// Concept-nodens properties:
interface ConceptProperties {
  description: string;          // Kort beskrivning av begreppet (1-2 meningar)
  domain: string;               // Ärvs från artikeln som skapade begreppet
  facet: string;                // Vilken TYP av begrepp: 'topic' | 'entity' | 'method' | 'domain' | 'tool'
                                //   topic    = ämne/teori (LLM, Agile, RAG)
                                //   entity   = organisation/person/institut (OpenAI, Stanford, Sam Altman)
                                //   method   = metodik/process (RLHF, Scrum, Sprint Planning)
                                //   domain   = tillämpningsområde (Healthcare AI, Kodgenerering)
                                //   tool     = verktyg/produkt (GPT-5, Jira, TypeScript)
                                // Flexibel string — nya facetter kan läggas till utan kodändring
  aliases: string[];            // Alternativa namn, t.ex. ["PM", "Projektledning", "Project Management"]
  articleCount: number;         // Antal artiklar som refererar till detta begrepp
  depth: number;                // 0 = rot, 1 = första nivån, etc.

  // === STANDARD-ALIGNMENT (valfritt, utökas löpande) ===
  standardRefs?: {
    // Ontologi-mappning
    skos?: string;              // 'skos:Concept', 'skos:ConceptScheme', etc.
    schema?: string;            // 'schema:Organization', 'schema:Person', 'schema:SoftwareApplication'

    // Persistenta identifierare (gör entities länkbara)
    wikidata?: string;          // 'Q312' (OpenAI), 'Q21198' (Claude)
    orcid?: string;             // '0000-0002-1825-0097' (forskare)
    ror?: string;               // 'https://ror.org/03yrm5c26' (organisationer)
    doi?: string;               // '10.1038/...' (publikationer)
    isni?: string;              // '0000 0001 2156 2780' (kreatörer)

    // Multimedia (framtida — EBUCore+, IPTC)
    ebucore?: string;           // EBUCore+ typ-mappning
    iptc?: string;              // IPTC-typ
  };
  // OBS: Hela standardRefs är valfritt. Fältet kostar ingenting (JSONB)
  // men framtidssäkrar mot persistenta identifierare och interoperabilitet.
  // Se docs/metadata-standards.md för komplett referens.
}

// aurora_nodes entry:
{
  id: 'concept_<slug>',        // t.ex. 'concept_agile', 'concept_sprint-planning'
  type: 'concept',
  title: 'Sprint Planning',     // Kanoniskt namn
  properties: ConceptProperties,
  confidence: 0.8,              // Aggregerad från artiklarnas confidence
  scope: 'shared',
  embedding: vector(1024)       // Embedding av title + description
}
```

> **Facetter** gör att ontologin inte blir endimensionell. En artikel om "GPT-5 och RLHF" skapar
> concepts i FLERA facetter: `GPT-5` (tool), `OpenAI` (entity), `RLHF` (method), `LLM` (topic).
> Browse-kommandot kan filtrera per facett: `library browse --facet entity` visar bara organisationer/personer.

### Kanter

| Edge | Från → Till | Betydelse |
|------|------------|-----------|
| `broader_than` | concept → concept | Hierarki: "PM" broader_than "Agile" |
| `about` (NY) | article → concept | Artikeln handlar om detta begrepp |

### Ontologi-exempel (multi-facett)

En artikel: *"OpenAI releases GPT-5 with improved RLHF"* genererar:

```
Extraherade concepts:
  GPT-5        (facet: tool)    → broader: Large Language Models
  OpenAI       (facet: entity)  → broader: AI Companies
  RLHF         (facet: method)  → broader: Fine-tuning
  LLM          (facet: topic)   → broader: AI
```

Över tid växer ontologin i **flera dimensioner**:

```
TOPICS (ämnen)                    ENTITIES (aktörer)
├── AI                            ├── AI Companies
│   ├── Large Language Models      │   ├── OpenAI
│   │   ├── Fine-tuning            │   ├── Anthropic
│   │   ├── Prompt Engineering     │   └── Google DeepMind
│   │   └── RAG                   ├── Universities
│   ├── Agent Systems              │   ├── Stanford
│   │   ├── Tool Use               │   └── MIT
│   │   └── Multi-Agent           └── Researchers
│   └── Embeddings                     ├── Sam Altman
│       └── Vector Search              └── Dario Amodei
├── Project Management
│   ├── Agile                     METHODS (metodik)
│   │   ├── Scrum                 ├── Training Methods
│   │   │   ├── Sprint Planning   │   ├── RLHF
│   │   │   └── Retrospective     │   ├── DPO
│   │   └── Kanban                │   └── Fine-tuning
│   └── Risk Management           └── PM Processes
└── Software Engineering               ├── Sprint Planning
    ├── TypeScript                     └── Retrospective
    └── Testing
                                  TOOLS (verktyg)
                                  ├── LLMs
                                  │   ├── GPT-5
                                  │   ├── Claude
                                  │   └── Gemini
                                  └── PM Tools
                                      └── Jira
```

> **Notera:** Ett begrepp som "Sprint Planning" kan existera i BÅDE topics (under Scrum)
> och methods (som process). Facetten avgör i vilken dimension det hamnar.
> Cross-facett-relationer (`related_to`) kopplar dem.

## Uppgifter

### 1. Ontologi-modul — `src/aurora/ontology.ts`

```typescript
// === CONCEPT CRUD ===

export async function getOrCreateConcept(input: {
  name: string;                   // Begrepp att hitta eller skapa
  description?: string;
  domain?: string;
  facet?: string;                 // 'topic' | 'entity' | 'method' | 'domain' | 'tool'
  broaderConceptName?: string;    // Föreslaget parent-begrepp
  standardRefs?: Record<string, string>;  // Valfri standard-alignment (wikidata, orcid, schema, etc.)
}): Promise<ConceptNode>
// 1. Sök befintliga concept-noder semantiskt (embedding-likhet ≥ 0.85)
// 2. Om match: returnera befintlig (uppdatera aliases om annat namn)
// 3. Om ingen match: skapa ny concept-nod
// 4. Om broaderConceptName: getOrCreateConcept() rekursivt för parent
//    → skapa broader_than-kant
// 5. Generera embedding
// 6. Returnera noden
//
// VIKTIGT: Semantisk dedup förhindrar dubbletter.
// "Sprint Planning" och "Planning av Sprints" → samma concept-nod.

export async function getConcept(conceptId: string): Promise<ConceptNode | null>

export async function listConcepts(options?: {
  domain?: string;
  facet?: string;                // Filtrera på facett ('topic', 'entity', etc.)
  rootsOnly?: boolean;           // Bara toppnivå (inga parents)
  parentId?: string;             // Barn till specifik concept
}): Promise<ConceptNode[]>

export async function getConceptTree(
  rootId?: string,               // null = hela trädet
  maxDepth?: number              // default 5
): Promise<ConceptTreeNode[]>
// Returnerar hierarkiskt träd:
// { concept: ConceptNode, children: ConceptTreeNode[], articles: ArticleSummary[] }

export async function searchConcepts(
  query: string,
  options?: { limit?: number }
): Promise<ConceptSearchResult[]>
// Semantisk sökning bland concept-noder

// === ARTIKEL-KOPPLING ===

export async function linkArticleToConcepts(
  articleId: string,
  concepts: Array<{
    name: string;
    facet?: string;
    broaderConcept?: string | null;
    standardRefs?: Record<string, string>;
  }>,
): Promise<{ conceptsLinked: number; conceptsCreated: number }>
// 1. För varje concept:
//    a) getOrCreateConcept({ name, facet, broaderConceptName }) — med facett + hierarchy
//    b) Skapa 'about'-kant: article → concept
//    c) Uppdatera concept.properties.articleCount
// 2. Returnera statistik
// Bakåtkompatibel: om concepts är string[] (legacy), anta facet='topic'

// === ONTOLOGI-HÄLSA ===

export async function getOntologyStats(): Promise<{
  totalConcepts: number;
  maxDepth: number;
  orphanConcepts: number;         // Concepts utan parent eller children
  domains: Record<string, number>; // Antal concepts per domain
  facets: Record<string, number>;  // Antal concepts per facett
  topConcepts: Array<{ name: string; facet: string; articleCount: number }>;  // Mest använda
}>

export async function suggestMerges(): Promise<Array<{
  concept1: ConceptNode;
  concept2: ConceptNode;
  similarity: number;
  suggestion: string;             // "Merge 'PM' and 'Project Management'?"
}>>
// Hitta concept-par med hög semantisk likhet (≥ 0.80 men < 0.85)
// som borde vara samma begrepp men som slank igenom dedup
```

### 2. Integration med Knowledge Library

Uppdatera `synthesizeArticle()` och `importArticle()` i `knowledge-library.ts`:

```typescript
// I synthesizeArticle(), efter att artikeln skapats:
// 1. Parsa conceptHierarchy från LLM-svar (redan förberett i E4)
// 2. Anropa linkArticleToConcepts(articleId, concepts, conceptHierarchy)

// I importArticle():
// 1. Om inga concepts anges: kör en snabb LLM-prompt för att extrahera concepts
//    (samma prompt som syntes men bara JSON-blocket, inte hela artikeln)
// 2. Anropa linkArticleToConcepts()
```

Skapa en liten hjälp-prompt `prompts/concept-extraction.md`:

```markdown
Extrahera 3-7 nyckelbegrepp från följande text. Klassificera varje begrepp med en facett.

Returnera JSON:

{
  "concepts": [
    { "name": "GPT-5", "facet": "tool", "broaderConcept": "Large Language Models",
      "standardRefs": { "schema": "schema:SoftwareApplication" } },
    { "name": "OpenAI", "facet": "entity", "broaderConcept": "AI Companies",
      "standardRefs": { "schema": "schema:Organization", "wikidata": "Q21298850" } },
    { "name": "RLHF", "facet": "method", "broaderConcept": "Fine-tuning",
      "standardRefs": { "schema": "schema:HowTo" } },
    { "name": "LLM", "facet": "topic", "broaderConcept": "AI",
      "standardRefs": { "skos": "skos:Concept" } }
  ]
}

OBS: standardRefs är valfritt. Fyll i om du känner igen:
- wikidata: Wikidata entity ID (QXX)
- orcid: ORCID iD för forskare (0000-XXXX-XXXX-XXXX)
- ror: ROR-ID för organisationer (https://ror.org/...)
- schema: Schema.org-typ (schema:Organization, schema:Person, etc.)

## Facetter
- **topic** — ämne, teori, forskningsområde (AI, Agile, Embeddings)
- **entity** — organisation, person, universitet, institut (OpenAI, Stanford, Sam Altman)
- **method** — metodik, process, teknik (RLHF, Sprint Planning, TDD)
- **domain** — tillämpningsområde (Healthcare AI, Kodgenerering, DevOps)
- **tool** — verktyg, produkt, modell (GPT-5, Jira, TypeScript)

## Regler
- Extrahera begrepp från FLERA facetter, inte bara ämnen
- Varje begrepp ska ha ett bredare begrepp (parent) om möjligt — null om det är en rot-kategori
- Använd etablerade namn (inte förkortningar om fullständigt namn är vanligare)
- Om en person nämns, extrahera även deras organisation

## Text
{{text}}
```

Denna prompt används för importerade artiklar där det inte finns en syntes-prompt som redan extraherar concepts. Uppdatera även **syntes-prompten** (`prompts/article-synthesis.md`) så att dess JSON-block använder samma facett-format.

### 3. Migration 014

```sql
-- 014_ontology.sql

-- Index för concept-noder
CREATE INDEX IF NOT EXISTS idx_aurora_nodes_concept_type
  ON aurora_nodes (type)
  WHERE type = 'concept';

-- Index för att snabbt hitta children (broader_than-kanter)
CREATE INDEX IF NOT EXISTS idx_aurora_edges_broader
  ON aurora_edges (to_id, type)
  WHERE type = 'broader_than';

-- Index för att hitta artiklar per concept (about-kanter)
CREATE INDEX IF NOT EXISTS idx_aurora_edges_about
  ON aurora_edges (to_id, type)
  WHERE type = 'about';
```

### 4. CLI — `library browse` + `library concepts`

Utöka befintligt `library`-kommando:

```bash
# Visa ontologiträdet (alla facetter)
npx tsx src/cli.ts library browse
# Output grupperat per facett:
# ── TOPICS ──
# AI (12 artiklar)
# ├── Large Language Models (5)
# │   ├── Fine-tuning (2)
# │   └── RAG (3)
# └── Agent Systems (4)
# Project Management (8)
# └── Agile (6)
#
# ── ENTITIES ──
# AI Companies (3 artiklar)
# ├── OpenAI (2)
# └── Anthropic (1)
#
# ── METHODS ──
# Training Methods (4 artiklar)
# └── RLHF (3)

# Filtrera per facett
npx tsx src/cli.ts library browse --facet entity
npx tsx src/cli.ts library browse --facet topic

# Visa sub-träd
npx tsx src/cli.ts library browse --concept "Agile"

# Visa artiklar för ett begrepp
npx tsx src/cli.ts library concepts "Scrum"
# Output:
# Scrum (4 artiklar, 3 sub-begrepp)
#   Artiklar:
#     - "Scrum Fundamentals" (2026-03-14, v2, 0.85)
#     - "Advanced Sprint Techniques" (2026-03-15, v1, 0.78)
#   Sub-begrepp: Sprint Planning, Sprint Review, Retrospective

# Visa ontologi-statistik
npx tsx src/cli.ts library stats
# Output:
# Concepts: 47 | Max depth: 4 | Domains: ai(23), pm(18), tech(6)
# Top: "Agile" (6 artiklar), "LLM" (5), "Testing" (4)
# Föreslagna merges: 2 (kör 'library merge-suggestions')

# Visa merge-förslag
npx tsx src/cli.ts library merge-suggestions
```

### 5. MCP-tool

Utöka `neuron_knowledge_library` med nya actions:

```typescript
action: z.enum([
  // Befintliga från E4:
  'list', 'search', 'read', 'history', 'synthesize', 'refresh', 'import',
  // Nya i E4b:
  'browse',              // Visa ontologiträd
  'concepts',            // Visa artiklar för ett begrepp
  'ontology_stats',      // Statistik
  'merge_suggestions',   // Föreslagna merges
]),
// Nya parametrar:
conceptName: z.string().optional(),   // för browse/concepts
facet: z.string().optional(),         // för browse (filtrera per facett)
maxDepth: z.number().optional(),      // för browse
```

### 6. Tester

Skapa `tests/aurora/ontology.test.ts`:
- `getOrCreateConcept()` skapar ny concept-nod med facet
- `getOrCreateConcept()` returnerar befintlig vid semantisk match
- `getOrCreateConcept()` lägger till alias vid namnvariant
- `getOrCreateConcept()` skapar broader_than-kant till parent
- `getOrCreateConcept()` skapar parent rekursivt om den saknas
- `getOrCreateConcept()` defaultar till facet='topic' om ej angiven
- `listConcepts()` filtrerar på domain
- `listConcepts({ facet: 'entity' })` filtrerar på facett
- `listConcepts({ rootsOnly: true })` returnerar bara rötter
- `listConcepts({ parentId })` returnerar barn
- `getConceptTree()` returnerar hierarkiskt träd
- `getConceptTree()` respekterar maxDepth
- `searchConcepts()` hittar via semantisk sökning
- `linkArticleToConcepts()` skapar about-kanter med facett-info
- `linkArticleToConcepts()` skapar nya concepts vid behov
- `linkArticleToConcepts()` uppdaterar articleCount
- `linkArticleToConcepts()` hanterar legacy string[] format
- `getOntologyStats()` returnerar facets-fördelning
- `suggestMerges()` hittar liknande concept-par

Skapa `tests/commands/ontology.test.ts`:
- CLI browse visar trädstruktur grupperat per facett
- CLI browse --facet filtrerar korrekt
- CLI concepts visar artiklar per begrepp
- CLI stats visar ontologi-statistik med facetter

Uppdatera `tests/aurora/knowledge-library.test.ts`:
- `synthesizeArticle()` anropar linkArticleToConcepts() med facett-data
- `importArticle()` extraherar concepts med facetter via LLM

Minst **20 nya tester** totalt.

## Designbeslut

### Varför standardRefs som JSONB (inte separata kolumner)?
- Nya standarder läggs till utan migration (bara nytt fält i JSONB)
- Fältet är valfritt — noder utan standardrefs fungerar exakt som förut
- Olika facetter behöver olika identifierare (entity → wikidata/ror, person → orcid)
- `docs/metadata-standards.md` dokumenterar vilka fält som stöds och varför
- Framtida export till RDF/JSON-LD kan mappa direkt från standardRefs

### Varför semantisk dedup för concepts (inte exakt string match)?
- "Sprint Planning" och "Planning av Sprints" ska vara samma begrepp
- "PM" och "Project Management" ska matcha
- Samma logik som `remember()` redan använder (beprövat mönster)
- Threshold 0.85 balanserar precision vs recall

### Varför rekursiv getOrCreateConcept() för hierarchy?
- LLM kan föreslå "Sprint Planning → Scrum → Agile → PM" — hela kedjan skapas automatiskt
- Undviker att man måste skapa parents manuellt först
- Idempotent: om "Agile" redan finns hoppar den över

### Varför articleCount som denormaliserad property?
- Snabb sortering/filtrering utan JOIN
- Uppdateras vid linkArticleToConcepts()
- Acceptabelt att den kan bli lite ur synk (inte kritiskt)

### Varför inte LLM för merge-beslut?
- `suggestMerges()` identifierar kandidater via embedding-likhet
- Faktisk merge görs manuellt (CLI-kommando) — för riskabelt att auto-merga
- Kan automatiseras i framtida version om det fungerar bra

## Avgränsningar

- Ändra INTE befintliga Aurora-moduler (memory.ts, intake.ts, briefing.ts)
- Ändra INTE KnowledgeManagerAgent
- Concept-merge är BARA förslag — ingen auto-merge
- Max rekursionsdjup 5 för getOrCreateConcept() (undvik oändlig loop)
- Concept-noder skapas BARA via artiklar (inte manuellt i E4b)
- Ingen "concept-redigering" UI — bara browse och stats

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `getOrCreateConcept()` med semantisk dedup + facet | Tester |
| Hierarkiska broader_than-kanter | Tester |
| Facetter (topic/entity/method/domain/tool) på concepts | Tester |
| `linkArticleToConcepts()` kopplar artiklar med facett-data | Tester |
| `getConceptTree()` returnerar hierarki | Tester |
| `listConcepts({ facet })` filtrerar per facett | Tester |
| `synthesizeArticle()` skapar concept-noder med facetter | Tester |
| `importArticle()` extraherar concepts + facetter via LLM | Tester |
| `getOntologyStats()` statistik inkl. facett-fördelning | Tester |
| `suggestMerges()` hittar dubbletter | Tester |
| Concept-extraction prompt med facett-instruktioner | Prompt-fil |
| Migration 014 (index) | Migration + tester |
| CLI browse (grupperat per facett) + --facet filter | Tester |
| MCP utökad med browse/concepts/stats + facet-param | Tester |
| Alla befintliga tester gröna | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |
| ≥20 nya tester | `pnpm test` |

## Risk

**Medel.** Semantisk concept-dedup kan ge false positives (två begrepp slås ihop felaktigt) eller false negatives (dubbletter skapas). Threshold 0.85 är konservativ. `suggestMerges()` fångar upp det som slår igenom. Rekursiv concept-skapning kan ge djupa kedjor — maxdjup 5 skyddar.

**Rollback:** `git revert <commit>` + ta bort migration 014.

## Framtida steg

- **E4c: EBUCore+ alignment** — mappa multimedia-noder (transcript, voice_print, speaker_identity) till EBUCore+ properties
- **E4d: Persistent identifiers** — auto-lookup av Wikidata/ORCID/ROR vid concept-skapande (API-anrop)
- **E5: Topic chaining** — KM navigerar ontologin för att hitta tunna områden att researcha
- **E5b: Auto-staleness** — om child-concepts uppdateras, flagga parent-artiklar
- **Concept merge CLI** — `library merge <concept1> <concept2>` för att slå ihop
- **Ontologi-visualisering** — grafisk vy i dashboard
- **Cross-domain discovery** — hitta kopplingar mellan domäner ("AI + PM" → "AI-assisterad PM")
- **RDF/JSON-LD export** — exportera ontologin i standardformat för interoperabilitet
- **PROV-O fördjupning** — fullständig proveniens-kedja: källa → extraktion → modell → tidpunkt

> **Levande referens:** `docs/metadata-standards.md` uppdateras löpande med nya standarder och alignment-beslut.
