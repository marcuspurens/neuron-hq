# Brief: GraphRAG G2 — Agent-verktyg + Historian/Librarian skriver

## Bakgrund

G1 levererade core-modulen (`src/core/knowledge-graph.ts`) med Zod-schemas, 9 CRUD-operationer
och en migrerad `memory/graph.json` (69 noder, 56 kanter). Allt är immutabelt och validerat.

Nu i G2 exponeras grafen som verktyg som agenter kan anropa, och Historian + Librarian
börjar skriva till grafen (parallellt med befintliga `.md`-filer).

**Föregående:** G1 — `src/core/knowledge-graph.ts` + `memory/graph.json`
**Källa:** [ROADMAP.md](../ROADMAP.md) → G2-sektionen

## Scope

**4 nya graph-verktyg. Historian + Librarian använder dem. Befintliga minnesfiler skrivs fortfarande.**

Inga ändringar i Manager, Implementer, Reviewer eller Researcher (det är G3).

## Uppgifter

### 1. Fyra graph-verktyg i Historian (`src/core/agents/historian.ts`)

Lägg till dessa verktyg i `defineTools()` och implementera dem i `executeTools()`:

#### `graph_query`
Söker noder i grafen. Wrappar `findNodes()` från `knowledge-graph.ts`.

```typescript
// Input
{
  type?: "pattern" | "error" | "technique" | "run" | "agent",  // filtrera på nodtyp
  query?: string,  // fritextsökning i title + properties
  min_confidence?: number  // filtrera bort noder med lägre confidence
}
// Output: JSON-array med matchande noder (max 20, sorterade på confidence desc)
```

#### `graph_traverse`
Följer kanter från en nod. Wrappar `traverse()` från `knowledge-graph.ts`.

```typescript
// Input
{
  node_id: string,       // startnod
  edge_type?: "solves" | "discovered_in" | "related_to" | "causes" | "used_by",
  depth?: number         // default 1, max 3
}
// Output: JSON-array med noder som nås via kanterna
```

#### `graph_assert`
Lägger till en nod + valfria kanter. Wrappar `addNode()` + `addEdge()` + `saveGraph()`.

```typescript
// Input
{
  node: {
    type: "pattern" | "error" | "technique" | "run",
    title: string,
    properties: Record<string, unknown>,  // kontext, lösning, effekt, keywords, etc.
    confidence: number  // 0.0–1.0
  },
  edges?: Array<{
    target_id: string,  // befintlig nod att koppla till
    type: "solves" | "discovered_in" | "related_to" | "causes" | "used_by"
  }>
}
// Verktyget genererar id automatiskt (t.ex. "pattern-028", "error-026")
// Verktyget sätter created/updated till now()
// Verktyget lägger till provenance-metadata: { runId: ctx.runId, agent: "historian", timestamp }
// Output: "Node <id> created with <N> edges"
```

**Viktigt:** `graph_assert` ska:
- Läsa `memory/graph.json` via `loadGraph()`
- Generera nästa lediga id (t.ex. om sista pattern-noden är "pattern-027" → nästa blir "pattern-028")
- Lägga till noden + kanterna
- Spara tillbaka med `saveGraph()`
- Logga till audit

#### `graph_update`
Uppdaterar en befintlig nod. Wrappar `updateNode()` + `saveGraph()`.

```typescript
// Input
{
  node_id: string,
  confidence?: number,
  properties?: Record<string, unknown>,  // mergas med befintliga properties
  title?: string
}
// Output: "Node <id> updated"
```

**Viktigt:** `graph_update` ska:
- Läsa grafen
- Merga nya `properties` med befintliga (inte ersätta)
- Spara tillbaka
- Logga till audit

### 2. Samma 4 verktyg i Librarian (`src/core/agents/librarian.ts`)

Lägg till exakt samma 4 verktyg (`graph_query`, `graph_traverse`, `graph_assert`, `graph_update`)
i Librarian. Implementationen är identisk — enda skillnaden är att provenance-metadata
sätter `agent: "librarian"` istället för `agent: "historian"`.

**Refaktorering möjlig men inte obligatorisk:** Om du vill kan du bryta ut verktygen till
en delad hjälpfil (t.ex. `src/core/agents/graph-tools.ts`), men det är okej att duplicera
om det blir enklare.

