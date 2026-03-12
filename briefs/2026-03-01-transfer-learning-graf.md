# Brief: N14 — Transfer Learning via Graf

## Bakgrund

Kunskapsgrafen samlar mönster, fel och tekniker från alla körningar. Men alla
noder behandlas lika — ett mönster som upptäckts i Aurora ("kör tester med `-q`
för att undvika context overflow") är lika användbart för alla projekt, medan
"Aurora använder SQLite för embeddings" bara gäller Aurora.

Idag kan Manager bara söka med fritext (`graph_query({ query: "aurora" })`).
Det finns ingen mekanism att:

- Skilja universella mönster från projektspecifika
- Automatiskt applicera beprövade mönster på nya targets
- Undvika att irrelevanta projektspecifika noder skymmer universella insikter

**Lösning:** Tagga varje nod med `scope: "universal" | "project-specific"`.
Manager konsulterar universella mönster *oavsett* target, medan projektspecifika
noder bara visas för rätt projekt. Historian taggar nya noder vid skapande.
Consolidator kan uppgradera noder som bekräftas i flera projekt.

## Scope

Fyra delar:

1. **Schema-ändring** i `knowledge-graph.ts` — nytt `scope`-fält på `KGNode`
2. **Filtrering** i `graph-tools.ts` — `graph_query` stödjer `scope`-parameter
3. **Prompt-uppdateringar** — Historian, Manager, Consolidator instrueras att använda scope
4. **Migration** — befintliga noder får `scope: "unknown"`, enkel heuristik kan tagga om

## Uppgifter

### 1. Utöka KGNode-schemat

I `src/core/knowledge-graph.ts`, lägg till `scope` i `KGNodeSchema`:

```typescript
export const NodeScopeSchema = z.enum(['universal', 'project-specific', 'unknown']);
export type NodeScope = z.infer<typeof NodeScopeSchema>;

// In KGNodeSchema, add:
scope: NodeScopeSchema.default('unknown'),
```

Uppdatera `addNode()` så att `scope` defaultar till `'unknown'` om det inte
anges.

### 2. Scope-filtrering i graph_query

I `src/core/agents/graph-tools.ts`, utöka `graph_query`-verktygets input:

```typescript
// Add to graph_query tool input_schema.properties:
scope: {
  type: 'string',
  enum: ['universal', 'project-specific', 'unknown'],
  description: 'Filter nodes by scope. Omit to return all scopes.',
}

// In executeGraphTool for graph_query, filter results:
if (input.scope) {
  nodes = nodes.filter(n => n.scope === input.scope);
}
```

### 3. Scope-filtrering i findNodes

I `src/core/knowledge-graph.ts`, utöka `findNodes()`:

```typescript
export function findNodes(
  graph: KnowledgeGraph,
  type?: string,
  query?: string,
  minConfidence?: number,
  scope?: NodeScope,  // new parameter
): KGNode[] {
  let results = graph.nodes;
  if (type) results = results.filter(n => n.type === type);
  if (scope) results = results.filter(n => n.scope === scope);
  // ... rest of existing filtering
}
```

### 4. Historian-prompt: tagga nya noder

I `prompts/historian.md`, uppdatera graf-sektionen:

```markdown
### Scope Tagging

When writing nodes with `graph_assert`, always set `scope` in properties:

- **"universal"** — Pattern applies to any project (testing strategies,
  coding conventions, error handling, tool usage, prompt engineering)
- **"project-specific"** — Pattern is tied to a specific target's codebase,
  architecture, or domain (e.g., "Aurora uses SQLite", "neuron-hq uses Zod")

**Rule of thumb:** If the pattern would help someone working on a *different*
project, it's universal. If it only makes sense in the context of *this* target,
it's project-specific.

Example:
```
graph_assert({
  node: {
    type: "pattern",
    title: "Kör tester med -q för att undvika context overflow",
    properties: { ... },
    confidence: 0.8
  },
  scope: "universal"
})
```
```

### 5. Manager-prompt: konsultera universella mönster

I `prompts/manager.md`, uppdatera ARCHIVE-sektionen `knowledge-graph`:

```markdown
### 1. Universal patterns (from all projects)
graph_query({ type: "pattern", scope: "universal", min_confidence: 0.6 })

Use these proven patterns regardless of which target you're working on.

### 2. Target-specific patterns
graph_query({ type: "pattern", query: "<target-name>" })

Patterns specific to this target's codebase and architecture.

### 3. Target-specific risks
graph_query({ type: "error", query: "<target-name>", min_confidence: 0.5 })
```

### 6. Consolidator-prompt: uppgradera scope

I `prompts/consolidator.md`, lägg till en ny fas:

```markdown
### 5. Scope Promotion

Check if any `project-specific` or `unknown` patterns appear in multiple
targets (different `provenance.runId` prefixes or different target names in
properties):

- If a pattern has been confirmed in 2+ different targets → promote to
  `scope: "universal"` via `graph_update()`
- If a pattern only has provenance from one target → set to
  `scope: "project-specific"` if still `unknown`
```

### 7. Migration av befintliga noder

I `src/core/knowledge-graph.ts`, lägg till en migrationsfunktion:

```typescript
/**
 * Migrates existing nodes to include scope field.
 * - Nodes without scope get scope: "unknown"
 * - Does NOT overwrite existing scope values
 * - Returns count of migrated nodes
 */
export function migrateAddScope(graph: KnowledgeGraph): {
  graph: KnowledgeGraph;
  migrated: number;
};
```

Anropa automatiskt i `loadGraph()` om noder saknar `scope`.

### 8. graph_assert stödjer scope

I `src/core/agents/graph-tools.ts`, utöka `graph_assert`-verktygets input:

```typescript
// Add to graph_assert tool input_schema.properties.node.properties:
scope: {
  type: 'string',
  enum: ['universal', 'project-specific', 'unknown'],
  description: 'Scope of the node. Default: "unknown".',
}

// In the handler, pass scope to addNode():
const newNode = addNode(graph, {
  ...nodeInput,
  scope: nodeInput.scope || 'unknown',
});
```

### 9. Tester

Skriv tester i `tests/core/transfer-learning.test.ts`:

1. `KGNodeSchema` — accepterar `scope: "universal"`
2. `KGNodeSchema` — accepterar `scope: "project-specific"`
3. `KGNodeSchema` — accepterar `scope: "unknown"`
4. `KGNodeSchema` — default scope = `"unknown"` om utelämnat
5. `KGNodeSchema` — avvisar ogiltig scope (t.ex. `"global"`)
6. `addNode` — sätter scope till `"unknown"` om ej angivet
7. `addNode` — bevarar explicit scope
8. `findNodes` — filtrerar på scope `"universal"`
9. `findNodes` — filtrerar på scope `"project-specific"`
10. `findNodes` — utan scope-filter returnerar alla noder
11. `findNodes` — kombinerar scope + type-filter
12. `findNodes` — kombinerar scope + minConfidence
13. `migrateAddScope` — noder utan scope får `"unknown"`
14. `migrateAddScope` — noder med existerande scope behålls
15. `migrateAddScope` — returnerar korrekt antal migrerade
16. `migrateAddScope` — tom graf → 0 migrerade
17. `graph_query` — scope-parameter filtrerar korrekt
18. `graph_query` — utan scope returnerar alla
19. `graph_assert` — scope sätts vid skapande
20. `graph_assert` — scope defaultar till "unknown"

Skriv tester i `tests/prompts/historian-scope-lint.test.ts`:

21. Historian-prompt innehåller "Scope Tagging"
22. Historian-prompt nämner "universal" och "project-specific"

Skriv tester i `tests/prompts/manager-scope-lint.test.ts`:

23. Manager-prompt innehåller `scope: "universal"` i knowledge-graph ARCHIVE
24. Manager-prompt innehåller "Universal patterns"

## Acceptanskriterier

- [ ] `KGNodeSchema` har `scope`-fält med enum `["universal", "project-specific", "unknown"]`
- [ ] `findNodes()` stödjer scope-filtrering
- [ ] `graph_query`-verktyget har `scope`-parameter i input
- [ ] `graph_assert`-verktyget stödjer `scope` vid nodskapande
- [ ] `migrateAddScope()` finns och anropas i `loadGraph()`
- [ ] `prompts/historian.md` instruerar om scope-tagging
- [ ] `prompts/manager.md` frågar efter universella mönster
- [ ] `prompts/consolidator.md` har scope promotion-fas
- [ ] 20+ tester i `tests/core/transfer-learning.test.ts`
- [ ] 4+ tester i prompt-lint-filer
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Medium.** Ändrar KGNode-schemat — alla existerande noder måste migreras.
Migrationen är enkel (lägg till `"unknown"`) och körs automatiskt i `loadGraph()`,
men om något går fel kan grafen bli oläsbar. Backup av `graph.json` bör ske
före första körningen.

Prompt-ändringarna i Historian och Manager kan påverka beteende — Historian kan
vara inkonsekvent med scope-tagging, och Manager kan filtrera bort relevanta
noder. Scope `"unknown"` som default minimerar risken: ingen information går
förlorad, och Consolidator kan tagga om i efterhand.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 676+ passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-01-transfer-learning-graf.md --hours 1
```
