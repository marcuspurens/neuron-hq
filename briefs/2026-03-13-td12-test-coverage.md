# TD-12: Öka testtäckning för otestade moduler

## Bakgrund

Neuron HQ har 1750 tester och utmärkt täckning i kärnmoduler (agents 92%, aurora 95%, MCP tools 100%). Men 15 källfiler saknar helt tester — framförallt tre stora filer med riktig logik:

| Fil | Rader | Innehåll |
|-----|-------|----------|
| `src/core/agents/graph-tools.ts` | 558 | GraphRAG-verktyg: graph_query, graph_add, graph_update, graph_traverse, graph_cross_ref |
| `src/core/knowledge-graph-migrate.ts` | 414 | Migrering av knowledge.md → kunskapsgraf: markdown-parsning, nod/kant-extraktion |
| `src/core/baseline.ts` | 68 | Detekterar test-framework i target-repos (vitest/jest/pytest) |

Dessutom saknas tester för 9 CLI-kommandon i `src/commands/`. De flesta är tunna wrappers, men `neuron-statistics.ts` (102 rader) och `replay.ts` (75 rader) har egen logik.

### Nuläge

- 187 testfiler, 1750 tester
- Otestade filer: 15 st
- `graph-tools.ts` har indirekt täckning via `graph-tools-semantic.test.ts` och `graph-read-tools.test.ts`, men inga direkta enhetstester för execute-funktionerna

## Uppgifter

### 1. `tests/core/agents/graph-tools.test.ts` (högst prioritet)

Testa de 5 graph tool execute-funktionerna:

- **`executeGraphQuery`** — sökning efter typ, nyckelord, confidence-tröskel. Testa med tom graf, med matchningar, med semantisk sökning (mockad)
- **`executeGraphAdd`** — lägg till nod, verifiera att noden sparas med rätt fält. Testa dubbletter, validering
- **`executeGraphUpdate`** — uppdatera confidence, status, summary. Testa nod-som-inte-finns
- **`executeGraphTraverse`** — traversera kanter från en nod. Testa djup, riktning
- **`executeGraphCrossRef`** — Aurora cross-ref. Mocka `findAuroraMatchesForNeuron`
- **`graphToolDefinitions()`** — returnerar 5 verktyg med korrekta namn och schemas

### 2. `tests/core/knowledge-graph-migrate.test.ts` (hög prioritet)

Testa markdown-parsning:

- **`extractField()`** — hittar `**Fält:** värde` i markdown
- **`extractTitle()`** — hittar `## Rubrik`
- **`confidenceFromCount()`** — 0→0.5, 3→0.7, 9→0.85, 10→0.95
- **`migrateKnowledgeToGraph()`** — fullständig parsning av knowledge.md med noder och kanter. Testa med tom input, minimal input, komplett input

### 3. `tests/core/baseline.test.ts` (medel prioritet)

Testa `detectTestStatus()`:

- Workspace med `package.json` → vitest, jest, okänt framework
- Workspace med `pyproject.toml` → pytest
- Workspace med bara `tests/`-katalog
- Workspace utan testinfrastruktur
- Mocka filsystemet (memfs eller tmp-dir)

### 4. `tests/commands/neuron-statistics.test.ts` (medel prioritet)

Testa CLI-kommandots formaterings- och filtreringslogik:

- Formatering av statistikdata till terminal
- Flaggor: `--last N`, `--category`, `--json`
- Tomt resultat

### 5. `tests/commands/replay.test.ts` (låg prioritet)

Testa replay-logik:

- Parsning av audit.jsonl
- Filtrering per agent/tool
- Felhantering vid saknad fil

## Avgränsningar

- Testa INTE `src/cli.ts` — det är en CLI-entrypoint med arg-parsning, täcks bäst av E2E-tester
- Testa INTE `src/commands/index.ts` — ren re-export
- Testa INTE `src/commands/mcp-server.ts` — 5 rader, bara anropar `startMcpServer()`
- Testa INTE `src/core/types.ts` — bara typdefinitioner
- Testa INTE `src/aurora/index.ts` — ren re-export
- Ändra INTE befintlig kod — bara lägg till tester

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `graph-tools.test.ts` med ≥15 tester | `pnpm test` |
| `knowledge-graph-migrate.test.ts` med ≥10 tester | `pnpm test` |
| `baseline.test.ts` med ≥5 tester | `pnpm test` |
| `neuron-statistics.test.ts` med ≥5 tester | `pnpm test` |
| Alla 1750 befintliga tester fortfarande gröna | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |
| Totalt ≥35 nya tester | `pnpm test` |

## Risk

**Låg.** Ingen produktionskod ändras — bara nya testfiler läggs till.

**Rollback:** Ta bort de nya testfilerna.
