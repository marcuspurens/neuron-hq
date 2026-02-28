# Brief: Emergent beteende-logg — Flagga oväntade agentbeslut

## Bakgrund

Under G2-körningen valde Implementer att skapa en delad modul (`graph-tools.ts`, 345 rader)
trots att briefen sa "refaktorering möjlig men inte obligatorisk." Det var rätt beslut —
men det kunde ha varit fel. Vi märkte det bara för att vi granskade manuellt.

**Problem:** Agenter fattar designbeslut som inte är explicit instruerade i briefen.
Ibland är det bra (G2-fallet). Ibland kan det vara skadligt (överabstraktion, onödiga
dependencies, arkitekturella val som inte passar). Det finns ingen systematisk loggning
av *när* agenter avviker från briefens scope.

**Källa:** Djupsamtal session 50 — sektion 6.2 "Emergent beteende".

## Scope

**Reviewer flaggar avvikelser från briefen. Historian loggar dem i grafen.**

## Uppgifter

### 1. Uppdatera Reviewer-prompten (`prompts/reviewer.md`)

Lägg till en ny sektion "Scope Verification":

```markdown
### Scope Verification — Emergent Behavior Detection

Compare the actual changes (git diff) against the brief's scope:
1. Read `brief.md` from the run artifacts
2. For each changed file, ask: "Was this file change explicitly requested in the brief?"
3. If a change goes BEYOND the brief's scope:
   - Classify it: BENEFICIAL (simplifies future work), NEUTRAL (no impact), or RISKY (adds complexity)
   - Document it in report.md under a new section "## Emergent Changes":
     ```
     ## Emergent Changes
     | File | Change | Classification | Reasoning |
     |------|--------|---------------|-----------|
     | src/agents/graph-tools.ts | Created shared module instead of duplicating | BENEFICIAL | Simplifies G3 |
     ```
4. BENEFICIAL emergent changes do NOT block GREEN
5. RISKY emergent changes → YELLOW at minimum (require human review)
```

### 2. Uppdatera Historian-prompten (`prompts/historian.md`)

Lägg till efter steg 6 (graf-skrivning):

```markdown
7. **Log emergent behavior** from report.md:
   - If report.md contains "## Emergent Changes" section:
   - For each BENEFICIAL change: create a graph node type="pattern" with
     `properties.emergent = true` and title "Emergent: <description>"
   - For each RISKY change: create a graph node type="error" with
     `properties.emergent = true` and title "Emergent risk: <description>"
   - Add `discovered_in` edge to current run
```

### 3. Tester

Skriv tester i `tests/core/emergent-behavior.test.ts`:

1. Reviewer-prompten innehåller "Scope Verification" sektion
2. Historian-prompten innehåller "Log emergent behavior" sektion
3. En pattern-nod med `properties.emergent = true` kan skapas och laddas korrekt
4. En error-nod med `properties.emergent = true` kan skapas och laddas korrekt
5. `graph_query` hittar emergent-noder via properties-sökning

## Acceptanskriterier

- [ ] `prompts/reviewer.md` innehåller "Scope Verification"-sektion
- [ ] `prompts/historian.md` innehåller "Log emergent behavior"-sektion
- [ ] Reviewer dokumenterar emergent changes i `report.md`
- [ ] Historian skapar graf-noder med `emergent = true`
- [ ] RISKY emergent changes ger YELLOW-verdict
- [ ] 4+ tester
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Low.** Rent additiva prompt-ändringar. Inga kodändringar förutom eventuella testhjälpfunktioner.
Befintligt beteende påverkas inte — det här lägger bara till loggning.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test
```

Förväntat baseline: 443 passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-28-emergent-behavior-log.md --hours 1
```
