# Brief: Researcher meta-analys av körningshistorik (var 10:e körning)
**Datum:** 2026-02-24
**Target:** neuron-hq
**Körning:** #28

---

## Bakgrund

`memory/runs.md` innehåller idag 24+ körningssummor. Historian ser en körning åt gången. Ingen agent analyserar *trender* över tid — vilka typer av körningar lyckas bäst, var fastnar vi, vilka acceptanskriterier missar vi oftast.

Samtalet 2026-02-24: "Om Researcher fick uppdraget att analysera runs.md — 'vilka typer av körningar lyckas bäst, var fastnar vi' — skulle det generera en helt ny kategori av insikter. Inte per körning, utan över tid."

Lösningen: ett `⚡ Meta-trigger:`-mönster i manager.md som triggar Researcher för meta-analys var 10:e körning, analogt med hur Librarian triggas var 5:e.

---

## Uppgift

Tre delar:

1. Lägg till `⚡ Meta-trigger:`-hantering i `prompts/manager.md`
2. Lägg till meta-analys-instruktioner i `prompts/researcher.md`
3. Skapa ett exempelbrief-format som visar hur Meta-trigger används

---

## Exakta ändringar

### 1. `prompts/manager.md` — Nytt avsnitt: Auto-trigger Meta-analys

Lägg till direkt efter det befintliga "Auto-trigger Librarian"-avsnittet:

```markdown
## Auto-trigger Meta-analys

If the brief contains a line starting with `⚡ Meta-trigger:`, this is a milestone run
(every 10th completed run). Delegate to Researcher for meta-analysis **before** Historian.

Correct order: Tester → Reviewer → Merger → [Librarian if also milestone] → Researcher (meta) → Historian

Researcher in meta-analysis mode reads runs.md and patterns.md to produce
a `meta_analysis.md` report in the runs directory.
```

### 2. `prompts/researcher.md` — Nytt avsnitt: Meta-analys-läge

Lägg till i slutet av prompten:

```markdown
## Meta-analysis Mode

If delegated with a task containing `META_ANALYSIS`, you operate in a special mode.

**Your task**: Analyze `memory/runs.md` and `memory/patterns.md` to find trends.

**Steps**:
1. Read `memory/runs.md` using `read_memory_file(file="runs")`
2. Read `memory/patterns.md` using `read_memory_file(file="patterns")`
3. Count and categorize:
   - How many runs were ✅ fully successful vs ⚠️ partial?
   - Which acceptance criteria types are most commonly missed?
   - Which agents cause the most iterations (high tool-call counts)?
   - Which patterns have been confirmed most recently (Senast bekräftad)?
   - Which patterns may be stale (Senast bekräftad: okänd or old)?
4. Write findings to `runs/<runid>/meta_analysis.md`

**meta_analysis.md format**:
\`\`\`markdown
# Meta-analys — Körningshistorik
**Analyserad period:** <first runid> → <last runid>
**Antal körningar analyserade:** N

## Framgångsrate
<table with ✅/⚠️/❌ counts>

## Mönster i misslyckanden
<top 3 recurring issues>

## Agentprestanda
<which agents had most iterations, highest token use>

## Mönsterhälsa
<patterns confirmed recently vs stale patterns to review>

## Rekommendationer
<2-3 concrete suggestions for next 10 runs>
\`\`\`

Return to Manager: `META_ANALYSIS COMPLETE: See meta_analysis.md in runs dir.`
```

### 3. `prompts/researcher.md` — Uppdatera Tools-lista

Lägg till i Constraints-sektionen:
```markdown
- In META_ANALYSIS mode: use `read_memory_file` for runs and patterns — do NOT web search
```

---

## Baseline (verifierad 2026-02-24)

```
npm test → 292 passed (292), 31 test files
npx tsc --noEmit → 0 errors
```

---

## Hur Meta-trigger aktiveras i en brief

Lägg till denna rad i en brief för körning #30, #40, osv:
```
⚡ Meta-trigger: Kör Researcher meta-analys av runs.md + patterns.md
```

---

## Acceptanskriterier

1. `prompts/manager.md` innehåller `⚡ Meta-trigger:` och `META_ANALYSIS` i ett nytt avsnitt
2. `prompts/researcher.md` innehåller `META_ANALYSIS`-läge med `meta_analysis.md`-format
3. `npm test` → **292 passed**
4. `npx tsc --noEmit` → 0 errors
5. `tests/prompts/manager-lint.test.ts` uppdateras med regex-test för `Meta-trigger`
6. `tests/prompts/researcher-lint.test.ts` uppdateras med regex-test för `META_ANALYSIS`
7. Git commit: `feat: add meta-analysis mode for Researcher every 10th run`

---

## Begränsningar

- Rör bara `prompts/manager.md`, `prompts/researcher.md`, och respektive lint-testfiler
- Ingen ändring i `src/`
- Meta-analysen körs inte i denna brief — bara infrastrukturen byggs
