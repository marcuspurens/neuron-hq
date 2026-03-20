# Brief: 2.2 Feedback-loop — agenter måste läsa kunskap

**Target:** neuron-hq
**Effort:** 1-2 körningar
**Roadmap:** Fas 2 — Intelligens, punkt 2.2

## Bakgrund

Neuron HQ:s kunskapsgraf har ~924 idénoder, ~200 pattern/error/technique-noder, och PPR-baserad navigering (2.1). Agenterna *kan* läsa grafen via `graph_query`, `graph_traverse`, `graph_semantic_search` och `graph_ppr` — men de gör det sällan. Resultatet: samma misstag upprepas mellan körningar.

**Nuläge:**
- **Manager** pre-injicerar top-5 idéer (globalt rankade, inte brief-specifika) i systemprompt. Har graph-tools tillgängliga men använder dem inkonsekvent.
- **Reviewer** har graph-tools tillgängliga men prompten uppmuntrar dem inte. Ingen pre-injektion.
- **Researcher/Librarian** har graph-tools men använder dem aktivt bara vid explicit graf-uppgifter.

**Problemet:** Kontexten som injiceras är *generisk* (top-5 globala idéer) och *passiv* (agenten måste aktivt välja att anropa tools). En körning om PPR borde automatiskt se tidigare errors/patterns relaterade till grafalgoritmer — men gör det inte.

## Vad ska byggas

### 1. Brief-kontext-extraktor (`src/core/brief-context-extractor.ts`)

En modul som extraherar sökbara nyckelord och koncept från en brief.

**API:**
```typescript
interface BriefContext {
  keywords: string[];       // extraherade nyckelord (max 20)
  nodeTypes: NodeType[];    // vilka nodtyper som är relevanta (alltid minst ['error', 'pattern', 'idea'])
}

function extractBriefContext(briefContent: string): BriefContext;
```

**Extraktionslogik:**
- Parsea brief-markdown: titel, bakgrund, "vad ska byggas", AC:er
- Extrahera nyckelord: tokenisera på whitespace/skiljetecken, lowercase, filtrera stoppord (svenska + engelska lista), filtrera ord kortare än 3 tecken
- Specifika termer som förekommer i kodblock eller som modulnamn/funktionsnamn prioriteras (identifiera via backticks eller camelCase/snake_case-mönster)
- Identifiera relevanta nodtyper baserat på brief-innehåll:
  - Alltid inkludera `error` och `pattern` (de är nästan alltid relevanta)
  - Alltid inkludera `idea`
  - Om briefen nämner "paper", "artikel", "forskning", "research", "study" → inkludera `technique`

**Krav:**
- Ren funktion, inga sidoeffekter
- Max 20 nyckelord (prioritera specifika termer över generiska)
- Hanterar tom/minimal brief gracefully (returnerar tomma arrays)
- Stoppordslista: hardkoda en inline-lista med ~50 vanligaste svenska + ~50 engelska stoppord (och, att, är, det, en, the, is, a, to, of, ...). Inget npm-paket behövs — en enkel `Set<string>` räcker.

### 2. Graf-kontext-hämtare (`src/core/graph-context.ts`)

En modul som hämtar relevanta grafnoder baserat på brief-kontext.

**API:**
```typescript
interface GraphContextResult {
  nodes: Array<{
    node: KGNode;
    relevance: 'high' | 'medium';   // high = keyword match, medium = PPR/recent
    source: 'keyword' | 'ppr' | 'recent';  // recent = senaste errors utan keyword-match
  }>;
  summary: string;   // kort sammanfattning av vad som hittades
}

function getGraphContextForBrief(
  graph: KnowledgeGraph,
  briefContext: BriefContext,
  options?: {
    maxNodes?: number;        // default 15
    includeErrors?: boolean;  // default true — inkludera error-noder från senaste 20 körningarna
    pprSeeds?: string[];      // extra seed-noder för PPR (utöver keyword-matchade)
  }
): GraphContextResult;
```

**Viktigt:** Denna modul anropar **interna metoder** direkt — INTE MCP-tools.

