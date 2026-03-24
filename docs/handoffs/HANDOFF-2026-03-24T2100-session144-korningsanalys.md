# HANDOFF-2026-03-24T2100 — Session 144: Djupanalys av körning 3.5

## Bakgrund

Körning 3.5 (dynamisk diff-limit) slutförde GRÖN — alla 12 AC, 3916 tester, $39.85, 62 min. Featureen levererades korrekt. Denna session analyserade ALLA artefakter i runs-katalogen och identifierade 10 problem + 4 idéer. Efter djupare utredning filtrerades listan till 8 verkliga problem (2 var korrekt beteende).

## Samtalsflöde

### 1. Körning avslutad, rapporter lästa

Läste report.md, prompt-health, usage.json, ideas.md, questions.md. Första analysen identifierade 5 problem (P1-P4 + P10).

### 2. Marcus: "kolla ALLT i runs-mappen"

Läste ALLA 20+ filer i runs/20260324-1523-neuron-hq/:
- report.md, prompt-health, usage.json (Tier 1)
- reviewer_result.json, test_report.md, task_scores.jsonl, metrics.json, knowledge.md (Tier 2)
- digest.md, ideas.md, task_plan.md, implementer_handoff.md, reviewer_handoff.md (Tier 3)
- baseline.md, graph-health.md, reviewer_brief.md, implementer_result.json (Tier 4)
- Alla transcripts (historian, consolidator, observer-retros)

Hittade 5 nya problem (P5-P9) genom att läsa Tier 2-3 filer.

### 3. Ny feedback sparad

`feedback-run-artifact-reading.md` — prioriterad läsordning för runs-artefakter, 4 tiers.

### 4. Djuputredning av alla problem

Undersökte kodbasen för att förstå rotorsaker och klassificera varje problem som "direkt fix" vs "behöver brief" vs "inget att fixa".

---

## TODO-RAPPORT: Alla problem, analys och lösningsförslag

### DIREKTA KODFIXAR (kan göras utan brief)

#### Fix 1: metrics.json — parseTestCounts regex (P5)
- **Fil:** `src/core/run-metrics.ts` rad 63-90
- **Problem:** `parseTestCounts()` matchar `/(\d+)\s+passed/` men test_report.md skriver "3916/3916 passed" eller "3916 tests" — regex missar
- **Lösning:** Uppdatera regex att matcha fler varianter: `(\d+)\s+(?:passed|tests)`
- **Tid:** ~20 min
- **Påverkan:** Fixar P5 (metrics.json 0-värden) OCH troligen P6 (digest.md "+0 tester")

#### Fix 2: digest.md — stoplight-emoji bryter regex (P6)
- **Fil:** `src/core/run-digest.ts` rad 277
- **Problem:** `extractStoplight()` matchar `STOPLIGHT[:\s]+(GREEN|YELLOW|RED)` men report.md har `STOPLIGHT: 🟢 GREEN` — emojin `🟢` mellan `:` och `GREEN` bryter matchningen
- **Lösning:** Uppdatera regex: `STOPLIGHT[:\s]+(?:🟢\s*|🟡\s*|🔴\s*)?(GREEN|YELLOW|RED)`
- **Tid:** ~10 min

#### Fix 3: F1 — audit-loggningstest för diff_override_set
- **Fil:** `tests/core/agents/manager.test.ts`
- **Problem:** AC9 verifierad bara via kodläsning, inget körbart test
- **Lösning:** Ny testfunktion (~15-20 rader) med mock audit
- **Tid:** ~20 min

#### Fix 4: F2 — edge case overrideWarnLines=0
- **Fil:** `tests/policy.test.ts`
- **Problem:** `checkDiffSize(1, 0, 0)` otesterad
- **Lösning:** 1 ny test case (~5-8 rader)
- **Tid:** ~10 min

#### Fix 5: F4 — kommentar som kopplar maxDiffLines ↔ overrideWarnLines
- **Fil:** `src/core/agents/manager.ts` rad ~879
- **Lösning:** 3-4 raders kommentar
- **Tid:** ~5 min

**Total tid direkta fixar: ~65 min**

---

### KRÄVER BRIEF (agentsvärm-körning)

#### Brief 3.6: Historian/Consolidator reliability (P1, P2, P10) — KRITISK

**Problemet:** Historian och Consolidator har fått 0 output tokens i minst 3 körningar i rad. Retry-logiken från S141 hjälpte inte — den retryar bara vid iteration 1, och iteration 2 faller igenom om den också returnerar 0.

**Rotorsak i kod:**
- `historian.ts:239` — `if (iteration === 1 && response.usage.output_tokens === 0)` — bara 1 retry
- `consolidator.ts:175` — samma mönster
- `withRetry` i agent-utils.ts fångar bara kastade exceptions, inte HTTP 200 med 0 tokens
- 0 input_tokens tyder på att API-anropet kan misslyckas tyst vid streaming

**Djupare fråga:** Varför returnerar API:et 0/0 tokens? Möjliga orsaker:
1. Streaming misslyckas tyst (`stream.finalMessage()` returnerar default-värden)
2. Systemprompten + tools överstiger gränser
3. Transient API-problem
4. Context window exceeded

