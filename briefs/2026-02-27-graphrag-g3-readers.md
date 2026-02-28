# Brief: GraphRAG G3 — Alla agenter läser grafen

## Bakgrund

G1 levererade `src/core/knowledge-graph.ts` (core + migration).
G2 levererade `src/core/agents/graph-tools.ts` (4 verktyg) och integrerade dem i Historian + Librarian (läs + skriv).

Nu i G3 får de fyra återstående agenterna — Manager, Implementer, Reviewer och Researcher — **läs-åtkomst** till kunskapsgrafen via `graph_query` och `graph_traverse`.

**Föregående:** G2 — `graph-tools.ts` + Historian/Librarian-integration (commit `a1a1cfb`)
**Källa:** [ROADMAP.md](../ROADMAP.md) → G3

## Scope

**Enbart läsverktyg.** Manager, Implementer, Reviewer och Researcher får `graph_query` + `graph_traverse`. De ska INTE få `graph_assert` eller `graph_update` — skrivning till grafen förblir exklusivt för Historian och Librarian.

Inga ändringar i Historian, Librarian eller `graph-tools.ts`.

## Uppgifter

### 1. Lägg till hjälpfunktion i `graph-tools.ts`

Lägg till en exporterad funktion som returnerar enbart de två läs-verktygen:

```typescript
export function graphReadToolDefinitions(): Anthropic.Messages.Tool[] {
  return graphToolDefinitions().filter((t) =>
    ['graph_query', 'graph_traverse'].includes(t.name)
  );
}
```

### 2. Integrera i Manager (`src/core/agents/manager.ts`)

#### 2a. Import
Lägg till import överst:
```typescript
import { graphReadToolDefinitions, executeGraphTool, type GraphToolContext } from './graph-tools.js';
```

#### 2b. defineTools()
Lägg till läs-verktygen i den returnerade arrayen:
```typescript
...graphReadToolDefinitions(),
```

#### 2c. executeTools()
Lägg till case i switch-satsen:
```typescript
case 'graph_query':
case 'graph_traverse': {
  const graphCtx: GraphToolContext = {
    graphPath: path.join(this.ctx.baseDir, 'memory', 'graph.json'),
    runId: this.ctx.runid,
    agent: 'manager',
    audit: this.ctx.audit,
  };
  result = await executeGraphTool(block.name, block.input as Record<string, unknown>, graphCtx);
  break;
}
```

**Obs:** Kontrollera hur `this.ctx.baseDir` (eller motsvarande sökväg till `memory/graph.json`) redan konstrueras i Historian/Librarian och följ samma mönster exakt.

### 3. Integrera i Implementer (`src/core/agents/implementer.ts`)

Samma mönster som Manager (steg 2a–2c), men med `agent: 'implementer'`.

### 4. Integrera i Reviewer (`src/core/agents/reviewer.ts`)

Samma mönster som Manager (steg 2a–2c), men med `agent: 'reviewer'`.

### 5. Integrera i Researcher (`src/core/agents/researcher.ts`)

Samma mönster som Manager (steg 2a–2c), men med `agent: 'researcher'`.

### 6. Uppdatera prompter

#### `prompts/manager.md`
Lägg till i "Memory Tools"-sektionen (runt rad 81–85):

```markdown
### Knowledge Graph (read-only)
- **graph_query**: Search the knowledge graph for patterns, errors, and techniques from previous runs. Use BEFORE delegating to check if similar work has been done.
- **graph_traverse**: Follow edges from a node to find related patterns/errors. Use to understand the history of a recurring issue.
```

#### `prompts/implementer.md`
Lägg till en ny sektion efter "Before You Code":

```markdown
### Knowledge Graph (read-only)
- **graph_query**: Search patterns and techniques from previous runs. Use before coding to find proven solutions.
- **graph_traverse**: Follow edges from a pattern to see what techniques solved it.
```

#### `prompts/reviewer.md`
Lägg till en ny sektion i Verification-delen:

```markdown
### Knowledge Graph (read-only)
- **graph_query**: Search patterns and errors from previous runs. Cross-reference the current change against known issues.
- **graph_traverse**: Follow edges to verify if a fix addresses the root cause pattern.
```

#### `prompts/researcher.md`
Lägg till i "Research Process"-sektionen:

```markdown
### Knowledge Graph (read-only)
- **graph_query**: Search existing techniques and patterns before researching. Avoid duplicating what's already documented.
- **graph_traverse**: Follow edges to discover connections between ideas and previous findings.
```

### 7. Tester (`tests/core/graph-read-tools.test.ts`)

Skriv tester som verifierar:

1. `graphReadToolDefinitions()` returnerar exakt 2 verktyg (`graph_query`, `graph_traverse`)
2. `graphReadToolDefinitions()` inkluderar INTE `graph_assert` eller `graph_update`
3. Manager kan anropa `graph_query` och få svar (integration eller via executeGraphTool direkt)
4. Manager kan anropa `graph_traverse` och få svar
5. Implementer kan anropa `graph_query` (verifierar att agent-strängen i context sätts korrekt)
6. Reviewer kan anropa `graph_query`
7. Researcher kan anropa `graph_query`
8. `graph_query` med `type`-filter returnerar rätt noder
9. `graph_traverse` med `edge_type` returnerar rätt grannar
10. Läs-verktyg ändrar INTE `graph.json` (kontrollera filens mtime eller innehåll före/efter)

Testa gärna direkt mot `executeGraphTool()` med en temporär `graph.json` — unit-tester föredras.

## Acceptanskriterier

- [ ] `graphReadToolDefinitions()` exporterad från `graph-tools.ts` (returnerar 2 verktyg)
- [ ] `graph_query` + `graph_traverse` registrerade i Manager
- [ ] `graph_query` + `graph_traverse` registrerade i Implementer
- [ ] `graph_query` + `graph_traverse` registrerade i Reviewer
- [ ] `graph_query` + `graph_traverse` registrerade i Researcher
- [ ] Inga skriv-verktyg (`graph_assert`, `graph_update`) i dessa 4 agenter
- [ ] `prompts/manager.md` dokumenterar de 2 läs-verktygen
- [ ] `prompts/implementer.md` dokumenterar de 2 läs-verktygen
- [ ] `prompts/reviewer.md` dokumenterar de 2 läs-verktygen
- [ ] `prompts/researcher.md` dokumenterar de 2 läs-verktygen
- [ ] 8+ tester i `tests/core/graph-read-tools.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar (alla befintliga + nya tester)

## Risk

**Low.** Rent additiv ändring — lägger till 2 read-only verktyg. Inga befintliga verktyg ändras. Inga skrivoperationer exponeras. `graph-tools.ts` får bara en ny exporterad filterfunktion.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test
```

Förväntat baseline: 430 passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-27-graphrag-g3-readers.md --hours 1
```
