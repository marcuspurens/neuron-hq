# HANDOFF-2026-03-24T1530 — Session 141: Alla agentproblem från 3.2b fixade

## Bakgrund

Session 140 identifierade 11 agentproblem (A-L) från körning 3.2b:s prompt-health-rapport och retro. Denna session: systematisk genomgång, analys, och fixar av alla problem. Marcus bad mig ta det lugnt, tänka högt (CoT), och jobba i logisk ordning.

## Samtalsflöde

### 1. Planering och ordning

Jag presenterade en fullständig analys av alla 11 problem med typ (kodfix/promptfix/radering), effort, och prioritet. Marcus godkände att jag tog dem i ordning: trivial rensning → ROADMAP → promptfixar → kodfixar.

### 2. Rensning — 32 Python-scripts (E)

Handoffen nämnde 3 Python-scripts, men jag hittade **32 stycken** i `scripts/`. Alla var Implementer-artefakter (engångspatchar) från olika körningar. Verifierade att inga refereras i koden — enda referensen var `scripts/health_check.py` i `monitor.ts` men den filen existerar inte heller. Raderade alla 32.

Kvar i `scripts/`: bara `add-overlays.ts` och `agent-interview.ts` (faktiska verktyg).

### 3. Observer false positive (D)

**Rotorsak:** `TOOL_ALIGNMENT_TABLE` rad 79 i observer.ts hade `aurora_search` som tool för `researcher` och `librarian`. Men `aurora_search` är ett MCP-tool, inte ett agent-tool.

**Undersökning:**
- Librarian (intern sökare) använder `bash_exec` (grep/find) + grafverktyg — inget `aurora_search`
- Researcher (extern sökare) använder `fetch_url` — inget `aurora_search`

**Fix:** Delade upp raden i två separata entries:
- Librarian: keyword `search/sök` → `bash_exec`
- Researcher: keyword `fetch/search.*external` → `fetch_url`

70 Observer-tester gröna efter fix.

### 4. ROADMAP — 3.2b ✅ + statistik

- Markerade 3.2b som ✅ S140 · 2026-03-24
- Lade till "Gjort"-beskrivning med körningsnummer, AC, tester, token-kostnad
- Uppdaterade statistik: 3898 tester, 180 körningar, 140 sessioner
- Senast uppdaterad: 2026-03-24 · Session 141

### 5. Promptfixar — 5 agenter (F, G, H, I, K)

Läste varje prompt noggrant innan jag editerade. Mitt resonemang per prompt:

**F: Implementer (implementer.md)**
- Cascade Error Rule fanns redan (rad 79-87) — behövde INTE läggas till
- La till ny sektion "Verification Strategy" med två regler:
  1. "Kör hela testsuiten tidigt (iteration 2-3)" — ger baseline att jämföra mot
  2. "Batch arbete före typecheck" — färre inkrementella verifikationer

**G: Manager (manager.md)**
- Antipattern #1 (exploration spiral): Förstärkt med **hårt 3-4 iterations-gräns**, referens till 3.2b (134 bash, fortfarande > mål <60)
- Antipattern #7 (manual verification loops): Förstärkt med "Trust Tester's output", referens till båda körningarna (3.2a: 159, 3.2b: 134)

**H: Reviewer (reviewer.md)**
- La till helt ny sektion "### 3. Pre-verification Planning" — kräver att Reviewer skriver en verifieringsplan INNAN hen börjar köra kommandon
- Refererar till 3.2b-problemet (119 bash, mål 40-50) som motivation
- Fixade inkonsekvent numrering (det fanns två "### 4." redan)

**I: Researcher (researcher.md)**
- La till steg 1: "Extract search terms from the brief's technical focus" INNAN generella söktermer
- Problemet var att Researcher hade 3 hårdkodade söktermer som aldrig ändrades per brief
- Nu: brief-specifika termer först, generella som komplement

**K: Merger (merger.md)**
- La till "## Commands executed" i merge_summary-mallen
- Numrerad lista med exakt varje kommando som kördes, i ordning
- Motivering: "makes rollback diagnosis trivial"

**L: Consolidator — ingen fix behövdes.** Precondition-check (Priority 0) fanns redan i prompten sedan 3.2a. Retro-insikten var redundant — problemet var att Consolidator aldrig fick köra (0 tokens), inte att prompten saknades.

**J: Tester baseline — ingen fix behövdes.** Tester-prompten hanterar redan baseline korrekt ("Read baseline if available", "Compare against baseline"). Problemet är att baseline.md inte alltid har testresultat — det är en Manager-process-fråga, inte en Tester-promptfråga.

251 prompttester gröna efter alla fixar.

### 6. Kodfixar — Historian & Consolidator 0-token (B+C)

**Resonemang om rotorsak:**

Båda agenterna har identisk loop-logik: anropa API → om `stop_reason: 'end_turn'` utan `tool_use` → break. Om API:et returnerar tomt svar (0 output_tokens), bryter loopen omedelbart. Historian kördes ~19 min in i en 1h-körning efter att Implementer ätit 5.8M tokens — möjlig rate limiting eller API transient failure.

**Övervägda alternativ:**
- Alt A: Retry vid tomt svar ← valde detta
- Alt B: Loggning ← valde detta
- Alt C: Return value från historian.run() — avfärdat som over-engineering
- Alt D: Validering i orchestrator — avfärdat, B+A räcker

