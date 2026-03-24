# Brief: 3.5 Dynamisk diff-limit

**Target:** neuron-hq
**Effort:** 1 körning
**Roadmap:** Fas 3 — Agent-mognad, punkt 3.5

## Bakgrund

Diff-gränsen är idag statisk: 150 rader varning, 300 rader block (`policy/limits.yaml`). Alla tasks behandlas lika — en mekanisk rename över 40 filer bedöms identiskt med en komplex algoritmändring i 2 filer.

Från djupsamtalet S102 (Marcus kommentar): *"Jag vill inte att någon agent ska känna begränsningar [...] är det inte rimligt att agenter kan prata om X, diskutera och sedan kompromissa?"*

Denna brief inför en **planeringstid-override**: Manager sätter en motiverad diff-gräns per task i sin plan. Implementer respekterar den. Reviewer bedömer oberoende. Allt loggas i audit.

## Designbeslut

### 1. Planeringstid, inte runtime

Manager bestämmer diff-gränsen NÄR HAN PLANERAR — inte mitt under Implementers arbete. Enklare, kräver ingen ny kommunikationskanal mellan agenter.

### 2. BLOCK-gränsen är taket

`diff_block_lines` (300) är det absoluta taket för alla overrides. Ingen separat config-nyckel behövs. Klippning: `min(override, diff_block_lines)`. En nyckel, ett ansvar.

### 3. Per-task i TaskPlan

`AtomicTaskSchema` i `src/core/task-splitter.ts` (rad 3-9) får två valfria fält: `maxDiffLines` och `maxDiffJustification`. Om de saknas gäller default (150).

`maxDiffLines < 150` är tillåtet — Manager kan sätta en striktare gräns per task (t.ex. 50 rader för en liten buggfix där en stor diff indikerar scope creep). Motivering krävs oavsett riktning.

### 4. Policy respekterar override

`PolicyEnforcer.checkDiffSize()` i `src/core/policy.ts` (sök efter `checkDiffSize`) tar idag `(additions, deletions)`. Utökas med valfri `overrideWarnLines`:

```typescript
checkDiffSize(
  additions: number,
  deletions: number,
  overrideWarnLines?: number  // NYT — per-task override från Manager
): { status: 'OK' | 'WARN' | 'BLOCK'; reason?: string }
```

**Logik:**
- `effectiveWarn = min(overrideWarnLines, this.limits.diff_block_lines)` — override kan aldrig överstiga BLOCK
- WARN-tröskel: `effectiveWarn ?? this.limits.diff_warn_lines`
- BLOCK-tröskel: `this.limits.diff_block_lines` (300, OFÖRÄNDRAD)
- **Viktigt:** Override påverkar BARA WARN-tröskeln, aldrig BLOCK. En override på 50 rader gör att WARN triggas vid 51+ rader, men BLOCK sker fortfarande bara vid 300+. Override = "varna mig tidigare", BLOCK = "absolut säkerhetsgräns"
- Funktionen förblir ren (pure function) — ingen audit-loggning, ingen sidoeffekt

### 5. Reviewer bedömer oberoende

Reviewer får INGEN special-information om overrides. Override är ett kontrakt mellan Manager och Implementer — ett tillstånd att arbeta, inte en instruktion att bedöma annorlunda.

Om Reviewer undrar varför en diff är stor kan den läsa `task_plan.md` med sitt `read_file`-verktyg. Precis som en människa läser PR-beskrivningen.

### 6. Manager injicerar alltid diff-gränsen

Manager lägger ALLTID till diff-gränsen i task-strängen till Implementer — både med och utan override. Explicit > implicit:
- Utan override: `\nDiff limit for this task: 150 lines.`
- Med override: `\nDiff limit for this task: 250 lines.`

Programmatisk injektion i `delegateToImplementer()` — inte LLM-beroende.

### 7. Implementer-prompt behåller "150" som default

Prompten säger `Keep diffs under 150 lines (unless a different limit is specified in your task)`. Defensivt — om task-strängs-injektionen misslyckas finns alltid en konkret fallback.

### 8. Audit-loggning vid planering

Varje diff-override loggas i `audit.jsonl` med:
- `event: 'diff_override_set'`
- `task`: task-ID och beskrivning
- `default_limit`: 150
- `override_limit`: det satta värdet
- `effective_limit`: efter klippning mot BLOCK-gräns
- `justification`: Managers motivering

