# E4: Knowledge Library — syntetiserade kunskapsartiklar med versionering

## Bakgrund

Aurora-grafen lagrar idag kunskap som **atomära fakta** (enskilda noder av typ `fact`, `document`, `transcript`). Det fungerar för sökning och recall, men saknar en högre abstraktionsnivå: **sammanfattande artiklar** som väver ihop fakta till sammanhängande förståelse.

E1–E3 byggde en autonom kunskapscykel: KM skannar luckor → söker webben → lagrar fakta → kör automatiskt. Men resultatet är fortfarande lösa fakta-noder. Ingen sammanhängande bild av "vad vet vi om ämne X?".

### Problemet

- **Fakta utan sammanhang:** 50 fakta-noder om "LLM fine-tuning" är svåra att överblicka
- **Ingen historik:** När ny info kommer skrivs den gamla över eller drunknar — ingen "det här visste vi i mars"
- **Ingen syntes:** `briefing()` ger en tillfällig sammanfattning, men den sparas inte och uppdateras inte
- **Import saknas:** Kursmaterial, mötesanteckningar, roadmaps kan inte bli del av kunskapsbiblioteket på ett strukturerat sätt

### Vad E4 lägger till

1. **Kunskapsartiklar** — ny nodtyp `article` som syntetiserar fakta till läsbara markdown-dokument
2. **Versionering** — uppdateringar skapar nya versioner, gamla bevaras som historik
3. **Import** — markdown-filer kan importeras som artiklar (för kursmaterial, mötesanteckningar, etc.)
4. **Domäner** — flexibel taggning (ai, pm, project, technical, etc.) utan hård enum
5. **KM-integration** — KM syntetiserar/uppdaterar artiklar efter research-fasen

## Datamodell

### Artiklar som aurora_nodes

Artiklar använder befintlig `aurora_nodes`-tabell med `type = 'article'`. Ingen ny tabell behövs — JSONB-properties ger flexibilitet.

```typescript
// Artikel-nodens properties-schema:
interface ArticleProperties {
  content: string;              // Markdown-text (artikelns brödtext)
  domain: string;               // 'ai' | 'pm' | 'project' | 'technical' | valfri sträng
  tags: string[];               // Fritext-taggar för filtrering
  concepts: string[];           // Extraherade nyckelbegrepp (3-7 st), t.ex. ["Agile", "Scrum", "Sprint"]
                                // Förberedelse för E4b ontologi — begreppen blir concept-noder senare
  version: number;              // 1, 2, 3... (ökar vid uppdatering)
  previousVersionId: string | null;  // Länk till föregående version
  sourceNodeIds: string[];      // Vilka fakta/dokument-noder artikeln bygger på
  synthesizedBy: string;        // 'km-auto' | 'manual-import' | 'manual-cli'
  synthesisModel: string;       // 'claude-haiku-4-5' etc.
  wordCount: number;
  abstract: string;             // 1-2 meningar sammanfattning (för listning)
}
```

### Kant-typer (edges)

Använd befintliga edge-typer + nya:

| Edge | Från → Till | Betydelse |
|------|------------|-----------|
| `summarizes` (NY) | article → fact/document | Artikeln sammanfattar denna källa |
| `supersedes` (NY) | article v2 → article v1 | Ny version ersätter gammal |
| `broader_than` (NY) | concept → concept | Hierarkisk relation (E4b förberett) |
| `related_to` | article → article | Relaterade ämnen |
| `derived_from` | article → document | Artikeln bygger på detta dokument |

> **Not:** `broader_than` används inte i E4 men skapas i migrationen för att E4b (ontologi) ska kunna bygga vidare utan ny migration.

**Migration 013** lägger till stöd för nya edge-typer (om de behöver valideras) och index för artikel-queries.

```sql
-- Migration 013: Knowledge Library
-- Index för att snabbt hitta artiklar
CREATE INDEX idx_aurora_nodes_article_type
  ON aurora_nodes (type, created DESC)
  WHERE type = 'article';

-- Index för versionskedja (hitta senaste version)
CREATE INDEX idx_aurora_edges_supersedes
  ON aurora_edges (from_id, type)
  WHERE type = 'supersedes';

-- Index för att hitta artiklar per domän (properties->>'domain')
CREATE INDEX idx_aurora_nodes_article_domain
  ON aurora_nodes ((properties->>'domain'))
  WHERE type = 'article';
```

## Uppgifter

### 1. Artikelmodul — `src/aurora/knowledge-library.ts`

Kärnmodulen för CRUD + syntes:

