# Patterns — Mönster som fungerar

Beprövade lösningar och arbetssätt som konsekvent ger bra resultat.
Appendas av Historian-agenten när ny lärdom identifieras.

---

## Kompakt testutdata förhindrar context overflow
**Kontext:** Session 11 — Tester-agenten kraschade pga context overflow
**Lösning:** Kör tester med `-q --cov-report=term` och begränsa output till max 30 rader
**Effekt:** Tester-agenten klarar nu hela testsviten utan overflow
**Körningar:** #11

---

## initWorkspace() isolerar workspace-git från neuron-hq
**Kontext:** Session 11 — git-commits hamnade i neuron-hq repo istället för workspace
**Lösning:** `initWorkspace()` i `src/core/git.ts` sätter upp separat git-repo i workspace-mappen
**Effekt:** Alla commits från Implementer hamnar i rätt repo
**Körningar:** #11

---

## Brief-innehåll injiceras i Reviewer för korrekt kriteriecheck
**Kontext:** Session 9 — Reviewer godkände körningar utan att kontrollera mot acceptanskriterier
**Lösning:** `src/core/agents/reviewer.ts` skickar brief-innehåll till Reviewer i system prompt
**Effekt:** Reviewer kontrollerar nu faktiskt levererat vs planerat per kriterium
**Körningar:** #9

---

## Datumstämplade briefs förhindrar förvirring
**Kontext:** Session 9 — `today.md` överskrevs av misstag
**Lösning:** Briefs namnges `briefs/<YYYY-MM-DD>-<slug>.md`
**Effekt:** Historik bevaras, rätt brief pekas ut med `--brief`-flaggan
**Körningar:** #9

---

## Tvåfas-Merger (PLAN/EXECUTE via answers.md)
**Kontext:** Session 10 — Merger behövde mänskligt godkännande innan kopiering
**Lösning:** Merger skriver merge_plan.md, väntar på att `answers.md` innehåller "APPROVED"
**Effekt:** Säker merge-process — inget kopieras utan explicit godkännande
**Körningar:** #10

---

## Librarian dubbelkontrollerar med read-after-write
**Kontext:** Körning 20260222-1651 — Librarian smoke test
**Lösning:** Librarian läser tillbaka `techniques.md` efter att ha skrivit alla entries, vilket verifierar att skrivningarna faktiskt sparades korrekt
**Effekt:** Ger tillförlitlig bekräftelse att entries skrevs — Manager kan lita på Librarian-resultatet utan att själv behöva verifiera filen
**Körningar:** #?

---

## Researcher: multi-signal kodbasanalys ger rika förbättringsförslag
**Kontext:** Körning 20260222-1757 — Researcher analyserade aurora-swarm-lab utan kodändringar
**Lösning:** Researcher kombinerade tre signaltyper: (1) filläsning av nyckelfiler (config, core, moduler), (2) kvantitativa bash-grep-analyser (radräkning, mönsterfrekvens som `load_settings()` 46 gånger, `except Exception` 89 gånger), (3) arkitekturella observationer (2590-raders god-modul, saknad conftest.py). Resulterade i ideas.md med 10 prioriterade förslag med impact/effort/risk-bedömning och konkreta tradeoffs.
**Effekt:** Hög kvalitet på leverabeln — varje förslag backas av kvantitativa data snarare än subjektiva omdömen. Gör det möjligt att direkt prioritera och agera.
**Körningar:** #?

---

## Reviewer git-stash baseline-jämförelse
**Kontext:** Körning 20260222-1901 — Reviewer verifierade conftest.py-refaktorering mot 187 tester
**Lösning:** Reviewer körde `git stash` → `pytest tests/ -x -q` (baseline: 187 passed) → `git stash pop` → `pytest tests/ -x -q` (after: 187 passed) för att verifiera att ändringarna inte bröt något. Kombinerades med AST-analys för docstrings och ruff/mypy på enbart ändrade filer.
**Effekt:** Ger objektivt bevis att refaktoreringen är neutral — samma testantal före och efter. Mycket starkare verifiering än att bara köra testerna en gång.
**Keywords:** reviewer, baseline, git-stash, pytest, verifiering
**Relaterat:** patterns.md#Brief-innehåll injiceras i Reviewer för korrekt kriteriecheck
**Körningar:** #?