### 3. Uppdatera Historian-prompten (`prompts/historian.md`)

Lägg till i "What You Do"-sektionen (efter steg 4):

```markdown
5. **Write to knowledge graph** using `graph_assert` for every new pattern or error entry.
   - When writing a new pattern → also call `graph_assert` with type "pattern"
   - When writing a new error → also call `graph_assert` with type "error"
   - Always include edges: `discovered_in` → current run node
   - If the pattern/error relates to existing nodes (check with `graph_query`), add `related_to` edges
   - When confirming an existing pattern → use `graph_update` to bump confidence
```

Lägg till i "Tools"-sektionen:

```markdown
- **graph_query**: Search the knowledge graph for nodes by type, keyword, or confidence threshold
- **graph_traverse**: Follow edges from a node to find related patterns/errors
- **graph_assert**: Add a new node (pattern/error) with edges and provenance to the knowledge graph
- **graph_update**: Update an existing node's confidence or properties
```

### 4. Uppdatera Librarian-prompten (`prompts/librarian.md`)

Lägg till i "What You Do"-sektionen (efter steg 4):

```markdown
5. **Write to knowledge graph** using `graph_assert` for every new technique entry.
   - Call `graph_assert` with type "technique" for each paper written to techniques.md
   - If the technique relates to existing patterns (check with `graph_query`), add `related_to` edges
```

Lägg till i "Tools"-sektionen:

```markdown
- **graph_query**: Search the knowledge graph for nodes by type, keyword, or confidence threshold
- **graph_traverse**: Follow edges from a node to find related patterns/errors/techniques
- **graph_assert**: Add a new technique node with edges and provenance to the knowledge graph
- **graph_update**: Update an existing node's confidence or properties
```

### 5. Tester (`tests/core/knowledge-graph-tools.test.ts`)

Skriv tester som verifierar:

1. `graph_query` returnerar noder filtrerade på typ
2. `graph_query` returnerar noder filtrerade på query (fritextsök)
3. `graph_query` med `min_confidence` filtrerar korrekt
4. `graph_query` returnerar max 20 noder
5. `graph_traverse` returnerar grannar via kanter
6. `graph_traverse` med `edge_type` filtrerar kanttyp
7. `graph_traverse` med `depth > 1` följer flera steg
8. `graph_assert` skapar nod med auto-genererat id
9. `graph_assert` skapar nod + kanter
10. `graph_assert` sätter provenance-metadata (runId, agent, timestamp)
11. `graph_assert` sparar till disk (verifiera med `loadGraph`)
12. `graph_update` uppdaterar confidence
13. `graph_update` mergar properties (inte ersätter)
14. `graph_update` sparar till disk

Du kan antingen testa via agent-klasserna (integration) eller direkt mot
verktygsfunktionerna (unit). Unit-tester mot extraherade funktioner föredras.

### 6. Befintliga minnesfiler — parallellkörning

**Kritiskt:** Historian och Librarian ska **fortfarande skriva till** `memory/patterns.md`,
`memory/errors.md` och `memory/techniques.md` som förut. Graph-skrivning är ett
**tillägg**, inte en ersättning (det är G3).

## Acceptanskriterier

- [ ] 4 graph-verktyg (`graph_query`, `graph_traverse`, `graph_assert`, `graph_update`) registrerade i Historian
- [ ] Samma 4 graph-verktyg registrerade i Librarian
- [ ] `graph_assert` genererar auto-id och sätter provenance (runId, agent, timestamp)
- [ ] `graph_update` mergar properties (inte ersätter)
- [ ] `prompts/historian.md` dokumenterar de 4 nya verktygen
- [ ] `prompts/librarian.md` dokumenterar de 4 nya verktygen
- [ ] Historian skriver fortfarande till `memory/patterns.md` och `memory/errors.md` (parallellkörning)
- [ ] Librarian skriver fortfarande till `memory/techniques.md` (parallellkörning)
- [ ] 10+ tester i `tests/core/knowledge-graph-tools.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar (alla befintliga + nya tester)

## Risk

**Medium.** Ändrar Historian- och Librarian-agenternas verktygsuppsättning och prompts.
Men befintliga verktyg behålls intakta (additivt), och `.md`-skrivning fortsätter parallellt.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test
```

Förväntat baseline: 413 passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-27-graphrag-g2-tools.md --hours 1
```