```typescript
// === CRUD ===

export async function createArticle(input: {
  title: string;
  content: string;              // Markdown
  domain: string;
  tags?: string[];
  sourceNodeIds?: string[];     // Koppla till befintliga noder
  synthesizedBy: string;
  synthesisModel?: string;
}): Promise<ArticleNode>
// 1. Skapa aurora_node med type='article', properties enligt schema
// 2. Skapa 'summarizes'-kanter till sourceNodeIds
// 3. Generera embedding (hela content-texten)
// 4. Returnera noden

export async function getArticle(articleId: string): Promise<ArticleNode | null>
// Hämta artikel med alla properties

export async function listArticles(options?: {
  domain?: string;
  tags?: string[];
  limit?: number;
  includeOldVersions?: boolean;  // default false — bara senaste
}): Promise<ArticleSummary[]>
// Returnera title, abstract, domain, tags, version, confidence, updated
// Exkludera gamla versioner som default (har previousVersionId som pekar hit)

export async function searchArticles(
  query: string,
  options?: { domain?: string; minSimilarity?: number; limit?: number }
): Promise<ArticleSearchResult[]>
// Semantisk sökning filtrerad till type='article'
// Returnerar med similarity-score

export async function getArticleHistory(articleId: string): Promise<ArticleNode[]>
// Följ supersedes-kedjan bakåt → returnera alla versioner (nyast först)

// === UPPDATERING MED VERSIONERING ===

export async function updateArticle(
  articleId: string,
  updates: {
    content: string;
    sourceNodeIds?: string[];
    synthesizedBy: string;
    synthesisModel?: string;
  }
): Promise<ArticleNode>
// 1. Hämta befintlig artikel
// 2. Skapa NY nod med version + 1, previousVersionId = gammal
// 3. Skapa 'supersedes'-kant: ny → gammal
// 4. Flytta 'summarizes'-kanter till ny nod (eller skapa nya)
// 5. Generera ny embedding
// 6. Sänk gammal nods confidence (historisk)
// 7. Returnera nya noden
// OBS: Gamla noden RADERAS INTE — den blir historik

// === IMPORT ===

export async function importArticle(input: {
  title: string;
  content: string;              // Markdown-text
  domain: string;
  tags?: string[];
  sourceUrl?: string;           // Valfri — varifrån materialet kommer
}): Promise<ArticleNode>
// 1. Skapa artikel via createArticle() med synthesizedBy='manual-import'
// 2. Om sourceUrl finns, försök hitta befintlig document-nod att länka till
// 3. Returnera noden

// === SYNTES (LLM) ===

export async function synthesizeArticle(
  topic: string,
  options?: {
    domain?: string;
    maxSources?: number;         // default 15
    model?: string;              // default 'claude-haiku-4-5-20251001'
  }
): Promise<ArticleNode>
// 1. Samla källor:
//    a) recall(topic) → fakta-noder (max 10)
//    b) searchAurora(topic) → dokument/transcript-noder (max 10)
//    c) getGaps(topic) → öppna luckor (för "vad vet vi inte"-sektion)
//    d) getCrossRefs() → Neuron-kopplingar (max 5)
// 2. Filtrera + ranka efter relevans (cosine similarity) + confidence
// 3. Anropa LLM med syntes-prompt:
//    - Input: sorterade källor med citat + luckor
//    - Output: strukturerad markdown-artikel + JSON-block med:
//      - abstract (1-2 meningar)
//      - concepts (3-7 nyckelbegrepp)
//      - conceptHierarchy (föreslagna parent-begrepp, loggas för E4b)
// 4. Parsa LLM-svar: extrahera markdown-content + JSON-block
// 5. Skapa artikel via createArticle() med concepts från JSON
// 6. Logga conceptHierarchy (t.ex. audit eller console) — E4b använder detta
// 7. Returnera noden

export async function refreshArticle(
  articleId: string,
  options?: { model?: string }
): Promise<ArticleNode>
// 1. Hämta befintlig artikel
// 2. Kör synthesizeArticle() med samma topic (från title)
// 3. Jämför nytt content med gammalt
// 4. Om väsentligt annorlunda: updateArticle() → ny version
// 5. Om ≈ samma: uppdatera bara timestamp, returnera befintlig
```

### 2. Syntes-prompt — `prompts/article-synthesis.md`

```markdown
Du är en kunskapssammanfattare. Skriv en faktabaserad artikel baserad på källorna nedan.

## Instruktioner
- Skriv i markdown-format
- Börja med en 1-2 meningars sammanfattning (abstract)
- Organisera huvudinnehållet logiskt per delämne
- Citera källor med [källa: <title>]
- Avsluta med "Öppna frågor" om det finns kunskapsluckor
- Var faktabaserad — spekulera inte
- Skriv på samma språk som källorna
- Håll artikeln mellan 300-1500 ord

## Källor
{{sources}}

## Kunskapsluckor
{{gaps}}

## VIKTIGT: Returnera också följande JSON-block i slutet av svaret:

\```json
{
  "abstract": "1-2 meningar som sammanfattar artikeln",
  "concepts": ["Begrepp1", "Begrepp2", "Begrepp3"],
  "conceptHierarchy": [
    { "concept": "Begrepp1", "broaderConcept": "Övergripande kategori" },
    { "concept": "Begrepp2", "broaderConcept": "Begrepp1" }
  ]
}
\```

Extrahera 3-7 nyckelbegrepp som artikeln handlar om. För varje begrepp,
föreslå ett bredare begrepp (parent) som det hör under. Detta bygger upp en
kunskapstaxonomi över tid. Om inget bredare begrepp passar, sätt null.
```