**Verifierade fältnamn på `KGNode` (Zod-schema i `knowledge-graph.ts` rad 41-57):**
- `node.id` — string
- `node.type` — NodeType (`'pattern' | 'error' | 'technique' | 'run' | 'agent' | 'idea'`)
- `node.title` — string
- `node.properties` — `Record<string, unknown>` (description finns som `properties.description`)
- `node.created` — ISO datetime string (**OBS: heter `created`, INTE `createdAt`**)
- `node.updated` — ISO datetime string
- `node.confidence` — number 0-1
- `node.scope` — `'universal' | 'project-specific' | 'unknown'`

**Verifierad `pprQuery`-signatur (knowledge-graph.ts rad 753):**
```typescript
export function pprQuery(
  graph: KnowledgeGraph,
  seedNodeIds: string[],
  options?: {
    limit?: number;
    minScore?: number;
    excludeTypes?: NodeType[];
    excludeIds?: string[];
  },
): Array<{ node: KGNode; score: number }>
```
Throws `Error('At least one seed node required')` om seedNodeIds är tom, och `Error('Node not found: <id>')` om seed-nod saknas i grafen.

**Hämtningslogik (3 steg):**

1. **Keyword-matchning:** Filtrera `graph.nodes` direkt — för varje nyckelord, sök i `node.title` och `node.properties.description` (case-insensitive substring match). Filtrera på relevanta `nodeTypes` från `BriefContext`. Deduplicera. Markera som `relevance: 'high'`.

2. **PPR-expansion:** Om keyword-matchningen gav ≥1 nod: ta deras ID:n som seeds → anropa `pprQuery(graph, seedIds, { limit: 10, minScore: 0.01 })`. Filtrera bort redan matchade noder. Markera som `relevance: 'medium'`. Max 5 PPR-noder. **Om 0 keyword-matchade noder → hoppa över PPR-steget** (`pprQuery` kastar Error vid tom seedIds).

3. **Senaste errors:** Om `includeErrors: true`, hämta error-noder genom att filtrera `graph.nodes` där `node.type === 'error'`, sortera på `node.created` (ISO datetime-sträng, nyast först), ta max 5. Alla noder har `created`-fält (det är required i Zod-schemat). Error-noder som inte keyword-matchar briefen markeras med `relevance: 'medium'` och `source: 'recent'`. Error-noder som ÄVEN keyword-matchar markeras som `relevance: 'high'` och `source: 'keyword'` (de räknas bara en gång).

**Resultat:** Max 15 noder totalt, sorterat: high-relevance först, sedan medium. Om färre hittades, returnera det som finns. Aldrig fyll ut med irrelevanta noder.

**`summary`-fältet:** En template-baserad sträng (ingen AI-generering). Mönster: `Hittade ${patterns} patterns, ${errors} errors, ${ideas} idéer (${pprCount} via PPR).` Om 0 noder: `Inga relevanta noder hittades.`

**Krav:**
- Fungerar utan embeddings/pgvector/Ollama (keyword-matchning + PPR räcker)
- Om graf är tom eller inga noder matchar → returnera `{ nodes: [], summary: 'Inga relevanta noder hittades.' }`
- Deduplicering: en nod ska aldrig finnas dubbelt i resultatet

### 3. Injicera grafkontext i Manager systemprompt

**Plats:** `src/core/agents/manager.ts` — funktionen `buildSystemPrompt()` (ca rad 256-271)

**Nuläge:** Manager injicerar top-5 globalt rankade idéer.

**Nytt:**
- Ersätt den statiska top-5-injektionen med brief-baserad grafkontext
- Grafen laddas via `loadGraph()` (asynkron, redan tillgänglig i körningsflödet — verifiera att `buildSystemPrompt()` har tillgång till den, gör den `async` om nödvändigt)
- Anropa `extractBriefContext(briefContent)` → `getGraphContextForBrief(graph, context)`
- Formatera som markdown-sektion i systemprompt:

```markdown
## Relevant kunskap från grafen

Baserat på briefens innehåll hittade vi följande relevanta noder:

### Patterns & Errors (agera på dessa)
- [P] **Atomic task splitting** (confidence: 0.85) — Bryt ner uppgifter i atomära steg
- [E] **Graph tools timeout** (confidence: 0.7) — Körning 165: graph_query timeout vid >500 noder

### Relaterade idéer (kontext)
- [I] **PPR-reranking i graph_query** (impact: 4, effort: 2) — Använd PPR-scores som sekundär ranking
```

