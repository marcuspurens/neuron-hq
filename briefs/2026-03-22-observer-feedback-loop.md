# Brief: 2.6b Observer feedback-loop till Brief Reviewer

**Target:** neuron-hq
**Effort:** 1 körning (liten)
**Roadmap:** Fas 2 — Intelligens, punkt 2.6b

## Bakgrund

Brief Reviewer granskar briefar och ger betyg (scope, AC:er, edge cases osv) + verdict (GODKÄND/UNDERKÄND). Men Brief Reviewer ser aldrig hur det faktiskt gick. "Jag sa scope 8/10" — tog körningen 30 min eller 3 timmar? Var den GRÖN eller RÖD?

**Data finns redan:**
- `runs/reviews/review-<timestamp>.json` — Brief Reviewers granskning (betyg + verdict)
- `runs/<runid>/metrics.json` — faktiskt utfall (tid, tokens, tester, delegationer)
- `runs/<runid>/reviewer_result.json` — Reviewers verdict (GREEN/YELLOW/RED)

**Det som saknas:** en brygga som jämför granskningen med utfallet och sparar korrelationen.

Identifierat i Brief Reviewer V2-intervju (S123), gap #3 + #5.

## Vad ska byggas

### 1. Kalibreringsmodul (`src/core/observer-calibration.ts`)

En modul som efter varje körning:
1. Hittar senaste review-JSON som matchar körningens brief
2. Parsear Brief Reviewers betyg (scope, totalt) och verdict ur review-textens markdown
3. Läser `metrics.json` + `reviewer_result.json` från körningens `runs/<runid>/`
4. Beräknar avvikelser
5. Appendar en rad till `memory/review_calibration.md`

```typescript
interface CalibrationEntry {
  date: string;                    // ISO-datum
  runid: string;                   // t.ex. "20260322-0150-neuron-hq"
  briefFile: string;               // t.ex. "observer-a-observation.md"
  reviewScopeScore: number;        // Brief Reviewers scope-betyg (1-10)
  reviewTotalScore: number;        // Brief Reviewers totalbetyg
  reviewVerdict: string;           // "GODKÄND" | "GODKÄND MED RESERVATIONER" | "UNDERKÄND"
  actualStoplight: string;         // "GREEN" | "YELLOW" | "RED"
  actualDurationMinutes: number;   // metrics.json → timing.duration_seconds / 60
  actualTokensTotal: number;       // metrics.json → tokens.total_input + tokens.total_output
  actualTestsAdded: number;        // metrics.json → testing.after_passed - testing.baseline_passed (eller 0 om negativ)
  actualReDelegations: number;     // metrics.json → delegations.re_delegations
  scopeAccuracy: string;           // "OVER" | "UNDER" | "ACCURATE"
  verdictAccuracy: string;         // "MATCH" | "MISMATCH"
}
```

**Parsning av review-text:**
- Scope-betyg: sök `| Scope | X/10 |` eller `| Scope & genomförbarhet | X/10 |` i review-markdown
- Totalbetyg: sök `| **Totalt** | **X/10** |`
- Verdict: sök `GODKÄND`, `GODKÄND MED RESERVATIONER` eller `UNDERKÄND` i sista stycket

**Matchning review → körning (prioritetsordning):**

`appendCalibration` tar emot `briefFile` som tredje argument (briefens filnamn från `ctx.briefFile`). Matchning mot review-JSON:er i `runs/reviews/`:

1. Om review-JSON har `briefFile` som inte är tom: matcha mot det medskickade `briefFile`
2. Om `briefFile` är tom: sök efter briefens filnamn i `turns[0].content` (review-texten). Guard: om `turns` är tom eller saknas → hoppa till steg 3
3. Om ingen match hittas: logga "Kalibrering skippades: ingen matchande review för [briefFile]" och returnera

**Scope-accuracy (exhaustive, evalueras i prioritetsordning — första som matchar vinner):**
1. `OVER`: körningen blev GRÖN och scope-betyg var ≤6 (Brief Reviewer underskattade — sa "riskabelt" men körningen gick bra)
2. `ACCURATE`: körningen blev GRÖN och tog ≤90 min
3. `UNDER`: allt annat (YELLOW/RED, eller GRÖN men >90 min, eller GRÖN men ≥3 re-delegationer)

Logiken i kod:
```typescript
function classifyScopeAccuracy(
  stoplight: string, scopeScore: number, durationMin: number, reDelegations: number,
): 'OVER' | 'ACCURATE' | 'UNDER' {
  if (stoplight === 'GREEN' && scopeScore <= 6) return 'OVER';
  if (stoplight === 'GREEN' && durationMin <= 90) return 'ACCURATE';
  return 'UNDER';
}
```

**Verdict-accuracy:**
- `MATCH`: review-verdict var GODKÄND/GODKÄND MED RESERVATIONER + körning GRÖN, eller UNDERKÄND + körning RED/YELLOW
- `MISMATCH`: allt annat (t.ex. GODKÄND men körning RED, eller UNDERKÄND men körning GRÖN)

### 2. Kalibreringsfilformat (`memory/review_calibration.md`)

Append-only markdownfil:

