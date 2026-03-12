# Brief: Manager läser grafen vid planering

## Bakgrund

GraphRAG G3 (session 50) gav alla agenter `graph_query` och `graph_traverse` som read-only
verktyg. Men Manager-prompten säger inte *när* eller *hur* dessa ska användas.

Det betyder att Manager har tillgång till kunskapsgrafen men aldrig tittar i den. Grafen
har 70+ noder med mönster, buggar, beslut och risker — information som borde påverka hur
Manager planerar arbetet.

**Problem:** Manager planerar utan att konsultera systemets samlade erfarenhet.

## Scope

Uppdatera Manager-prompten så att Manager konsulterar grafen i planeringsfasen. Lägg till
ett planeringssteg och tester.

## Uppgifter

### 1. Manager-prompt: Planeringssteg med graf

Lägg till i `prompts/manager.md` efter "Read the brief" men före "Delegate to Researcher":

```markdown
### 2. Consult Knowledge Graph

Before planning, query the knowledge graph for relevant context:

1. **Known patterns for this target:**
   ```
   graph_query({ labels: ["pattern"], properties: { target: "<target-name>" } })
   ```

2. **Known risks and bugs:**
   ```
   graph_query({ labels: ["risk", "bug"], min_confidence: 0.5 })
   ```

3. **Previous decisions:**
   ```
   graph_query({ labels: ["decision"], properties: { target: "<target-name>" } })
   ```

Use what you find to:
- Avoid repeating known mistakes (check "bug" nodes)
- Follow established patterns (check "pattern" nodes)
- Respect previous architectural decisions (check "decision" nodes)
- Flag if the brief conflicts with any known risk

If the graph returns no relevant nodes, proceed normally.
```

### 2. Manager-prompt: Nummrera om stegen

Uppdatera numreringen i Manager-prompten:
- Steg 1: Read the brief (oförändrat)
- **Steg 2: Consult Knowledge Graph (ny)**
- Steg 3: Delegate to Researcher (var steg 2)
- Steg 4: Plan and delegate (var steg 3)
- osv.

### 3. Tester

Skriv tester i `tests/prompts/manager-graph.test.ts`:

1. Manager-prompten innehåller "Consult Knowledge Graph"
2. Manager-prompten nämner `graph_query` med label-filter
3. Manager-prompten nämner minst 3 labels: "pattern", "risk/bug", "decision"
4. Manager-prompten instruerar att använda grafresultat i planering
5. Manager-prompten har fallback "If the graph returns no relevant nodes"

## Acceptanskriterier

- [ ] `prompts/manager.md` innehåller "Consult Knowledge Graph"-steg
- [ ] Prompten refererar `graph_query` med specifika labels
- [ ] Prompten instruerar att använda grafen i planeringsbeslut
- [ ] 5+ tester i `tests/prompts/manager-graph.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Low.** Bara prompt-ändringar + prompt-tester. Ingen kodändring. Om grafen är tom eller
irrelevant instrueras Manager att gå vidare som vanligt.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 474 passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-28-manager-graph-context.md --hours 1
```