> **Not:** `concepts` sparas direkt i article properties. `conceptHierarchy` sparas INTE i E4 men **parsas och loggas** — detta är input-data för E4b:s ontologi-byggare.

### 3. KM-integration

Utöka `runAutoKM()` i `src/core/auto-km.ts` (ELLER KM-agentens report-fas) så att den efter research-fasen:

1. Kollar om det finns en befintlig artikel för det topic som researchades
2. Om ja: `refreshArticle()` — uppdatera med nya fakta
3. Om nej och ≥3 nya fakta lärdes: `synthesizeArticle()` — skapa ny artikel
4. Logga artikelaktivitet i KM-rapporten

Lägg till i `KMReport`:
```typescript
interface KMReport {
  // ... befintliga fält ...
  articlesCreated: number;
  articlesUpdated: number;
}
```

### 4. CLI — `library`-kommando

```bash
# Lista artiklar
npx tsx src/cli.ts library
npx tsx src/cli.ts library --domain ai
npx tsx src/cli.ts library --domain pm --tags "agile,scrum"

# Sök artiklar
npx tsx src/cli.ts library search "confidence decay"

# Läs en artikel
npx tsx src/cli.ts library read <article-id>

# Visa versionshistorik
npx tsx src/cli.ts library history <article-id>

# Importera markdown som artikel
npx tsx src/cli.ts library import ./kursmaterial/agile-basics.md --domain pm --tags "agile,kurs"

# Syntetisera ny artikel från befintlig kunskap
npx tsx src/cli.ts library synthesize "LLM fine-tuning techniques" --domain ai

# Uppdatera/refresha befintlig artikel
npx tsx src/cli.ts library refresh <article-id>
```

Implementera i `src/commands/knowledge-library.ts`.

### 5. MCP-tool

Registrera i `src/mcp/tools/knowledge-library.ts`:

```typescript
// neuron_knowledge_library — huvudtool med action-parameter
server.tool('neuron_knowledge_library', 'Manage the knowledge library...', {
  action: z.enum(['list', 'search', 'read', 'history', 'synthesize', 'refresh', 'import']),
  // action-specifika parametrar:
  query: z.string().optional(),          // för search
  articleId: z.string().optional(),      // för read/history/refresh
  topic: z.string().optional(),          // för synthesize
  domain: z.string().optional(),         // för list/synthesize/import
  tags: z.array(z.string()).optional(),  // för list/import
  title: z.string().optional(),          // för import
  content: z.string().optional(),        // för import
  limit: z.number().optional(),          // för list/search
}, handler);
```

### 6. Migration 013

```sql
-- 013_knowledge_library.sql
-- Indexes for article queries (nodes use existing aurora_nodes table)

CREATE INDEX IF NOT EXISTS idx_aurora_nodes_article_type
  ON aurora_nodes (type, created DESC)
  WHERE type = 'article';

CREATE INDEX IF NOT EXISTS idx_aurora_edges_supersedes
  ON aurora_edges (from_id, type)
  WHERE type = 'supersedes';

CREATE INDEX IF NOT EXISTS idx_aurora_nodes_article_domain
  ON aurora_nodes ((properties->>'domain'))
  WHERE type = 'article';
```

### 7. Tester

Skapa `tests/aurora/knowledge-library.test.ts`:
- `createArticle()` skapar nod med rätt type och properties
- `createArticle()` skapar summarizes-kanter till sourceNodeIds
- `getArticle()` returnerar artikel med alla properties
- `getArticle()` returnerar null för okänt id
- `listArticles()` exkluderar gamla versioner som default
- `listArticles()` filtrerar på domain
- `listArticles()` filtrerar på tags
- `listArticles({ includeOldVersions: true })` inkluderar alla
- `searchArticles()` hittar artiklar via semantisk sökning
- `updateArticle()` skapar ny version med version + 1
- `updateArticle()` skapar supersedes-kant
- `updateArticle()` bevarar gamla versionen
- `getArticleHistory()` returnerar alla versioner i ordning
- `importArticle()` skapar artikel med synthesizedBy='manual-import'
- `synthesizeArticle()` samlar källor och genererar artikel (mocka LLM)
- `synthesizeArticle()` parsar concepts från LLM-svar och sparar i properties
- `synthesizeArticle()` loggar conceptHierarchy (för framtida ontologi)
- `synthesizeArticle()` skapar summarizes-kanter till alla använda källor
- `refreshArticle()` skapar ny version om content ändrats
- `refreshArticle()` behåller befintlig om content ≈ samma

