# Brief: 2.1 HippoRAG — Personalized PageRank för grafnavigering

**Target:** neuron-hq
**Effort:** 1-2 körningar
**Roadmap:** Fas 2 — Intelligens, punkt 2.1

## Bakgrund

Neuron HQ:s kunskapsgraf har ~878 idénoder och ~2000 edges. Idag hittar `related_ideas` kopplingar via **Jaccard-likhet på tokeniserad text** (ordöverlapp). Det betyder att "agent-minne" och "HippoRAG" aldrig kopplas ihop — trots att de handlar om samma sak — för att orden inte matchar.

HippoRAG (NeurIPS 2024) och dess uppföljare **HippoRAG 2** (arXiv 2502.14802, ICML 2025) löser detta genom att använda **Personalized PageRank (PPR)** på kunskapsgrafen. Givet en fråga eller nod, "vandrar" algoritmen genom grafen och hittar noder som är starkt kopplade via grafstrukturen — oavsett om orden matchar.

**Från HippoRAG 2:** Viktigaste insikten för oss är att **damping α = 0.5** fungerar bättre än klassiska 0.85 — lägre damping ger mer vikt åt seed-noderna, vilket passar små grafer. HippoRAG 2 introducerar även dual-node (passage+phrase), query-to-triple matching, och LLM-filtrering — dessa är **inte relevanta** för vår graf av idénoder och hanteras inte här.

## Vad ska byggas

### 1. PPR-algoritm (`src/core/ppr.ts`)

En fristående modul som beräknar Personalized PageRank på en graf.

**Algoritm (iterativ power iteration med dangling node-hantering):**
```
Input: adjacency-lista, personaliseringsvektor p (seed-vikter), damping α = 0.5
Output: score-vektor π (PPR-score per nod)

1. Bygg rad-normaliserad adjacency-matris: A_tilde = D^-1 * A (varje rad summerar till 1)
   - Identifiera "dangling nodes" = noder utan utgående kanter (degree 0 i adjacency-listan)
2. Initiera π = p (normaliserad)
3. Repeat max 50 gånger:
   a. Beräkna dangling mass: d = summa av π[i] för alla dangling nodes
   b. π_new = (1-α) * p + α * (A_tilde^T * π + d * p)
      — dangling mass redistribueras tillbaka till personaliseringsvektorn
   Om ||π_new - π|| < 1e-6: break
4. Return π
```

**Dangling nodes:** Noder utan grannar (isolerade) har inga utgående kanter, så deras mass "försvinner" i varje iteration. Standard PageRank-lösning: redistribuera dangling mass proportionellt till personaliseringsvektorn p. Effekt: en isolerad seed-nod behåller score ≈ 1.0 (all mass återförs till p som pekar på seed).

**API:**
```typescript
interface PPROptions {
  damping?: number;       // default 0.5 (HippoRAG 2 optimal)
  maxIterations?: number; // default 50
  tolerance?: number;     // default 1e-6
}

interface PPRResult {
  nodeId: string;
  score: number;
}

// Beräkna PPR givet seed-noder med vikter
function personalizedPageRank(
  nodes: string[],                          // alla nod-IDs
  edges: Array<{ from: string; to: string }>, // riktade kanter (graphToAdjacency dubblerar redan)
  seeds: Map<string, number>,               // personaliseringsvektor (nod → vikt, normaliseras internt)
  options?: PPROptions
): PPRResult[];                             // sorterat fallande på score
```

**Krav:**
- Ren matematik — inga DB-anrop, inga sidoeffekter
- Adjacency-matrisen ska vara **rad-normaliserad** (D^-1 * A) — varje nods grannar viktas lika
- Edges behandlas som **oriktade** och **oviktade** (alla kanter har vikt 1). `personalizedPageRank()` tar emot **redan dubblerade riktade edges** (ansvar ligger på `graphToAdjacency()`). PPR-funktionen lägger INTE till omvända kanter själv — den använder edges-arrayen as-is för att bygga adjacency-matrisen.
- **Self-loops filtreras bort** innan adjacency-matris byggs (edge där `from === to`)
- **Edges med okända noder ignoreras** — om en edge refererar till en nod-ID som inte finns i `nodes`-arrayen, filtrera bort den (tyst, ingen error)
- Seed-vikter **normaliseras alltid internt** (input behöver inte summera till 1). Seed med alla vikter = 0 → kastar Error("Seed weights sum to zero")
- Returnerar ALLA noder med score > 0, sorterat fallande
- PPR-scores summerar till ~1.0 (inom tolerans 0.01) — detta är en grundegenskap
- Hanterar edge cases: tom graf, isolerade noder, en enda nod, disconnected subgrafer
- Funktionen ska vara **idempotent** — samma input ger alltid samma output