---

## Implementer: direktskrivning slår transform-skript
**Kontext:** Körning 20260222-2113 — Implementer försökte först skapa ett Python-transform-skript för att mekaniskt refaktorera test_mcp_server.py, men write_file till /tmp blockerades och bash med inline-skript blev för komplext
**Lösning:** Implementer gjorde git checkout, läste hela originalfilen, applicerade ändringarna mentalt, och skrev hela den refaktorerade filen med en enda write_file-anrop direkt till target-filen
**Effekt:** Snabbare och pålitligare — inga policy-blockeringar, inga mellansteg som kan misslyckas. write_file till workspace-filer är alltid tillåtet.
**Keywords:** implementer, write_file, transform-skript, policy, refaktorering
**Relaterat:** errors.md#Implementer transform-skript blockeras av policy
**Körningar:** #?

---

## Implementer anpassar sig till faktiskt repo-tillstånd vid inaktuell brief
**Kontext:** Körning 20260222-2253 — Briefen specificerade 3 ruff-fel att fixa, men 2 av dem var redan lösta i repot sedan en tidigare körning
**Lösning:** Implementer körde `ruff check .` för att se faktiska fel (8 st, inte 3), använde `ruff --fix` för auto-fixbara F401-fel och fixade kvarvarande F841 manuellt. Dokumenterade avvikelsen från briefen i knowledge.md.
**Effekt:** Alla faktiska ruff-fel fixades istället för att fastna på att specificerade fel inte fanns. Leveransen överträffade briefen (8 fixade istället för 3). Reviewer verifierade mot faktiskt resultat, inte briefens obsoleta lista.
**Keywords:** implementer, brief, baseline, ruff, anpassning, stale-brief
**Relaterat:** errors.md#Brief med inaktuella ruff-fel
**Körningar:** #?

---

## Resume-körning hoppar direkt till Review+Merge
**Kontext:** Körning 20260222-2314-resume — Implementation var redan klar i workspace från föregående körning 20260222-2253 som avbröts innan merge
**Lösning:** Manager kontrollerade workspace-tillståndet (git status, ruff check, pytest), konstaterade att allt var klart, och delegerade direkt till Reviewer utan att köra Researcher eller Implementer. Efter godkänd review delegerades till Merger som slutförde merge till target.
**Effekt:** Snabb och effektiv körning — ingen onödig duplicering av arbete. Hela resume-cykeln (verify → review → merge plan → approve → merge → post-verify) tog ~6 minuter. Bevisar att svärmen kan hantera avbrutna körningar genom att återuppta vid rätt steg.
**Keywords:** resume, manager, reviewer, merger, pipeline, avbruten-körning
**Relaterat:** patterns.md#Tvåfas-Merger (PLAN/EXECUTE via answers.md)
**Körningar:** #?

---

## Self-hosting: svärmen fixar sina egna dokumenterade fel
**Kontext:** Körning 20260223-0619-neuron-hq — Första gången svärmen riktades mot sin egen kodbas (neuron-hq) istället för ett externt target
**Lösning:** Brief byggdes direkt på errors.md-entries från 7 tidigare körningar. Varje uppgift mappade 1:1 till ett dokumenterat fel: (1) Researcher saknar knowledge.md → lägg till i prompten, (2) Manager duplicerar arbete → lägg till "After Researcher Completes"-avsnitt, (3) Implementer glömmer commit → lägg till explicit git commit-steg. Plus tester för otestade verktyg. Manager hoppade över Researcher eftersom briefen redan innehöll all kontext.
**Effekt:** Stänger feedback-loopen — errors.md → brief → prompt-fix → commit. Alla tre dokumenterade problem åtgärdades i en enda körning. Bevisar att memory-systemet (runs.md + errors.md + patterns.md) fungerar som kunskapskälla för förbättring av svärmen själv.
**Keywords:** self-hosting, errors.md, feedback-loop, prompt-fix, meta-förbättring
**Relaterat:** errors.md#Implementer glömde git commit efter lyckade fixar, errors.md#Researcher skapade inte knowledge.md, errors.md#Manager duplicerar Researchers arbete
**Körningar:** #8

---