**Lösningsförslag (3 delar):**
1. **Utökad retry** — upp till 3 försök med exponentiell backoff (5s, 15s, 30s). Logga ERROR efter 3 misslyckade.
2. **Diagnostik** — logga systemprompt-storlek + request size vid 0-token-svar. Testa utan streaming som fallback.
3. **Observer 0-token-medvetenhet** — om agent har 0 output tokens i usage.json, skriv "AGENT DID NOT RUN (0 tokens)" istället för tool-alignment-analys.

**Påverkan:** Data förloras varje körning. Kunskapsgrafen stagnerar (83% isolerade noder).

---

#### Brief 3.7: Bash-exec budget per agent (P3, P4) — VIKTIG

**Problemet:** Manager 269 bash_exec (mål <60), Reviewer 118 (mål 40-50). Försämras: 134→159→269. Promptriktlinjer ignoreras — ingen programmatisk enforcement.

**Detaljerad analys:**
- Manager: 207 bash FÖRE första delegering. Läste task-splitter.ts 18 gånger. 168 iterationer men bara 8 delegationer.
- Reviewer: 7 varianter av grep efter `buildTaskString`, 11+ varianter efter "150 lines". Ingen deduplicering.
- Implementer: 197 bash men det var INTE ett loop-problem — 18 iterationer, 15 verifieringar, 8 commits. Effektivt.

**Lösningsförslag:**
1. **Ny limit i limits.yaml:** `max_bash_exec_manager: 80`, `max_bash_exec_reviewer: 60`
2. **Runtime-varning** vid 70% av budget — injiceras som user-meddelande i konversationen
3. **Soft block vid 100%** — agenten informeras, varje extra anrop loggas som OVER_BUDGET
4. **Valfritt (separat brief):** Kommandodeduplicering — varna om exakt samma kommando körts inom senaste 3 iterationerna

---

#### Brief 3.8 (valfri): task_plan.md status-uppdatering (P8)

**Problemet:** Alla tasks står som "⏳ pending" efter completion. task_plan.md är skrivskyddad specifikation, aldrig uppdaterad.

**Lösningsförslag:** Manager eller orchestrator uppdaterar task_plan.md med ✅/❌ efter varje task. ~100-150 rader ny kod + tester.

**Prioritet:** Låg — status spåras redan via audit.jsonl och task_scores.jsonl. Mest kosmetiskt.

---

### INGET ATT FIXA (utredda och avfärdade)

| Problem | Varför inget att fixa |
|---------|----------------------|
| P7 (task_scores token-fördelning) | Working as designed — audit loggar inte per-task tokens, delning är korrekt fallback |
| P9 (scripts/patch_manager.py) | Bara i workspace, inte merged. Korrekt beteende — Merger tog bara relevanta filer |

---

### IDÉER FRÅN KÖRNINGEN (lagra, ingen åtgärd nu)

1. **Reviewer-accessible TaskPlan summary** — `task_plan_summary.md` med aktuell tasks maxDiffLines/justification
2. **Runtime diff check i Implementer** — programmatisk check innan commit
3. **Policy limits dashboard** — sammanfatta `diff_override_set` audit entries vid körningsslut
4. **Audit log test coverage** — integration-test som läser mock audit.jsonl

---

## Prioriteringsordning

| Prio | Åtgärd | Typ | Varför |
|------|--------|-----|--------|
| 1 | Direkta kodfixar (Fix 1-5) | Kod | Snabbt, förbättrar rapportkvalitet |
| 2 | Brief 3.6: Historian/Consolidator | Brief | Data förloras varje körning |
| 3 | Brief 3.7: Bash-exec budget | Brief | Kostar pengar + tid, försämras |
| 4 | Brief 3.8: task_plan status | Brief | Kosmetiskt, låg prio |

---

## Ändrade filer denna session

| Fil | Ändring |
|-----|---------|
| `memory/feedback-run-artifact-reading.md` | NY — läsordning för runs-artefakter |
| `docs/handoffs/HANDOFF-2026-03-24T2100-session144-korningsanalys.md` | NY — denna handoff |

## Commits denna session

Inga commits — bara analys och rapportskrivning.

## Tester

3916 gröna (oförändrat — inga kodändringar).

## Branch

`swarm/20260324-0959-neuron-hq` — inga nya commits.

## VIKTIGT för nästa chatt

1. **Läs denna handoff** — komplett TODO-rapport med alla problem, analyser och lösningar
2. **Börja med Fix 1-5** — direkta kodfixar, ~65 min
3. **Sedan skriv brief 3.6** (Historian/Consolidator reliability) — det mest kritiska
4. **Ny feedback:** `feedback-run-artifact-reading.md` — läs Tier 1+2 efter varje körning
5. Kör ALDRIG `run` själv. CoT. Läs feedback-always-cot.md, feedback-never-run-commands.md, feedback-always-commit.md, feedback-deep-think-fixes.md, feedback-run-artifact-reading.md.