```markdown
# Brief Reviewer — Kalibreringsdata

> Genereras automatiskt av Observer efter varje körning.
> Brief Reviewer läser denna i Fas 0 för att kalibrera sina bedömningar.

| Datum | Körning | Brief | Scope (BR) | Totalt (BR) | Verdict (BR) | Stoplight | Tid (min) | Scope-acc | Verdict-acc |
|-------|---------|-------|------------|-------------|--------------|-----------|-----------|-----------|-------------|
| 2026-03-22 | #174 | observer-a | 8 | 8.6 | GODKÄND | GREEN | 61 | ACCURATE | MATCH |
```

### 3. Integration i körflödet

Uppdatera `src/commands/run.ts` — lägg till kalibrering efter att Observer-rapporten genererats:

```typescript
// Efter Observer-rapport (Brief A/B kod redan på plats):
import { appendCalibration } from '../core/observer-calibration.js';
await appendCalibration(ctx.runDir, baseDir, ctx.briefFile);
// ctx.briefFile = sökvägen till briefen som kördes, t.ex. "briefs/2026-03-22-observer-a-observation.md"
```

`appendCalibration` hanterar allt internt: hitta review, läs metrics, parsea, appenda. Om data saknas (ingen review, inget metrics.json, inget reviewer_result.json): logga explicit vilken fil som saknas och returnera utan att skriva.

### 4. Brief Reviewer läser kalibrering

Uppdatera `prompts/brief-reviewer.md` Fas 0 — lägg till en punkt:

```markdown
5. Om `memory/review_calibration.md` finns: skanna tabellen. Notera om dina scope-bedömningar tenderar att vara OVER/UNDER. Justera medvetet.
```

## Filer att skapa

| Fil | Beskrivning |
|-----|-------------|
| `src/core/observer-calibration.ts` | **NY** — Kalibrerings-brygga |
| `tests/core/observer-calibration.test.ts` | **NY** — Tester |

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/commands/run.ts` | Lägg till `appendCalibration()` anrop efter Observer |
| `prompts/brief-reviewer.md` | Ny punkt 5 i Fas 0 |

## Filer att INTE ändra

- `src/core/agents/observer.ts` (Observer behöver inte veta om kalibrering)
- Inga andra agentprompter
- `policy/` filer

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Review-JSON saknar `briefFile` | Medel | Ingen matchning | Trestegs-matchning: briefFile → turns-content → skippa |
| Parsning av betyg misslyckas | Låg | Ingen kalibrering | Regex med fallback, logga och skippa |
| `memory/review_calibration.md` blir stor | Låg (lång sikt) | Trög inläsning | V1: ingen trunkering — filen växer ~1 rad per körning, ~200 rader/år. Trunkering kan läggas till senare |
| metrics.json har oväntade fältnamn | Låg | Parsning misslyckas | Verifiera mot faktisk metrics.json — fältnamnen i briefen baseras på `runs/20260322-0150-neuron-hq/metrics.json`: `timing.duration_seconds`, `tokens.total_input`+`total_output`, `testing.after_passed`-`testing.baseline_passed`, `delegations.re_delegations` |
| Dubbelanrop (samma körning två gånger) | Låg | Dubblettrad | Kontrollera om runid redan finns i filen innan append |

## Acceptanskriterier

- **AC1:** Efter varje körning som har en matchande brief-review: en ny rad appendas till `memory/review_calibration.md` med scope-score, totalbetyg, verdict, stoplight, tid och accuracy-klassificeringar
- **AC2:** Om ingen matchande review finns (ny brief utan granskning): ingen rad skrivs, ingen krasch, loggmeddelande
- **AC3:** Brief Reviewer-prompten har uppdaterats med punkt 5 i Fas 0 som instruerar att läsa kalibreringsdatan

### Tester

- **AC4:** `observer-calibration.test.ts` täcker minst:
  - Lyckad kalibrering: review + metrics → korrekt rad i markdown
  - Scope-accuracy prioritetsordning: OVER (GRÖN+scope≤6), ACCURATE (GRÖN+≤90min), UNDER (allt annat)
  - Scope-accuracy edge case: GRÖN + 95 min + scope 8 → UNDER (inte ACCURATE, inte OVER)
  - Verdict-accuracy: MATCH (GODKÄND+GREEN), MISMATCH (GODKÄND+RED)
  - Saknad review → ingen output, ingen krasch
  - Saknad metrics.json → ingen output, ingen krasch
  - Parsning av review-betyg från markdown-tabell (inkl. fallback om format avviker)
  - Append till befintlig fil (inte skriv över)
  - Dubblettskydd: samma runid appendas inte två gånger
  - Matchning: briefFile tom → fallback till turns-content-matchning
  - Matchning: tom turns-array i review-JSON → hoppa till steg 3 (skippa), ingen krasch
  - Saknad reviewer_result.json → loggmeddelande "Kalibrering skippades: reviewer_result.json saknas", ingen krasch
- **AC5:** Alla befintliga tester passerar utan regression

## Designbeslut

1. **Append-only markdown (inte JSON):** Brief Reviewer läser prompten som text — markdown-tabell är lättare att parsa för en LLM än JSON-array.
2. **Kalibrering i Observer-scope, inte i Brief Reviewer:** Observer har redan tillgång till post-run data. Brief Reviewer kör innan körningen — den ska bara *läsa*, inte *skriva*.
3. **Enkel scope-accuracy (tre nivåer):** V1 behöver inte sofistikerad statistik. OVER/UNDER/ACCURATE räcker för att Brief Reviewer ska se trender.