## Audit.jsonl som sanningskälla innan ⚠️-poster skapas
**Kontext:** Körning 20260223-0728 — Två ⚠️-poster i errors.md visade sig vara falska larm. Researcher verifierade audit.jsonl och bekräftade att Librarian faktiskt körde och skrev 8 entries, men Historian hade aldrig kontrollerat loggen.
**Lösning:** Innan en ⚠️-post skrivs till errors.md ska Historian/Researcher alltid läsa audit.jsonl för den aktuella körningen och verifiera vad som faktiskt hände — inte bara förlita sig på report.md eller avsaknad av synliga artefakter.
**Effekt:** Förhindrar falska larm som sedan kräver en hel körning att stänga. I detta fall hade två felaktiga ⚠️-poster överlevt i 4 körningar innan de korrigerades.
**Keywords:** audit.jsonl, errors.md, historian, falska-larm, verifiering
**Relaterat:** errors.md#Librarian smoke test producerade inga artefakter
**Körningar:** #10

---

## Prompt-lint-tester: regex-validering av prompt-filer
**Kontext:** Körning 20260223-1016-neuron-hq — efter att Implementer i körning #13 glömde `git status` före commit, lades en explicit instruktion till i `prompts/implementer.md`. För att säkerställa att instruktionen inte tas bort av misstag skapades `tests/prompts/implementer-lint.test.ts`.
**Lösning:** Vitest-testfil som läser prompt-markdown med `readFileSync` och kör regex-assertions mot innehållet (t.ex. `expect(prompt).toMatch(/git status/i)`). Fem tester verifierar att kritiska guardrails (`git status`, `git add -A`, iteration-budget, partial commit, staging-verifiering) finns kvar i prompten.
**Effekt:** Garanterar att säkerhetskritiska instruktioner i agentpromptar inte försvinner vid framtida redigeringar. Billigt att skriva (27 rader), snabbt att köra, och fångar regressioner som annars bara syns som beteendefel i produktion. Kan appliceras på alla prompt-filer med kritiska instruktioner.
**Keywords:** prompt-lint, tester, vitest, regex, guardrails, implementer, regression
**Relaterat:** errors.md#Implementer committade bara testfil, inte implementeringsfiler
**Körningar:** #14

---

## Explicit agentordning vid beroenden
**Kontext:** Körning #15 avslöjade att Historian inte kunde verifiera Librarian-arbete eftersom Manager delegerade Historian före Librarian. Fixades i körning #16.
**Lösning:** Dokumentera explicita ordningskrav i manager.md: "Correct order: Tester → Reviewer → Merger → Librarian → Historian". Komplettera med guardrail i den beroende agentens prompt (historian.md) som använder `read_memory_file` istället för `grep_audit` för att verifiera föregående agents arbete.
**Effekt:** Eliminerar race conditions där en agent söker efter en annan agents output innan den har körts. Guardrail-instruktionen ger en fallback även om ordningen bryts i framtiden.
**Keywords:** agent-ordning, timing, delegation, librarian, historian, guardrail, race-condition
**Relaterat:** errors.md#Librarian auto-trigger ignorerades av Manager
**Körningar:** #16

---

## Meta-test (coverage.test.ts) som vaktar prompt-lint-täckning
**Kontext:** Körning 20260223-1348-neuron-hq — 7 prompt-lint-testfiler fanns men ingen mekanism garanterade att nya promptfiler (t.ex. librarian.md) automatiskt fick lint-tester
**Lösning:** Skapade `tests/prompts/coverage.test.ts` som läser `prompts/*.md` och verifierar att varje fil har en motsvarande `*-lint.test.ts`. Tre tester: (1) varje prompt har lint-test, (2) minst 7 promptfiler finns, (3) minst 7 lint-testfiler finns. Vid körning avslöjades omedelbart att `librarian.md` saknade lint-test — Implementer skapade den för att coverage-testet skulle bli grönt.
**Effekt:** Framtida tillägg av prompt-filer utan lint-test fångas automatiskt av CI. Förhindrar att lint-täckningen eroderar över tid — varje ny agent-prompt måste ha en lint-testfil annars blir testerna röda.
**Keywords:** meta-test, coverage, prompt-lint, guardrails, ci, regression
**Relaterat:** patterns.md#Prompt-lint-tester: regex-validering av prompt-filer
**Körningar:** #18

---