### 2. Ersätt Jaccard i `linkRelatedIdeas()` med PPR-hybrid

**Plats:** `src/core/knowledge-graph.ts` — funktionen `linkRelatedIdeas()`

**Nuläge:** `linkRelatedIdeas(graph: KnowledgeGraph): KnowledgeGraph` — tar en in-memory graf, returnerar uppdaterad graf med nya edges. Anropas av historian-agenten efter att nya idénoder skapats. Befintlig logik: Jaccard på tokeniserad text → tröskel 0.3 → skapa `related_to`-edge.

**Nytt: PPR + embedding-hybrid**

Istället för Jaccard, beräkna kopplingar så här:

1. Ladda alla idénoder och deras edges från grafen
2. **För varje idénod** (som inte redan nått `maxEdgesPerNode` *vid funktionens start*):
   a. Kör PPR med den noden som enda seed (vikt 1.0)
   b. **Filtrera bort seed-noden själv** ur PPR-resultaten
   c. Filtrera bort noder som inte är av typ `idea`
   d. Filtrera bort noder som redan har edge till seed-noden
   e. Kandidater = top-10 PPR-resultat med score ≥ 0.01
3. **Fallback:** Om noden hade <2 `related_to`-edges (bara `related_to` räknas, inte `derived_from` etc.) *vid funktionens start* och PPR ger <2 kandidater ovan tröskel:
   - Kör Jaccard mot **alla andra idénoder** (befintlig tokenize/jaccardSimilarity), max top-10 Jaccard-kandidater per nod
   - Tröskel 0.3
   - Jaccard-kandidater läggs till **utöver** eventuella PPR-kandidater (inte ersätter)
   - **Edge-kontroll:** Kontrollera mot både befintliga edges vid start OCH edges skapade tidigare i samma körning. Håll en `Set<string>` med kanonisk nyckel `[min(id1,id2), max(id1,id2)].join(":")` så att A→C och C→A detekteras som samma edge.
   - Totalt antal nya edges per nod respekterar fortfarande `maxEdgesPerNode` (räkna start-edges + nyskapade)
   - Detta fångar noder som är isolerade i grafen men har textöverlapp
4. Sortera kandidater och skapa edges som idag (respektera `maxEdgesPerNode`)
5. **Idempotens:** `linkRelatedIdeas()` ska ge samma resultat vid upprepad körning — kontrollera befintliga edges före skapande (redan implementerat, behåll)

**Trösklar:**
- PPR-score ≥ 0.01 (motivering: med damping 0.5, en direkt granne till seed-noden i en graf med 10 grannar får ~0.05. Tröskel 0.01 fångar noder 2-3 hopp bort.)
- Jaccard-fallback: behåll tröskel 0.3

**Prestandabeslut:** Kör PPR **bara för noder som behöver fler edges** (nuvarande `edgeCount < maxEdgesPerNode`). Bygg adjacency-listan **en gång** och återanvänd för alla PPR-körningar. Adjacency-listan ska cachas som en lokal variabel inom `linkRelatedIdeas()`, inte som modul-state.

**Iteration:** `linkRelatedIdeas()` itererar **sekventiellt** (for-loop, inte Promise.all) över idénoder, sorterade på nod-ID. Sekventiell körning krävs för att `Set<string>`-baserad edge-dedup ska vara korrekt utan race conditions.

**Delad konvertering:** Skapa en **exporterad** hjälpfunktion `graphToAdjacency(graph: KnowledgeGraph): { nodes: string[], edges: Array<{ from: string; to: string }> }` som både `linkRelatedIdeas()` och `pprQuery()` använder. Exporteras för testbarhet. Inkluderar **alla noder** (inklusive isolerade utan edges) och **alla edge-typer** (`related_to`, `derived_from`, etc.) — PPR ska navigera hela grafstrukturen och behöver alla noder för korrekt dangling-hantering. Varje grafkant dubbleras till 2 riktade edges (A→B + B→A) här — `personalizedPageRank()` tar edges as-is.

**maxEdgesPerNode:** Default-värde = 3 (redan definierat i befintlig kod). Räknar bara `related_to`-edges (inte `derived_from` eller andra typer). Briefen förutsätter detta default — anges explicit här för tydlighet.