Skapa `tests/commands/knowledge-library.test.ts`:
- CLI list-kommandot anropar listArticles()
- CLI search anropar searchArticles()
- CLI import anropar importArticle()
- CLI synthesize anropar synthesizeArticle()

Uppdatera `tests/core/auto-km.test.ts`:
- Auto-KM syntetiserar artikel efter ≥3 nya fakta
- KMReport innehåller articlesCreated/articlesUpdated

Minst **20 nya tester** totalt.

## Designbeslut

### Varför artiklar i aurora_nodes (inte ny tabell)?
- Återanvänder embeddings, sökning, cross-refs, confidence — allt funkar automatiskt
- JSONB properties ger flexibilitet utan nya migrationer
- Artiklarna dyker upp i `searchAurora()` och `briefing()` automatiskt

### Varför versionering via nod-kedja (inte kolumn)?
- Varje version har sin egen embedding (sökning hittar rätt version)
- Gamla versioner behåller sitt confidence-värde vid tidpunkten
- `getArticleHistory()` ger en tidslinje av hur förståelsen utvecklades
- Enkelt att rulla tillbaka: peka bara om "senaste"-referensen

### Varför Haiku för syntes?
- Kostnadseffektivt (artiklar syntetiseras ofta)
- Haiku redan bevisat i briefing() — funkar bra för sammanfattning
- Konfigurerbart via `model`-parameter om man vill använda bättre modell

### Varför flexibel domain (string, inte enum)?
- Stöder framtida domäner utan kodändring: 'ai', 'pm', 'devops', 'security', 'research', 'meeting-notes', 'course-material', ...
- Inga migrationer behövs för nya kunskapsområden
- Filtrering fungerar ändå via index på `properties->>'domain'`

## Avgränsningar

- Ändra INTE befintliga Aurora-moduler (memory.ts, intake.ts, briefing.ts, search.ts)
- Ändra INTE KnowledgeManagerAgent-klassen — utöka auto-km.ts istället
- Max 15 käll-noder per syntes (begränsa LLM-kontext)
- Syntes-prompten är enkel (inte multi-step agent-loop) — Haiku räcker
- Ingen auto-staleness-detektion i E4 (kommer i E5)
- Ingen export till markdown-filer i E4 (artiklar läses via CLI/MCP)
- Ingen cross-artikel-motsägelse-detektion i E4
- Ingen ontologi-byggning i E4 — concepts extraheras och sparas men concept-noder + hierarki skapas i E4b
- conceptHierarchy från LLM loggas men lagras INTE i databasen (E4b gör det)

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `createArticle()` med properties + kanter | Tester |
| `updateArticle()` skapar ny version + supersedes-kant | Tester |
| `listArticles()` exkluderar gamla versioner | Tester |
| `searchArticles()` semantisk sökning | Tester |
| `getArticleHistory()` versionskedja | Tester |
| `importArticle()` för externt material | Tester |
| `synthesizeArticle()` LLM-baserad syntes | Tester (mockad LLM) |
| `refreshArticle()` uppdaterar vid ny info | Tester |
| KM-integration (syntes efter research) | Tester |
| Migration 013 (index) | Migration + tester |
| CLI `library` kommando (list/search/read/import/synthesize/refresh) | Tester |
| MCP `neuron_knowledge_library` tool | Tester |
| KMReport utökad (articlesCreated/Updated) | Tester |
| Alla befintliga tester gröna | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |
| ≥20 nya tester | `pnpm test` |

## Risk

**Medel.** LLM-syntes introducerar icke-deterministiskt beteende — tester måste mocka LLM-anrop. Ny nodtyp 'article' påverkar inte befintliga queries (type-filtrering skyddar). Versionering via nod-kedja är enkel men kräver korrekt edge-hantering.

**Rollback:** `git revert <commit>` + ta bort migration 013.

## Framtida steg

- **E4b: Ontologi** — concept-noder + hierarki (broader_than-kanter) + auto-extraktion + browse-kommando. Bygger på concepts-fältet och conceptHierarchy som E4 redan producerar.
- **E5: Topic chaining** — KM hittar nya luckor → nästa auto-KM tar vid
- **E5b: Auto-staleness** — nya fakta flaggar relaterade artiklar som stale
- **E6: Historiska queries** — "Vad visste vi om X i mars 2026?"
- **E6b: Artikel-export** — exportera till markdown-filer i `knowledge/`-mapp
- **E7: Cross-artikel-analys** — hitta motsägelser mellan artiklar
- **E7b: Domänspecifik freshness** — AI-kunskap åldras snabbt, PM-metodik långsamt