**Fix (identisk i båda):**
1. **Loggning:** Varje iteration loggar nu `input_tokens`, `output_tokens`, `content_blocks`, `stop_reason`
2. **Retry:** Om output_tokens === 0 på iteration 1 → vänta 5s och `continue` (retry med samma meddelanden, utan att pusha tomt svar till historik)

Typecheck ren, 30 Historian-tester gröna, 20 Consolidator-tester gröna.

### 7. Fullständig testsvit

**3898 tester, 294 filer, alla gröna.** Ingen regression.

## Commits (3 st denna session)

| Commit | Vad |
|--------|-----|
| `c8b2649` | chore: rensa 32 Python-scripts + fix Observer false positive + ROADMAP 3.2b ✅ |
| `cedf1bb` | fix(prompts): agentinsikter från 3.2b retro — effektivitetsregler |
| `a267f8c` | fix(agents): loggning + retry vid tomt API-svar i Historian/Consolidator |

## Ändrade filer

| Fil | Ändring |
|-----|---------|
| `scripts/*.py` (32 filer) | RADERADE — alla Implementer-artefakter |
| `src/core/agents/observer.ts` | TOOL_ALIGNMENT_TABLE: aurora_search → bash_exec/fetch_url |
| `ROADMAP.md` | 3.2b ✅, statistik uppdaterad |
| `prompts/implementer.md` | Ny sektion "Verification Strategy" (tidig testsuite + batch) |
| `prompts/manager.md` | Förstärkt antipattern #1 (3-4 iter gräns) + #7 (trust Tester) |
| `prompts/reviewer.md` | Ny sektion "Pre-verification Planning" + fixad numrering |
| `prompts/researcher.md` | Brief-specifika söktermer före generella |
| `prompts/merger.md` | "Commands executed" i merge_summary-mallen |
| `src/core/agents/historian.ts` | Loggning + retry vid tomt API-svar |
| `src/core/agents/consolidator.ts` | Loggning + retry vid tomt API-svar |

## Tester

3898 gröna (oförändrat från S140 — alla ändringar var prompt/kodfix utan nya tester).

## Problem-status (A-L)

| # | Problem | Status | Hur |
|---|---------|--------|-----|
| A | Token-förbrukning 14M | Indirekt adresserat | Promptfixar F/G/H minskar bash-anrop |
| B | Historian 0-token | ✅ Fixad | Loggning + retry i historian.ts |
| C | Consolidator 0-token | ✅ Fixad | Loggning + retry i consolidator.ts |
| D | Observer false positive | ✅ Fixad | aurora_search → bash_exec/fetch_url |
| E | Python-scripts | ✅ Fixad | 32 filer raderade |
| F | Implementer regler | ✅ Fixad | Tidig testsuite + batch i implementer.md |
| G | Manager exploration | ✅ Fixad | Hårdare gräns + trust Tester i manager.md |
| H | Reviewer redundans | ✅ Fixad | Pre-verification Planning i reviewer.md |
| I | Researcher sökstrategi | ✅ Fixad | Brief-specifika termer i researcher.md |
| J | Tester baseline | Notering | Tester gör redan rätt — Manager-processfråga |
| K | Merger loggning | ✅ Fixad | Commands executed i merger.md |
| L | Consolidator precondition | Redan löst | Priority 0 finns sedan 3.2a |

## Inte gjort

- Inga nya tester skrivna (alla fixar var i prompter/loggning — existerande tester täcker)
- Ingen brief skriven ännu (nästa chatt)

## Nästa steg — PRIO: Mini-brief för agenthälsa-körning

Marcus vill köra igenom **alla agenter** och läsa rapporter — speciellt se om Historian/Consolidator nu fungerar, om Manager/Reviewer/Implementer är effektivare, och om Observer-rapporten blir renare.

**Uppgift nästa chatt:** Skriv en liten brief (enkel feature/fix) som triggar alla agenter. Syftet är inte en stor feature — det är en **diagnostisk körning** för att verifiera att promptfixarna och kodfixarna ger effekt. Tänk:
- Liten scope → alla agenter får köra utan att Implementer äter all budget
- Något som Librarian kan söka efter
- Något med existerande tester att jämföra mot (Tester baseline)
- Researcher triggas om briefen har `⚡ Auto-trigger:`

Möjliga kandidater:
- En enkel ROADMAP-punkt från Fas 3 (3.3-3.5)
- En bugg/förbättring identifierad i ideas.md
- En teknisk skuld-fix (t.ex. den döda `health_check.py`-referensen i monitor.ts)

## Branch

`swarm/20260324-0959-neuron-hq` — 5 nya commits (17 totalt sedan main), ej pushad.

## VIKTIGT för nästa chatt

Läs ROADMAP.md och MEMORY.md noggrant innan du agerar. CoT + persisted-output. Kör ALDRIG agent swarm. Läs feedback-always-cot.md, feedback-post-run-workflow.md, feedback-always-commit.md, feedback-never-run-commands.md, feedback-no-agent-assumptions.md, feedback-handoff-detail.md.

**Marcus mål:** Skriv en mini-brief, bolla med Brief Reviewer + Code Anchor, ge Marcus kommandot att köra. Fokus: verifiera att alla agenter fungerar.