**Loggning:** `linkRelatedIdeas()` ska logga via `logger.info` (modulen använder `createLogger('knowledge-graph')`) med strukturerade fält: `{ pprNodes: number, jaccardFallbacks: number, newEdges: number }`. Viktigt för att verifiera att PPR-migrationen fungerar korrekt i produktion.

### 3. Ny funktion `pprQuery()` i knowledge-graph.ts

En ny export-funktion som MCP-tools kan anropa:

```typescript
export function pprQuery(
  graph: KnowledgeGraph,
  seedNodeIds: string[],
  options?: {
    limit?: number;          // default 10
    minScore?: number;       // default 0.01
    excludeTypes?: NodeType[]; // typ-filter
    excludeIds?: string[];   // exkludera specifika noder
  }
): Array<{ node: KGNode; score: number }>;
```

Denna funktion:
1. **Validerar** att `seedNodeIds` inte är tom (kastar `Error("At least one seed node required")`) och att alla seed-noder finns i grafen (kastar `Error("Node not found: <id>")`)
2. Tar emot seed-noder med **lika vikter** (1/N per seed). Viktad seeding är ett icke-mål för v1.
3. Kör PPR på hela grafen
4. Exkluderar seed-noder ur resultaten
5. Filtrerar och returnerar top-N

**Typer:** `KnowledgeGraph`, `KGNode`, `NodeType`, `KGEdge` definieras i `src/core/knowledge-graph.ts` (Zod-scheman). `KGNode` har bl.a. `id`, `type`, `title`, `confidence`, `properties`, `scope`, `model`, `created`, `updated`.

**Felhantering:** `pprQuery()` kastar vid ogiltiga inputs. Det är anroparens ansvar att catcha — MCP-toolet fångar och returnerar `{ error }`, agent-toolet låter felet propagera.

### 4. Nytt tool `graph_ppr` (agent-tool + MCP-tool)

**Viktig arkitekturdetalj:** `graph_query` och `graph_traverse` är **agent-interna tools** registrerade i `src/core/agents/graph-tools.ts` (Anthropic SDK-format). De är INTE MCP-tools. `graph_ppr` ska registreras på **två** ställen:

**A. Agent-tool** (för användning inom körningar):
- **Plats:** `src/core/agents/graph-tools.ts`
- Lägg till i `graphToolDefinitions()` och `executeGraphTool()`
- Samma mönster som `graph_query` och `graph_traverse`

**B. MCP-tool** (för extern användning via Claude Desktop/Claude Code):
- **Plats:** `src/mcp/tools/graph-ppr.ts` (ny fil med `registerGraphPprTool()`)
- Registrera i `src/mcp/scopes.ts` under `neuron-analytics`-scopet
- Samma mönster som `neuron_help` (se `src/mcp/tools/neuron-help.ts`)

```
Tool: graph_ppr
Description: Find related nodes using graph structure (Personalized PageRank).
  Starts from seed nodes and walks the graph — finds connections that
  keyword search misses.

Input:
  seed_ids: string[]    — nod-IDs att starta från (minst 1, valideras)
  limit?: number        — max resultat (default 10)
  type?: NodeType       — filtrera resultattyp
  min_score?: number    — tröskel (default 0.01)

Output:
  Array<{ id, title, type, score, confidence }>
```

- `confidence` = nodens befintliga `confidence`-fält från grafen (INTE PPR-score)
- `score` = PPR-score
- Agent-tool returnerar via Anthropic tool-result. MCP-tool wrappar `pprQuery()` i try/catch och returnerar `{ content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] }` vid fel (aldrig throw) — samma mönster som `neuron_help` och `neuron_knowledge`.

## Acceptance Criteria