- **Kräv dokumentation i plan:** Lägg till i manager-prompten att Manager MÅSTE skriva en sektion "Grafkontext jag konsumerade" i sin plan. Om inga relevanta noder hittades, skriv "Inga relevanta noder — ny domän."

**Krav:**
- Om `getGraphContextForBrief` returnerar tom lista → injicera inte sektionen (ingen tom sektion)
- Behåll top-5 idéer som fallback om brief-kontext ger <3 noder
- Formatera kompakt — max ~40 rader i systemprompt

### 4. Injicera grafkontext i Reviewer systemprompt

**Plats:** `src/core/agents/reviewer.ts` — funktionen `buildSystemPrompt()` (rad 91)

**Nuläge:** Reviewer har INGEN pre-injicerad grafkontext.

**Nytt:**
- Samma `extractBriefContext()` + `getGraphContextForBrief()` pipeline
- Men Reviewer får en **filtrerad** vy: bara `error` och `pattern` noder (inte idéer)
- Formatera som:

```markdown
## Kända problem och mönster

Dessa errors och patterns från tidigare körningar kan vara relevanta:

- [E] **Test flakiness med vitest mocks** — Körning 158: Mock-state läckte mellan tester
- [P] **Verifiera innan commit** — Kör alltid typecheck + lint + test innan rapport
```

- **Kräv verifiering:** Lägg till i reviewer-prompten: "Kontrollera att implementationen inte upprepar kända errors listade ovan."

**Krav:**
- Max 10 noder för Reviewer (errors + patterns, inga idéer)
- Om inga relevanta errors/patterns → injicera inte sektionen

### 5. Loggning av grafkonsumtion

**Plats:** `runs/<runId>/knowledge.md`

Befintlig artifact. Utöka med:

```markdown
## Grafkontext injicerad

- **Manager:** 12 noder injicerade (3 patterns, 2 errors, 7 idéer)
- **Reviewer:** 5 noder injicerade (2 patterns, 3 errors)
- **Keyword-matchade:** pagerank, ppr, grafnavigering, ...
- **PPR-expanderade:** 4 noder via PPR från keyword-seeds
```