Ingen enforcement-loggning i policy.ts — den förblir en ren funktion. Anropare loggar vid behov.

## Vad ska byggas

### 1. task-splitter.ts — AtomicTaskSchema utökning

`AtomicTaskSchema` (rad 3 i `src/core/task-splitter.ts`) utökas med:

```typescript
maxDiffLines: z.number().positive().optional(),
maxDiffJustification: z.string().min(10).optional(),
```

Valideringsregel i `validateTaskPlan()`: om `maxDiffLines` sätts MÅSTE `maxDiffJustification` finnas (annars: validering misslyckas med beskrivande felmeddelande). `min(10)` kräver substantiell motivering — inte bara "ok" eller "".

### 2. policy.ts — checkDiffSize utökning

Uppdatera `checkDiffSize()` (sök efter metodnamnet i `src/core/policy.ts`) enligt designbeslut #4. Klipp override mot `this.limits.diff_block_lines`. Ingen audit-loggning — funktionen förblir ren.

### 3. manager.ts — write_task_plan + injicera gräns + audit

**write_task_plan-toolet** (sök efter `write_task_plan` i `src/core/agents/manager.ts`):
- `input_schema` (rad ~633-652) har hårdkodad typ utan `maxDiffLines`/`maxDiffJustification`. Lägg till dessa som valfria fält i task-objektets `properties`
- Type cast (rad ~732) i `executeTools` har hårdkodad typ — uppdatera så `maxDiffLines` och `maxDiffJustification` inkluderas

**delegateToImplementer()** (sök efter metodnamnet i `src/core/agents/manager.ts`):
- Bryt ut en pure function `buildTaskString(taskDescription: string, maxDiffLines?: number): string` som appendar diff-gränsen till task-strängen. Denna funktion är trivialt testbar utan att mocka Manager
- Läs `maxDiffLines` från aktuell task i TaskPlan. Om TaskPlan saknas eller task saknar `maxDiffLines`: använd default 150
- Anropa `buildTaskString()` som ALLTID lägger till: `\nDiff limit for this task: ${maxDiffLines ?? 150} lines.`
- Om `maxDiffLines` sätts: logga `diff_override_set` i audit.jsonl (via befintlig audit-mekanism `this.ctx.audit.log()` — sök efter `audit.log` i manager.ts)

### 4. implementer.ts — respektera injicerad gräns

Ändra de hårdkodade strängarna (sök efter "150 lines" i `src/core/agents/implementer.ts`):
- `Keep diffs under 150 lines per iteration` → `Keep diffs under 150 lines per iteration (unless a different limit is specified in your task)`
- `Keep diffs small (<150 lines)` → `Keep diffs within the limit specified in your task (default: 150 lines)`

### 5. Promptfixar

**manager.md** (sök efter "150 lines" i `prompts/manager.md` — 4 ställen):
- `<150 lines of diff` → `within the diff limit (default 150, overridable via maxDiffLines in TaskPlan)`  (första förekomsten)
- Övriga 3 förekomster: `<150 lines` → `within diff limit`

Lägg till ny sektion under task-planering (efter den uppdaterade raden):
```
You MAY set a higher diff limit per task (maxDiffLines, up to diff_block_lines) with a written justification (maxDiffJustification, min 10 characters).
Valid reasons: mechanical renames, test-only additions, auto-generated code.
Invalid reasons: "it's complex" or "I need more space".
You MAY also set a LOWER limit to constrain scope on small fixes.
Default remains 150 lines — only override when objectively justified.
```