### PPR-algoritm (ppr.ts)
- [ ] AC1: `personalizedPageRank()` exporteras från `src/core/ppr.ts`
- [ ] AC2: Linjär graf med edges `[{A,B}, {B,C}, {C,D}]` (bidirektionella), seed={A: 1.0}: score(B) > score(C) > score(D) > 0
- [ ] AC3: Triangel A↔B↔C, seed={A: 1.0}: `Math.abs(score(B) - score(C)) < 0.01` (symmetri inom tolerans)
- [ ] AC4: Tom graf (inga noder, inga edges) → tom resultat-lista, inget crash
- [ ] AC5: Disconnected subgraf med dangling seed — `personalizedPageRank()` direkt med dubblerade edges `[{from:B,to:C},{from:C,to:B}]`, noder=[A,B,C], seed={A: 1.0}. A är dangling (inga utgående kanter) och disconnected från B,C-klustret (ingen path). B,C får score = 0 (ingen path från seed), A:s dangling mass redistribueras till p → A score ≈ 1.0.
- [ ] AC6: Damping=0 → seed-nodens score = 1.0, alla andra = 0 (ingen grafpåverkan, π = p exakt)
- [ ] AC7: Summan av alla scores ≈ 1.0 (tolerans 0.01) — grundegenskap hos PPR
- [ ] AC8: Disconnected subgrafer: seed i kluster 1 → alla noder i kluster 2 har score 0
- [ ] AC9: Self-loops filtreras: graf med A→A edge ger inte överviktad score för A
- [ ] AC9b: Edges med okända noder ignoreras: edge `{X,Y}` där X inte finns i `nodes` → ignoreras utan error

### linkRelatedIdeas med PPR
- [ ] AC10: PPR hittar transitiva kopplingar — testgraf: 8 idénoder A-H i linjär kedja, initiala `related_to`-edges: A↔B, B↔C, C↔D, D↔E, E↔F, F↔G, G↔H (7 edges, varje nod har 1-2 edges). Alla noder har unika ord utan överlapp. `maxEdgesPerNode=3`. `linkRelatedIdeas()` körs. Verifiera: (a) minst en ny `related_to`-edge skapas mellan icke-angränsande noder (t.ex. A↔C, 2 hopp), (b) A↔H skapas INTE (7 hopp — PPR-score faller under 0.01 vid 5+ hopp med α=0.5).
- [ ] AC11: Fallback till Jaccard: isolerad idénod (0 edges i grafen) med ordöverlapp mot annan nod → får `related_to`-edge via Jaccard-fallback
- [ ] AC12: `maxEdgesPerNode` respekteras — nod med redan `maxEdgesPerNode` edges får inga fler
- [ ] AC13: Inga dubbel-edges: kör `linkRelatedIdeas()` två gånger på samma graf → samma antal edges (idempotens)
- [ ] AC14: Befintliga tester i `knowledge-graph.test.ts` passerar (uppdateras vid behov)
- [ ] AC14b: `linkRelatedIdeas()` loggar `{ pprNodes, jaccardFallbacks, newEdges }` via `logger.info` — verifiera med spy/mock i test

### pprQuery-funktion
- [ ] AC15: `pprQuery()` exporteras från `knowledge-graph.ts`
- [ ] AC16: Returnerar sorterade resultat med score (högst först), seed-noder exkluderade
- [ ] AC17: Stöder `excludeTypes` — resultat innehåller inga noder av exkluderad typ
- [ ] AC18: Stöder `limit` — returnerar max N resultat
- [ ] AC19: Tom graf → tom lista, inget crash
- [ ] AC20: Seed-nod som inte finns i grafen → kastar Error med tydligt meddelande ("Node not found: <id>")
- [ ] AC20b: Multipla seeds: `pprQuery` med 2 seeds i olika kluster → resultat innehåller noder från båda kluster

### graph_ppr tool (agent-tool + MCP-tool)
- [ ] AC21: Agent-tool: `graph_ppr` tillagd i `graphToolDefinitions()` och `executeGraphTool()` i `src/core/agents/graph-tools.ts`
- [ ] AC22: MCP-tool: `registerGraphPprTool()` i `src/mcp/tools/graph-ppr.ts`, registrerad i `src/mcp/scopes.ts` under `neuron-analytics`
- [ ] AC23: Båda tools accepterar `seed_ids` (minst 1), `limit`, `type`, `min_score`
- [ ] AC24: Output-format: `Array<{ id, title, type, score, confidence }>` där `confidence` = nodens graf-confidence, `score` = PPR-score
- [ ] AC25: Tom `seed_ids`, obefintlig nod, eller nod som inte finns i grafen (t.ex. tom graf + icke-tom seeds) → tydligt felmeddelande (MCP returnerar `{ error }`, agent-tool kastar)
- [ ] AC26: Tool registrerat i `src/mcp/tool-catalog.ts` med beskrivning, kategori `analys`, och keywords `["graf", "pagerank", "ppr", "relaterade", "kopplingar", "graph", "related"]`

### graphToAdjacency
- [ ] AC10b: `graphToAdjacency()` exporteras från `knowledge-graph.ts` och returnerar korrekta bidirektionella edges (en `{ from, to }` edge i grafen → 2 riktade edges i output) och alla nod-IDs
- [ ] AC10c: `graphToAdjacency()` hanterar tom graf → `{ nodes: [], edges: [] }`

