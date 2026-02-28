# Brief: GraphRAG G1 — Core-modul + migration

## Bakgrund

Neuron HQ:s agenter använder filbaserat minne (`memory/patterns.md`, `memory/errors.md`,
`memory/techniques.md`). Filerna har redan proto-grafstrukturer:

- `Relaterat:`-fält = kanter mellan noder
- `Bekräftelser:` = confidence-poäng
- `Körningar:` = provenance (vilken körning upptäckte mönstret)
- `Status: ✅/⚠️` = temporalt tillstånd

Denna körning formaliserar dessa implicita strukturer till en riktig kunskapsgraf.

**Källdokument:** [docs/research-2026-02-27T1219-graphrag-agent-memory.md](../docs/research-2026-02-27T1219-graphrag-agent-memory.md)
**Paraplydokument:** [briefs/2026-02-27-graphrag-agent-memory.md](./2026-02-27-graphrag-agent-memory.md)

## Scope

**Bara core-modulen + migration. Inga agentprompt-ändringar. Inga nya verktyg.**

## Uppgifter

### 1. Zod-schemas (`src/core/knowledge-graph.ts`)

Definiera schemas för:

```typescript
// Node-typer
type NodeType = "pattern" | "error" | "technique" | "run" | "agent";

// Nod
interface KGNode {
  id: string;             // t.ex. "pattern-001", "error-012"
  type: NodeType;
  title: string;
  properties: Record<string, unknown>;  // kontext, lösning, effekt, keywords, etc.
  created: string;        // ISO-datum
  updated: string;        // ISO-datum
  confidence: number;     // 0.0–1.0
}

// Kant-typer
type EdgeType = "solves" | "discovered_in" | "related_to" | "causes" | "used_by";

// Kant
interface KGEdge {
  from: string;           // node-id
  to: string;             // node-id
  type: EdgeType;
  metadata: {
    runId?: string;
    agent?: string;
    timestamp?: string;
  };
}

// Hela grafen
interface KnowledgeGraph {
  version: string;        // "1.0.0"
  nodes: KGNode[];
  edges: KGEdge[];
  lastUpdated: string;    // ISO-datum
}
```

### 2. CRUD + traverse-operationer

I samma fil (`src/core/knowledge-graph.ts`), implementera:

- `loadGraph(path?: string): KnowledgeGraph` — läser `memory/graph.json`
- `saveGraph(graph: KnowledgeGraph, path?: string): void` — skriver JSON
- `addNode(graph, node): KnowledgeGraph` — lägger till nod (validerar med Zod)
- `addEdge(graph, edge): KnowledgeGraph` — lägger till kant (validerar att from/to finns)
- `findNodes(graph, filter): KGNode[]` — sök på type, keywords i title/properties
- `traverse(graph, startId, edgeType?, depth?): KGNode[]` — följ kanter från en nod
- `updateNode(graph, id, updates): KnowledgeGraph` — uppdatera confidence/properties
- `removeNode(graph, id): KnowledgeGraph` — ta bort nod + alla kopplade kanter

Alla operationer returnerar en ny graf (immutabelt). Zod validerar in/ut.

### 3. Migration — parser för befintliga filer

Skapa `src/core/knowledge-graph-migrate.ts`:

- `migratePatterns(markdownContent: string): { nodes: KGNode[], edges: KGEdge[] }`
- `migrateErrors(markdownContent: string): { nodes: KGNode[], edges: KGEdge[] }`
- Parsern ska:
  - Splitta på `---` + `## ` för att hitta entries
  - Extrahera fält: Kontext, Lösning, Effekt, Keywords, Relaterat, Körningar, Bekräftelser
  - Skapa noder med auto-genererade ID:n (`pattern-001`, `error-001`, etc.)
  - Skapa `related_to`-kanter från `Relaterat:`-fält
  - Sätta `confidence` baserat på `Bekräftelser:` (0 = 0.5, 1–3 = 0.7, 4–9 = 0.85, 10+ = 0.95)
  - Skapa `discovered_in`-kanter från `Körningar:`-fält till Run-noder
  - Hoppa över `[UPPDATERING]`-block och `[OBSOLET]`-poster

**Förväntade siffror:**
- ~27 pattern-noder (från patterns.md)
- ~25 error-noder (från errors.md)
- ~61 kanter (från Relaterat:-fält)
- + run-noder från Körningar:-fält

### 4. Generera `memory/graph.json`

Kör migrationen och spara resultatet. Filen ska vara läsbar JSON (indenterad).

## Acceptanskriterier

- [ ] `src/core/knowledge-graph.ts` exporterar Zod-schemas + alla CRUD-operationer
- [ ] `src/core/knowledge-graph-migrate.ts` exporterar parsers för patterns + errors
- [ ] `memory/graph.json` genereras med migrerad data
- [ ] Antal noder i graph.json >= 50 (27 patterns + 25 errors + run-noder)
- [ ] Antal kanter i graph.json >= 40 (subset av 61 Relaterat-fält + discovered_in)
- [ ] `findNodes(graph, { type: "pattern" })` returnerar alla pattern-noder
- [ ] `traverse(graph, "error-001", "solved_by")` returnerar relaterade patterns
- [ ] Alla operationer validerar med Zod (ogiltig input ger fel)
- [ ] 12+ tester i `tests/core/knowledge-graph.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] Inga ändringar i agentprompts, verktyg eller befintliga minnesfiler

## Risk

**Low.** Helt ny kod — berör inte agenternas kärn-loop, prompts eller verktyg.
Migration läser bara befintliga filer och genererar en ny fil.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test
```

Förväntat baseline: 377 passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-27-graphrag-g1-core.md --hours 1
```