**Krav:**
- Append till befintligt `knowledge.md` (skapa sektionen om den saknas)
- Logga alltid, även om 0 noder injicerades ("Inga relevanta noder hittades")

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/core/brief-context-extractor.ts` | **NY** — extrahera nyckelord från brief |
| `src/core/graph-context.ts` | **NY** — hämta relevanta grafnoder |
| `src/core/agents/manager.ts` | Byt ut statisk idé-injektion mot brief-baserad grafkontext |
| `prompts/manager.md` | Lägg till "Grafkontext jag konsumerade"-krav i plan |
| `src/core/agents/reviewer.ts` | Injicera errors/patterns i systemprompt |
| `prompts/reviewer.md` | Lägg till "Kontrollera kända errors"-krav |
| `src/core/artifacts.ts` | Utöka knowledge.md med grafkonsumtionslogg |
| `tests/core/brief-context-extractor.test.ts` | **NY** — tester |
| `tests/core/graph-context.test.ts` | **NY** — tester |
| `tests/core/agents/manager.test.ts` | Uppdatera för ny grafkontext-injektion |
| `tests/core/agents/reviewer.test.ts` | Uppdatera för ny grafkontext-injektion |

## Filer att INTE ändra

- `src/core/ppr.ts` — PPR-algoritmen är klar
- `src/core/knowledge-graph.ts` — Använd befintlig `loadGraph()`, `pprQuery()` as-is
- `src/mcp/` — Inga MCP-ändringar i denna brief
- `src/core/agents/researcher.ts` — Researcher/Librarian-injektion är framtida scope

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Keyword-extraktion ger dåliga matchningar | Medel | Irrelevanta noder i kontext → brus | Max 15 noder, strikt dedup, relevance-tagging |
| Systemprompt blir för lång | Låg | Token-kostnad ökar | Max 40 rader, kompakt format |
| Manager ignorerar grafkontext | Medel | Ingen effekt av ändringen | Kräv "Grafkontext jag konsumerade" i plan — verifierbart |
| Inga relevanta noder hittas | Låg | Fallback till top-5 idéer | Explicit fallback-logik |

## Acceptanskriterier

### Brief-kontext-extraktor

- **AC1:** `extractBriefContext(briefContent)` returnerar `BriefContext` med keywords och nodeTypes
- **AC2:** Givet en brief som innehåller texten "PPR-algoritm" och "Personalized PageRank" extraheras minst keywords `['ppr', 'pagerank']` och nodeTypes inkluderar `pattern` och `error`
- **AC3:** Givet tom sträng returneras `{ keywords: [], nodeTypes: ['error', 'pattern', 'idea'] }`
- **AC4:** Max 20 keywords returneras, stoppord filtreras bort

### Graf-kontext-hämtare

- **AC5:** `getGraphContextForBrief(graph, context)` returnerar max 15 noder med relevance-tagging
- **AC6:** Keyword-matchade noder har `relevance: 'high'`, PPR-expanderade har `relevance: 'medium'`
- **AC7:** Error-noder inkluderas: filtrera `graph.nodes` där `type === 'error'`, sortera på `node.created` (nyast först), ta max 5. Errors som keyword-matchar → `relevance: 'high'`, övriga → `relevance: 'medium'`
- **AC8:** Om graf är tom → returnerar `{ nodes: [], summary: 'Inga relevanta noder hittades.' }`
- **AC9:** Ingen nod förekommer dubbelt i resultatet
- **AC10:** Fungerar utan embeddings/pgvector/Ollama

### Manager-injektion

- **AC11:** Manager systemprompt innehåller sektion "Relevant kunskap från grafen" med brief-matchade noder
- **AC12:** Fallback-logik baserat på *totalt* antal noder (alla typer): om 0 noder → injicera top-5 idéer under rubriken "Relevant kunskap från grafen" (befintligt beteende). Om 1-2 noder → komplettera med top-5 idéer. Om ≥3 noder → använd enbart brief-kontexten. Aldrig en helt tom sektion.
- **AC13:** Manager-prompten kräver "Grafkontext jag konsumerade" i plan
- **AC14:** Om inga idéer finns i grafen alls (ny installation) → sektionen utelämnas helt

### Reviewer-injektion

- **AC15:** Reviewer systemprompt innehåller sektion "Kända problem och mönster" med errors/patterns
- **AC16:** Reviewer ser INTE idéer — bara error och pattern-noder
- **AC17:** Om inga relevanta errors/patterns → sektionen utelämnas
- **AC18:** Reviewer-prompten kräver "Kontrollera kända errors"

### Loggning

- **AC19:** `knowledge.md` innehåller sektion "Grafkontext injicerad" med antal noder per agent och keywords
- **AC20:** Loggning sker även om 0 noder injicerades

### Tester

- **AC21:** `brief-context-extractor.test.ts` har minst 8 tester (nyckelord, stoppord, nodtyper, tomma inputs, filsökvägar)
- **AC22:** `graph-context.test.ts` har minst 10 tester (keyword-match, PPR-expansion, error-hämtning, dedup, tom graf, max-limit)
- **AC23:** Manager-testerna verifierar ny grafkontext-injektion
- **AC24:** Reviewer-testerna verifierar error/pattern-injektion
- **AC25:** Alla befintliga tester passerar utan regression

## Designbeslut

1. **Keyword-matchning före embedding:** Vi använder keyword-matchning + PPR istället för embedding-likhet. Anledning: fungerar utan Ollama/pgvector (robustare), och PPR ger strukturella kopplingar som embeddings missar.

2. **Separata vyer per agent:** Manager ser allt (errors, patterns, idéer). Reviewer ser bara errors/patterns. Anledning: Reviewer behöver inte idéer — de distraherar från kodgranskning.

3. **Max 15 noder:** Begränsar systemprompt-tillväxt. 15 noder ≈ 30-40 rader markdown ≈ ~500 tokens. Rimlig kostnad.

4. **"Grafkontext jag konsumerade" som verifiering:** Promptinstruktion, inte kod-enforcement. Vi kan logga om Manager faktiskt skrev det, men vi blockerar inte körningen om det saknas. Anledning: samma princip som brief-reviewer-intervjun — tvingande kod för kritiskt, prompt för önskat beteende.