### Integration & prestanda
- [ ] AC27: `pnpm typecheck` passerar
- [ ] AC28: `pnpm test` passerar (inga regressioner)
- [ ] AC29: Nya tester för PPR-algoritmen (minst 8 tester, täcker AC2-AC9)
- [ ] AC30: Nya tester för pprQuery (minst 5 tester, täcker AC16-AC20b)
- [ ] AC31: Nya tester för graph_ppr MCP-tool (minst 2 tester)
- [ ] AC32: Prestandatest (med `{ timeout: 60_000 }` i Vitest): (a) en enskild `personalizedPageRank()`-körning med 500 noder och 1000 edges slutför inom 100ms. (b) Hela `linkRelatedIdeas()` med 200 idénoder, 400 edges, `maxEdgesPerNode=3`, alla noder med 0 befintliga edges slutför inom 30 sekunder. Grafen genereras deterministiskt: nod `i` kopplad till `(i+1) % N` och `(i+7) % N`. Mäts med `performance.now()`. OBS: 100ms per PPR är worst-case (sparst graf, fler iterationer) — typiskt ~5-20ms, men 200×100ms=20s ger marginal.

## Filer som berörs

| Fil | Ändring |
|-----|---------|
| `src/core/ppr.ts` | **NY** — PPR-algoritm |
| `src/core/knowledge-graph.ts` | Modifiera `linkRelatedIdeas()`, ny `pprQuery()` |
| `src/core/agents/graph-tools.ts` | Lägg till `graph_ppr` i `graphToolDefinitions()` + `executeGraphTool()` |
| `src/mcp/tools/graph-ppr.ts` | **NY** — MCP-tool med `registerGraphPprTool()` |
| `src/mcp/scopes.ts` | Registrera under `neuron-analytics`-scope |
| `src/mcp/tool-catalog.ts` | Lägg till `graph_ppr` i tool-katalogen |
| `tests/core/ppr.test.ts` | **NY** — PPR-enhetstester (minst 8) |
| `tests/core/knowledge-graph.test.ts` | Uppdatera/utöka tester för linkRelatedIdeas + pprQuery |
| `tests/mcp/graph-ppr.test.ts` | **NY** — MCP-tool-tester |

## Risker

| Risk | Hantering |
|------|-----------|
| PPR-tröskel 0.01 för hög eller låg | Logga min/max/median PPR-score i prestandatestet (AC32). Om medianen < 0.01 flaggar testet en `console.warn` — justering görs i nästa brief, inte automatiskt |
| O(n * iterations * edges) för långsamt | Redan mitigerat: kör PPR bara för noder med <maxEdgesPerNode edges + cacha adjacency-lista |
| Befintliga tester förväntar Jaccard-beteende | Uppdatera tester — men verifiera att edge-skapande logiken fortfarande fungerar korrekt |
| linkRelatedIdeas anropas med in-memory graf (inte DB) | PPR ska fungera rent in-memory — inga DB-anrop i ppr.ts |
| Parallella anrop till linkRelatedIdeas | Funktionen är inte thread-safe (Set-baserad dedup). Anropas idag sekventiellt i historian-agenten — inte ett problem nu, men notera i JSDoc |

## Commit-meddelande

```
feat: add PPR graph navigation (HippoRAG 2) with Jaccard fallback

Implements Personalized PageRank (α=0.5) for knowledge graph traversal
in linkRelatedIdeas(). Adds pprQuery() API and graph_ppr tool (agent +
MCP). Jaccard kept as fallback for isolated nodes without graph edges.
```

## Icke-mål (utanför scope)

- Ingen LLM-driven retrieval (HippoRAG 2:s "recognition filtering" — framtida fas)
- Ingen query-to-triple matching (HippoRAG 2 — kräver OpenIE-pipeline vi inte har)
- Ingen dual-node passage+phrase (HippoRAG 2 — framtida brief när Aurora indexerar dokument/research i grafen)
- Ingen ändring av `semanticSearch()` (den fungerar bra med pgvector)
- Ingen dedikerad CLI-subcommand — men `graph_ppr` syns via `help-tools` automatiskt genom tool-catalog (AC26)
- Ingen PPR-reranking i befintlig `graph_query` — det är en separat förbättring för en framtida brief
- Ingen viktad seeding i `pprQuery()` — alla seeds viktas lika (1/N). Viktade seeds är en framtida förbättring.