**implementer.md** (sök efter "150 lines" i `prompts/implementer.md` — 2 ställen):
- `<150 lines per iteration` → `within your task's diff limit (default 150 lines per iteration)`
- `diff > 150 lines` → `diff exceeds your task's diff limit (default 150 lines)`

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/core/task-splitter.ts` | `maxDiffLines` + `maxDiffJustification` i AtomicTaskSchema, validering |
| `src/core/policy.ts` | `checkDiffSize()` accepterar `overrideWarnLines`, klipps mot BLOCK |
| `src/core/agents/manager.ts` | Alltid injicera diff-gräns i Implementer-task + audit-loggning vid override |
| `src/core/agents/implementer.ts` | "150 lines (unless overridden)" (2 ställen) |
| `prompts/manager.md` | Override-instruktioner + dynamisk referens (4 ställen) |
| `prompts/implementer.md` | "your task's diff limit (default 150)" (2 ställen) |

## Filer att INTE ändra

- `policy/limits.yaml` — ingen ny nyckel behövs. BLOCK-gränsen (300) är taket
- `src/core/types.ts` — inget nytt fält i PolicyLimitsSchema
- `src/core/agents/reviewer.ts` — Reviewer bedömer oberoende, ingen override-injektion
- `src/core/ppr.ts` — irrelevant
- `src/core/agents/consolidator.ts` — hanterar kunskapsgraf, inte diff-gränser
- `src/core/agents/historian.ts` — loggar, överridear inte
- `src/core/agents/observer.ts` — observerar, ändrar inte policy
- `src/commands/run.ts` — override flödar genom Manager → Implementer
- `src/core/agents/merger.ts` — anropar inte `checkDiffSize`, irrelevant
- `src/core/agents/tester.ts` — kör tester, irrelevant

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Manager sätter override på alla tasks | Medel | Förlorar gränsens värde | Prompt: "Invalid reasons" + motivering min 10 tecken |
| TaskPlan-schemat bryter bakåtkompatibilitet | Låg | Kompilationsfel | Fält är `.optional()` |
| Implementer ignorerar injicerad gräns | Medel | Diff blir för stor ändå | Reviewer fångar — bedömer oberoende |

## Acceptanskriterier

### Policy

- **AC1:** `checkDiffSize(100, 60, 250)` returnerar `{ status: 'OK' }` (total 160 < override 250). Utan override: returnerar `{ status: 'WARN' }` (160 > default 150)
- **AC2:** `checkDiffSize(200, 150, 400)` returnerar `{ status: 'BLOCK' }` (total 350 > BLOCK 300). Override klipps till 300 men total överstiger BLOCK
- **AC3:** `checkDiffSize(280, 0, 400)` returnerar `{ status: 'OK' }` (override klipps till min(400, 300) = 300, total 280 < 300)
- **AC4a:** `checkDiffSize(160, 0)` utan override returnerar `{ status: 'WARN' }` (total 160 > default 150, < BLOCK 300)
- **AC4b:** `checkDiffSize(160, 0, 50)` returnerar `{ status: 'WARN' }` (effectiveWarn = 50, total 160 > 50 men < BLOCK 300 → WARN, inte BLOCK)
- **AC4c:** `checkDiffSize(310, 0, 50)` returnerar `{ status: 'BLOCK' }` (total 310 > BLOCK 300 — BLOCK-tröskel oförändrad oavsett override)

### TaskPlan

- **AC5:** `AtomicTaskSchema` accepterar `{ ..., maxDiffLines: 250, maxDiffJustification: "mechanical rename across 40 files" }`. Parsningen lyckas
- **AC6:** `validateTaskPlan()` returnerar fel om `maxDiffLines` sätts utan `maxDiffJustification`, eller med `maxDiffJustification` kortare än 10 tecken
- **AC6b:** `validateTaskPlan()` lyckas om `maxDiffJustification` sätts utan `maxDiffLines` (orphaned justification är ofarligt och ignoreras)
- **AC7:** `validateTaskPlan()` lyckas om varken `maxDiffLines` eller `maxDiffJustification` sätts (bakåtkompatibelt)

### Integration

- **AC8:** `buildTaskString("implement feature X")` returnerar sträng som slutar med `\nDiff limit for this task: 150 lines.` (default). `buildTaskString("implement feature X", 250)` returnerar sträng som slutar med `\nDiff limit for this task: 250 lines.` Pure function — testas direkt utan mocking
- **AC9:** `audit.jsonl` innehåller entry med `event: 'diff_override_set'` inkl `effective_limit` när Manager sätter override. Ingen audit-entry vid default (150)

### Prompt

- **AC10:** `prompts/manager.md` nämner INTE hårdkodat "<150 lines" (ersatt med dynamisk referens). Innehåller override-instruktioner med "maxDiffLines"
- **AC11:** `prompts/implementer.md` behåller "150" som default men lägger till "unless overridden" / "your task's diff limit"

### Regression

- **AC12:** Alla befintliga tester passerar utan regression (`pnpm test`)
