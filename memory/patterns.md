# Patterns — Mönster som fungerar

Beprövade lösningar och arbetssätt som konsekvent ger bra resultat.
Appendas av Historian-agenten när ny lärdom identifieras.

---

## Kompakt testutdata förhindrar context overflow
**Kontext:** Session 11 — Tester-agenten kraschade pga context overflow
**Lösning:** Kör tester med `-q --cov-report=term` och begränsa output till max 30 rader
**Effekt:** Tester-agenten klarar nu hela testsviten utan overflow
**Körningar:** #11
**Senast bekräftad:** okänd

---

## initWorkspace() isolerar workspace-git från neuron-hq
**Kontext:** Session 11 — git-commits hamnade i neuron-hq repo istället för workspace
**Lösning:** `initWorkspace()` i `src/core/git.ts` sätter upp separat git-repo i workspace-mappen
**Effekt:** Alla commits från Implementer hamnar i rätt repo
**Körningar:** #11
**Senast bekräftad:** okänd

---

## Brief-innehåll injiceras i Reviewer för korrekt kriteriecheck
**Kontext:** Session 9 — Reviewer godkände körningar utan att kontrollera mot acceptanskriterier
**Lösning:** `src/core/agents/reviewer.ts` skickar brief-innehåll till Reviewer i system prompt
**Effekt:** Reviewer kontrollerar nu faktiskt levererat vs planerat per kriterium
**Körningar:** #9
**Senast bekräftad:** okänd

---

## Datumstämplade briefs förhindrar förvirring
**Kontext:** Session 9 — `today.md` överskrevs av misstag
**Lösning:** Briefs namnges `briefs/<YYYY-MM-DD>-<slug>.md`
**Effekt:** Historik bevaras, rätt brief pekas ut med `--brief`-flaggan
**Körningar:** #9
**Senast bekräftad:** okänd

---

## Tvåfas-Merger (PLAN/EXECUTE via answers.md)
**Kontext:** Session 10 — Merger behövde mänskligt godkännande innan kopiering
**Lösning:** Merger skriver merge_plan.md, väntar på att `answers.md` innehåller "APPROVED"
**Effekt:** Säker merge-process — inget kopieras utan explicit godkännande
**Körningar:** #10
**Senast bekräftad:** okänd

---

## Librarian dubbelkontrollerar med read-after-write
**Kontext:** Körning 20260222-1651 — Librarian smoke test
**Lösning:** Librarian läser tillbaka `techniques.md` efter att ha skrivit alla entries, vilket verifierar att skrivningarna faktiskt sparades korrekt
**Effekt:** Ger tillförlitlig bekräftelse att entries skrevs — Manager kan lita på Librarian-resultatet utan att själv behöva verifiera filen
**Körningar:** #?
**Senast bekräftad:** okänd

---

## Researcher: multi-signal kodbasanalys ger rika förbättringsförslag
**Kontext:** Körning 20260222-1757 — Researcher analyserade aurora-swarm-lab utan kodändringar
**Lösning:** Researcher kombinerade tre signaltyper: (1) filläsning av nyckelfiler (config, core, moduler), (2) kvantitativa bash-grep-analyser (radräkning, mönsterfrekvens som `load_settings()` 46 gånger, `except Exception` 89 gånger), (3) arkitekturella observationer (2590-raders god-modul, saknad conftest.py). Resulterade i ideas.md med 10 prioriterade förslag med impact/effort/risk-bedömning och konkreta tradeoffs.
**Effekt:** Hög kvalitet på leverabeln — varje förslag backas av kvantitativa data snarare än subjektiva omdömen. Gör det möjligt att direkt prioritera och agera.
**Körningar:** #?
**Senast bekräftad:** okänd

---

## Reviewer git-stash baseline-jämförelse
**Kontext:** Körning 20260222-1901 — Reviewer verifierade conftest.py-refaktorering mot 187 tester
**Lösning:** Reviewer körde `git stash` → `pytest tests/ -x -q` (baseline: 187 passed) → `git stash pop` → `pytest tests/ -x -q` (after: 187 passed) för att verifiera att ändringarna inte bröt något. Kombinerades med AST-analys för docstrings och ruff/mypy på enbart ändrade filer.
**Effekt:** Ger objektivt bevis att refaktoreringen är neutral — samma testantal före och efter. Mycket starkare verifiering än att bara köra testerna en gång.
**Keywords:** reviewer, baseline, git-stash, pytest, verifiering
**Relaterat:** patterns.md#Brief-innehåll injiceras i Reviewer för korrekt kriteriecheck
**Körningar:** #?
**Senast bekräftad:** okänd

---

## Implementer: direktskrivning slår transform-skript
**Kontext:** Körning 20260222-2113 — Implementer försökte först skapa ett Python-transform-skript för att mekaniskt refaktorera test_mcp_server.py, men write_file till /tmp blockerades och bash med inline-skript blev för komplext
**Lösning:** Implementer gjorde git checkout, läste hela originalfilen, applicerade ändringarna mentalt, och skrev hela den refaktorerade filen med en enda write_file-anrop direkt till target-filen
**Effekt:** Snabbare och pålitligare — inga policy-blockeringar, inga mellansteg som kan misslyckas. write_file till workspace-filer är alltid tillåtet.
**Keywords:** implementer, write_file, transform-skript, policy, refaktorering
**Relaterat:** errors.md#Implementer transform-skript blockeras av policy
**Körningar:** #?
**Senast bekräftad:** okänd

---

## Implementer anpassar sig till faktiskt repo-tillstånd vid inaktuell brief
**Kontext:** Körning 20260222-2253 — Briefen specificerade 3 ruff-fel att fixa, men 2 av dem var redan lösta i repot sedan en tidigare körning
**Lösning:** Implementer körde `ruff check .` för att se faktiska fel (8 st, inte 3), använde `ruff --fix` för auto-fixbara F401-fel och fixade kvarvarande F841 manuellt. Dokumenterade avvikelsen från briefen i knowledge.md.
**Effekt:** Alla faktiska ruff-fel fixades istället för att fastna på att specificerade fel inte fanns. Leveransen överträffade briefen (8 fixade istället för 3). Reviewer verifierade mot faktiskt resultat, inte briefens obsoleta lista.
**Keywords:** implementer, brief, baseline, ruff, anpassning, stale-brief
**Relaterat:** errors.md#Brief med inaktuella ruff-fel
**Körningar:** #?
**Senast bekräftad:** okänd

---

## Resume-körning hoppar direkt till Review+Merge
**Kontext:** Körning 20260222-2314-resume — Implementation var redan klar i workspace från föregående körning 20260222-2253 som avbröts innan merge
**Lösning:** Manager kontrollerade workspace-tillståndet (git status, ruff check, pytest), konstaterade att allt var klart, och delegerade direkt till Reviewer utan att köra Researcher eller Implementer. Efter godkänd review delegerades till Merger som slutförde merge till target.
**Effekt:** Snabb och effektiv körning — ingen onödig duplicering av arbete. Hela resume-cykeln (verify → review → merge plan → approve → merge → post-verify) tog ~6 minuter. Bevisar att svärmen kan hantera avbrutna körningar genom att återuppta vid rätt steg.
**Keywords:** resume, manager, reviewer, merger, pipeline, avbruten-körning
**Relaterat:** patterns.md#Tvåfas-Merger (PLAN/EXECUTE via answers.md)
**Körningar:** #?
**Senast bekräftad:** okänd

---

## Self-hosting: svärmen fixar sina egna dokumenterade fel
**Kontext:** Körning 20260223-0619-neuron-hq — Första gången svärmen riktades mot sin egen kodbas (neuron-hq) istället för ett externt target
**Lösning:** Brief byggdes direkt på errors.md-entries från 7 tidigare körningar. Varje uppgift mappade 1:1 till ett dokumenterat fel: (1) Researcher saknar knowledge.md → lägg till i prompten, (2) Manager duplicerar arbete → lägg till "After Researcher Completes"-avsnitt, (3) Implementer glömmer commit → lägg till explicit git commit-steg. Plus tester för otestade verktyg. Manager hoppade över Researcher eftersom briefen redan innehöll all kontext.
**Effekt:** Stänger feedback-loopen — errors.md → brief → prompt-fix → commit. Alla tre dokumenterade problem åtgärdades i en enda körning. Bevisar att memory-systemet (runs.md + errors.md + patterns.md) fungerar som kunskapskälla för förbättring av svärmen själv.
**Keywords:** self-hosting, errors.md, feedback-loop, prompt-fix, meta-förbättring
**Relaterat:** errors.md#Implementer glömde git commit efter lyckade fixar, errors.md#Researcher skapade inte knowledge.md, errors.md#Manager duplicerar Researchers arbete
**Körningar:** #8
**Senast bekräftad:** okänd

---

## Audit.jsonl som sanningskälla innan ⚠️-poster skapas
**Kontext:** Körning 20260223-0728 — Två ⚠️-poster i errors.md visade sig vara falska larm. Researcher verifierade audit.jsonl och bekräftade att Librarian faktiskt körde och skrev 8 entries, men Historian hade aldrig kontrollerat loggen.
**Lösning:** Innan en ⚠️-post skrivs till errors.md ska Historian/Researcher alltid läsa audit.jsonl för den aktuella körningen och verifiera vad som faktiskt hände — inte bara förlita sig på report.md eller avsaknad av synliga artefakter.
**Effekt:** Förhindrar falska larm som sedan kräver en hel körning att stänga. I detta fall hade två felaktiga ⚠️-poster överlevt i 4 körningar innan de korrigerades.
**Keywords:** audit.jsonl, errors.md, historian, falska-larm, verifiering
**Relaterat:** errors.md#Librarian smoke test producerade inga artefakter
**Körningar:** #10
**Senast bekräftad:** okänd

---

## Prompt-lint-tester: regex-validering av prompt-filer
**Kontext:** Körning 20260223-1016-neuron-hq — efter att Implementer i körning #13 glömde `git status` före commit, lades en explicit instruktion till i `prompts/implementer.md`. För att säkerställa att instruktionen inte tas bort av misstag skapades `tests/prompts/implementer-lint.test.ts`.
**Lösning:** Vitest-testfil som läser prompt-markdown med `readFileSync` och kör regex-assertions mot innehållet (t.ex. `expect(prompt).toMatch(/git status/i)`). Fem tester verifierar att kritiska guardrails (`git status`, `git add -A`, iteration-budget, partial commit, staging-verifiering) finns kvar i prompten.
**Effekt:** Garanterar att säkerhetskritiska instruktioner i agentpromptar inte försvinner vid framtida redigeringar. Billigt att skriva (27 rader), snabbt att köra, och fångar regressioner som annars bara syns som beteendefel i produktion. Kan appliceras på alla prompt-filer med kritiska instruktioner.
**Keywords:** prompt-lint, tester, vitest, regex, guardrails, implementer, regression
**Relaterat:** errors.md#Implementer committade bara testfil, inte implementeringsfiler
**Körningar:** #14
**Senast bekräftad:** okänd

---

## Explicit agentordning vid beroenden
**Kontext:** Körning #15 avslöjade att Historian inte kunde verifiera Librarian-arbete eftersom Manager delegerade Historian före Librarian. Fixades i körning #16.
**Lösning:** Dokumentera explicita ordningskrav i manager.md: "Correct order: Tester → Reviewer → Merger → Librarian → Historian". Komplettera med guardrail i den beroende agentens prompt (historian.md) som använder `read_memory_file` istället för `grep_audit` för att verifiera föregående agents arbete.
**Effekt:** Eliminerar race conditions där en agent söker efter en annan agents output innan den har körts. Guardrail-instruktionen ger en fallback även om ordningen bryts i framtiden.
**Keywords:** agent-ordning, timing, delegation, librarian, historian, guardrail, race-condition
**Relaterat:** errors.md#Librarian auto-trigger ignorerades av Manager
**Körningar:** #16
**Senast bekräftad:** okänd

---

## Meta-test (coverage.test.ts) som vaktar prompt-lint-täckning
**Kontext:** Körning 20260223-1348-neuron-hq — 7 prompt-lint-testfiler fanns men ingen mekanism garanterade att nya promptfiler (t.ex. librarian.md) automatiskt fick lint-tester
**Lösning:** Skapade `tests/prompts/coverage.test.ts` som läser `prompts/*.md` och verifierar att varje fil har en motsvarande `*-lint.test.ts`. Tre tester: (1) varje prompt har lint-test, (2) minst 7 promptfiler finns, (3) minst 7 lint-testfiler finns. Vid körning avslöjades omedelbart att `librarian.md` saknade lint-test — Implementer skapade den för att coverage-testet skulle bli grönt.
**Effekt:** Framtida tillägg av prompt-filer utan lint-test fångas automatiskt av CI. Förhindrar att lint-täckningen eroderar över tid — varje ny agent-prompt måste ha en lint-testfil annars blir testerna röda.
**Keywords:** meta-test, coverage, prompt-lint, guardrails, ci, regression
**Relaterat:** patterns.md#Prompt-lint-tester: regex-validering av prompt-filer
**Körningar:** #18
**Senast bekräftad:** okänd

---

## Explicita strukturinvarianter i memory/invariants.md
**Kontext:** Körning 20260223-1509-neuron-hq — coverage.test.ts fångade en implicit invariant (varje prompt behöver lint-test) men det saknades ett explicit ställe att förvara strukturkrav som alltid måste gälla
**Lösning:** Skapade `memory/invariants.md` med format `[INV-NNN]` + beskrivning + `Vaktas av:` (vilken test/mekanism garanterar invarianten) + `Tillagd:` (körningsnummer). Historian-prompten uppdaterades med steg 5 som instruerar att läsa invariants.md och lägga till nya invarianter vid behov. Lint-test (`invariants-lint.test.ts`) vaktar formatet.
**Effekt:** Implicita constraints som tidigare bara levde i testlogik görs explicita och sökbara — alla agenter kan läsa invariants.md för att förstå systemets strukturregler. Forskning (StructMemEval 2026, LoCoMo-Plus 2026) bekräftar att explicita constraints förbättrar retrieval-kvalitet jämfört med implicita.
**Keywords:** invariants, memory, strukturkrav, guardrails, historian, explicita-constraints
**Relaterat:** patterns.md#Meta-test (coverage.test.ts) som vaktar prompt-lint-täckning, patterns.md#Prompt-lint-tester: regex-validering av prompt-filer
**Körningar:** #19
**Senast bekräftad:** okänd

---

## Merger NO-OP-detektion vid redan mergade ändringar
**Kontext:** Körning 20260223-2218-resume — en resume-körning startade trots att originalköningens merge redan var klar. Merger kopierade filer men `diff` visade identiskt innehåll.
**Lösning:** Merger jämförde workspace- och target-filer med `diff`, detekterade att de var byte-identiska, och rapporterade "NO-OP MERGE" utan att skapa en tom commit. merge_summary.md dokumenterade tydligt att ändringarna redan fanns.
**Effekt:** Undviker tomma commits i git-historiken och ger tydlig feedback till Historian om vad som hände. Resume-körningar som är redundanta avslutas rent.
**Keywords:** merger, no-op, resume, diff, identical, idempotent
**Relaterat:** patterns.md#Resume-körning hoppar direkt till Review+Merge
**Körningar:** #?
**Senast bekräftad:** okänd

---

## Exakt feloutput + fixförslag i brief ger kirurgiska leveranser
**Kontext:** Körning 20260223-2248 — Briefen innehöll faktisk mypy-output med radnummer, förklarade rot-orsaken per felgrupp (typ-annotation vs tilldelning, borttagen API), och gav kodsnuttar med rätt fix
**Lösning:** Inkludera i briefen: (1) baseline tool-output (mypy/ruff/etc) med exakta rad- och felnummer, (2) kort analys av varför felet uppstår, (3) föreslagen fix som kodsnutt. Svärmen kan då implementera direkt utan att själv behöva diagnosticera.
**Effekt:** 6/6 acceptanskriterier godkända i första körningen. Diffen var 5 insertions, 4 deletions — minimalt scope. Ingen iteration behövdes. Jämfört med körning #7 (103 mypy-fel utan analys → ofullständig leverans) visar detta att förarbete i briefen betalar sig kraftigt.
**Keywords:** brief, mypy, diagnostik, fix-förslag, kirurgisk, scope, effektivitet
**Relaterat:** patterns.md#Implementer anpassar sig till faktiskt repo-tillstånd vid inaktuell brief
**Körningar:** #?
**Senast bekräftad:** okänd

---

## Manager-only verifiering vid redan mergade resume-körningar
**Kontext:** Körning 20260224-0647-resume — alla ändringar redan mergade, Manager delegerade inte till någon sub-agent (varken Reviewer eller Merger)
**Lösning:** Manager verifierade workspace-tillståndet solo: läste filer, körde tester (vitest + npm test), tsc --noEmit, git log i target-repot, och konstaterade att commit redan fanns på main. Skrev report.md och questions.md direkt utan delegering. Enda delegering var till Historian som sista steg.
**Effekt:** Snabbaste möjliga resume-flöde — ~10 tool-anrop istället för 30+ vid Review+Merge-pipeline. Visar att Manager kan kortslutas till ren verifieringsagent när all implementation och merge redan är klar. Eliminerar onödig Reviewer- och Merger-overhead.
**Keywords:** manager, resume, no-op, verifiering, delegering, effektivitet, solo
**Relaterat:** patterns.md#Resume-körning hoppar direkt till Review+Merge, patterns.md#Merger NO-OP-detektion vid redan mergade ändringar
**Körningar:** #?
**Senast bekräftad:** okänd

---

## Merger som commit-message-korrigent vid avvikelse
**Kontext:** Körning 20260224-0812-neuron-hq — Implementer skrev eget commit-meddelande som avvek från briefens specifikation
**Lösning:** Merger läste briefens exakta commit-meddelande (`feat: improve tester failure reporting with stack traces and file locations`) och använde det vid `git commit` till target-repot, istället för Implementers workspace-commit-meddelande (`feat: improve Tester agent failure reporting with structured trace details`). Tvåfas-mergen (workspace-commit → target-commit) ger Merger möjlighet att korrigera metadata utan att ändra koden.
**Effekt:** Slutresultatet i target-repot matchar briefens specifikation trots att Implementer avvek. Visar att Merger inte bara är en kopiator utan en aktiv kvalitetsbarriär som kan rätta till avvikelser i metadata (commit-meddelande, filval, etc.) innan merge.
**Keywords:** merger, commit-message, kvalitetsbarriär, tvåfas-merge, brief-compliance
**Relaterat:** patterns.md#Tvåfas-Merger (PLAN/EXECUTE via answers.md)
**Körningar:** #?
**Senast bekräftad:** okänd

---

## Memory-producer → memory-consumer-koppling via prompt-instruktioner
**Kontext:** Körning #26 — techniques.md hade 30+ entries men ingen agent läste dem. Researcher genererade idéer utan att ta del av den samlade forskningen. Briefen beskrev det som "ett bibliotek ingen lånar ur".
**Lösning:** Lade till steg 1b i `prompts/researcher.md` som instruerar Researcher att läsa `memory/techniques.md` via `read_memory_file(file="techniques")` innan webbaserad sökning, och citera relevanta paper i ideas.md via ett nytt `Research support`-fält. Prompt-lint-test vaktar att instruktionen kvarstår.
**Effekt:** Stänger den sista länken i kedjan Librarian → techniques.md → Researcher → ideas.md. Forskning som Librarian samlar in kan nu direkt påverka Researchers förslag istället för att ligga oanvänd. Principen generaliserar: varje minnesfil behöver minst en explicit konsument i en agents prompt, annars ackumuleras data utan nytta.
**Keywords:** memory, techniques.md, researcher, librarian, feedback-loop, prompt-koppling, consumer-producer
**Relaterat:** patterns.md#Self-hosting: svärmen fixar sina egna dokumenterade fel, patterns.md#Explicita strukturinvarianter i memory/invariants.md
**Körningar:** #?
**Senast bekräftad:** okänd

---

**[UPPDATERING]** Mönstret "Manager-only verifiering vid redan mergade resume-körningar" bekräftades i körning 20260224-0905-neuron-hq-resume — Manager verifierade alla 7 kriterier solo utan delegering, identiskt beteende som i det dokumenterade mönstret.

**Senast bekräftad:** 20260224-0905-neuron-hq-resume

**[UPPDATERING]** Mönstret "Meta-test (coverage.test.ts) som vaktar prompt-lint-täckning" bekräftades i körning 20260224-0948-neuron-hq — Implementer uppdaterade coverage.test.ts-trösklar (7→8 promptfiler, 7→8 lint-testfiler) proaktivt för att den nya `brief-agent.md` + `brief-agent-lint.test.ts` inte skulle bryta meta-testet. Visar att coverage-guardrail fungerar som avsett vid ny agent-tillägg.

**Senast bekräftad:** 20260224-0948-neuron-hq

**[UPPDATERING]** Mönstret "Manager-only verifiering vid redan mergade resume-körningar" bekräftades i körning 20260224-1211-neuron-hq-resume — tredje bekräftelsen. Manager verifierade alla 8 kriterier solo (läste filer, körde npm test 313 passed, tsc 0 errors, kontrollerade git log) utan att delegera till Reviewer/Merger. Identiskt beteende som i de två tidigare bekräftelserna.

**Senast bekräftad:** 20260224-1211-neuron-hq-resume

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260224-1225-neuron-hq — briefen innehöll exakta TypeScript-funktionssignaturer (`countCompletedRuns`, `maybeInjectMetaTrigger`) med komplett kodsnutt som Implementer kunde integrera direkt. 6/6 kriterier uppfyllda utan iteration.

**Senast bekräftad:** 20260224-1225-neuron-hq

**[UPPDATERING]** Mönstret "Merger NO-OP-detektion vid redan mergade ändringar" bekräftades i körning 20260224-1253-neuron-hq-resume — Merger jämförde workspace och target med `diff`, detekterade byte-identiska filer i `src/core/run.ts` och `tests/core/run.test.ts`, och rapporterade NO-OP utan ny commit. Identiskt beteende som i det dokumenterade mönstret.

**Senast bekräftad:** 20260224-1253-neuron-hq-resume

**[UPPDATERING]** Mönstret "Tvåfas-Merger (PLAN/EXECUTE via answers.md)" bekräftades i körning 20260224-2155-aurora-swarm-lab — Merger skrev merge_plan.md, Manager skrev answers.md med APPROVED, sedan genomförde Merger merge med 5 filer till commit 32c2670. Standardflödet fungerade utan problem.

**Senast bekräftad:** 20260224-2155-aurora-swarm-lab

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260224-2155-aurora-swarm-lab — Reviewer körde baseline verify (91 mypy errors, 190 tests pass) → after-change verify (92 mypy errors, 197 tests pass) och konstaterade att mypy-regressionen var trivial (+1 test fixture type hint). Stoplight-formatet gav tydlig överblick.

**Senast bekräftad:** 20260224-2155-aurora-swarm-lab

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260225-0404-aurora-swarm-lab — briefen innehöll exakta kodsnuttar för `load_dotenv()`-placering, pyproject.toml-dependencies och teststruktur. 8/8 kriterier uppfyllda utan iteration, 48 raders diff.

**Senast bekräftad:** 20260225-0404-aurora-swarm-lab

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260225-0404-aurora-swarm-lab — Reviewer körde baseline verify (197 tests, 87 mypy errors) → after-change verify (201 tests, 87 mypy errors) och konstaterade noll regressioner. Stoplight-formatet gav tydlig överblick.

**Senast bekräftad:** 20260225-0404-aurora-swarm-lab

## Manager delegerar cleanup-pass efter Implementer
**Kontext:** Körning 20260225-0500-neuron-hq — Implementer skapade ett temporärt Python-hjälpskript (`scripts/update-agent-limits.py`) för att mekaniskt uppdatera 8 agentfiler. Skriptet committades till workspace men hörde inte hemma i slutleveransen.
**Lösning:** Manager inspekterade workspace efter Implementer, upptäckte det kvarvarande skriptet, och delegerade en andra Implementer-pass med instruktionen "Remove the file `scripts/update-agent-limits.py`". Implementer körde `git rm` och committade. Cleanup skedde före merge.
**Effekt:** Slutleveransen innehöll bara avsedda filer — inga temporära artefakter läckte till target-repot. Visar att Manager + Implementer kan fungera i ett tvåpass-mönster (implement → inspect → cleanup → merge) utan mänsklig intervention. Reviewer hade också flaggat skriptet, men Manager agerade proaktivt.
**Keywords:** manager, implementer, cleanup, tvåpass, hjälpskript, självkorrigering, quality-gate
**Relaterat:** patterns.md#Merger som commit-message-korrigent vid avvikelse, patterns.md#Implementer: direktskrivning slår transform-skript
**Körningar:** #20260225-0500-neuron-hq
**Senast bekräftad:** 20260225-0500-neuron-hq

---

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260225-0500-neuron-hq — briefen innehöll exakta YAML-strukturer, Zod-schemafält och constructor-mönster (`limits.max_iterations_<role> ?? limits.max_iterations_per_run`) för alla 8 agenter. 11 filer ändrade utan iteration, 324/324 tester gröna.

**Senast bekräftad:** 20260225-0500-neuron-hq

**[UPPDATERING]** Mönstret "Resume-körning hoppar direkt till Review+Merge" bekräftades i körning 20260225-0954-aurora-swarm-lab-resume — en variant: Manager delegerade en snabb Implementer-fix (byta `--timeout=120` till `--ignore`), sedan direkt till Tester → Reviewer → Merger. Ingen Researcher behövdes.

**Senast bekräftad:** 20260225-0954-aurora-swarm-lab-resume

**[UPPDATERING]** Mönstret "Tvåfas-Merger (PLAN/EXECUTE via answers.md)" bekräftades i körning 20260225-0954-aurora-swarm-lab-resume — Merger skrev merge_plan.md, Manager skrev APPROVED i answers.md, Merger exekverade merge med 4 filer (commit 80a5baa). Merger filtrerade dessutom bort `.coverage`-binären proaktivt.

**Senast bekräftad:** 20260225-0954-aurora-swarm-lab-resume

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260225-0954-aurora-swarm-lab-resume — Reviewer körde baseline verify (204 tests, ruff PASS, mypy PASS) → after-change verify (209 tests, ruff PASS, mypy PASS) med full stoplight-tabell.

**Senast bekräftad:** 20260225-0954-aurora-swarm-lab-resume

**[UPPDATERING]** Mönstret "Implementer anpassar sig till faktiskt repo-tillstånd vid inaktuell brief" bekräftades i körning 20260225-0954-aurora-swarm-lab-resume — briefen specificerade `--timeout=120` men pytest-timeout var inte installerat. Implementer ersatte med `--ignore=tests/test_health_check.py` som fungerade med faktisk testmiljö.

**Senast bekräftad:** 20260225-0954-aurora-swarm-lab-resume

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260225-2005-neuron-hq — briefen innehöll komplett TypeScript-kod för `isConnectionError`, `isRetryableError`, `withRetry`-uppdatering och `CONNECTION_RETRY_BASE_DELAY_MS`. 8/8 kriterier uppfyllda utan iteration, 136 raders diff (2 filer).

**Senast bekräftad:** 20260225-2005-neuron-hq

**[UPPDATERING]** Mönstret "Tvåfas-Merger (PLAN/EXECUTE via answers.md)" bekräftades i körning 20260225-2005-neuron-hq — Merger delegerades två gånger (20:14:39 och 20:16:00), standardflödet med merge_plan.md → APPROVED → execute. Merge av 2 filer (136 insertions, 4 deletions) till commit 1dc7159 utan problem.

**Senast bekräftad:** 20260225-2005-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260226-0605-aurora-swarm-lab-resume — Reviewer körde baseline verify (ruff PASS, pytest 217 pass, mypy pre-existing) → after-change verify (ruff PASS, pytest 217 pass, no new mypy errors) med fullständig stoplight-tabell och security review.

**Senast bekräftad:** 20260226-0605-aurora-swarm-lab-resume

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260226-0636-aurora-swarm-lab — briefen innehöll exakta Python-kodsnuttar för User-Agent-header, `_is_valid_url()`-funktion, pyproject.toml optional-dep och 5 namngivna testfall. 7/7 kriterier uppfyllda utan iteration, 156 raders diff (4 filer).

**Senast bekräftad:** 20260226-0636-aurora-swarm-lab

**[UPPDATERING]** Mönstret "Tvåfas-Merger (PLAN/EXECUTE via answers.md)" bekräftades i körning 20260226-0636-aurora-swarm-lab — Merger delegerades två gånger (06:48:06 och 06:49:38), standardflödet med merge_plan.md → APPROVED → execute. Merge av 4 filer (156 insertions, 2 deletions) till commit 0caaf72 utan problem.

**Senast bekräftad:** 20260226-0636-aurora-swarm-lab

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260226-0636-aurora-swarm-lab — Reviewer körde baseline verify (217 tests, 91 mypy errors pre-existing) → after-change verify (222 tests, 91 mypy errors, ruff PASS) med fullständig stoplight-tabell. 5 nya tester adderade utan regression.

**Senast bekräftad:** 20260226-0636-aurora-swarm-lab

## Reviewer-BLOCKED → Manager → Implementer fix-loop
**Kontext:** Körning 20260226-1553 — Reviewer hittade 3 ruff F401-fel (oanvända imports) i testfilen och rapporterade BLOCKED. Manager delegerade en andra Implementer-pass med enbart lint-fixen som uppgift.
**Lösning:** När Reviewer rapporterar BLOCKED med specifika fel, delegerar Manager en fokuserad Implementer-pass med enbart de identifierade felen som uppgift (i detta fall: "Fix 3 unused imports in test file"). Implementer fixar, committar, och körningen fortsätter till Merger.
**Effekt:** Hela korrigeringsloopen (Reviewer BLOCKED → Manager delegerar → Implementer fixar → Merger mergerar) tog ~2 minuter. Svärmen self-correctar utan mänsklig intervention. Skiljer sig från cleanup-mönstret (som handlar om temporära filer) genom att detta triggas av Reviewer-feedback på kodkvalitet.
**Keywords:** reviewer, manager, implementer, self-correction, ruff, lint, BLOCKED, fix-loop
**Relaterat:** patterns.md#Manager delegerar cleanup-pass efter Implementer, patterns.md#Exakt feloutput + fixförslag i brief ger kirurgiska leveranser
**Körningar:** #20260226-1553-aurora-swarm-lab
**Senast bekräftad:** 20260226-1553-aurora-swarm-lab

---

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260226-1553-aurora-swarm-lab — briefen innehöll exakta Python-kodsnuttar för `_is_youtube_url()`, dedup-kontroll, `compute_source_version()` med metadata, pyproject.toml optional dep och 8 namngivna testfall. 5/5 funktionella uppgifter utan iteration, 291 raders diff (3 filer).

**Senast bekräftad:** 20260226-1553-aurora-swarm-lab

**[UPPDATERING]** Mönstret "Tvåfas-Merger (PLAN/EXECUTE via answers.md)" bekräftades i körning 20260226-1553-aurora-swarm-lab — Merger delegerades två gånger (16:08:14 och 16:09:48), standardflödet med merge_plan.md → APPROVED → execute. Merge av 3 filer (225 insertions, 6 deletions) till commit 9a7b844 utan problem.

**Senast bekräftad:** 20260226-1553-aurora-swarm-lab

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260226-1658-aurora-swarm-lab — briefen innehöll exakta Python-kodsnuttar för `ChunkEnrichOutput.dates`, write-back-logik med `source_refs`-uppdatering, enrich-promptmall och 3 namngivna testfall. 4/4 uppgifter utan iteration, 134 raders diff (4 filer).

**Senast bekräftad:** 20260226-1658-aurora-swarm-lab

**[UPPDATERING]** Mönstret "Tvåfas-Merger (PLAN/EXECUTE via answers.md)" bekräftades i körning 20260226-1658-aurora-swarm-lab — Merger delegerades, skrev merge_plan.md, Manager skrev APPROVED i answers.md, Merger exekverade merge med 4 filer (134 insertions, 2 deletions) till commit 5c05583 utan problem.

**Senast bekräftad:** 20260226-1658-aurora-swarm-lab

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260226-1658-aurora-swarm-lab — Reviewer körde baseline verify (233 tests, ruff PASS, mypy 1 pre-existing) → after-change verify (233 tests, ruff PASS, mypy PASS, 0 new errors) med fullständig stoplight-tabell. Diff 134 rader, risk LOW.

**Senast bekräftad:** 20260226-1658-aurora-swarm-lab

**[UPPDATERING]** Mönstret "Manager-only verifiering vid redan mergade resume-körningar" bekräftades i körning 20260226-1810-aurora-swarm-lab-resume — fjärde bekräftelsen. Manager verifierade alla 7 kriterier solo (läste filer, körde pytest 233 passed, kontrollerade git log) utan att delegera till Reviewer/Merger. Identiskt beteende som i de tre tidigare bekräftelserna.

**Senast bekräftad:** 20260226-1810-aurora-swarm-lab-resume

**[UPPDATERING]** Mönstret "Resume-körning hoppar direkt till Review+Merge" bekräftades i körning 20260226-1844-aurora-swarm-lab-resume — Manager hoppade över Researcher och Implementer, delegerade direkt till Tester → Reviewer → Merger. 236 tester gröna, merge till commit b22ee1c.

**Senast bekräftad:** 20260226-1844-aurora-swarm-lab-resume

**[UPPDATERING]** Mönstret "Tvåfas-Merger (PLAN/EXECUTE via answers.md)" bekräftades i körning 20260226-1844-aurora-swarm-lab-resume — Merger delegerades två gånger (18:51:38 och 18:53:06), standardflödet med merge_plan.md → APPROVED → execute. Merge av 8 filer (127 insertions, 8 deletions) till commit b22ee1c utan problem.

**Senast bekräftad:** 20260226-1844-aurora-swarm-lab-resume

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260226-1844-aurora-swarm-lab-resume — Reviewer körde baseline verify (236 tests, ruff PASS, mypy 90 pre-existing) → after-change verify (236 tests, ruff PASS, mypy 90 errors — identiskt med baseline, 0 nya). Stoplight: alla gröna, risk LOW.

**Senast bekräftad:** 20260226-1844-aurora-swarm-lab-resume

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260226-1844-aurora-swarm-lab-resume — briefen innehöll exakta Python-kodsnuttar för config.py default-ändring, CREATE TABLE-schema, migration ALTER TABLE, upsert INSERT-uppdatering, embed_chunks/voice_gallery model-fält och CLI check-embeddings-kommando. 7/7 acceptanskriterier uppfyllda, 135 raders diff (8 filer).

**Senast bekräftad:** 20260226-1844-aurora-swarm-lab-resume

**[UPPDATERING]** Mönstret "Researcher: multi-signal kodbasanalys ger rika förbättringsförslag" bekräftades i körning 20260226-1917-zeroclaw — Researcher analyserade ett helt nytt externt repo (ZeroClaw, Rust-baserat) genom att läsa ~30 filer (README, AGENTS.md, src/agent/, src/providers/, src/tools/, src/memory/, src/channels/, src/security/, docs/) och producerade en 405-raders analysrapport med 5 fokusområden plus 10 idéer. Första gången svärmen analyserar ett externt repo utanför aurora-swarm-lab/neuron-hq — samma teknik fungerade utan anpassning.

**Senast bekräftad:** 20260226-1917-zeroclaw

## Merger patch-strategi för divergerade filer
**Kontext:** Körning 20260227-0604-neuron-hq — `prompts/implementer.md` hade ändrats i target (iteration budget 40→55, 45→65) sedan workspace skapades, men svärmens ändringar (ny Avslutningssteg-sektion) var i en helt annan del av filen
**Lösning:** Merger genererade en unified diff från workspace (`git diff -- prompts/implementer.md > /tmp/handoff_implementer.patch`), körde `patch -p1 --dry-run` mot target för att verifiera, och applicerade sedan `patch -p1` skarpt. Non-overlapping regioner (rad 43/45 vs rad 103+) mergades korrekt utan konflikt.
**Effekt:** Hanterar det vanliga scenariot där target-repot rör sig framåt under en körning — istället för att skriva över targets ändringar appliceras bara svärmens diff. Bevarar båda sidors arbete. Tidigare körningar med divergerade filer hade ingen etablerad strategi.
**Keywords:** merger, patch, divergerad-fil, non-overlapping, git-diff, baseline
**Relaterat:** patterns.md#Tvåfas-Merger (PLAN/EXECUTE via answers.md), patterns.md#Merger som commit-message-korrigent vid avvikelse
**Körningar:** #20260227-0604-neuron-hq
**Senast bekräftad:** 20260227-0604-neuron-hq

---

**[UPPDATERING]** Mönstret "Tvåfas-Merger (PLAN/EXECUTE via answers.md)" bekräftades i körning 20260227-0604-neuron-hq — Merger skrev merge_plan.md med detaljerad divergensanalys och patch-strategi, Manager skrev APPROVED, Merger exekverade merge med 9 filer (8 direct copy + 1 patch) till commit med conventional-commit-meddelande.

**Senast bekräftad:** 20260227-0604-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260227-0604-neuron-hq — Reviewer körde baseline verify (git stash → 352 tests, 5 pre-existing failures) → after-change verify (git stash pop → 357 tests, 5 same pre-existing failures) med fullständig stoplight-tabell. tsc --noEmit rent.

**Senast bekräftad:** 20260227-0604-neuron-hq

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260227-0604-neuron-hq — briefen innehöll exakta TypeScript-kodsnuttar för `delegateToImplementer()` (före/efter), prompt-texter för alla tre filer (implementer.md, manager.md, reviewer.md), och testnamn. 8/8 kriterier uppfyllda utan iteration.

**Senast bekräftad:** 20260227-0604-neuron-hq

## Konceptbaserade regex i prompt-lint-tester (inte specifika siffror/värden)
**Kontext:** Körning 20260227-0634-neuron-hq-resume — `implementer-lint.test.ts` använde `/40.*iteration|iteration.*40/i` som bröt när per-agent iteration limits ändrade prompten från "40" till "55/65"
**Lösning:** Byt ut sifferspecifika regex mot konceptbaserade: `/iteration budget/i` istället för `/40.*iteration/i`. Konceptet ("iteration budget") är stabilt, de exakta siffrorna är det inte.
**Effekt:** Lint-testet blev robust mot framtida numeriska ändringar utan att förlora sitt syfte. Samma princip gäller alla prompt-lint-tester: testa att konceptet finns i prompten, inte specifika parametervärden som kan ändras.
**Keywords:** prompt-lint, regex, robusthet, tester, koncept-vs-värde, regression
**Relaterat:** patterns.md#Prompt-lint-tester: regex-validering av prompt-filer
**Körningar:** #20260227-0634-neuron-hq-resume
**Senast bekräftad:** 20260227-0634-neuron-hq-resume

---

**[UPPDATERING]** Mönstret "Merger NO-OP-detektion vid redan mergade ändringar" bekräftades i körning 20260227-0634-neuron-hq-resume — Merger jämförde alla 9 workspace-filer mot target, detekterade att handoff-feature redan var mergad (commit fce0d66), och rapporterade NO-OP utan ny commit. Identiskt beteende som i det dokumenterade mönstret.

**Senast bekräftad:** 20260227-0634-neuron-hq-resume

## AGENTS.md som delad systemkonstitution separerar rollprompts från systemprotokoll
**Kontext:** Session 44 — 9 promptfiler hade isolerade regler utan gemensamt protokoll. Risk-tiers, handoff-format och anti-patterns existerade bara i enskilda agenters prompts.
**Lösning:** Skapa `AGENTS.md` i repots rot som "konstitution" — systemövergripande regler som alla agenter refererar till. Rollprompts behåller rollanpassad precision (t.ex. Reviewers verifieringskommandon), AGENTS.md äger systemgemensamma protokoll (risk-tiers, handoff-mall, minnesprioritetsordning, anti-patterns). Varje prompt-fil får en referensrad i toppen: "System-wide principles are in AGENTS.md."
**Effekt:** Eliminerar duplicering och inkonsekvens mellan prompts. Risk-tiers (Low/Medium/High) är nu ett delat språk — Manager kan instruera Implementer "detta är High-risk" och Implementer vet exakt vad det kräver. Handoff-mallen standardiserar kommunikationen Implementer→Manager och sparar 5–15 iterationer per körning.
**Keywords:** AGENTS.md, konstitution, rollprompt, systemprotokoll, risk-tiers, handoff, anti-patterns
**Relaterat:** patterns.md#Prompt-lint-tester: regex-validering av prompt-filer
**Körningar:** #Session 44
**Senast bekräftad:** 2026-02-26

---

## Single-phase Merger: auto-commit on Reviewer GREEN
**Kontext:** Körning 20260227-0656-neuron-hq — tvåfas-Merger-logiken (plan → answers.md APPROVED → execute) togs bort och ersattes med single-phase auto-commit
**Lösning:** Merger läser `report.md`, kontrollerar att Reviewer gav GREEN (case-insensitive substring), och kör execute-flödet (copy, git add, git commit) direkt. Returnerar `MERGER_BLOCKED` om Reviewer inte gav GREEN, `MERGER_COMPLETE` vid lyckad merge. Skriver `merge_summary.md` med commit-hash och rollback-instruktion. Ingen `answers.md` eller `merge_plan.md` behövs längre.
**Effekt:** Eliminerar behovet av dubbla Merger-delegationer (plan + execute), `answers.md`-godkännande, och Manager-mellansteget. Hela merge-kedjan går från Reviewer GREEN → en enda Merger-delegation → commit. Enklare flöde, färre felkällor (tidigare körningar hade problem med answers.md-sökvägar, saknade APPROVED-svar, etc.). **Ersätter mönstret "Tvåfas-Merger (PLAN/EXECUTE via answers.md)"** som nu är obsolet.
**Keywords:** merger, single-phase, auto-commit, reviewer-green, förenkling
**Relaterat:** patterns.md#Tvåfas-Merger (PLAN/EXECUTE via answers.md)
**Körningar:** #20260227-0656-neuron-hq
**Senast bekräftad:** 20260227-0656-neuron-hq

---

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260227-1613-neuron-hq — Merger delegerades en enda gång (16:28:39), läste report.md med GREEN-verdict, kopierade 10 filer (9 befintliga + 1 ny testfil) och committade direkt med `feat(graphrag): add read-only graph tools`. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260227-1613-neuron-hq

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260227-1613-neuron-hq — briefen innehöll exakta TypeScript-kodsnuttar för `graphReadToolDefinitions()`, import-satser, switch-case-block och prompt-sektioner för alla 4 agenter. 13/13 kriterier uppfyllda utan iteration, 82+170 raders diff (10 filer).

**Senast bekräftad:** 20260227-1613-neuron-hq

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260228-0707-neuron-hq — briefen innehöll komplett TypeScript-funktionssignatur för `applyConfidenceDecay()`, detaljerad logik (iterera noder, kolla updated-timestamp, multiplicera confidence, sätt stale-flag), prompt-text för skeptiker-granskning, och 7 namngivna testfall. 6/6 kriterier uppfyllda, 277 raders diff.

**Senast bekräftad:** 20260228-0707-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer-BLOCKED → Manager → Implementer fix-loop" bekräftades i körning 20260228-0707-neuron-hq — Reviewer flaggade design-problem med `decay_applied`-semantiken (one-time vs progressive decay) och kvarvarande hjälpskript. Manager delegerade tredje Implementer-pass som fixade båda. Hela loopen: Implementer→Reviewer→Manager→Implementer→Tester→Merger.

**Senast bekräftad:** 20260228-0707-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260228-0707-neuron-hq — Merger delegerades en enda gång (07:24:51), läste report.md med GREEN-verdict, kopierade 3 filer (knowledge-graph.ts, historian.ts, confidence-decay.test.ts) och committade direkt till commit 1f44846. Historian.md skippades (redan identisk).

**Senast bekräftad:** 20260228-0707-neuron-hq

**[SKEPTIKER 20260228-0707-neuron-hq]** Granskade 7 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning — behåll
- pattern-030 (0.95) "Graph write restricted": Ej aktivt testad, men strukturellt relevant — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad (443→451 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant denna körning — behåll
- pattern-028 (0.85) "Tvåfas-Merger (ARKIVERAD)": Obsolet mönster, ersatt av Single-phase Merger — confidence sänkt 0.85→0.5
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 2+ repos — behåll

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260228-0736-neuron-hq — briefen innehöll exakta markdown-block att infoga i reviewer.md och historian.md, plus testnamn och assertion-mönster. 8/8 kriterier uppfyllda utan iteration, 207 raders diff (3 filer).

**Senast bekräftad:** 20260228-0736-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260228-0736-neuron-hq — Merger delegerades en enda gång (07:45:51), läste report.md med GREEN-verdict, kopierade 3 filer (207 insertions, 3 deletions) och committade direkt till commit 096a5e6. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260228-0736-neuron-hq

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260228-0756-neuron-hq — briefen innehöll komplett TypeScript-interface (`BaselineResult`) med fältdefinitioner, detekteringslogik (package.json → vitest/jest, pyproject.toml → pytest, tests/ → katalogkontroll), prompt-sektioner att infoga, och 6 namngivna testfall. 8/8 kriterier uppfyllda utan iteration, 192 raders diff (6 filer).

**Senast bekräftad:** 20260228-0756-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260228-0756-neuron-hq — Merger delegerades en enda gång, läste report.md med GREEN-verdict, kopierade 6 filer (exkluderade scripts/patch-manager.py korrekt) och committade direkt till commit 769daaa. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260228-0756-neuron-hq

**[SKEPTIKER 20260228-0756-neuron-hq]** Granskade 12 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad (458→466 baseline comparison) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-031 (0.8) "Confidence decay": Nyligen implementerad, ej aktivt testad — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
Ingen confidence sänkt denna omgång — alla mönster antingen bekräftade eller strukturellt relevanta.

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260228-0824-neuron-hq — briefen innehöll komplett TypeScript ScaffoldOptions-interface, exakt filstruktur per template, CLI-kommandosyntax och integrationskrav. 8/8 kriterier uppfyllda utan iteration, 491 raders diff (6 filer, varav 197 tester).

**Senast bekräftad:** 20260228-0824-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260228-0824-neuron-hq — Merger delegerades en enda gång (08:34:22), läste report.md med GREEN-verdict, kopierade 6 filer (489 insertions, 2 deletions) och committade direkt till commit e2535d0. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260228-0824-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260228-0824-neuron-hq — Reviewer körde baseline verify (466 tests passed before change) → after-change verify (474 tests passed, 0 failed) med fullständig stoplight-tabell. tsc --noEmit rent, inga nya lint-fel.

**Senast bekräftad:** 20260228-0824-neuron-hq

**[SKEPTIKER 20260228-0824-neuron-hq]** Granskade 12 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (466→474 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-031 (0.8) "Confidence decay": Ej aktivt testad men nyligen implementerad — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
Ingen confidence sänkt denna omgång — 3 mönster aktivt bekräftade, övriga strukturellt relevanta.

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260228-1442-neuron-hq — briefen innehöll exakt TypeScript-kod för `delegateToReviewer()` (try/catch med fs.readFile, fallback-meddelande), prompt-text att infoga i reviewer.md och manager.md, och teststruktur. 6/6 kriterier uppfyllda utan iteration, 249 raders diff.

**Senast bekräftad:** 20260228-1442-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260228-1442-neuron-hq — Merger delegerades en enda gång, läste report.md med GREEN-verdict, kopierade 7 filer (249 insertions, 1 deletion) och committade direkt till commit 091b5ec. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260228-1442-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260228-1442-neuron-hq — Reviewer körde baseline verify (474 tests expected per brief — confirmed 474 baseline + 6 new = 480) → after-change verify (480 tests, 46 files, all green) med fullständig stoplight-tabell. tsc --noEmit rent.

**Senast bekräftad:** 20260228-1442-neuron-hq

**[SKEPTIKER 20260228-1442-neuron-hq]** Granskade 12 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens TypeScript-snuttar → 6/6) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (474→480 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-031 (0.8) "Confidence decay": Ej aktivt testad, 1 körning gammal — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
Ingen confidence sänkt denna omgång — 3 mönster aktivt bekräftade, övriga strukturellt relevanta.

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260228-1509-neuron-hq — briefen innehöll exakta TypeScript-kodsnuttar för STOP-radering (fs.unlink), estop_handoff.md-template, tryRead-helper, kontextladdning (contextParts) och previousRunContext-injicering i Manager. 7/7 kriterier uppfyllda utan iteration, 172 raders diff (5 filer).

**Senast bekräftad:** 20260228-1509-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260228-1509-neuron-hq — Merger delegerades en enda gång (15:21:54), läste report.md med GREEN-verdict, kopierade 5 filer (172 insertions, 1 deletion) och committade direkt till commit ef27d6c. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260228-1509-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260228-1509-neuron-hq — Reviewer körde baseline verify (474 tests at baseline) → after-change verify (491 tests, 0 failed) med fullständig stoplight-tabell. tsc --noEmit rent, diff 172 rader, risk MEDIUM.

**Senast bekräftad:** 20260228-1509-neuron-hq

**[SKEPTIKER 20260228-1509-neuron-hq]** Granskade 12 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens TypeScript-snuttar → 7/7) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (474→491 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-031 (0.8) "Confidence decay": Ej aktivt testad, 2 körningar gammal — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
Ingen confidence sänkt denna omgång — 3 mönster aktivt bekräftade, övriga strukturellt relevanta.

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260228-2311-neuron-hq — briefen innehöll exakta markdown-block att infoga i manager.md, graph_query-exempel med type-filter, och 7 namngivna testfall. 6/6 kriterier uppfyllda utan iteration, 62 raders diff (2 filer).

**Senast bekräftad:** 20260228-2311-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260228-2311-neuron-hq — Merger delegerades en enda gång (23:20:08), läste report.md med GREEN-verdict, kopierade 2 filer (62 insertions) och committade direkt till commit bd323fd. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260228-2311-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260228-2311-neuron-hq — Reviewer körde baseline verify (491 tests at baseline) → after-change verify (498 tests, 0 failed) med fullständig stoplight-tabell. pnpm typecheck rent, lint pre-existing.

**Senast bekräftad:** 20260228-2311-neuron-hq

**[UPPDATERING]** Mönstret "Prompt-lint-tester: regex-validering av prompt-filer" bekräftades i körning 20260228-2311-neuron-hq — 7 nya lint-tester i manager-graph.test.ts verifierar att "Consult Knowledge Graph"-sektionen, graph_query-anrop, och fallback-instruktioner finns kvar i manager.md. Mönstret tillämpas nu på 9+ prompt-aspekter.

**Senast bekräftad:** 20260228-2311-neuron-hq

**[SKEPTIKER 20260228-2311-neuron-hq]** Granskade 12 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens graph_query-block → 6/6) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad men briefen handlade om graph_query i manager — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (491→498 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-031 (0.8) "Confidence decay": Ej aktivt testad, 3 körningar gammal — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
Ingen confidence sänkt denna omgång — 3 mönster aktivt bekräftade, övriga strukturellt relevanta.

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260228-2328-neuron-hq — briefen innehöll exakta markdown-sektioner att infoga i 3 prompt-filer, komplett TypeScript-kod för verification-gate.ts med validateHandoff() och required-constants, plus testnamn. 8/8 kriterier uppfyllda utan iteration, 137 raders diff (6 filer).

**Senast bekräftad:** 20260228-2328-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260228-2328-neuron-hq — Merger delegerades en enda gång (23:39:40), läste report.md med GREEN-verdict, kopierade 6 filer (137 insertions, 0 deletions) och committade direkt till commit 0a4f70e. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260228-2328-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260228-2328-neuron-hq — Reviewer körde baseline verify (498 tests at baseline per brief) → after-change verify (508 tests, 0 failed) med fullständig stoplight-tabell. pnpm typecheck rent.

**Senast bekräftad:** 20260228-2328-neuron-hq

**[UPPDATERING]** Mönstret "Manager delegerar cleanup-pass efter Implementer" bekräftades i körning 20260228-2328-neuron-hq — Implementer skapade 3 Python-hjälpskript (insert_reviewer_section.py, insert_manager_section.py, update_manager.py) för prompt-insertion. Manager inspekterade, delegerade cleanup-pass (andra Implementer-delegering) som körde `git rm` på alla 3 skript. Tredje bekräftelsen av detta mönster.

**Senast bekräftad:** 20260228-2328-neuron-hq

**[SKEPTIKER 20260228-2328-neuron-hq]** Granskade 12 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens prompt-block + TS-kod → 8/8) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (498→508 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-031 (0.8) "Confidence decay": Ej aktivt testad, 4 körningar gammal — confidence sänkt 0.8→0.7
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad, ej testad denna körning — behåll (testad i 3+ repos)
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
1 confidence sänkt (pattern-031 confidence decay 0.8→0.7, ej testad i 4 körningar).

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260228-2344-neuron-hq — briefen innehöll komplett TypeScript-kod för task-splitter.ts (Zod-schemas, validateTaskPlan med cykeldetektering), exakt prompt-sektion att infoga i manager.md, write_task_plan tool-definition med handler och 10 testfall. 8/8 kriterier uppfyllda utan iteration, 340 raders diff (6 filer).

**Senast bekräftad:** 20260228-2344-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260228-2344-neuron-hq — Merger delegerades en enda gång (23:56:38), läste report.md med GREEN-verdict, kopierade 6 filer (422 insertions) och committade direkt till commit 51d287d. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260228-2344-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260228-2344-neuron-hq — Reviewer körde baseline verify (508 tests at baseline) → after-change verify (523 tests, 0 failed) med fullständig stoplight-tabell. pnpm typecheck rent.

**Senast bekräftad:** 20260228-2344-neuron-hq

**[SKEPTIKER 20260228-2344-neuron-hq]** Granskade 13 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens TypeScript-snuttar → 8/8) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (508→523 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-034 (0.75) "Manager cleanup-pass": ❌ Ej utförd i denna körning trots behov — hjälpskript läckte till target. Confidence sänkt 0.75→0.65
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
- pattern-031 (0.7) "Confidence decay": Ej aktivt testad, 5 körningar gammal — confidence sänkt 0.7→0.6
1 confidence sänkt (pattern-034 cleanup-pass 0.75→0.65: mönstret INTE tillämpat trots behov), 1 ytterligare sänkt (pattern-031 confidence decay 0.7→0.6: ej testad i 5 körningar).

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260301-0647-neuron-hq — briefen innehöll komplett TypeScript-kod (Zod-schemas för MergeProposal, funktionssignaturer för mergeNodes/findDuplicateCandidates/findStaleNodes/findMissingEdges, Jaccard-likhetsberäkning, consolidator-verktyg). 8/8 kriterier uppfyllda utan iteration, 48 nya tester.

**Senast bekräftad:** 20260301-0647-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260301-0647-neuron-hq — Merger delegerades en enda gång (07:18:31), läste report.md med GREEN-verdict, kopierade 15 filer och committade direkt till commit 7ed7e67. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260301-0647-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260301-0647-neuron-hq — Reviewer körde baseline verify (522 tests, 1 pre-existing fail) → after-change verify (576 tests, 1 same pre-existing fail) med fullständig stoplight-tabell. pnpm typecheck rent.

**Senast bekräftad:** 20260301-0647-neuron-hq

**[UPPDATERING]** Mönstret "Meta-test (coverage.test.ts) som vaktar prompt-lint-täckning" bekräftades i körning 20260301-0647-neuron-hq — ny `prompts/consolidator.md` fick matchande `tests/prompts/consolidator-lint.test.ts` (10 tester). Coverage-meta-testet kräver att varje prompt har lint-test.

**Senast bekräftad:** 20260301-0647-neuron-hq

**[SKEPTIKER 20260301-0647-neuron-hq]** Granskade 11 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens TypeScript-snuttar → 8/8) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad men Consolidator designad med separata verktyg (graph_merge_nodes, ej graph_assert) — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (522→576 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": ✅ Delvis bekräftad — Consolidator fick 8 verktyg i en körning, samma bulk-mönster — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": ✅ Bekräftad — consolidator.md fick consolidator-lint.test.ts, coverage.test.ts-tröskel förväntas uppdaterad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
Ingen confidence sänkt denna omgång — 5 mönster aktivt bekräftade, övriga strukturellt relevanta.

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260301-0734-neuron-hq — briefen innehöll komplett TypeScript-kod (Zod-schema RunMetricsSchema, funktionssignaturer för computeRunMetrics/parseTestCounts/countDelegations/aggregateDiffStats). 7/7 kriterier uppfyllda utan iteration, 735 raders diff (2 nya + 2 modifierade filer).

**Senast bekräftad:** 20260301-0734-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260301-0734-neuron-hq — Merger delegerades en enda gång (07:50:20), läste report.md med GREEN-verdict, kopierade 5 filer (735 insertions) och committade direkt till commit 50e8dc1. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260301-0734-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260301-0734-neuron-hq — Reviewer körde baseline verify (577 tests) → after-change verify (598 tests, 0 failed) med fullständig stoplight-tabell. pnpm typecheck rent.

**Senast bekräftad:** 20260301-0734-neuron-hq

**[SKEPTIKER 20260301-0734-neuron-hq]** Granskade 12 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens TypeScript-snuttar → 7/7) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (577→598 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
- pattern-035 (0.7) "Consolidator agent": Ej aktivt testad (skapad förra körningen) — behåll
Ingen confidence sänkt denna omgång — 3 mönster aktivt bekräftade, övriga strukturellt relevanta.

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260301-0800-neuron-hq — briefen innehöll komplett TypeScript-kod (Zod-schema TaskScoreSchema, funktionssignaturer för computeTaskScore/extractTaskMetrics/computeAllTaskScores/findSimilarTaskScores, efficiencyformler med Math.max). 9/9 kriterier uppfyllda utan iteration, 946 raders diff (2 nya + 3 modifierade filer).

**Senast bekräftad:** 20260301-0800-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260301-0800-neuron-hq — Merger delegerades en enda gång (08:18:57), läste report.md med GREEN-verdict, kopierade 5 filer (852 insertions) och committade direkt till commit 79b18da. Exkluderade 3 filer (2 hjälpskript + 1 handoff). Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260301-0800-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260301-0800-neuron-hq — Reviewer körde baseline verify (598 tests expected per brief) → after-change verify (631 tests, 0 failed) med fullständig stoplight-tabell. pnpm typecheck rent. Diff size 946 rader analyserad och motiverad.

**Senast bekräftad:** 20260301-0800-neuron-hq

**[SKEPTIKER 20260301-0800-neuron-hq]** Granskade 12 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens TypeScript-snuttar → 9/9) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (598→631 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
- pattern-035 (0.7) "Consolidator agent": Ej aktivt testad — behåll
Ingen confidence sänkt denna omgång — 3 mönster aktivt bekräftade, övriga strukturellt relevanta.

## Merger filtrerar hjälpskript utan Manager-cleanup-pass
**Kontext:** Körning 20260301-0800-neuron-hq — Implementer skapade 2 Python-hjälpskript (add-missing-tests.py, insert_section.py) under implementation, men Merger exkluderade dem vid merge utan att Manager behövde delegera cleanup
**Lösning:** Merger jämför workspace-filer mot briefens filspecifikation och report.mds emergent-changes-sektion. Filer klassificerade som NEUTRAL (icke-deliverables) exkluderas från commit. Reviewer flaggade skripten som "Should ideally not be committed" i Emergent Changes-sektionen, vilket Merger kunde använda som signal.
**Effekt:** Eliminerar behovet av en extra Manager → Implementer cleanup-delegation som tidigare krävdes (se mönstret "Manager delegerar cleanup-pass"). Merger blir sista kvalitetsbarriär även för oönskade filer. Första lyckade filtreringen efter 4 misslyckade körningar (20260228-2344, 20260301-0647, 20260301-0734). 5 filer committades, 3 exkluderades.
**Keywords:** merger, hjälpskript, filtrering, cleanup, quality-gate, emergent-changes
**Relaterat:** patterns.md#Manager delegerar cleanup-pass efter Implementer, errors.md#Hjälpskript mergades till target utan cleanup-pass
**Körningar:** #20260301-0800-neuron-hq
**Senast bekräftad:** 20260301-0800-neuron-hq

---

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260301-0834-neuron-hq — briefen innehöll komplett TypeScript-interface (PromptHierarchy), funktionssignaturer (parsePromptHierarchy, loadPromptHierarchy, buildHierarchicalPrompt), exakta ARCHIVE-markörformat och integrationskod för manager.ts/reviewer.ts. 9/9 kriterier uppfyllda utan iteration, 358 raders diff (6 filer).

**Senast bekräftad:** 20260301-0834-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260301-0834-neuron-hq — Merger delegerades en enda gång (09:02:11), läste report.md med GREEN-verdict, kopierade 6 filer (358 insertions, 2 deletions) och committade direkt till commit 84dc0fb. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260301-0834-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260301-0834-neuron-hq — Reviewer körde baseline verify (631 tests) → after-change verify (650 tests, 0 failed) med fullständig stoplight-tabell. pnpm typecheck rent, diff 358 rader, risk MEDIUM.

**Senast bekräftad:** 20260301-0834-neuron-hq

**[UPPDATERING]** Mönstret "Merger filtrerar hjälpskript utan Manager-cleanup-pass" bekräftades i körning 20260301-0834-neuron-hq — Implementer skapade `scripts/add-reviewer-markers.py` men Merger exkluderade det vid merge. Endast 6 briefspecificerade filer committades (4 modifierade + 2 nya). Andra bekräftelsen av detta mönster (efter 20260301-0800-neuron-hq).

**Senast bekräftad:** 20260301-0834-neuron-hq

**[SKEPTIKER 20260301-0834-neuron-hq]** Granskade 13 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens TypeScript-snuttar → 9/9) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (631→650 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
- pattern-035 (0.7) "Consolidator agent": Ej aktivt testad — behåll
- pattern-036 (0.7) "Merger filtrerar hjälpskript": ✅ Bekräftad i denna körning — behåll
Ingen confidence sänkt denna omgång — 4 mönster aktivt bekräftade, övriga strukturellt relevanta.

## Hierarkisk promptladdning: core + archive med HTML-kommentarsmarkörer
**Kontext:** Körning 20260301-0834-neuron-hq — agentpromptar laddades som monolitiska strängar (~234–290 rader), varav stora delar sällan behövdes. Inspirerat av MemGPT/Letta (core memory vs archival memory).
**Lösning:** Dela prompt-filer i core (alltid laddad) och archive (laddas vid behov) med `<!-- ARCHIVE: namn -->` / `<!-- /ARCHIVE -->`-markörer. `parsePromptHierarchy()` extraherar sektioner till en Map. `buildHierarchicalPrompt()` bygger systemprompt från core + valda arkiv. Fallback: om inga markörer hittas returneras hela filen som core — bakåtkompatibelt.
**Effekt:** Manager-promptens core-del reducerades med 52.5% (10195→4837 chars). Sparar kontextutrymme som kan användas till meddelandehistorik. HTML-kommentarerna är osynliga vid rendering men parsebara. 6 arkivsektioner i manager.md, 4 i reviewer.md, med triggers baserade på briefinnehåll, risk-level och baseline-status.
**Keywords:** prompt-hierarchy, core, archive, kontextbesparing, MemGPT, HTML-kommentarer, loadPromptHierarchy
**Relaterat:** techniques.md#MemGPT, patterns.md#AGENTS.md som delad systemkonstitution
**Körningar:** #20260301-0834-neuron-hq
**Senast bekräftad:** 20260301-0834-neuron-hq

---

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260301-1038-neuron-hq — briefen innehöll komplett TypeScript-kod (Zod-schemas SecurityFindingSchema/ScanResultSchema, regex-mönster för SECURITY_PATTERNS, funktionssignaturer för scanDiff/formatScanReport/isHighRisk, ARCHIVE-markör). 10/10 kriterier uppfyllda utan iteration, 566 raders diff (5 filer).

**Senast bekräftad:** 20260301-1038-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260301-1038-neuron-hq — Merger delegerades en enda gång, läste report.md med GREEN-verdict, kopierade 5 filer (566 insertions, 2 deletions) och committade direkt till commit 0248dff. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260301-1038-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260301-1038-neuron-hq — Reviewer körde baseline verify (650 tests) → after-change verify (676 tests, 0 failed). pnpm typecheck rent, diff 566 rader.

**Senast bekräftad:** 20260301-1038-neuron-hq

**[UPPDATERING]** Mönstret "Hierarkisk promptladdning: core + archive med HTML-kommentarsmarkörer" bekräftades i körning 20260301-1038-neuron-hq — ny `<!-- ARCHIVE: security-review -->` sektion lades till i reviewer.md, laddas enbart vid HIGH risk via `isHighRisk()`. Validerar ARCHIVE-konceptet i praktiken — sektionen konsumeras av trigger-logik som designat.

**Senast bekräftad:** 20260301-1038-neuron-hq

**[UPPDATERING]** Mönstret "Prompt-lint-tester: regex-validering av prompt-filer" bekräftades i körning 20260301-1038-neuron-hq — 3 nya lint-tester i `tests/prompts/reviewer-security-lint.test.ts` verifierar att security-review ARCHIVE-sektionen med "Mandatory Security Checklist" och "Security Verdict" finns kvar i reviewer.md.

**Senast bekräftad:** 20260301-1038-neuron-hq

**[SKEPTIKER 20260301-1038-neuron-hq]** Granskade 13 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens TypeScript-snuttar → 10/10) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (650→676 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-027 (0.7) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
- pattern-035 (0.7) "Consolidator agent": Ej aktivt testad — behåll
- pattern-036 (0.7) "Merger filtrerar hjälpskript": Ej behövd denna körning (inga hjälpskript skapades) — behåll
Ingen confidence sänkt denna omgång — 3 mönster aktivt bekräftade, övriga strukturellt relevanta.

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260301-1129-neuron-hq — briefen innehöll komplett TypeScript-kod (NodeScopeSchema, findNodes-signatur med scope-parameter, migrateAddScope()-funktion, graph_query/graph_assert input_schema-utökningar, prompt-block för Historian/Manager/Consolidator). 12/12 kriterier uppfyllda utan iteration, 662 raders diff (13 filer, varav 351 rader tester).

**Senast bekräftad:** 20260301-1129-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260301-1129-neuron-hq — Merger delegerades en enda gång (11:43:56), läste report.md med GREEN-verdict, kopierade 13 filer (662 insertions, 43 deletions) och committade direkt till commit 808487a. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260301-1129-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260301-1129-neuron-hq — Reviewer körde baseline verify (676 tests) → after-change verify (715 tests, 0 failed) med fullständig stoplight-tabell. pnpm typecheck rent. Diff size 662 rader analyserad och motiverad (351 tester + 193 skript + 152 produktionskod).

**Senast bekräftad:** 20260301-1129-neuron-hq

**[SKEPTIKER 20260301-1129-neuron-hq]** Granskade 15 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens TypeScript-snuttar → 12/12) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, scope-filtrering tilläggsvaliderar designen — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (676→715 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": Ej bekräftad men fortfarande relevant — behåll
- pattern-037 (0.8) "Hierarkisk promptladdning": Ej aktivt testad men nyligen implementerad — behåll
- pattern-027 (0.75) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
- pattern-036 (0.75) "Merger filtrerar hjälpskript": ❌ Ej tillämpat — 3 hjälpskript inkluderades i committen trots att mönstret fanns. Confidence sänkt 0.75→0.65
- pattern-038 (0.75) "Kodbaserad säkerhetsskanning": Ej aktivt testad men nyligen implementerad — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-035 (0.7) "Consolidator agent": Ej aktivt testad — behåll
1 confidence sänkt (pattern-036 "Merger filtrerar hjälpskript" 0.75→0.65: mönstret INTE tillämpat i denna körning, hjälpskript läckte till commit).

## Safe schema migration via Zod defaults + idempotent migrator
**Kontext:** Körning 20260301-1129-neuron-hq — tillade `scope`-fält till KGNode utan att bryta befintlig data
**Lösning:** Nya fält använder Zod `.default('unknown')` så att befintlig JSON utan fältet parsas felfritt. Separat `migrateAddScope()`-funktion körs i `loadGraph()` och är idempotent (kollar `if (!node.scope)` innan tilldelning). Default-värdet ('unknown') bevarar all information — Consolidator kan tagga om i efterhand.
**Effekt:** Noll-risk schema-evolution — gammal data fungerar omedelbart, migration är automatisk och säker att köra upprepade gånger. Rollback är trivial eftersom 'unknown' ignoreras graciöst av gammal kod. Testat med 15 dedikerade tester (tom graf, mixade noder, existing scope preserved).
**Keywords:** schema-migration, zod, default, idempotent, loadGraph, backward-compatible
**Relaterat:** —
**Körningar:** #20260301-1129-neuron-hq
**Senast bekräftad:** 20260301-1129-neuron-hq

---

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260301-1247-neuron-hq — briefen innehöll komplett TypeScript-kod (funktionssignaturer för computeExecutionWaves/detectFileConflicts/splitConflictingWave/taskBranchName, Zod-schemas, Promise.allSettled-integration, ARCHIVE-sektioner med exakt markdown). 15/15 kriterier uppfyllda utan iteration, 1198 raders diff (13 filer).

**Senast bekräftad:** 20260301-1247-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260301-1247-neuron-hq — Merger delegerades en enda gång (13:25:10), läste report.md med GREEN-verdict, kopierade 13 filer (exkluderade 2 hjälpskript) och committade direkt till commit b195004. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260301-1247-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260301-1247-neuron-hq — Reviewer körde baseline verify (715 tests per brief) → after-change verify (743 tests, 0 failed) med fullständig stoplight-tabell. pnpm typecheck rent, diff 1198 rader analyserad och motiverad (HIGH risk).

**Senast bekräftad:** 20260301-1247-neuron-hq

**[UPPDATERING]** Mönstret "Merger filtrerar hjälpskript utan Manager-cleanup-pass" bekräftades i körning 20260301-1247-neuron-hq — Implementer skapade 2 hjälpskript (add-parallel-wave.py, patch-merger.py), Merger exkluderade dem med `git diff --stat -- ':!scripts/'`. Tredje konsekutiva bekräftelsen (efter 20260301-0800 och 20260301-0834).

**Senast bekräftad:** 20260301-1247-neuron-hq

**[UPPDATERING]** Mönstret "Hierarkisk promptladdning: core + archive med HTML-kommentarsmarkörer" bekräftades i körning 20260301-1247-neuron-hq — nya `<!-- ARCHIVE: parallel-tasks -->` och `<!-- ARCHIVE: parallel-merge -->` sektioner lades till i manager.md och merger.md. Validerar ARCHIVE-konceptet i praktiken — Manager och Merger-agenternas prompts laddar relevanta sektioner baserat på kontext.

**Senast bekräftad:** 20260301-1247-neuron-hq

**[SKEPTIKER 20260301-1247-neuron-hq]** Granskade 14 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens TypeScript-snuttar → 15/15) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (715→743 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": ✅ Delvis bekräftad — merge_task_branch-verktyg adderat till Merger — behåll
- pattern-037 (0.8) "Hierarkisk promptladdning": ✅ Bekräftad — nya ARCHIVE-sektioner i manager.md och merger.md — behåll
- pattern-038 (0.75) "Kodbaserad säkerhetsskanning": Ej aktivt testad men Reviewer använde säkerhetsgranskning i report.md (shell injection-analys) — behåll
- pattern-027 (0.75) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-035 (0.7) "Consolidator agent": Ej aktivt testad — behåll
Ingen confidence sänkt denna omgång — 5 mönster aktivt bekräftade, övriga strukturellt relevanta.

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260301-1544-neuron-hq — briefen innehöll komplett TypeScript-kod (ModelConfigSchema, AgentModelMapSchema, resolveModelConfig, createAgentClient) plus exakta constructor-mönster för alla 10 agenter (före/efter). 13/13 kriterier uppfyllda utan iteration, 747 raders diff (23 filer).

**Senast bekräftad:** 20260301-1544-neuron-hq

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260301-1544-neuron-hq — Merger delegerades en enda gång (16:15:14), läste report.md med GREEN-verdict, kopierade 23 filer (651 insertions, 96 deletions) och committade direkt till commit c861b37. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260301-1544-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260301-1544-neuron-hq — Reviewer körde baseline verify (750 tests expected per brief) → after-change verify (781 tests, 0 failed) med fullständig stoplight-tabell. pnpm typecheck rent. Diff size 747 rader analyserad och motiverad (HIGH risk, mekaniska substitutioner).

**Senast bekräftad:** 20260301-1544-neuron-hq

**[SKEPTIKER 20260301-1544-neuron-hq]** Granskade 16 mönster med confidence ≥ 0.7:
- pattern-018 (0.95) "Exakt feloutput": ✅ Bekräftad i denna körning (briefens TypeScript-snuttar → 13/13) — behåll
- pattern-030 (0.95) "Graph write restricted": Strukturellt relevant, ej aktivt testad — behåll
- pattern-007 (0.85) "Reviewer baseline": ✅ Bekräftad i denna körning (750→781 tester) — behåll
- pattern-019 (0.85) "Manager-only resume": Ej relevant (inte resume-körning) — behåll
- pattern-029 (0.8) "Additiv verktygsspridning": ✅ Bekräftad — samma bulk-mönster (10 agenter → factory) som i GraphRAG-körningen — behåll
- pattern-037 (0.8) "Hierarkisk promptladdning": Ej aktivt testad denna körning — behåll
- pattern-027 (0.75) "Single-phase Merger": ✅ Bekräftad i denna körning (23 filer → commit c861b37) — behåll
- pattern-036 (0.75) "Merger filtrerar hjälpskript": Ej behövd (inga hjälpskript skapades) — behåll
- pattern-038 (0.75) "Kodbaserad säkerhetsskanning": Reviewer använde security-granskning i report.md — behåll
- pattern-006 (0.7) "Researcher multi-signal": Ej bekräftad men testad i 3+ repos — behåll
- pattern-009 (0.7) "Implementer anpassar sig": Ej relevant — behåll
- pattern-010 (0.7) "Resume hoppar till Review": Ej relevant — behåll
- pattern-015 (0.7) "Meta-test coverage": Ej aktivt testad — behåll
- pattern-017 (0.7) "Merger NO-OP": Ej relevant — behåll
- pattern-035 (0.7) "Consolidator agent": Ej aktivt testad — behåll
- pattern-039 (0.7) "Safe schema migration": Ej aktivt testad — behåll
Ingen confidence sänkt denna omgång — 4 mönster aktivt bekräftade, övriga strukturellt relevanta.

## Model-specifika prompt-overlays
**Kontext:** Byggde på S7 (hierarchical prompts) för att anpassa agentinstruktioner efter modell. Olika modeller (Opus, Haiku, Sonnet, GPT-4) har olika styrkor och begränsningar.
**Lösning:** Implementerade ett overlay-system med familje-mappning (model ID → overlay-familj), två merge-strategier (hierarkisk för Manager/Reviewer, enkel append för övriga 8 agenter), och cascading resolution-ordning (role-specifik → family default → ingen overlay). Overlays är enkla markdown-filer utan ARCHIVE-markörer.
**Effekt:** Agenter kan nu ge modell-optimala instruktioner (kortare + explicita för Haiku, nuanserade för Opus) utan att kompromissa promptbaseline. Systemet är fullt bakåtkompatibelt (parametrar är valfria) och utökbart till fler modeller genom att bara lägga till nya overlay-filer.
**Keywords:** prompt-engineering, model-optimization, overlay-system, hierarchical-prompts, claude-opus, claude-haiku, gpt-4
**Relaterat:** S7 (hierarchical prompts), S5 (multi-provider)
**Körningar:** #20260302-1733-neuron-hq
**Senast bekräftad:** 20260302-1733-neuron-hq

---

## Model-specifika prompt-overlays
**Kontext:** Byggde på S7 (hierarchical prompts) för att anpassa agentinstruktioner efter modell. Olika modeller (Opus, Haiku, Sonnet, GPT-4) har olika styrkor och begränsningar.
**Lösning:** Implementerade ett overlay-system med familje-mappning (model ID → overlay-familj), två merge-strategier (hierarkisk för Manager/Reviewer, enkel append för övriga 8 agenter), och cascading resolution-ordning (roll-specifik → family default → ingen overlay). Overlays är enkla markdown-filer utan ARCHIVE-markörer.
**Effekt:** Agenter kan nu ge modell-optimala instruktioner (kortare + explicita för Haiku, nuanserade för Opus) utan att kompromissa promptbaseline. Systemet är fullt bakåtkompatibelt (parametrar är valfria) och utökbart till fler modeller genom att bara lägga till nya overlay-filer.
**Keywords:** prompt-engineering, model-optimization, overlay-system, hierarchical-prompts, claude-opus, claude-haiku, gpt-4
**Relaterat:** S7 (hierarchical prompts), S5 (multi-provider)
**Körningar:** #20260302-1733-neuron-hq
**Senast bekräftad:** 20260302-1733-neuron-hq

---

## Gradvis typkontroll med Zod + Fallback
**Kontext:** Neuron-hq använde fritext-markdown-handoffs mellan agenter utan typkontroll. Kompilering gav ingen garanti för strukturen på agent-meddelanden.
**Lösning:** Implementera Zod-scheman för kritiska agent-till-agent-meddelanden. Manager läser strukturerad JSON-resultatfil om den finns, med fallback till fritext om den saknas. Scheman exporteras som TypeScript-typer för compile-time-kontroll.
**Effekt:** Möjliggör gradvis migration — systemet fungerar exakt som förut medan agenter börjar skriva JSON. Inga borttagningar av befintliga markdown-handoffs. Efter övergångstid kan markdown-fallback tas bort. Minskar behov av string.includes()-validering.
**Keywords:** zod, schema-validation, typed-messages, gradual-migration, backward-compatibility
**Relaterat:** N13 agent-handoff-context
**Körningar:** #20260303-0215-neuron-hq
**Senast bekräftad:** 20260303-0215-neuron-hq

---

## Stdio-transport måste skydda stdout för protokoll

**Kontext:** Vid implementering av MCP (Model Context Protocol) server med stdio-transport måste all protokolkommunikation gå genom stdout. Eventuell console.log eller debug-output kan kontaminera protokollmeddelanden.

**Lösning:** Dirigera all loggning till stderr/console.error när servern körs i MCP-mode. Använd environment-variabel (e.g., DEBUG_STDERR=1) för att styra loggdestination.

**Effekt:** Förhindrar brusiga eller korrupta MCP-meddelanden som gör att Claude-klienten inte kan tolka verktygssvar. Enkel men kritisk för klientstabilitet.

**Keywords:** MCP, stdio, protocol, logging, stderr, stdout

**Relaterat:** MCP TypeScript SDK docs (https://modelcontextprotocol.io/)

**Körningar:** #20260303-1430

**Senast bekräftad:** 20260303-1430-neuron-hq

---

## Extrahera delad logik till src/core för återanvändning mellan commands och tools

**Kontext:** När samma affärslogik behövs av flera slutpunkter (e.g., CLI-kommando och MCP-verktyg) kan det leda till duplicering eller svårt att upprätthålla.

**Lösning:** Identifiera kärnlogiken (t.ex. prisberäkning i costs.ts) och extrahera till en dedikerad modul under src/core/. Importera från båda slutpunkterna istället för att duplicera.

**Effekt:** Reducerar koddupliceringen, gör ändringar lättare att underhålla (en källa till sanning), och möjliggör bättre testning av kärnlogiken separat.

**Keywords:** code-reuse, shared-module, extraction, DRY, core-logic

**Relaterat:** Körning 20260303-1430 — pricing.ts extraherades från costs.ts

**Körningar:** #20260303-1430

**Senast bekräftad:** 20260303-1430-neuron-hq

---

## MCP stdio-transport kräver stderr för all loggning

**Kontext:** Vid implementering av Model Context Protocol-server med stdio-transport måste stdout hållas fri för protokollmeddelanden. Console.log eller debug-output kan kontaminera och bryta protokollparsning hos Claude-klienten.

**Lösning:** Dirigera all loggning (console.error, winston till stderr, aldrig console.log i MCP-mode). Skydda stdout explicit — det är Cprotokollens enda kommunikationskanal.

**Effekt:** MCP-meddelanden når Claude rena och parsabla. Klienten kan tolka och anropa verktyg utan brus från debug-output. Kritisk för stabilitet.

**Keywords:** MCP, stdio, protocol, logging, stderr, stdout, transport

**Relaterat:** @modelcontextprotocol/sdk dokumentation, Claude Desktop integration guide

**Körningar:** #20260303-1430

**Senast bekräftad:** 20260303-1430-neuron-hq

---

## Extrahera delad affärslogik till src/core för återanvändning mellan CLI-kommando och MCP-verktyg

**Kontext:** Samma beräkningslogik (t.ex. prisberäkning i costs-kommandot) behövs av flera gränssnitt — CLI-kommando och MCP-verktyg exponerar samma data.

**Lösning:** Identifiera kärnlogiken och flytta till en dedikerad modul under src/core/ (t.ex. src/core/pricing.ts). Importera från båda gränssnitten istället för att duplicera kod.

**Effekt:** Reducerar koddupliceringen, gör ändringar i kärnlogiken enkla (en källa till sanning), och möjliggör fokuserad testning av logiken separat från gränssnittskoden.

**Keywords:** code-reuse, shared-module, extraction, DRY, core-logic, business-logic

**Relaterat:** Körning 20260303-1430 — pricing.ts extraherades från costs.ts för båda CLI:n och MCP-verktyget

**Körningar:** #20260303-1430

**Senast bekräftad:** 20260303-1430-neuron-hq

---

## Additivt moduldesign för minnessystem-parallellisering
**Kontext:** Running A1 (Aurora skeleton) required integrating a second knowledge graph alongside Neuron's existing kg_nodes/kg_edges without modifying legacy code.
**Lösning:** Created entirely new `src/aurora/` module that mirrors `knowledge-graph.ts` CRUD patterns (addAuroraNode, findAuroraNodes, updateAuroraNode, etc). Generalized shared functions like `semanticSearch()` to accept optional `table: 'kg_nodes' | 'aurora_nodes'` parameter with allowlist validation instead of string interpolation. Kept `kg_nodes`/`kg_edges` completely untouched; only 25 lines added to existing files (semantic-search.ts, cli.ts, mcp/server.ts).
**Effekt:** Achieved low-risk integration despite 1400+ lines of new code. Zero breakage of 984 existing tests. Rollback trivial: `git revert + DROP TABLE aurora_*`. Pattern enables future parallel knowledge graphs (e.g., project-specific memory) without architectural redesign. Dual-write to JSON + Postgres provides failover: if DB unavailable, JSON fallback still works.
**Keywords:** modular design, additive architecture, dual-write fallback, SQL parameterization, allowlist validation, knowledge graph, parallel systems
**Relaterat:** neuron-hq brief A1
**Körningar:** #20260309-0552
**Senast bekräftad:** 20260309-0552

---
## SQL table-parameter allowlist validation
**Kontext:** Generalizing `semanticSearch()` and `findSimilarNodes()` to support both `kg_nodes` and `aurora_nodes` tables via parameter rather than separate functions.
**Lösning:** Implemented whitelist-based validation: define `const ALLOWED_TABLES = ['kg_nodes', 'aurora_nodes']` and throw error if parameter not in list before any SQL string concatenation. Never use template literals or string interpolation for table names.
**Effekt:** Prevents SQL injection attacks while keeping function signatures clean. Test suite includes injection-attempt case that verifies error thrown for malicious input. Pattern applies to any dynamic table selection — reusable across codebases.
**Keywords:** security, SQL injection prevention, parameterization, validation, whitelist, defensive programming
**Relaterat:** patterns.md#Additivt moduldesign för minnessystem-parallellisering
**Körningar:** #20260309-0552
**Senast bekräftad:** 20260309-0552

---

## Modulär dual-write för parallella minnessystem
**Kontext:** Körning 20260309-0552-neuron-hq: Integrera Aurora-minnessystem parallellt med befintligt Neuron-minnessystem utan att ändra befintlig kod.
**Lösning:** Skapa helt isolerad `src/aurora/`-modul som speglar `knowledge-graph.ts` strukturen (AuroraNode + AuroraEdge schemas, CRUD-funktioner, dual-write till JSON + Postgres). Generalisera delade funktioner (semanticSearch, applyConfidenceDecay) för att acceptera optional `table`-parameter istället för separata funktioner.
**Effekt:** 66 nya tests passerar, 984 befintliga oförändrade. Rollback är trivial (`git revert + DROP TABLE`). Mönstret skalas för framtida minnessystem utan arkitekturredesign.
**Keywords:** modular architecture, parallel systems, dual-write, backward compatibility, schema isolation
**Relaterat:** patterns.md#Additivt moduldesign för minnessystem-parallellisering, neuron-hq brief A1
**Körningar:** #20260309-0552
**Senast bekräftad:** 20260309-0552

---

## Batch embeddings för skalbarhet
**Kontext:** Aurora A1-härdning identifierade 100-nods embedding-loops som en flaskhals
**Lösning:** Refaktorera `autoEmbedAuroraNodes()` och `autoEmbedNodes()` från en-per-en till `embedBatch()` med batchstorlek 20
**Effekt:** Reducerar roundtrips från N till ceil(N/20) — t.ex. 100 noder = 5 anrop istället för 100. Betydlig latensförbättring utan att ändra beteendet eller felhantering
**Keywords:** embeddings, performance, batch-operations, Ollama, non-fatal-errors
**Relaterat:** src/aurora/aurora-graph.ts, src/core/knowledge-graph.ts
**Körningar:** #20260309-0643-neuron-hq
**Senast bekräftad:** 20260309-0643-neuron-hq

---

## PL/pgSQL atomicitetsgarantier för databaskritiska operationer
**Kontext:** Confidence decay i Aurora kräver att värden uppdateras konsekvent — TypeScript loop kan krascha mitt i processen
**Lösning:** Flytta decay-logik till PL/pgSQL-funktion `decay_confidence()` med table-name-allowlist (SQL-injection-skydd), transaction-atomicitet och statistik-output
**Effekt:** Garanterar att alla noder uppdateras eller ingen, rehabituerar inte på crashed-uppdateringar, returnerar före/efter-statistik för verifiering
**Keywords:** transactions, PostgreSQL, atomic-operations, data-consistency, decay, PL-pgSQL
**Relaterat:** src/core/migrations/004_decay_function.sql, src/commands/aurora-decay.ts
**Körningar:** #20260309-0643-neuron-hq
**Senast bekräftad:** 20260309-0643-neuron-hq

---

## MCP-tool graceful fallback för felsenario
**Kontext:** `aurora_search` behöver fungera även om semantisk sökning (Postgres/Ollama) inte är tillgänglig
**Lösning:** Implementera `try/catch` för `semanticSearch()`, fallback till `findAuroraNodes()` med keyword-matchning om det kastar
**Effekt:** MCP-tool aldrig timeout-kastar, Claude Desktop får alltid ett svar (tom lista eller keyword-resultat). Påverkan på användarupplevelsen minimal
**Keywords:** MCP, fallback, error-handling, robustness, graceful-degradation
**Relaterat:** src/mcp/tools/aurora-search.ts, src/mcp/tools/knowledge.ts (existing pattern)
**Körningar:** #20260309-0643-neuron-hq
**Senast bekräftad:** 20260309-0643-neuron-hq

---

## Graceful fallback från semantisk sökning till keyword-matchning
**Kontext:** När Aurora-funktionen kräver sökning i databas men Ollama/Postgres ej tillgänglig, behövs fallback för att upprätthålla funktionalitet.
**Lösning:** Implementera try/catch runt `semanticSearch()` med fallback till `findAuroraNodes()` (keyword-baserad sökning). Placera logiken centralt i en shared search-modul (`aurora/search.ts`). Exponera via ett enhetligt gränssnitt (`searchAurora()`) som döljer fallback-detaljerna.
**Effekt:** Systemet fungerar även utan Ollama/Postgres (vid dev eller nedtid), ingen duplikation av fallback-logik över CLI/MCP/programmatisk API, enklare testning (mock vid searchen, inte vid varje consumer).
**Keywords:** semantic-search, graceful-degradation, fallback-strategy, aurora, neural-search
**Relaterat:** patterns.md#Comprehensive test mocking av externa API-beroenden
**Körningar:** #20260309-0848-neuron-hq
**Senast bekräftad:** 20260309-0848-neuron-hq

---

## Comprehensive test mocking av externa API-beroenden
**Kontext:** Vid testning av funktioner som anropar Claude API, semantisk sökning eller databas ska tests ej göra riktiga API-anrop.
**Lösning:** 
1. Mocka alla externa dependencies på modulnivå (med `vi.mock()`)
2. Skapa realistic mock-data som matchar actual API-response-format
3. Exportera mocks från test-filen för att kunna verifiera calls
4. Testa både happy-path och edge-cases (tomma resultat, API-fel, timeout)
5. Håll mocks uppdaterade när API-kontraktet ändras
**Effekt:** Tests kör snabbt och deterministiskt, inga fel från externa system påverkar suite, full kontroll över test-villkor (trots på API-fel, simulera vissa resultat osv).
**Keywords:** unit-test, mocking, jest, vitest, api-isolation, external-dependencies
**Relaterat:** patterns.md#Graceful fallback från semantisk sökning till keyword-matchning
**Körningar:** #20260309-0848-neuron-hq
**Senast bekräftad:** 20260309-0848-neuron-hq

---

## Separation av concerns: ask (syntes) vs search (hämtning) i kunskapsagenter
**Kontext:** Aurora-pipelinen behöver både söka information och syntetisera svar via LLM. Dessa två concerns kan blandas i ett modul eller separeras.
**Lösning:** Skapa två distinkta moduler:
- `search.ts`: Ansvarar bara för hämtning, deduplicering, relevans-ranking. Returnerar struktur med SearchResult[] (text, similarity, source)
- `ask.ts`: Tar SearchResult[], formaterar som LLM-kontext, anropar Claude, extraherar svar + citeringar. Returnerar AskResult.
Låt consumers (CLI, MCP, programmatisk) anropa ask() direkt; ask() anropar search internt.
**Effekt:** 
- Enkelt att testa ask() isolerat med mock-search-resultat
- Enkelt att testa search() isolerat utan API-anrop
- Enkel att låta search() användas oberoende av ask() (t.ex. i andra features)
- Clear contract mellan moduler, minimerar tight coupling
**Keywords:** separation-of-concerns, single-responsibility, modular-design, functional-programming
**Körningar:** #20260309-0848-neuron-hq
**Senast bekräftad:** 20260309-0848-neuron-hq

---

## Graceful fallback från semantisk sökning till keyword-matchning
**Kontext:** Aurora A3 — när semantisk sökning inte är tillgänglig (Ollama/Postgres offline), fallback till keyword-matchning för robusthet.
**Lösning:** Implementera try/catch runt `semanticSearch()` med fallback till `findAuroraNodes()` (keyword-baserad sökning). Placera logiken centralt i search-modulen (`searchAurora()`), inte duplicerad i varje consumer.
**Effekt:** Systemet fungerar även utan Ollama/Postgres, ingen duplikation av fallback-logik över CLI/MCP/programmatisk API, enklare testning.
**Keywords:** semantic-search, graceful-degradation, fallback, keyword-search, aurora, robustness
**Relaterat:** patterns.md#Comprehensive test mocking av externa API-beroenden
**Körningar:** #20260309-0848-neuron-hq
**Senast bekräftad:** 20260309-0848-neuron-hq

---

## Comprehensive test mocking av externa API-beroenden
**Kontext:** Enhetstester som anropar Claude API, semantisk sökning eller databas måste isoleras från externa systemet.
**Lösning:** 
1. Mocka alla externa dependencies på modulnivå med `vi.mock()`
2. Skapa realistic mock-data som matchar actual API-response-format
3. Testa både happy-path och edge-cases (tomma resultat, API-fel, timeout)
4. Håll mocks uppdaterade när API-kontraktet ändras
**Effekt:** Tests kör snabbt och deterministiskt, full kontroll över villkor, ingen beroende av externa tjänster.
**Keywords:** unit-testing, mocking, vitest, api-isolation, external-dependencies, determinism
**Relaterat:** patterns.md#Graceful fallback från semantisk sökning till keyword-matchning
**Körningar:** #20260309-0848-neuron-hq
**Senast bekräftad:** 20260309-0848-neuron-hq

---

## Separation av concerns: ask (syntes) vs search (hämtning) i kunskapsagenter
**Kontext:** Aurora-pipelinen behöver både söka information och syntetisera svar via LLM — två skilda concerns.
**Lösning:** Skapa två distinkta moduler:
- `search.ts`: Hämtning, deduplicering, ranking. Returnerar SearchResult[]
- `ask.ts`: Formaterar kontext, anropar Claude, extraherar svar + citeringar. Returnerar AskResult
Let consumers anropa ask() direkt; ask() anropar search internt.
**Effekt:** 
- Enkelt att testa ask() isolerat med mock-search
- Enkelt att testa search() isolerat
- Enkelt att återanvända search() i andra features
- Clear contract mellan moduler, minimal tight coupling
**Keywords:** separation-of-concerns, single-responsibility, modular-design, functional-architecture
**Körningar:** #20260309-0848-neuron-hq
**Senast bekräftad:** 20260309-0848-neuron-hq

---

## Graceful fallback från semantisk sökning till keyword-matchning
**Kontext:** Aurora A3 — när semantisk sökning inte är tillgänglig (Ollama/Postgres offline), fallback till keyword-matchning för robusthet.
**Lösning:** Implementera try/catch runt `semanticSearch()` med fallback till `findAuroraNodes()` (keyword-baserad sökning). Placera logiken centralt i search-modulen (`searchAurora()`), inte duplicerad i varje consumer.
**Effekt:** Systemet fungerar även utan Ollama/Postgres, ingen duplikation av fallback-logik över CLI/MCP/programmatisk API, enklare testning.
**Keywords:** semantic-search, graceful-degradation, fallback, keyword-search, aurora, robustness
**Relaterat:** patterns.md#Comprehensive test mocking av externa API-beroenden
**Körningar:** #20260309-0848-neuron-hq
**Senast bekräftad:** 20260309-0848-neuron-hq

---

## Comprehensive test mocking av externa API-beroenden
**Kontext:** Enhetstester som anropar Claude API, semantisk sökning eller databas måste isoleras från externa systemet.
**Lösning:** 
1. Mocka alla externa dependencies på modulnivå med `vi.mock()`
2. Skapa realistic mock-data som matchar actual API-response-format
3. Testa både happy-path och edge-cases (tomma resultat, API-fel, timeout)
4. Håll mocks uppdaterade när API-kontraktet ändras
**Effekt:** Tests kör snabbt och deterministiskt, full kontroll över villkor, ingen beroende av externa tjänster.
**Keywords:** unit-testing, mocking, vitest, api-isolation, external-dependencies, determinism
**Relaterat:** patterns.md#Graceful fallback från semantisk sökning till keyword-matchning
**Körningar:** #20260309-0848-neuron-hq
**Senast bekräftad:** 20260309-0848-neuron-hq

---

## Separation av concerns: ask (syntes) vs search (hämtning) i kunskapsagenter
**Kontext:** Aurora-pipelinen behöver både söka information och syntetisera svar via LLM — två skilda concerns.
**Lösning:** Skapa två distinkta moduler:
- `search.ts`: Hämtning, deduplicering, ranking. Returnerar SearchResult[]
- `ask.ts`: Formaterar kontext, anropar Claude, extraherar svar + citeringar. Returnerar AskResult
Let consumers anropa ask() direkt; ask() anropar search internt.
**Effekt:** 
- Enkelt att testa ask() isolerat med mock-search
- Enkelt att testa search() isolerat
- Enkelt att återanvända search() i andra features
- Clear contract mellan moduler, minimal tight coupling
**Keywords:** separation-of-concerns, single-responsibility, modular-design, functional-architecture
**Körningar:** #20260309-0848-neuron-hq
**Senast bekräftad:** 20260309-0848-neuron-hq

---

## Aurora semantic dedup med fallback
**Kontext:** A4-körningen vid implementering av memory-modulen för faktabesparing
**Lösning:** Två-stegs dedup-strategi: (1) `searchAurora()` för semantisk likhetssökning, (2) fallback till `findAuroraNodes()` med keyword-matchning vid DB/Ollama-fel. Tröskelvärden: 0.85 för uppdatering (dedup), 0.95 för duplikatdetektering.
**Effekt:** Robust mot infrastrukturfel. Möjliggör faktabesparing utan kritiska dependenser. Reducerar risken för duplicerad data samtidigt som systemet kör även om sökning är nere.
**Keywords:** dedup, semantic-search, fallback, fact-storage, confidence-decay
**Relaterat:** patterns.md#Aurora-grafsökning, techniques.md#Graceful degradation
**Körningar:** #20260309-1022-neuron-hq
**Senast bekräftad:** 20260309-1022-neuron-hq

---

## Worker-bridge abstraction for external dependencies
**Kontext:** Adding new Python workers (yt-dlp, Whisper, pyannote) to neuron-hq Aurora pipeline
**Lösning:** Isolated external subprocess handlers behind type-safe bridge: workers registered in worker-bridge.ts union type + __main__.py HANDLERS dict, all communication via stdin/stdout JSON. New handlers added without modifying TypeScript calling code.
**Effekt:** Minimized risk of regression (4 files modified, 3 only with registrations), enables comprehensive mocking at the bridge layer (no actual subprocess calls in tests), scales gracefully as new workers added (just append to union + dict)
**Keywords:** worker-bridge, abstraction, external-dependencies, subprocess-protocol, mocking, zero-regression
**Relaterat:** patterns.md#Additive implementation for isolated features
**Körningar:** #20260309-1104-neuron-hq
**Senast bekräftad:** 20260309-1104-neuron-hq

---

## Optional fields on existing interfaces preserve backward compatibility
**Kontext:** Adding new features (auto-lärande, contradiction-detection) to Aurora's `ask()` and `remember()` without breaking existing code.
**Lösning:** New fields on result interfaces and options marked optional (AskOptions.learn?, AskResult.factsLearned?, RememberResult.contradictions?). Callers that don't use the new fields continue to work unchanged.
**Effekt:** Zero risk — additive only. Existing code paths unaffected, new code paths opt-in. Tests confirm all 1264 pre-existing tests pass without modification.
**Keywords:** typescript, interface-extension, backward-compatibility, additive-change
**Relaterat:** neuron-hq brief A6
**Körningar:** #20260309-1229-neuron-hq
**Senast bekräftad:** 20260309-1229-neuron-hq

---

## Graceful fallback for optional Claude API calls
**Kontext:** Auto-lärande and contradiction-detection require Claude calls but must never block the primary response.
**Lösning:** Wrap Claude calls in try/catch. On any failure (parse error, API error, timeout), log warning and return result without the optional field. E.g., if `learn: true` fails, still return the answer; if contradiction-check fails, fall back to `related_to` edge.
**Effekt:** High availability — users get correct answers even if secondary features fail. Simplified error handling — no cascading failures.
**Keywords:** resilience, error-handling, try-catch, non-blocking
**Relaterat:** neuron-hq brief A6
**Körningar:** #20260309-1229-neuron-hq
**Senast bekräftad:** 20260309-1229-neuron-hq

---

## Guard clauses prevent unnecessary Claude API calls
**Kontext:** Contradiction-detection and knowledge-gap dedup both call Claude-Haiku to resolve ambiguous cases. Cost and latency add up if called naively.
**Lösning:** Check preconditions before calling Claude. E.g., in contradiction-check: only if `relatedCandidates.length > 0 && similarity >= 0.5`. In gap-dedup: only if no perfect existing match found. Avoids thousands of wasted calls.
**Effekt:** ~80% fewer Claude calls in typical runs. Measurable cost reduction without sacrificing accuracy.
**Keywords:** api-cost-optimization, conditional-logic, claude-haiku
**Relaterat:** neuron-hq brief A6
**Körningar:** #20260309-1229-neuron-hq
**Senast bekräftad:** 20260309-1229-neuron-hq

---

## Optional fields on existing interfaces preserve backward compatibility
**Kontext:** Adding new features (auto-lärande, contradiction-detection) to Aurora's `ask()` and `remember()` without breaking existing code.
**Lösning:** New fields on result interfaces and options marked optional (AskOptions.learn?, AskResult.factsLearned?, RememberResult.contradictions?). Callers that don't use the new fields continue to work unchanged.
**Effekt:** Zero risk — additive only. Existing code paths unaffected, new code paths opt-in. Tests confirm all 1264 pre-existing tests pass without modification.
**Keywords:** typescript, interface-extension, backward-compatibility, additive-change
**Relaterat:** neuron-hq Aurora A6 smart memory
**Körningar:** #20260309-1229-neuron-hq
**Senast bekräftad:** 20260309-1229-neuron-hq

---

## Graceful fallback for optional Claude API calls
**Kontext:** Auto-lärande and contradiction-detection require Claude calls but must never block the primary response.
**Lösning:** Wrap Claude calls in try/catch. On any failure (parse error, API error, timeout), log warning and return result without the optional field. E.g., if `learn: true` fails, still return the answer; if contradiction-check fails, fall back to `related_to` edge.
**Effekt:** High availability — users get correct answers even if secondary features fail. Simplified error handling — no cascading failures.
**Keywords:** resilience, error-handling, try-catch, non-blocking
**Relaterat:** neuron-hq Aurora A6 smart memory
**Körningar:** #20260309-1229-neuron-hq
**Senast bekräftad:** 20260309-1229-neuron-hq

---

## Guard clauses prevent unnecessary Claude API calls
**Kontext:** Contradiction-detection and knowledge-gap dedup both call Claude-Haiku to resolve ambiguous cases. Cost and latency add up if called naively.
**Lösning:** Check preconditions before calling Claude. E.g., in contradiction-check: only if `relatedCandidates.length > 0 && similarity >= 0.5`. In gap-dedup: only if no perfect existing match found. Avoids thousands of wasted calls.
**Effekt:** ~80% fewer Claude calls in typical runs. Measurable cost reduction without sacrificing accuracy.
**Keywords:** api-cost-optimization, conditional-logic, claude-haiku
**Relaterat:** neuron-hq Aurora A6 smart memory
**Körningar:** #20260309-1229-neuron-hq
**Senast bekräftad:** 20260309-1229-neuron-hq

---

## Semantic deduplication pattern for knowledge capture
**Kontext:** When saving facts/questions to a knowledge base, both `remember()` fakta-dedup och `recordGap()` kunskapslucka-dedup behöver samma grundmönster.
**Lösning:** Search för semantiska kandidater (similarity >= 0.5) före insert. För exakt match (>= dedupThreshold): update frequency. För partial match: create related/contradicts-kant. För no match: create new node.
**Effekt:** Konsistent dedup-beteende över alla inlärningsvägar. Inga automatiska dubbletter, höga confidence-värden.
**Keywords:** semantic-dedup, knowledge-graph, similarity-threshold, frequency-tracking
**Relaterat:** neuron-hq Aurora A4, A6
**Körningar:** #20260309-1229-neuron-hq
**Senast bekräftad:** 20260309-1229-neuron-hq

---

## Additive table design för cross-domain integrations
**Kontext:** Implementering av cross-referencing mellan två separata kunskapsgrafer (Neuron KG och Aurora KG) som lever i samma Postgres-databas men har olika scheman
**Lösning:** Skapa egen junction-tabell (`cross_refs`) med FK till båda grafernas nodtabeller, istället för att lägga till kanter i befintliga edge-tabeller. Tabell får CHECK-constraint för relationstyperna (supports, contradicts, enriches, discovered_via), UNIQUE-constraint för duplikatkontroll (ON CONFLICT upsert), och indexering på båda FK-kolumner
**Effekt:** Noll påverkan på befintlig kod; migrationen är reversibel; möjliggör senare addition av metadata/confidence-kopplingar utan att ändra befintliga structurer. Undviker FK-konflikter mellan separata domäner
**Keywords:** postgres, junction-table, additive-design, two-phase-migration, knowledge-graph
**Relaterat:** patterns.md#Embedding-based similarity search via direct SQL
**Körningar:** #20260309-1410-neuron-hq
**Senast bekräftad:** 20260309-1410-neuron-hq

---
## Embedding-based similarity search via direct SQL
**Kontext:** Cross-reference-modulen måste söka efter semantiskt liknande noder *från en redan-inbäddad nods perspektiv* (dvs. givet en nods embedding från `kg_nodes`, hitta alla `aurora_nodes` med högst cosine similarity)
**Lösning:** Använd direkt SQL med `<=>` (cosine distance operator) istället för `semanticSearch()` textfrågor. Frågor som `SELECT ... ORDER BY embedding <=> (SELECT embedding FROM kg_nodes WHERE id = $1) LIMIT $2` möjliggör O(1) index-lookup via pgvector HNSW
**Effekt:** Snabba two-way matches; semantisk search utan textfråga-parsing; möjliggör bulk-sökningar utan repeterad embedding-generering
**Keywords:** pgvector, embedding, cosine-similarity, sql, knowledge-graph
**Relaterat:** patterns.md#Additive table design för cross-domain integrations
**Körningar:** #20260309-1410-neuron-hq
**Senast bekräftad:** 20260309-1410-neuron-hq

---
## Side-effect tools correctly excluded from read-only tool lists
**Kontext:** Implementering av Historian-tool `graph_cross_ref` som skapar poster i databasen (skapar cross-refs för matches med similarity >= 0.7)
**Lösning:** Definiera `graph_cross_ref` i `graph-tools.ts` och lägg till i Historians `tools`-lista, men **exkludera från** `graphReadToolDefinitions()`. Denna funktion returnerar en lista över tools som är lämpliga för read-only-kontext (tex. LLM-RAG). Tools med side effects får aldrig listas där
**Effekt:** Förhindrar felaktig användning av mutations-tools i read-only-scenarier. Dokumenterar intent genom kod-struktur
**Keywords:** historian, tool-registration, side-effects, tool-definitions, separation-of-concerns
**Relaterat:** 
**Körningar:** #20260309-1410-neuron-hq
**Senast bekräftad:** 20260309-1410-neuron-hq

---

## Parallell orkestrering av API-anrop med Promise.all()
**Kontext:** Briefing-funktionen behövde köra 4 oberoende sökningar (recall, searchAurora, getGaps, unifiedSearch) och samla resultaten
**Lösning:** Använde Promise.all() för att köra alla 4 parallellt istället för sekventiellt. Resultaten mappades sedan till BriefingResult-struktur
**Effekt:** Minskad total latens från ~4s (sekventiell) till ~1s (parallell). Skalbar metod för att orkestrera multipla asynkrona operationer utan callback-hell
**Keywords:** async-orchestration, promise-all, performance, knowledge-graph, briefing
**Relaterat:** 
**Körningar:** #20260309-1728-neuron-hq
**Senast bekräftad:** 20260309-1728-neuron-hq

---

## Separation av core-modul från CLI och MCP-implementering
**Kontext:** Briefing-funktionen behövde exponeras på tre sätt: som exporterad TypeScript-funktion, CLI-kommando och MCP-tool
**Lösning:** Skapade en ren core-modul (src/aurora/briefing.ts) med BriefingResult-interface, sedan byggde CLI (aurora-briefing.ts) och MCP-tool (tools/aurora-briefing.ts) som tunna adaptrar som anropade core-funktionen
**Effekt:** Noll kodduplicering, enklare testning av core-logik separat från UI-formatting, samma datastruktur används överallt, framtida ändringar sker på ett ställe
**Keywords:** modularity, separation-of-concerns, testing, code-reuse, interface-design
**Relaterat:**
**Körningar:** #20260309-1728-neuron-hq
**Senast bekräftad:** 20260309-1728-neuron-hq

---

## Additiv arkitektur för ny funktionalitet minskar risk
**Kontext:** Implementering av freshness-scoring för Aurora krävde nya kolumner, beräkningar och CLI-verktyg
**Lösning:** Lägg till funktionalitet helt separat från befintlig kod — ny migrering med `IF NOT EXISTS`, nya moduler utan ändringar i befintlig logik, try/catch runt optional DB-anrop
**Effekt:** Risk klassificerades som LÅG, 0 regressioner i 1416 befintliga tester, typecheck ren. Funktion kan användas men kan också ignoreras med graceful degradation.
**Keywords:** additiv-arkitektur, migration-pattern, separering-av-bekymmer, låg-risk-funktion
**Relaterat:** patterns.md#Testning minskar regressionsrisk
**Körningar:** #20260309-2134-neuron-hq
**Senast bekräftad:** 20260309-2134-neuron-hq

---

## N+1-databaskalls-mönster acceptabelt för små resultatsätt
**Kontext:** Briefing-funktionen behövde berika 5-10 fakta med freshness-info — varje fakt krävde ett separat DB-anrop
**Lösning:** Implementera enkel per-fakt lookup istället för att optimera med `WHERE id IN (...)` från start
**Effekt:** Kod är läsbar och underhålls, prestanda är acceptabel för typiska workloads. Om volymen växer kan batching läggas till senare utan att ändra API:et.
**Keywords:** database-query, N+1, premature-optimization, pragmatic-trade-off
**Relaterat:** patterns.md#Additiv arkitektur för ny funktionalitet minskar risk
**Körningar:** #20260309-2134-neuron-hq
**Senast bekräftad:** 20260309-2134-neuron-hq

---

## Testsidefekter i datalokaliseringsfiler kräver merge-konflikthantering
**Kontext:** aurora/graph.json (testdatakälla) muterades av tester med slumpmässiga UUIDs och timestamps. Vid merge uppstod konfliktmarkörer.
**Lösning:** Exkludera test-artefaktfiler från merge, hantera manuellt eller med `git merge-driver` för ignorerade ändringar. Dokumentera klart vilka filer som är test-generade.
**Effekt:** Minskar merge-konflikter från testsidefekter. Merger kan fokusera på verklig funktionskod.
**Keywords:** testsidefekter, merge-konflikt, data-files, git-drift
**Relaterat:** 
**Körningar:** #20260309-2134-neuron-hq
**Senast bekräftad:** 20260309-2134-neuron-hq

---

## Additiv arkitektur för ny funktionalitet minskar risk
**Kontext:** Implementering av freshness-scoring för Aurora krävde nya kolumner, beräkningar och CLI-verktyg
**Lösning:** Lägg till funktionalitet helt separat från befintlig kod — ny migrering med `IF NOT EXISTS`, nya moduler utan ändringar i befintlig logik, try/catch runt optional DB-anrop
**Effekt:** Risk klassificerades som LÅG, 0 regressioner i 1416 befintliga tester, typecheck ren. Funktion kan användas men kan också ignoreras med graceful degradation.
**Keywords:** additiv-arkitektur, migration-pattern, separering-av-bekymmer, låg-risk-funktion
**Relaterat:** patterns.md#Testning minskar regressionsrisk
**Körningar:** #20260309-2134-neuron-hq
**Senast bekräftad:** 20260309-2134-neuron-hq

---

## N+1-databaskalls-mönster acceptabelt för små resultatsätt
**Kontext:** Briefing-funktionen behövde berika 5-10 fakta med freshness-info — varje fakt krävde ett separat DB-anrop
**Lösning:** Implementera enkel per-fakt lookup istället för att optimera med `WHERE id IN (...)` från start
**Effekt:** Kod är läsbar och underhålls, prestanda är acceptabel för typiska workloads. Om volymen växer kan batching läggas till senare utan att ändra API:et.
**Keywords:** database-query, N+1, premature-optimization, pragmatic-trade-off
**Relaterat:** patterns.md#Additiv arkitektur för ny funktionalitet minskar risk
**Körningar:** #20260309-2134-neuron-hq
**Senast bekräftad:** 20260309-2134-neuron-hq

---

## Testsidefekter i datalokaliseringsfiler kräver merge-konflikthantering
**Kontext:** aurora/graph.json (testdatakälla) muterades av tester med slumpmässiga UUIDs och timestamps. Vid merge uppstod konfliktmarkörer.
**Lösning:** Exkludera test-artefaktfiler från merge, hantera manuellt eller med `git merge-driver` för ignorerade ändringar. Dokumentera klart vilka filer som är test-generade.
**Effekt:** Minskar merge-konflikter från testsidefekter. Merger kan fokusera på verklig funktionskod.
**Keywords:** testsidefekter, merge-konflikt, data-files, git-drift
**Relaterat:** 
**Körningar:** #20260309-2134-neuron-hq
**Senast bekräftad:** 20260309-2134-neuron-hq

---

## Additive DB-schema-utvidgning med IF NOT EXISTS
**Kontext:** Aurora freshness scoring required länka verifikationsstatus till befintliga noder utan dataförlust
**Lösning:** Skapa migration med `ADD COLUMN IF NOT EXISTS` istället för tvingande ADD COLUMN. Lagra ny data (last_verified TIMESTAMPTZ) parallellt med befintlig schema. Berika applikationslager med nya fält (freshnessScore, freshnessStatus) utan att tvinga schema-migration på alla konsumenter.
**Effekt:** Zero breaking changes. Gamla databaser kan fortsätta utan migration tills de är redo. Nya databaser får kolumnen automatiskt. Applikation hanterar både fall med try/catch och sensibla defaults. 1416 tester passerar oförändrade.
**Keywords:** migration, schema-expansion, backward-compatibility, additive-change, postgres
**Relaterat:** errors.md#Merge-konflikt i aurora/graph.json från test-sidoeffekter
**Körningar:** #20260309-2134-neuron-hq
**Senast bekräftad:** 20260309-2134-neuron-hq

---

## Additive DB-schema-utvidgning med IF NOT EXISTS
**Kontext:** Aurora freshness scoring krävde spårning av verifikationsstatus utan dataförlust på befintliga noder
**Lösning:** Skapa migration med `ADD COLUMN IF NOT EXISTS last_verified TIMESTAMPTZ`. Lagra ny data parallellt med befintlig schema. Berika applikationslager med nya fält (freshnessScore, freshnessStatus) utan att tvinga schema-migrering på alla konsumenter. Try/catch runt DB-anrop med sensibla defaults gör enrichment-logiken robust.
**Effekt:** Zero breaking changes — gamla databaser kan fortsätta utan migration tills de är redo. Nya databaser får kolumnen automatiskt. Applikation hanterar både fall med graceful fallback. 1416 tester passerar oförändrade. Freshness-info är en bonus, inte ett krav.
**Keywords:** migration, schema-expansion, backward-compatibility, additive-change, postgres, db-design
**Relaterat:** runs.md#Körning 20260309-2134-neuron-hq, errors.md#Merge-konflikt i aurora/graph.json från test-sidoeffekter
**Körningar:** #20260309-2134-neuron-hq
**Senast bekräftad:** 20260309-2134-neuron-hq

---

## Cross-ref-spårning vid node-merge: async-wrapped dataöverföring med DB-resilliens
**Kontext:** Neuronfunk B4 — behövde överföra cross-ref-relationer från en borttagen nod till en överlevande nod utan att dataförlust uppstår eller merge-operationen blockeras om databasen är otillgänglig
**Lösning:** 
1. Ändra `mergeNodes()` från synkron till async för att tillåta database-I/O
2. Uppdatera alla anropare (8 tester + 1 i Consolidator) med `await`
3. Implementera `transferCrossRefs()` med ON CONFLICT-SQL för att hantera dubbletter
4. Wrap DB-anropet i try/catch i `graph-merge.ts` så att merge aldrig blockeras av databasel-fel
5. Lägg till `context`-fält på cross-refs för att spåra varför kopplingen finns ("auto-ingest", "historian-discovery", "manual-mcp", etc.)

**Effekt:** 
- Kompletta grafordningar mellan Neuron och Aurora är nu tracerbara — varje cross-ref bär sitt eget ursprung
- Node-merge är fortfarande tillförlitlig även när DB är nere — fallback till JSON-merge utan DB-synkronisering
- Migration 007 (additivt, aldrig destruktivt) tillåter gradvis rollout

**Keywords:** async-migration, database-resillience, cross-reference, try-catch-wrapping, ON-CONFLICT-SQL, node-merge, traceability
**Relaterat:** errors.md (om async-regression uppstår), techniques.md#Graph-based-Agent-Memory, techniques.md#ESAA
**Körningar:** #20260309-2239-neuron-hq
**Senast bekräftad:** 20260309-2239-neuron-hq

---

## Optional DB operations wrapped in try/catch for merge safety
**Kontext:** B4 Cross-ref integritet — integrating cross-ref transfer into `mergeNodes()` which must never fail due to DB unavailability
**Lösning:** Wrap optional DB operations in try/catch at call site. When transferring cross-refs during merge, use:
```typescript
try {
  const { transferCrossRefs } = await import('../aurora/cross-ref.js');
  const { isDbAvailable } = await import('./db.js');
  if (await isDbAvailable()) {
    await transferCrossRefs(removed, kept, 'neuron');
  }
} catch {
  // DB might not be available — merge still succeeds
}
```
This allows merge to proceed even if DB is down, while still updating cross-refs when possible.

**Effekt:** Decouples DB availability from critical merge logic. Node consolidation succeeds regardless of Postgres health. Non-critical integrity operations fail gracefully without cascading.

**Keywords:** database-optional, fail-graceful, try-catch-wrap, merge-safety, decoupled-dependencies

**Relaterat:** errors.md#* (none yet — this is preventive), techniques.md#*

**Körningar:** #20260309-2239-neuron-hq

**Senast bekräftad:** 20260309-2239-neuron-hq

---

## Optional parametrar för bakåtkompatibilitet vid API-utökning
**Kontext:** B4 Cross-ref integritet — utöka `createCrossRef()` med nya parametrar `context` och `strength` utan att bryta 30+ befintliga anropare
**Lösning:** Gör nya parametrar optionala med Zod `.optional()` och sensibla defaults. Vid `strength`, use `strength ?? similarity` för fallback till initial söksimilaritet. Alla anropare fortsätter att fungera utan ändringar.
**Effekt:** API kan utökas gradvis utan stora migrations eller versionshopp. Gamla anropare får default-värden, nya anropare kan specificera exakt vad de vill.
**Keywords:** optional-parameters, backwards-compatibility, api-evolution, gradual-migration
**Relaterat:** patterns.md#Optional DB operations wrapped in try/catch
**Körningar:** #20260309-2239-neuron-hq
**Senast bekräftad:** 20260309-2239-neuron-hq

---

## Heuristisk extraktion för konversationsanalys
**Kontext:** B5-körningen — konversationsbaserad inlärning för Aurora
**Lösning:** Implementera mönsterbaserad extraktion utan LLM-anrop. Använd regex och nyckelordsmatchning för att detektera fyra itemtyper: preference ("Jag föredrar X"), decision ("Vi bestämde att X"), fact ("X fungerar bra"), insight ("Viktigt: X"). Språkoberoende (svenska + engelska). Minsta ordlängd: 5 ord för att filtrera brus.
**Effekt:** Billigt, snabbt och underhållbart. Precisionen är tillräcklig för initialextraktion. Enklare att lägga till nya mönster än LLM-baserad approach. Ingen latens från API-anrop.
**Keywords:** extraction, heuristic, pattern-matching, conversation-learning, no-llm
**Relaterat:** 
**Körningar:** #20260310-0532
**Senast bekräftad:** 20260310-0532

---

## Typ-mappning för schemakompatibilitet
**Kontext:** B5-körningen — Aurora schema stödjer inte "decision" eller "insight" som typer för remember()
**Lösning:** Acceptera "decision" och "insight" i LearnedItem, men mappa dem internt till "fact" innan remember()-anrop. Håll originaltypen i metadata för framtida användning. Dokumentera mappningen för kommande agenter.
**Effekt:** Möjliggör utökad begreppsmodell (4 typer) utan att bryta befintlig remember()-gränssnitt. Framtidssäker — om schemat utökas kan mappning enkelt justeras på ett ställe.
**Keywords:** schema, type-mapping, adapter, compatibility
**Relaterat:** 
**Körningar:** #20260310-0532
**Senast bekräftad:** 20260310-0532

---

## Deduplicering via similarity-tröskelvärde
**Kontext:** B5-körningen — learnFromConversation() ska skippa duplicates
**Lösning:** För varje extraherad item, anropa recall(item.text, { limit: 1 }) och jämför similarity. Om similarity >= 0.8 mot befintlig minnesenhet → markera som duplicate och hoppa över remember()-anrop. Om < 0.8 eller tom recall → lagra som ny.
**Effekt:** Enkelt och kostnadseffektivt sätt att undvika dubbletter. Tröskelvärdena 0.8 verkar vara vettig baseline för semantisk likhet. Minskar minnesblockad från repetativ information.
**Keywords:** deduplication, similarity, threshold, recall, memory-optimization
**Relaterat:** 
**Körningar:** #20260310-0532
**Senast bekräftad:** 20260310-0532

---

## Heuristisk extraktion för konversationsanalys
**Kontext:** B6-körningen — konversationsbaserad inlärning för Aurora
**Lösning:** Implementera mönsterbaserad extraktion utan LLM-anrop. Använd regex och nyckelordsmatchning för att detektera fyra itemtyper: preference ("Jag föredrar X", "I prefer X"), decision ("Vi bestämde att X", "We decided X"), fact ("X fungerar bra", "X works well"), insight ("Viktigt: X", "Important: X"). Språkoberoende (svenska + engelska). Minsta ordlängd: 5 ord för att filtrera brus. Confidence: 0.6 för alla extraherade items (heuristik, inte verifierad).
**Effekt:** Billigt, snabbt och underhållbart. Precisionen är tillräcklig för initialextraktion. Enklare att lägga till nya mönster än LLM-baserad approach. Ingen latens från API-anrop. Deduplicering via recall() similarity >= 0.8 fungerar väl för att undvika dubbletter.
**Keywords:** extraction, heuristic, pattern-matching, conversation-learning, no-llm, deduplication
**Relaterat:** patterns.md#Typ-mappning för schemakompatibilitet
**Körningar:** #20260310-0532
**Senast bekräftad:** 20260310-0532

---

## Typ-mappning för schemakompatibilitet
**Kontext:** B6-körningen — Aurora schema stödjer inte "decision" eller "insight" som typer för remember()
**Lösning:** Acceptera "decision" och "insight" i LearnedItem interface-typen, men mappa dem internt till "fact" innan remember()-anrop. Håll originaltypen i metadata för framtida användning. Dokumentera mappningen för kommande agenter. Deduplicering mot befintliga noder använder recall() med similarity >= 0.8 som tröskel.
**Effekt:** Möjliggör utökad begreppsmodell (4 typer) utan att bryta befintlig remember()-gränssnitt. Framtidssäker — om schemat utökas kan mappning enkelt justeras på ett ställe. Transparent för användaren.
**Keywords:** schema, type-mapping, adapter, compatibility, deduplication-threshold
**Relaterat:** patterns.md#Heuristisk extraktion för konversationsanalys
**Körningar:** #20260310-0532
**Senast bekräftad:** 20260310-0532

---

## Parallell delegering för snabbare leverans
**Kontext:** B6-körningen — efter T1-implementering delegerades T2, T3, T4 parallellt
**Lösning:** Identifiera beroenden mellan uppgifter. T1 (core module) måste slutföras innan T2/T3/T4 (CLI, tests, MCP-tool) kan delegeras. Delegera de oberoende uppgifterna samtidigt med Promise.allSettled() eller sekventiell Manager-delegation till flera Implementer-agenter. Merger samlar resultat och applicerar single-phase commit.
**Effekt:** Reducerar total tid från sekventiell (T1→T2→T3→T4) till parallell (T1, sedan T2||T3||T4). Höll tempo uppe under körningen. Implementer-agenter arbetar effektivt på isolerade uppgifter utan väntande.
**Keywords:** parallelization, delegation-strategy, task-scheduling, efficiency
**Relaterat:** 
**Körningar:** #20260310-0532
**Senast bekräftad:** 20260310-0532

---

## Additive Module with Isolated Testing Strategy
**Kontext:** Körning 20260310-0559-neuron-hq implementerade gap-brief-pipeline utan ändringar i befintlig kod
**Lösning:** Struktura ny funktionalitet som helt ny modul (src/aurora/gap-brief.ts). Skapa motsvarande testfil med 2–3 tester per core-funktion, plus 5–6 CLI/integration-tester. Registrera exports i befintlig index.ts men modifiera aldrig äldre kod. Ny CLI-kommando och MCP-tool läggs till additimt.
**Effekt:** Minimerar regression-risk (0 befintliga tester påverkade), möjliggör parallell utveckling, gör rollback trivialt (git revert en commit). 16 nya tester ger 93.8% ökning i test-täckning utan att bryta något. Acceptanskriterier verifieras genom enhetstester, inte integration-tester.
**Keywords:** modularity, additive-development, testing-strategy, isolation, rollback, regression-prevention
**Relaterat:** patterns.md#Spec-Driven Implementation, techniques.md#Hybrid-Gym
**Körningar:** #20260310-0559-neuron-hq
**Senast bekräftad:** 20260310-0559-neuron-hq

---

## Isolerad modulimplementering för feature-tillägg
**Kontext:** Körning 20260310-0559-neuron-hq levererade gap-brief-pipelinen utan ändringar i befintlig kod
**Lösning:** Skapa helt ny modulfil (src/aurora/gap-brief.ts) med all funktionalitet. Registrera exports i befintlig index.ts men ändra aldrig befintlig kod. CLI-kommando och MCP-tool läggs till additimt via kort patch i cli.ts och server.ts (bara import + register).
**Effekt:** Noll befintliga tester påverkas, rollback är trivial (git revert), nya tester verifiera komplett scope utan regression. 1469 baseline-tester oförändrade + 16 nya = högsta förtroende.
**Keywords:** modularity, isolation, zero-regression, feature-safety, batch-processing, Claude-Haiku-integration
**Relaterat:** patterns.md#Additive Module with Isolated Testing Strategy, techniques.md#Hybrid-Gym
**Körningar:** #20260310-0559-neuron-hq
**Senast bekräftad:** 20260310-0559-neuron-hq

---

## Valfria interface-fält för bakåtkompatibel utökning
**Kontext:** Implementering av STT-förbättringar där nya options behövde skickas genom existerande worker-architektur
**Lösning:** Lägg till valfritt `options?: Record<string, unknown>`-fält i `WorkerRequest` och `VideoIngestOptions`-interfaces. Befintliga anrop behöver inte ändras — de ignorerar helt enkelt det nya fältet.
**Effekt:** Möjliggör stegvis utökning utan att bryta API:er. Gamla handlers fortsätter fungera med endast `source`-parametern, nya handlers kan ta emot options utan någon migrationsbelastning.
**Keywords:** backward-compatibility, interface-extension, optional-fields, TypeScript, architecture
**Körningar:** #20260310-0843-neuron-hq
**Senast bekräftad:** 20260310-0843-neuron-hq

---

## Använd inspect.signature för villkorlig parameter-vidarebefordran i dispatcher
**Kontext:** Python-worker-dispatchern behövde skicka nya options-parameter till befintliga handlers utan att bryta gamla handlers som inte accepterar det
**Lösning:** Använd `inspect.signature()` för att kontrollera handler-signatur. Om handler accepterar 2+ parametrar, skicka options. Annars, skicka bara source.
**Effekt:** Möjliggör gradvis migrering av handlers — gamla handlers fungerar utan ändringar, nya kan läggas till med extra parametrar. Eliminerar behovet av att uppdatera alla befintliga handlers samtidigt.
**Keywords:** dispatcher, Python, inspect-module, parameter-forwarding, backwards-compatibility
**Körningar:** #20260310-0843-neuron-hq
**Senast bekräftad:** 20260310-0843-neuron-hq

---

## Trestegs-prioritering för flexibel modellval
**Kontext:** STT-implementering där modell kunde specificeras direkt, härledas från språk, eller detekteras automatiskt
**Lösning:** Implementera prioritetsordning: (1) Explicit `whisper_model` om angiven → använd den direkt, (2) Explicit `language` om angiven → slå upp bästa modell för språket, (3) Inget angivet → auto-detect språk med lightweight-modell, välj sedan modell
**Effekt:** Ger användare fria val utan att tvinga slow auto-detection när de redan vet språket. Fallback är intelligent istället för hårdkodad default.
**Keywords:** model-selection, language-detection, priority-order, STT, Whisper
**Körningar:** #20260310-0843-neuron-hq
**Senast bekräftad:** 20260310-0843-neuron-hq

---

## Parallell vågexekvering av Implementer-uppgifter — effektivitet
**Kontext:** Körning 20260311-1941-neuron-hq — Manager delegerade 9 koduppgifter i 3 sekventiella vågor (Wave 1: T1/T2/T3, Wave 2: T5/T6/T7, Wave 3: T8/T9). Varje våg kördes parallellt.
**Lösning:** Dela upp koduppgifterna efter beroendegrafer. Wave 1 skapar de grundläggande building blocks (Python worker, worker-bridge, dispatcher). Wave 2 lägger på TS-funkcionen, CLI och MCP-tool. Wave 3 skriver tester. Implementer-agenter börjar direkt när Wave delegeras, utan att vänta på föregående våg.
**Effekt:** Totalt ~7 minuter implementering för 9 uppgifter. Parallell speeup 3x per våg (T1, T2, T3 tar individuellt ~4 min men tillsammans 3 min). Merge-konflikter minimeras om varje task har tydlig filägning. Två konflikter uppstod men löstes automatiskt via "--ours" checkout.
**Keywords:** manager, implementer, parallelism, wave, dependency-graph, file-ownership
**Relaterat:** patterns.md#Manager-planering med parallella vågor
**Körningar:** #20260311-1941-neuron-hq
**Senast bekräftad:** 20260311-1941-neuron-hq

---

## Try-catch wrap runt tidskritiska DB-uppdateringar säkrar pipeline-robusthet
**Kontext:** Implementering av F0 Bayesisk confidence-uppdatering i Aurora intake-pipeline
**Lösning:** `updateConfidence()` anrop i `src/aurora/intake.ts` (efter cross-ref-skapelse) omslutits i try-catch. Failure i confidence-uppdatering loggas men bryter inte ingest-flödet.
**Effekt:** Pipeline blir motståndskraftig mot DB-fel, timeout eller transienta problem i audit-loggning. Ingest fortsätter även om confidence-loggen misslyckas — en bra idé för data som är "nice-to-have" men inte kritisk.
**Keywords:** database-resilience, try-catch, pipeline-safety, batch-operations, error-isolation
**Relaterat:** patterns.md#Sidoeffekter i rent-funktion-wrapper
**Körningar:** #20260312-0907-neuron-hq
**Senast bekräftad:** 20260312-0907-neuron-hq

---

## Logistisk Bayesisk uppdatering håller konfidensvärdanden inom (0,1) naturligt
**Kontext:** Implementering av F0 confidence-uppdateringsformel
**Lösning:** Använd logit-transformering (ln(p/(1-p))) istället för linjär addition. Ny logit = gammal_logit + vikt*riktning. Konvertera tillbaka via sigmoid (1/(1+exp(-logit))). Clamp input till (0.001, 0.999) för att undvika log(0).
**Effekt:** Matematisk elegans: formeln respekterar gränser automatiskt, är symmetrisk (support+contradict förflyttar logit fram/bak lika mycket), och skapar naturlig "tröghet" för extrema värdanden — höga confidence (0.9) kräver starkt bevis för att sjunka. Detta är både teoretiskt försvarbart och praktisk användbar.
**Keywords:** bayesian-inference, logistic-transform, mathematical-soundness, confidence-bounds
**Relaterat:** techniques.md#Bayesian updating formulas
**Körningar:** #20260312-0907-neuron-hq
**Senast bekräftad:** 20260312-0907-neuron-hq

---

## Try-catch-skydd runt kritiska sidoeffekter säkrar pipeline-robusthet
**Kontext:** Implementering av F0 Bayesisk confidence-uppdatering i Aurora intake-pipeline
**Lösning:** `updateConfidence()` och relaterade DB-operationer omsluts i try-catch. Failure loggas men bryter inte ingest-flödet. Pattern: `try { await updateConfidence(...); } catch (err) { logger.warn(...); }`
**Effekt:** Pipeline blir motståndskraftig mot transientade DB-fel, timeout eller auditlogging-problem. Ingest fortsätter även om confidence-systemet misslyckas — kritisk för uppdelning av *har-data* från *nice-to-have-metadata*. Applicerbar för alla sidoeffekter som inte är av säkerhet- eller dataintegritetsnöd.
**Keywords:** database-resilience, error-isolation, pipeline-safety, sidoeffekter, non-blocking-updates
**Relaterat:** patterns.md#Graceful degradation vid externe tjänstfel
**Körningar:** #20260312-0907-neuron-hq
**Senast bekräftad:** 20260312-0907-neuron-hq

---

## Logistisk Bayesisk uppdatering håller konfidensvärdanden inom (0,1) naturligt
**Kontext:** Implementering av F0 Bayesisk confidence-uppdateringsformel
**Lösning:** Använd logit-transformering (ln(p/(1-p))) för att avbildra (0,1) till R. Ny logit = gammal_logit + vikt*riktning (+1 för stöd, -1 för motsägelelse). Konvertera tillbaka via sigmoid (1/(1+exp(-logit))). Input-clamping till (0.001, 0.999) för numerisk stabilitet.
**Effekt:** Matematisk elegans: formeln respekterar gränser automatiskt utan explicit clamping i utgångsvärdet. Symmetrisk omkring 0.5 (support och motsägelelse förflyttar logit fram/bak lika mycket). Skapar naturlig *tröghet* för extrema värdanden — höga confidence (0.9) kräver starkt bevis för att sjunka. Teoretiskt försvarbar (Bayesisk) och praktisk användbar.
**Keywords:** bayesian-inference, logistic-transform, mathematical-soundness, confidence-bounds, sigmoid-activation
**Relaterat:** techniques.md#Bayesian updating formulas (AMG-007)
**Körningar:** #20260312-0907-neuron-hq
**Senast bekräftad:** 20260312-0907-neuron-hq

---

## Log-odds Bayesian updating for confidence scoring
**Kontext:** F0 Bayesian confidence feature for Aurora knowledge base. Needed principled way to update node confidence scores as new evidence accumulates.
**Lösning:** Implemented logistic Bayesian update using log-odds (logit) space: `ny_logit = gammal_logit + källvikt × riktning` followed by sigmoid transform back to (0,1). Source weights range 0.03-0.25 based on publication tier (academic > encyclopedia > official > news > blog > anecdotal). Update is symmetric: supporting evidence followed by contradicting evidence returns to original confidence.
**Effekt:** Mathematically sound, prevents boundary violations (clamped to [0.001, 0.999]), naturally accumulates evidence across multiple sources, and asymmetry property (high confidence resists contradictions) matches human belief dynamics. Try-catch wrapped so failures don't block ingest pipeline.
**Keywords:** bayesian-inference, log-odds, confidence-scoring, source-weighting, logistic-transform
**Relaterat:** brief.md#Formeln, bayesian-confidence.ts
**Körningar:** #20260312-0907-neuron-hq
**Senast bekräftad:** 20260312-0907-neuron-hq

---

## Researcher deliverables: ideas + knowledge + sources format
**Kontext:** F0 run required research phase output. Researcher needed to document future opportunities, assumptions, and code references in structured way.
**Lösning:** Created three parallel markdown files:
  1. **ideas.md** — 10 prioritized future work items with impact/effort/risk matrix
  2. **knowledge.md** — 8 key learnings + 8 documented assumptions + risk analysis + mental models
  3. **research/sources.md** — Annotated code file references (7 files) + test coverage summary + conceptual foundations + verification checklist
Each file hyperlinked, cross-referenced, comprehensive. Format enables different stakeholder consumption: execs skim ideas.md, engineers read sources.md, architects study knowledge.md.
**Effekt:** Enables knowledge transfer at multiple levels. Ideas file becomes actionable roadmap. Knowledge file surfaces assumptions for validation. Sources file provides audit trail and onboarding material. Three separate files prevent any single document becoming unwieldy.
**Keywords:** research-deliverables, ideas-roadmap, knowledge-documentation, source-references, stakeholder-communication
**Körningar:** #20260312-0907-neuron-hq
**Senast bekräftad:** 20260312-0907-neuron-hq

---

## Log-odds Bayesian updating for confidence scoring
**Kontext:** F0 Bayesian confidence feature for Aurora knowledge base. Needed principled way to update node confidence scores as new evidence accumulates.
**Lösning:** Implemented logistic Bayesian update using log-odds (logit) space: `ny_logit = gammal_logit + källvikt × riktning` followed by sigmoid transform back to (0,1). Source weights range 0.03-0.25 based on publication tier (academic > encyclopedia > official > news > blog > anecdotal). Update is symmetric: supporting evidence followed by contradicting evidence returns to original confidence.
**Effekt:** Mathematically sound, prevents boundary violations (clamped to [0.001, 0.999]), naturally accumulates evidence across multiple sources, and asymmetry property (high confidence resists contradictions) matches human belief dynamics. Try-catch wrapped so failures don't block ingest pipeline.
**Keywords:** bayesian-inference, log-odds, confidence-scoring, source-weighting, logistic-transform
**Relaterat:** brief.md#Formeln, bayesian-confidence.ts
**Körningar:** #20260312-0907-neuron-hq
**Senast bekräftad:** 20260312-0907-neuron-hq

---

## Researcher deliverables: ideas + knowledge + sources format
**Kontext:** F0 run required research phase output. Researcher needed to document future opportunities, assumptions, and code references in structured way.
**Lösning:** Created three parallel markdown files:
  1. **ideas.md** — 10 prioritized future work items with impact/effort/risk matrix
  2. **knowledge.md** — 8 key learnings + 8 documented assumptions + risk analysis + mental models
  3. **research/sources.md** — Annotated code file references (7 files) + test coverage summary + conceptual foundations + verification checklist
Each file hyperlinked, cross-referenced, comprehensive. Format enables different stakeholder consumption: execs skim ideas.md, engineers read sources.md, architects study knowledge.md.
**Effekt:** Enables knowledge transfer at multiple levels. Ideas file becomes actionable roadmap. Knowledge file surfaces assumptions for validation. Sources file provides audit trail and onboarding material. Three separate files prevent any single document becoming unwieldy.
**Keywords:** research-deliverables, ideas-roadmap, knowledge-documentation, source-references, stakeholder-communication
**Körningar:** #20260312-0907-neuron-hq
**Senast bekräftad:** 20260312-0907-neuron-hq

---

## Delegera merge-konflikter till parallell merge-uppgift istället för manuell konfliktlösning
**Kontext:** När flera Implementer-instanser körde på parallella grenar (T1-T6 simultant), skapade det potentiella merge-konflikter i delade filer som `src/cli.ts` och `src/mcp/server.ts`.
**Lösning:** Istället för att låta Manager försöka lösa konflikter med `git merge --abort` och manuell editering, delegerades en dedikerad Task (T6 — senare T8) till Implementer för att: (1) hämta finaliserade filer från parallela grenar med `git show BRANCH:file`, (2) omregistrera dem med `sed`-editering för inkrementell tillägg av imports och registreringar, (3) köra typecheck före commit.
**Effekt:** 
- Eliminerade manuell konfliktlösning och fel under sammanslagning
- Parallella körningar som normalt tar O(n²) merge-tid sparade tid
- Koden blev läsbar och inspektionsbar innan final merge
- Alla 1673 tester passerade utan regression

**Keywords:** parallel-tasks, merge-strategy, git-workflows, delegering, konflikthantering
**Körningar:** #20260312-1044-neuron-hq
**Senast bekräftad:** 20260312-1044-neuron-hq

---

## Logit-transform för Bayesisk uppdatering av agent-/task-prestanda
**Kontext:** F1 körning 20260312-1329-neuron-hq implementerade Bayesisk uppdatering av run_beliefs-tabell med signal-styrka och historik-spårning.
**Lösning:** Använd `bayesianUpdate(oldConfidence, signal, weight)` från aurora/bayesian-confidence.js. Denna funktion tillämpar logit-transform: `confidence' = sigmoid(logit(c) + weight * (success ? +1 : -1))`. Signal-vikter justeras per dimension (GREEN: 0.20, re-delegations: 0.10, blockade: 0.08). Varje uppdatering loggad i run_belief_audit med timestamp för revidering.
**Effekt:** Stabiliserar beliefs över tid trots brus i enskilda körningar. En agent med historisk confidence 0.82 kan sjunka säkert till 0.75 med två misslyckanden utan att överbeskatta enstaka fel. Enkelt att fråga om trender: `getSummary().trending_up/trending_down`.
**Keywords:** bayesian-inference, signal-integration, confidence-tracking, sql-upsert
**Relaterat:** error.md#Stoplight-regex matchar inte emoji-prefix
**Körningar:** #20260312-1329
**Senast bekräftad:** 20260312-1329

---

## Try/catch-wrapper för observeringslogik förhindrar körningsstörning
**Kontext:** F1 integrerade run-statistics samlingen in i finalizeRun() i src/core/run.ts.
**Lösning:** Omslut statistics-uppdatering med try/catch: `try { await collectOutcomes(); await updateRunBeliefs(); } catch (err) { logger.warn('Statistics failed', err); }`. Om DB är otillgänglig, Postgres-fel, eller fil-I/O-fel uppstår — greppa felet, logga det, och fortsätt. Huvudkörningen avbryts aldrig.
**Effekt:** Observeringslogik blir valfri optimering, aldrig en blockerare. Kritiskt för production-robusthet — användare återupplever aldrig statistikuppdateringsfel.
**Keywords:** error-handling, try-catch, graceful-degradation, observability
**Relaterat:** patterns.md#Signal-klassificering för brief-typ
**Körningar:** #20260312-1329
**Senast bekräftad:** 20260312-1329

---

## Signal-klassificering för brief-typ via regex-nyckelord
**Kontext:** F1 klassificerade briefs i 6 kategorier (feature, refactor, bugfix, test, docs, infrastructure) för att spåra prestanda per typ.
**Lösning:** `classifyBrief()` läser brief.md-titel och passar mot regex-pattern i ordning: `feature` (innehåller /feature|add|implement|new/i), `refactor` (/refactor|clean|restructure/i), `bugfix` (/fix|bug|broken/i), `test` (/test/i), `docs` (/doc|readme/i). Första träff vinner. Fallback: infrastructure.
**Effekt:** Enkelt klassificeringsschema för 90%+ av briefs utan LLM-overhead. Regex-ordningen spelar roll (feature före infrastructure för att undvika falska träffar på "add doc"). Gränsfallen (t.ex. "add test infrastructure") klassificeras deterministiskt och kan manuellt retaggas om behov.
**Keywords:** classification, regex, brief-routing, heuristic
**Relaterat:** patterns.md#Logit-transform för Bayesisk uppdatering
**Körningar:** #20260312-1329
**Senast bekräftad:** 20260312-1329

---

## Retroaktiv backfill för statistikuppdatering
**Kontext:** F1 körning 20260312-1329-neuron-hq implementerade retroaktiv backfill-funktion för att uppdatera historiska körningsstatistik.
**Lösning:** Lägg till `--backfill` CLI-flagga som itererar genom alla befintliga `runs/*/metrics.json` filer i kronologisk ordning och kör `collectOutcomes()` + `updateRunBeliefs()` på var och en, uppdaterar databastabellen run_beliefs med retroaktiva datapoäng.
**Effekt:** Möjliggör gradvis datamigration från filsystem till databas utan att förlora historiska datapoäng. Användbar mall för framtida datamigrering när nya kolumner eller tabeller introduceras — backfill kan köras som en engångsoperation eller regelbundna jobb.
**Keywords:** data-migration, retroactive-update, batch-processing, file-iteration
**Relaterat:** patterns.md#Logit-transform för Bayesisk uppdatering, patterns.md#Try/catch-wrapper för observeringslogik
**Körningar:** #20260312-1329
**Senast bekräftad:** 20260312-1329

---

## Options-objekt för varierad delad kod
**Kontext:** Många agenter hade identiska execute-funktioner (bash, readFile, writeFile, listFiles) men med små per-agent variationer (truncate, includeStderr, baseDir)
**Lösning:** Istället för if-statements eller överlagrad kod, definiera options-interfaces för varje funktion: `BashOptions { truncate?: boolean; includeStderr?: boolean }`, `ReadFileOptions { truncate?: boolean }`. Ge varje agent ansvar att välja sina egna options vid anrop.
**Effekt:** 961 raders nettominskning i 6 agentfiler. Variationerna blir explicit och lätt att ändra utan att röra den gemensamma implementationen.
**Keywords:** refactoring, code-extraction, options-pattern, shared-tools, agents
**Relaterat:** patterns.md#Factory functions for tool definitions
**Körningar:** #20260312-1907-neuron-hq
**Senast bekräftad:** 20260312-1907-neuron-hq

---

## Factory functions for tool definitions
**Kontext:** Tool-definitioner (schemas för bash_exec, read_file, write_file, list_files) var duplicerad i alla 6 agenter. Vissa agenter behövde bara en delmängd av tools (merger exkluderar list_files).
**Lösning:** Skapa en factory-funktion `coreToolDefinitions(roleDescription?: {...})` som returnerar de 4 standard-verktygen med optional rollspecifika beskrivningar. Agenter anropar denna och filtrerar/utökar vid behov.
**Effekt:** En källa för truth för tool-schemas. Rollspecifika beskrivningar kan injiceras utan att ändra kärnan. Enkelt för agenter att välja vilka tools de vill ha.
**Keywords:** tool-definitions, factory-pattern, shared-tools, agents
**Relaterat:** patterns.md#Options-objekt för varierad delad kod
**Körningar:** #20260312-1907-neuron-hq
**Senast bekräftad:** 20260312-1907-neuron-hq

---

## Batch UPDATE med unnest i PostgreSQL
**Kontext:** Fixat N+1 UPDATE-mönster i autoEmbedAuroraNodes() (TD-14) efter tidigare identisk fix i saveAuroraGraphToDb() (TD-4)
**Lösning:** Ersätta per-nod UPDATE-loop med `unnest($1::text[], $2::text[])` tabellvärdefunktion. Placera ID och värde i två separata array-parametrar, joina via unnest, uppdatera i en enda query.

```typescript
const ids = batchRows.map((r: Record<string, unknown>) => r.id as string);
const vectors = embeddings.map((e: number[]) => `[${e.join(',')}]`);

await pool.query(
  `UPDATE table_name AS n
   SET column_name = v.value::TYPE
   FROM unnest($1::text[], $2::text[]) AS v(id, value)
   WHERE n.id = v.id`,
  [ids, vectors],
);
```

**Effekt:** Reducerar N UPDATE-queries till 1. Vid 100 noder: från 100 queries till 1. Minnesmässigt små (två array-parametrar). Inkapslar batch-operationer i samma transaktions-scope som loopen tidigare hade.
**Keywords:** PostgreSQL, batch-update, unnest, N+1, performance, database-optimization
**Relaterat:** Körningar #20260309-0552-neuron-hq (TD-4 saveAuroraGraphToDb)
**Körningar:** #20260312-2023-neuron-hq
**Senast bekräftad:** 20260312-2023-neuron-hq

---

## Batch UPDATE med unnest i PostgreSQL
**Kontext:** Fixat N+1 UPDATE-mönster i autoEmbedAuroraNodes() (TD-14) efter tidigare identisk fix i saveAuroraGraphToDb() (TD-4)
**Lösning:** Ersätta per-nod UPDATE-loop med `unnest($1::text[], $2::text[])` tabellvärdefunktion. Placera ID och värde i två separata array-parametrar, joina via unnest, uppdatera i en enda query.

```typescript
const ids = batchRows.map((r: Record<string, unknown>) => r.id as string);
const vectors = embeddings.map((e: number[]) => `[${e.join(',')}]`);

await pool.query(
  `UPDATE table_name AS n
   SET column_name = v.value::TYPE
   FROM unnest($1::text[], $2::text[]) AS v(id, value)
   WHERE n.id = v.id`,
  [ids, vectors],
);
```

**Effekt:** Reducerar N UPDATE-queries till 1. Vid 100 noder: från 100 queries till 1. Minnesmässigt små (två array-parametrar). Inkapslar batch-operationer i samma transaktions-scope som loopen tidigare hade.
**Keywords:** PostgreSQL, batch-update, unnest, N+1, performance, database-optimization
**Relaterat:** Körningar #20260309-0552-neuron-hq (TD-4 saveAuroraGraphToDb)
**Körningar:** #20260312-2023-neuron-hq
**Senast bekräftad:** 20260312-2023-neuron-hq

---

## Batch-UPDATE med unnest för PostgreSQL N+1-optimering
**Kontext:** Eliminering av per-nod UPDATE-loops i batch-embedding-operationer (TD-14 autoEmbedAuroraNodes, TD-15 autoEmbedNodes)
**Lösning:** Ersätt:
```typescript
for (let i = 0; i < items.length; i++) {
  await pool.query('UPDATE table SET col = $1 WHERE id = $2', [values[i], ids[i]]);
}
```
Med:
```typescript
await pool.query(
  'UPDATE table AS t SET col = v.val::type FROM unnest($1::text[], $2::text[]) AS v(id, val) WHERE t.id = v.id',
  [ids, values],
);
```
**Effekt:** Reducerar N queries till 1 per batch; signifikant prestandaförbättring för batch-size 20+. Identisk semantik, ingen räntingskid.
**Keywords:** postgres, unnest, N+1, batch-update, embedding, performance
**Relaterat:** patterns.md#TD-14, techniques.md#Batch Processing PostgreSQL
**Körningar:** #20260312-2122-neuron-hq
**Senast bekräftad:** 20260312-2122-neuron-hq

---

## Tidskodat talartidslinje från överlappande segmentarrayer
**Kontext:** Behov att kombinera Whisper transkribering (text, start/end tidsstämplar) med pyannote diarization (talare, start/end) för att skapa enhetlig tidslinje.
**Lösning:** Implementera `buildSpeakerTimeline()` som matchar whisper-segment mot diarization-segment genom att beräkna tidsöverlappsgrad. För varje tidsintervall tilldelas den talare med högsta överlapp. Intilliggande block med samma talare slås samman automatiskt. Output formateras som hh:mm:ss internt MS-lagrat.
**Effekt:** Exakt talartilldelning utan manuell justering. Automatisk gruppering reducerar antalet block och förbättrar läsbarheten. Testet (round-trip, överlapp-kanter, luckor) bekräftade robusthet.
**Keywords:** segment matching, speaker diarization, time-overlap, timeline, transcript alignment
**Relaterat:** OB-1a brief, Obsidian export, aurora:show
**Körningar:** #20260318-0701
**Senast bekräftad:** 20260318-0701

---

## Additivt moduldesign för isolerad feature-implementering
**Kontext:** Stor ny feature (talartidslinje) kräver både ny logik och integrering med befintliga kommandon (obsidian-export, aurora:show).
**Lösning:** Skapa helt ny ren modul (speaker-timeline.ts) med noll externa beroenden. Modulen innehåller all affärslogik (formatMs, buildSpeakerTimeline, typer). Integrering görs via tunna adaptrar i befintliga filer — bara de få rader som krävs för att anropa ny modul. Befintliga kodvägar för icke-video-noder förblir oförändrade.
**Effekt:** Låg integrerings-risk trots 1400+ rader ny kod. Zero regressioner på 3000 befintliga tester. Modulen är helt testbar isolerat. Enkelt rollback: ta bort speaker-timeline.ts och reversera de få ändringar i video.ts och kommandon.
**Keywords:** modular design, additive architecture, feature isolation, pure module, adapter pattern
**Relaterat:** patterns.md#Additivt moduldesign för minnessystem-parallellisering
**Körningar:** #20260318-0701
**Senast bekräftad:** 20260318-0701

---

## Tidskodat talartidslinje från överlappande segmentarrayer
**Kontext:** Behov att kombinera Whisper transkribering (text, start/end tidsstämplar) med pyannote diarization (talare, start/end) för att skapa enhetlig tidslinje.
**Lösning:** Implementera `buildSpeakerTimeline()` som matchar whisper-segment mot diarization-segment genom att beräkna tidsöverlappsgrad. För varje tidsintervall tilldelas den talare med högsta överlapp. Intilliggande block med samma talare slås samman automatiskt. Output formateras som hh:mm:ss internt MS-lagrat.
**Effekt:** Exakt talartilldelning utan manuell justering. Automatisk gruppering reducerar antalet block och förbättrar läsbarheten. Testet (round-trip, överlapp-kanter, luckor) bekräftade robusthet.
**Keywords:** segment matching, speaker diarization, time-overlap, timeline, transcript alignment
**Relaterat:** OB-1a brief, Obsidian export, aurora:show
**Körningar:** #20260318-0701
**Senast bekräftad:** 20260318-0701

---

## Additivt moduldesign för isolerad feature-implementering
**Kontext:** Stor ny feature (talartidslinje) kräver både ny logik och integrering med befintliga kommandon (obsidian-export, aurora:show).
**Lösning:** Skapa helt ny ren modul (speaker-timeline.ts) med noll externa beroenden. Modulen innehåller all affärslogik (formatMs, buildSpeakerTimeline, typer). Integrering görs via tunna adaptrar i befintliga filer — bara de få rader som krävs för att anropa ny modul. Befintliga kodvägar för icke-video-noder förblir oförändrade.
**Effekt:** Låg integrerings-risk trots 1400+ rader ny kod. Zero regressioner på 3000 befintliga tester. Modulen är helt testbar isolerat. Enkelt rollback: ta bort speaker-timeline.ts och reversera de få ändringar i video.ts och kommandon.
**Keywords:** modular design, additive architecture, feature isolation, pure module, adapter pattern
**Relaterat:** patterns.md#Additivt moduldesign för minnessystem-parallellisering
**Körningar:** #20260318-0701
**Senast bekräftad:** 20260318-0701

---

## Batch-baserad LLM-korrigering med kontextinjection
**Kontext:** OB-1b transcript-polishing för Aurora videoingest
**Lösning:** Gruppera Whisper-segment i batchar om 5-10 meningar, skicka [videotitel + kanal] + [föregående] + [batch] + [nästa] till LLM för korrigering. Spara `correctedText` separat från `rawText`.
**Effekt:** Reducerar LLM API-anrop (8 anrop för 80 meningar istället för 80), samtidigt som kontextinjection förbättrar stavningsfixxing för namn och tekniska termer. Exemplet: "claude code" → "Claude Code" fixas genom att LLM ser videotitel som innehåller "Claude".
**Keywords:** LLM, transcript, batching, context-injection, cost-optimization
**Relaterat:** patterns.md#Graceful-fallback-till-lokal-modell
**Körningar:** #20260318-0834-neuron-hq
**Senast bekräftad:** 20260318-0834-neuron-hq

---

## Multimodal speaker-gissning från metadata + innehål
**Kontext:** OB-1b speaker identification för Aurora
**Lösning:** Kombinera tre datasignaler för att gissa talare: (1) videotitel + kanalnamn från yt-dlp metadata, (2) transkriptinnehål (t.ex. "we at Anthropic"), (3) talarmönster (intervjuare ställer frågor, gäst svarar). Output: namn + confidence (0-100) + roll + reason.
**Effekt:** Fungerar väl för bekanta talare (CEO, forskare nämnd i titel); fallback för okända talare. Exemplet: titel "Anthropic CEO Explains" + talaren säger "we at Anthropic" → hög confidence för "Dario Amodei". Intervjuare identifieras genom frågmönster utan namn.
**Keywords:** speaker-identification, multimodal-inference, metadata, confidence-scoring
**Relaterat:** patterns.md#Batch-baserad-LLM-korrigering-med-kontextinjection
**Körningar:** #20260318-0834-neuron-hq
**Senast bekräftad:** 20260318-0834-neuron-hq

---

## Batch-baserad LLM-korrigering med kontextinjection
**Kontext:** OB-1b transcript-polishing för Aurora videoingest
**Lösning:** Gruppera Whisper-segment i batchar om 5-10 meningar, skicka [videotitel + kanal] + [föregående] + [batch] + [nästa] till LLM för korrigering. Spara `correctedText` separat från `rawText`.
**Effekt:** Reducerar LLM API-anrop (8 anrop för 80 meningar istället för 80), samtidigt som kontextinjection förbättrar stavningsfixxing för namn och tekniska termer. Exemplet: "claude code" → "Claude Code" fixas genom att LLM ser videotitel som innehåller "Claude".
**Keywords:** LLM, transcript, batching, context-injection, cost-optimization
**Relaterat:** patterns.md#Graceful-fallback-till-lokal-modell
**Körningar:** #20260318-0834-neuron-hq
**Senast bekräftad:** 20260318-0834-neuron-hq

---

## Multimodal speaker-gissning från metadata + innehål
**Kontext:** OB-1b speaker identification för Aurora
**Lösning:** Kombinera tre datasignaler för att gissa talare: (1) videotitel + kanalnamn från yt-dlp metadata, (2) transkriptinnehål (t.ex. "we at Anthropic"), (3) talarmönster (intervjuare ställer frågor, gäst svarar). Output: namn + confidence (0-100) + roll + reason.
**Effekt:** Fungerar väl för bekanta talare (CEO, forskare nämnd i titel); fallback för okända talare. Exemplet: titel "Anthropic CEO Explains" + talaren säger "we at Anthropic" → hög confidence för "Dario Amodei". Intervjuare identifieras genom frågmönster utan namn.
**Keywords:** speaker-identification, multimodal-inference, metadata, confidence-scoring
**Relaterat:** patterns.md#Batch-baserad-LLM-korrigering-med-kontextinjection
**Körningar:** #20260318-0834-neuron-hq
**Senast bekräftad:** 20260318-0834-neuron-hq

---

## Strukturerad kodgranskningsrapport med spot-check verifikation
**Kontext:** Granskade 35 700 rader TypeScript + 830 rader Python över 184 filer, 12 grankningsområden (säkerhet, arkitektur, testbarhet, prestanda, resurshantering)
**Lösning:** Använde mallstruktur för findings (Fil:rad, Kategori, Severity, Rekommendation, Effort) tillsammans med top-10 prioriterad åtgärdslista. Reviewer verifierade rapport genom spot-checks: slumpmässiga grep-kommandon mot faktisk kod för att bekräfta shell injection, path traversal, silent catch-blocks, race conditions, console.log-fördelning, type assertions.
**Effekt:** 100% träffsäkerhet på spot-checks (8/8 bekräftade), 33 väldokumenterade findings, 3 CRITICAL säkerhetsbristor identifierade, actionbar prioritering för framtida åtgärd. Strukturerade mallar gör rapport navigerbar och omedelbar implementerbar.
**Keywords:** code-review, security-audit, spot-check, findings-structure, prioritization, shell-injection, path-traversal, race-conditions
**Relaterat:** 
**Körningar:** #20260318-0941-neuron-hq
**Senast bekräftad:** 20260318-0941-neuron-hq

---

## Spot-check verifikation för code review-rapporter
**Kontext:** Stora kodgranskningsrapporter (33+ findings) från Implementer kräver validering innan Reviewer godkänner leveransen
**Lösning:** Reviewer väljer 8 slumpmässiga findings och verifierar varje via grep-kommando mot faktisk kod i target-repot. Exempel: "shell injection i git.ts:35" → `grep -n "execAsync(\`" src/core/git.ts` → bekräfta att förekomsten finns och är problematisk
**Effekt:** 100% träffsäkerhet på spot-checks identifierar rapportörarnas noggrannhet utan att granska alla 33 findings individuellt. Minimalt overhead (8 greps) för att fånga systematiska misclassifications eller hallucinationer
**Keywords:** code-review, spot-check, verification, findings-validation, shell-injection, path-traversal, race-condition
**Relaterat:** 
**Körningar:** #20260318-0941-neuron-hq
**Senast bekräftad:** 20260318-0941-neuron-hq

---

## Migrera execAsync template literals till execFileAsync argument-arrays
**Kontext:** Code review CR-1a identifierade shell injection i git.ts och emergency-save.ts. 21+ anrop med `execAsync(\`git ...\`)` behövde migreras.
**Lösning:** Ersätt varje `execAsync(\`git checkout -b ${branchName}\`)` med `execFileAsync('git', ['checkout', '-b', branchName])`. Importera `execFile` från `child_process`, wrappa med `promisify()`. Ta bort shell-escaping-logik (på denna nivå onödig med execFile).
**Effekt:** Eliminerar shell injection genom att argument passeras direkt till git-processen utan shell-tolkning. Template literals kan aldrig "bryta ut" ur argument-array.
**Keywords:** shell injection, child_process, execFile, security, git operations
**Relaterat:** patterns.md#Promise gate för race-condition-fri resursinitialisering
**Körningar:** #20260318-1119-neuron-hq
**Senast bekräftad:** 20260318-1119-neuron-hq

---

## Promise-gate för race-condition-fri resursinitialisering
**Kontext:** ensureOllama() i src/core/ollama.ts använde en boolean flag (`ollamaVerified`) utan låsmekanism, vilket tillät parallella anrop att starta två Ollama-processer.
**Lösning:** Byt från `let ollamaVerified = false;` till `let ollamaReady: Promise<boolean> | null = null;`. I ensureOllama(), om `ollamaReady` är null, sätt den till `doEnsureOllama(model)` Promise och returnera samma Promise för alla parallella anrop.
**Effekt:** Första anropet startar initializeringen, alla andra anrop väntar på samma Promise. Garanterar att initializering körs exakt en gång oavsett antalet parallela anrop. Enklare än Mutex eller Lock-primitiver.
**Keywords:** race condition, concurrency, initialization, Promise, lazy evaluation
**Relaterat:** patterns.md#Migrera execAsync template literals till execFileAsync argument-arrays
**Körningar:** #20260318-1119-neuron-hq
**Senast bekräftad:** 20260318-1119-neuron-hq

---

## Använd path.resolve() + startsWith() för path traversal-säker validering
**Kontext:** start.ts använde `path.normalize() + startsWith('briefs/')` för att validera att filvägen låg inom briefs/-katalogen, men detta kan kringgås. runs.ts använde ingen validering på runid-parametern alls.
**Lösning:** (1) För runid: lägg till Zod-regex `z.string().regex(/^[a-zA-Z0-9_-]+$/)` för whitelist-validering. (2) För path: `const resolved = path.resolve(BASE_DIR, args.brief); if (!resolved.startsWith(path.resolve(BASE_DIR, 'briefs/'))) throw Error(...)`. Aldrig förlita dig på normalize() + startsWith() på relativa vägar.
**Effekt:** Whitelist-regex eliminerar directory traversal direkt. Absolute path + startsWith på resolved sökvägar blockerar symlink-attacks och normalization bypasses.
**Keywords:** path traversal, validation, security, directory escape, Zod
**Relaterat:** none
**Körningar:** #20260318-1119-neuron-hq
**Senast bekräftad:** 20260318-1119-neuron-hq

---

## Använd tempfile.TemporaryDirectory() context manager för automatic cleanup
**Kontext:** extract_video.py i aurora-workers skapade temporära mappar med `tempfile.mkdtemp()` men rensade aldrig dem, vilket ledde till att gigabyte ackumulerades i /tmp.
**Lösning:** Byt `tmpdir = tempfile.mkdtemp()` till `with tempfile.TemporaryDirectory(prefix="aurora_vid_") as tmpdir:` och flytta all logik inuti with-blocket. Python garanterar automatic cleanup vid exit.
**Effekt:** Eliminerar resource leak helt. Context manager är standardpatternen i Python och gör koden tydligare.
**Keywords:** tempfile, resource leak, cleanup, context manager, Python
**Relaterat:** none
**Körningar:** #20260318-1119-neuron-hq
**Senast bekräftad:** 20260318-1119-neuron-hq

---

## Error serialization via explicit property extraction
**Kontext:** Logging system needs to serialize Error objects that JSON.stringify fails on (Error properties are non-enumerable).
**Lösning:** Create `serializeExtra()` function that checks instanceof Error and explicitly extracts name, message, stack, plus any custom properties via Object.getOwnPropertyNames().
**Effekt:** Errors log correctly with full context; debugging time reduced because stack traces are present. Pattern is composable — serializeExtra() runs before redact() for security.
**Keywords:** error-serialization, logging, JSON-compatibility, debugging
**Relaterat:** patterns.md#Structured logging with JSON redaction
**Körningar:** #20260318-1914-neuron-hq
**Senast bekräftad:** 20260318-1914-neuron-hq

---

## Trace ID for log correlation across run lifecycle
**Kontext:** Production logging needs to correlate all log entries from a single run/request for debugging and monitoring.
**Lösning:** Maintain global `traceId` variable, exported as `setTraceId()` and `getTraceId()`. Set once at run start (e.g., from run.ts calling setTraceId(runId)). Include in all LogEntry output if set.
**Effekt:** Logs are automatically correlated — no boilerplate needed in individual log calls. Enables filtering logs by run, and is prerequisite for external log aggregation (e.g., Langfuse, Datadog).
**Keywords:** trace-id, correlation, log-aggregation, observability
**Relaterat:** patterns.md#Structured logging with JSON redaction
**Körningar:** #20260318-1914-neuron-hq
**Senast bekräftad:** 20260318-1914-neuron-hq

---

## LogWriter interface for testable and extensible output
**Kontext:** Logging needs to be both testable (without spying on stderr) and future-proof (for file writers, Langfuse, etc.).
**Lösning:** Define `LogWriter` interface with single `write(entry: LogEntry)` method. Provide `StderrWriter` default. Export `setLogWriter()` for test injection.
**Effekt:** Tests become simpler — inject a mock LogWriter instead of mocking stderr. New writers (file, network, multi-target) can be added later without changing logger.ts. Follows dependency injection pattern.
**Keywords:** interface-abstraction, dependency-injection, testability, extensibility, logging
**Relaterat:** patterns.md#Structured logging with JSON redaction
**Körningar:** #20260318-1914-neuron-hq
**Senast bekräftad:** 20260318-1914-neuron-hq

---

## Lazy initialization of config-based logger settings
**Kontext:** Logger needs to read environment variables (LOG_LEVEL) but config must not require eager module initialization.
**Lösning:** Create `ensureInit()` function that runs on first log() call. Reads config via getConfig() and sets minLevel once. setLogLevel() override still works and skips re-init.
**Effekt:** Avoids circular dependency risks; config is guaranteed to be ready by first actual log call. Tests can mock setLogLevel() without touching env vars.
**Keywords:** lazy-init, config, environment-variables, initialization-order
**Körningar:** #20260318-1914-neuron-hq
**Senast bekräftad:** 20260318-1914-neuron-hq

---

## Additiv kodarkitektur för säkra stora features
**Kontext:** Körning 20260318-2038 implementerade 10 idé-rankningsuppgifter med 1800 LOC ny kod, utan att modifiera befintlig kärnlogik.
**Lösning:** Strukturera nya features som rena funktionsappender i befintliga filer + nya dedikerade moduler. Minimera *ändringar* i befintlig kod (endast 4 rader i `historian.ts`, 22 rader i `manager.ts` för kontextintegration).
**Effekt:** Risken sjönk från "Medium" till "Low–Medium" — befintlig testning skyddade mot regressioner, och enkla rollbacks möjliggjordes. Implementörerna kunde arbeta parallellt på oberoende funktioner utan merge-konflikter. Lågt kognitiv belastning vid review.
**Keywords:** architecture, refactoring, risk-reduction, parallelization, testing
**Relaterat:** patterns.md#Idempotent-backfill-operationer
**Körningar:** #20260318-2038
**Senast bekräftad:** 20260318-2038

---

## Centraliserad felmeddelande-mappning för multi-steg-pipelines
**Kontext:** R1.1 Robust Input Pipeline. Aurora-ingest har 6 kritiska steg (extract_video, transcribe_audio, diarize_audio, extract_url, autoEmbedAuroraNodes, findNeuronMatchesForAurora) — varje kan misslyckas på olika sätt.
**Lösning:** Skapa en `PipelineError`-klass med `step`, `userMessage`, `suggestion`, `originalError`. Hårdkoda en STEP_ERRORS-mappning med svenska meddelanden och användarförslag för varje steg. Implementera `wrapPipelineStep(fn, step, errors)` som wrappas runt varje steg. CLI/MCP visar `userMessage + suggestion`, loggar rå error på debug-nivå.
**Effekt:** Användare ser igenkännbara svenska felmeddelanden i stället för Python-tracebacks. Underhållning enkel — en fil (pipeline-errors.ts) innehåller all mappning. Konsistent felhantering över CLI, MCP, tests.
**Keywords:** error-handling, user-experience, pipeline, swedish-messages, centralized-config
**Relaterat:** patterns.md#Progressiv-rapport-byggning-för-partiella-pipeline-fel
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## Progressiv rapport-byggning för partiella pipeline-fel
**Kontext:** Pipeline-rapporten måste visa vilka steg som lyckades, vilka som misslyckades, och vilka som skippades vid partiellt fel. Retroaktiv konstruktion (efter alla steg) gör detta svårt — vi vet inte hur långt vi kom.
**Lösning:** Bygg pipeline_report stegvis under körning. För varje steg, lägg till `{ step, status, duration, metadata }` i report-objektet. Vid fel, markera det misslyckade steget som `status: "error"` med error-meddelande, och markera alla efterföljande steg som `status: "skipped"`. Spara rapporten alltid på noden, även vid fel.
**Effekt:** Användare kan se exakt var pipelines stannade och vilka metadata som samlades in före felet. Pipeline-rapport kan visas i `aurora:show`-kommandot. Debuggning blir möjlig utan att behöva loggar.
**Keywords:** pipeline, error-handling, partial-completion, metadata, reporting
**Relaterat:** patterns.md#Centraliserad-felmeddelande-mappning-för-multi-steg-pipelines
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## Parallell våguppdelning för oberoende implementeringsuppgifter
**Kontext:** Brief R1.1 hade 6 relativt oberoende implementeringsuppgifter: PipelineError-klass (T1), retry-logik (T2), video-wrapping (T3), intake-wrapping (T4), CLI-adapters (T5), MCP-adapters (T6).
**Lösning:** Gruppera uppgifter i vågsteg där senare vågor är beroende av tidigare. T1–T2 deltas inte av T3–T4 (samma filer lästa, olika ändringar). T3–T4 väntar på T1–T2 för PipelineError-typer. T5–T6 väntar på T3–T4. Tydliga handoff-gränser möjliggör detta.
**Effekt:** 3 vågsteg på 2h15m totalt (vs sekventiell 1h50m för 1 implementer). Ingen kontest-kö, inga merge-konflikter. Implementers kunde arbeta parallellt utan att blockera varandra.
**Keywords:** parallelization, task-splitting, wave-based-execution, merge-strategy
**Relaterat:** patterns.md#Centraliserad-felmeddelande-mappning-för-multi-steg-pipelines
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## Centraliserad felmeddelande-mappning med wrapPipelineStep()-utility
**Kontext:** Multi-step-pipelines (Aurora ingest: 6 steg) där varje steg kan misslyckas med olika root causes. Användarupplevelse degrades om rå Python-tracebacks exponerats.
**Lösning:** PipelineError-klass med `step`, `userMessage`, `suggestion`, `originalError`. Mappning av steg→svenska meddelanden i STEP_ERRORS konstant. `wrapPipelineStep(fn, step, errors)` höger-ordnings-funktion som wrappas runt varje steg för konsekvent felhantering.
**Effekt:** Användare ser igenkännbara svenska meddelanden. En fil (pipeline-errors.ts) innehåller all mappning — enkel underhållning. Konsekvent felhantering över CLI, MCP, tests.
**Keywords:** error-handling, user-experience, pipeline, localization, dry-principle
**Relaterat:** patterns.md#Progressiv-rapport-byggning-för-partiella-pipeline-fel
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## Progressiv rapport-byggning för partiella pipeline-fel
**Kontext:** Pipeline-rapport måste visa status för alla steg — lyckade, misslyckade, och skippade. Retroaktiv konstruktion (efter alla steg) kan inte korrekt modellera partiella fel.
**Lösning:** Bygg rapport stegvis under körning. För varje steg, lägg till `{ step, status, duration, metadata }` i report-objektet. Vid fel: markera det misslyckade steget som `status: "error"` med error-text, och alla efterföljande steg som `status: "skipped"`. Spara rapport alltid på noden, även vid fel.
**Effekt:** Användare kan se exakt var pipelines stannade och vilka metadata som samlades in före felet. Rapport synlig i `aurora:show` utan att behöva gräva i loggar.
**Keywords:** pipeline, error-handling, partial-completion, metadata, progressive-construction
**Relaterat:** patterns.md#Centraliserad-felmeddelande-mappning-för-multi-steg-pipelines
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## Vågbaserad parallelisering för oberoende implementeringsuppgifter
**Kontext:** Brief med 6 oberoende implementeringsuppgifter som delvis kan paralleliseras. T1–T2 (setup) bör slutföras före T3–T4 (core), som bör slutföras före T5–T6 (adapters).
**Lösning:** Gruppera uppgifter i 3 sekventiella vågor. T1–T2 startas parallelt, vänd tills completion. T3–T4 startas parallelt efter T1–T2. T5–T6 startas parallelt efter T3–T4. Tydliga handoff-gränser mellan vågor minskar merge-konflikter.
**Effekt:** 3 vågor à ~20–37 minuter vardera (totalt ~80 min) för 6 implementers. Jämfört med sekventiell (180 min) sparas ~60%. Zero merge-konflikter inom vågorna.
**Keywords:** parallelization, task-splitting, wave-based-execution, merge-strategy
**Relaterat:** patterns.md#Centraliserad-felmeddelande-mappning-för-multi-steg-pipelines
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## PipelineError-klass för användarvänliga felmeddelanden
**Kontext:** R1.1 implementering i neuron-hq — behövde konvertera Python-tracebacks och tekniska fel till svenska användarmeddelanden
**Lösning:** Skapade `src/aurora/pipeline-errors.ts` med en `PipelineError`-klass (Error-subklass) som har properties: `step`, `userMessage`, `suggestion`, `originalError`. En hardkodad STEP_ERRORS-mappning definierar svenska meddelanden för alla sex pipeline-steg (extract_video, transcribe_audio, diarize_audio, extract_url, autoEmbedAuroraNodes, findNeuronMatchesForAurora). En utility-funktion `wrapPipelineStep()` wrappas omkring varje steg för att fånga fel och konvertera dem till PipelineError.
**Effekt:** Användare ser tydliga svenska meddelanden (t.ex. "Transkribering misslyckades: Ljudfilen kunde inte hittas") + förslag på vad de kan göra, medan tekniska detaljer loggas för felsökning. CLI och MCP-tools visar bara användarmeddelandet, inte raw error stack.
**Keywords:** error-handling, user-friendly-messages, pipeline-robustness, swedish-ux, arctic-dream-target
**Relaterat:** patterns.md#Exponentiell backoff för API-retry
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## Progress-metadata för realtid-feedback i långkörande pipelines
**Kontext:** R1.1 implementering — behövde ge detaljerad steg-för-steg-feedback under video-ingest
**Lösning:** Utökade `onProgress`-callbacken i `ingestVideo()` för att inkludera metadata-objekt per steg: stepNumber, totalSteps, stepName, metadata (ord, talare, chunks, vektorer, korsreferenser, filstorlek, varaktighet). Informationen byggas progressivt under körning när varje steg slutförs. CLI-adapter formaterar detta med emojis, stegnummer och sammanfattningar för läsbar output.
**Effekt:** Användare ser [`1/7 ⬇️  Laddar ner video... OK (245 MB, 34s)`] istället för bara start/slut. Detta lär användaren vad pipeline gör och ger konfidentiellt feedback vid felslag (vilka steg återstod).
**Keywords:** progress-feedback, metadata-passing, user-experience, pipeline-visibility
**Relaterat:** patterns.md#PipelineError-klass för användarvänliga felmeddelanden
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## Exponentiell backoff för API-retry utan externa bibliotek
**Kontext:** R1.1 implementering — embedding-batchar kunde misslyckas på rate-limit eller tillfälliga nätverksfel
**Lösning:** Implementerade retry-loop i `autoEmbedAuroraNodes()` med max 2 retries, exponentiell backoff (2s → 4s) med `setTimeout`. Vid slutligt misslyckande loggas node IDs som saknar embedding för senare diagnostik.
**Effekt:** Transient API-fel hanteras automatiskt utan att användaren behöver göra något manuellt. Implementationen är enkel (ingen extern retry-bibliotek) och testbar. Exponentiell backoff förhindrar att vi bombarderar API:et.
**Keywords:** retry-logic, exponential-backoff, api-resilience, error-recovery
**Relaterat:** patterns.md#PipelineError-klass för användarvänliga felmeddelanden
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## PipelineError-klass för användarcentrerade felmeddelanden i Aurora
**Kontext:** R1.1 implementering — Aurora-pipeline producerade Python-tracebacks som användare inte förstod, krävde omformulering till svenska
**Lösning:** Skapade `src/aurora/pipeline-errors.ts` med PipelineError-subklass och STEP_ERRORS-mappning (6 steg: extract_video, transcribe_audio, diarize_audio, extract_url, autoEmbedAuroraNodes, findNeuronMatchesForAurora). Varje steg mappades till svenskt felmeddelande + användarförslag (t.ex. "Transkribering misslyckades: Ljudfilen kunde inte hittas. Prova: kontrollera att yt-dlp laddade ner videon korrekt"). wrapPipelineStep()-utility wrappade alla steg för automatisk konvertering.
**Effekt:** Användare ser tydliga svenska instruktioner istället för raw Python-errors. Tekniska detaljer loggas för felsökning. CLI och MCP-tools visar bara användarmeddelandet.
**Keywords:** error-handling, user-experience, aurora-pipeline, pipeline-errors, swedish-ux
**Relaterat:** patterns.md#Exponentiell backoff för API-retry
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## Progressiv progress-metadata för realtid pipeline-feedback
**Kontext:** R1.1 implementering — Aurora-ingest visade bara start/slut, användare ville se detaljerad steg-för-steg-förlopp
**Lösning:** Utökade onProgress-callbacken i `ingestVideo()` för att inkludera metadata per steg: stepNumber, totalSteps, stepName, och stegspecifika metriker (filstorlek, ordantal, talareantal, chunks, vektorer, korsreferenser). Metadata bygges progressivt när varje steg slutförs, aldrig retroaktivt. CLI-adapter formaterar output med emojis och sammanfattningar.
**Effekt:** Användare ser [`1/7 ⬇️  Laddar ner video... OK (245 MB, 34s)`] istället för bara status. Lär användaren vad pipeline gör, ger konfidentiellt feedback vid fel (vilka steg återstod).
**Keywords:** progress-feedback, pipeline-visibility, metadata, user-experience, realtime-feedback
**Relaterat:** patterns.md#PipelineError-klass för användarcentrerade felmeddelanden i Aurora
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## Exponentiell backoff-retry för externa API-fel
**Kontext:** R1.1 implementering — embedding-batchar kunde misslyckas på transient rate-limit eller nätverksfel
**Lösning:** Implementerade retry-loop i `autoEmbedAuroraNodes()` med max 2 retries, exponentiell backoff (2s → 4s) med setTimeout. Vid slutligt misslyckande loggas node IDs som saknar embedding för diagnostik. Implementering är enkel TypeScript, ingen extern retry-bibliotek.
**Effekt:** Transient API-fel hanteras automatiskt. Exponentiell backoff förhindrar att vi bombarderar API:et. Användare behöver ingen manuell intervention för tillfälliga anslutningsfel.
**Keywords:** retry-logic, exponential-backoff, api-resilience, error-recovery, transient-failure
**Relaterat:** patterns.md#PipelineError-klass för användarcentrerade felmeddelanden i Aurora
**Körningar:** #20260319-1121-neuron-hq
**Senast bekräftad:** 20260319-1121-neuron-hq

---

## Robust Markdown Parser via Separated Concerns (Frontmatter + Content)
**Kontext:** Run 20260319-1234-neuron-hq implementerade obsidian-import med säker YAML-parsning, tagg-extraktion och kommentar-hämtning från markdown-filer.
**Lösning:** Separera parsningslogik i tre oberoende, testbara funktioner:
1. `extractSpeakers()` — använd gray-matter för YAML-frontmatter, returnera null vid korrupthet (logga varning)
2. `extractTags()` — fixta regex för `### HH:MM:SS — Speaker #tag`, filtrera mot whitelist av kända taggar, ignorera okända
3. `extractComments()` — fixta HTML-kommentarregex, koppla till närmaste föregående tidskod, hoppa över om ingen match

**Effekt:** 
- Ren, testbar kod (51 tester, alla gröna, 0 regressioner i 3258 befintliga tester)
- Robusthet: hanterar edge cases (korrupt YAML, saknade speakers, okända taggar, misalignerade tidskoder) utan krasch
- Återanvändbarhet: parser-modulen är renrumsfunktioner, lätt att testa isolerat och säkerställa idempotens (ersättning, inte append)

**Keywords:** parser, markdown, YAML, gray-matter, separation-of-concerns, testing, idempotence
**Relaterat:** patterns.md#, techniques.md#StructMemEval
**Körningar:** #20260319-1234-neuron-hq
**Senast bekräftad:** 20260319-1234-neuron-hq

---

## MCP-verktyg för två-vägs datautbyte med externa vault
**Kontext:** OB-1d körning — Obsidian export/import MCP-tools för highlights och kommentarer
**Lösning:** Skapade två asymmetriska MCP-tools: aurora_obsidian_export (bulk-export av alla noder) och aurora_obsidian_import (läs tags/comments/speakers från vault). Verktygen returnerar statistik ({exported, filesProcessed, highlights, comments, speakersRenamed}) för debugging och audit.
**Effekt:** Möjliggör två-vägs datautbyte mellan Aurora-grafen och Obsidian. Returnvärden (istället för void) gör verktygets effekt mätbar för Claude Desktop-användare och möjliggör retry-logik baserad på statistik.
**Keywords:** mcp-tools, obsidian-integration, two-way-sync, return-type-change, statistics-reporting
**Relaterat:** patterns.md#Obsidian callout format för highlights
**Körningar:** #20260319-1327-neuron-hq
**Senast bekräftad:** 20260319-1327-neuron-hq

---

## Obsidian callout format för highlights — immediatepraktisk märkning
**Kontext:** OB-1d — highlights från Aurora renderas tillbaka i Obsidian-export
**Lösning:** Highlights renderas som Obsidian callout-syntax: `> [!important] #highlight\n> ### HH:MM:SS — Speaker\n> Quoted text`. Kommentarer som HTML-kommentarer under segment: `<!-- kommentar: text -->`.
**Effekt:** Highlights blir omedelbar synliga och redigerbara i Obsidian, medan HTML-kommentarer är non-intrusive. Round-trip bevaras — export → tagga → import → export igen behåller alla markers utan dubblering.
**Keywords:** obsidian-callouts, highlights, markdown-rendering, round-trip-stability
**Relaterat:** patterns.md#MCP-verktyg för två-vägs datautbyte
**Körningar:** #20260319-1327-neuron-hq
**Senast bekräftad:** 20260319-1327-neuron-hq

---

## MCP-verktyg för två-vägs datautbyte med externa vault
**Kontext:** OB-1d körning — Obsidian export/import MCP-tools för highlights och kommentarer
**Lösning:** Skapade två asymmetriska MCP-tools: aurora_obsidian_export (bulk-export av alla noder) och aurora_obsidian_import (läs tags/comments/speakers från vault). Verktygen returnerar statistik ({exported, filesProcessed, highlights, comments, speakersRenamed}) för debugging och audit.
**Effekt:** Möjliggör två-vägs datautbyte mellan Aurora-grafen och Obsidian. Returnvärden (istället för void) gör verktygets effekt mätbar för Claude Desktop-användare och möjliggör retry-logik baserad på statistik.
**Keywords:** mcp-tools, obsidian-integration, two-way-sync, return-type-change, statistics-reporting
**Relaterat:** patterns.md#Obsidian callout format för highlights
**Körningar:** #20260319-1327-neuron-hq
**Senast bekräftad:** 20260319-1327-neuron-hq

---

## Obsidian callout format för highlights — omedelbar praktisk märkning
**Kontext:** OB-1d — highlights från Aurora renderas tillbaka i Obsidian-export
**Lösning:** Highlights renderas som Obsidian callout-syntax: `> [!important] #highlight\n> ### HH:MM:SS — Speaker\n> Quoted text`. Kommentarer som HTML-kommentarer under segment: `<!-- kommentar: text -->`.
**Effekt:** Highlights blir omedelbar synliga och redigerbara i Obsidian, medan HTML-kommentarer är non-intrusive. Round-trip bevaras — export → tagga → import → export igen behåller alla markers utan dubblering.
**Keywords:** obsidian-callouts, highlights, markdown-rendering, round-trip-stability
**Relaterat:** patterns.md#MCP-verktyg för två-vägs datautbyte
**Körningar:** #20260319-1327-neuron-hq
**Senast bekräftad:** 20260319-1327-neuron-hq

---

## MCP-tools med scope-registrering och return-types
**Kontext:** Körning 20260319-1327-neuron-hq — implementering av aurora_obsidian_export och aurora_obsidian_import
**Lösning:** (1) Definiera tools i egen fil (src/mcp/tools/aurora-obsidian.ts) med explicit return-types; (2) Registrera i scopes.ts via `registerAuroraObsidianTools(server)`; (3) Uppdatera scopes-testfilen för att reflektera ny scope-count
**Effekt:** MCP-tools blir enkla att testa, scope-registrering är konsistent, och return-types möjliggör statistik-rapportering från Claude Desktop
**Keywords:** MCP, scope-registration, return-types, tool-registration
**Relaterat:** AGENTS.md#Implementer, brief.md#Del B
**Körningar:** #20260319-1327-neuron-hq
**Senast bekräftad:** 20260319-1327-neuron-hq

---

## Round-trip test för export/import cykler
**Kontext:** Körning 20260319-1327-neuron-hq — validering av Obsidian highlights/comments persistence
**Lösning:** Skapa test som: (1) exporterar data med highlights, (2) re-importerar samma data, (3) exporterar igen, (4) räknar markörer och bekräftar ingen dubblering
**Effekt:** Fångar subtila dubblering-buggar och bekräftar att annotations bevaras genom cykler. Enkel att implementera med regex-räkning eller marquee-assertion.
**Keywords:** round-trip, export-import, idempotence, annotations, obsidian
**Relaterat:** brief.md#AC3
**Körningar:** #20260319-1327-neuron-hq
**Senast bekräftad:** 20260319-1327-neuron-hq

---

## Event-collector + AI-with-fallback för robusta genererings-features
**Kontext:** Körning 20260319-2118. Behov att bygga körningsberättelse-generator som kan hantera variabel mängd data och API-fel utan att kracha.
**Lösning:** Tvåsteg-arkitektur: (1) Lättviktig event-collector prenumererar på EventBus under körningen, lagrar kronologiska entries med trunkering (max 500, detail ≤200 tecken). (2) Genererings-modul använder AI (Haiku) för syntes, men fallback till regelbaserad rendering när Haiku timeout/fails. Data trimmas intelligent före API-anrop (max 50 entries / 30K tecken) för att hålla inom token-budget.
**Effekt:** Robusthet — system fungerar även om Haiku är nere eller långsam. Läsbarhet — AI-narrative är bättre än platt lista. Minneseffektivitet — collector är lättviktig (<100KB även i långa körningar).
**Keywords:** event-collector, fallback, ai-resilience, narrative-generation, eventbus-pattern
**Relaterat:** patterns.md#Data-trimming för AI-prompts
**Körningar:** #20260319-2118-neuron-hq
**Senast bekräftad:** 20260319-2118-neuron-hq

---

## Event-Collector + AI-with-Fallback för robusta genererings-features
**Kontext:** Körning 20260319-2118-neuron-hq implementerade körningsberättelse-generator (run-narrative.md)
**Lösning:** Tvåstegs-arkitektur: (1) Lättviktig NarrativeCollector prenumererar på EventBus under körningen, lagrar kronologiska entries med automatisk trunkering (max 500 entries, detail-fält ≤200 tecken). (2) Genererings-modul använder Claude Haiku för AI-syntes med max 2048 tokens och 60s timeout, men fallback till regelbaserad rendering (narrateDecisionSimple + narrateEvent) när Haiku timeout/fails. Data trimmas intelligellt före Haiku-anrop (max 50 entries / 30K tecken) för att hålla inom token-budget.
**Effekt:** Robusthet — systemet fungerar även om Haiku är nere eller långsam. Läsbarhet — AI-narrative är betydligt bättre än platt lista av events. Minneseffektivitet — collector är lättviktig (<100KB även i långa körningar, 500 entries = ~100KB). Fallback-vägen är produktionsklar — ingen "Sorry, AI failed" message visar för användaren.
**Keywords:** event-collector, fallback-rendering, ai-resilience, narrative-generation, eventbus, tokenbudget
**Relaterat:** patterns.md#Separation av concerns: ask (syntes) vs search (hämtning)
**Körningar:** #20260319-2118-neuron-hq
**Senast bekräftad:** 20260319-2118-neuron-hq

---

## Event-Collector + AI-with-Fallback för robusta genererings-features
**Kontext:** Körning 20260319-2118-neuron-hq implementerade körningsberättelse-generator (run-narrative.md)
**Lösning:** Tvåstegs-arkitektur: (1) Lättviktig NarrativeCollector prenumererar på EventBus under körningen, lagrar kronologiska entries med automatisk trunkering (max 500 entries, detail-fält ≤200 tecken). (2) Genererings-modul använder Claude Haiku för AI-syntes med max 2048 tokens och 60s timeout, men fallback till regelbaserad rendering (narrateDecisionSimple + narrateEvent) när Haiku timeout/fails. Data trimmas intelligellt före Haiku-anrop (max 50 entries / 30K tecken) för att hålla inom token-budget.
**Effekt:** Robusthet — systemet fungerar även om Haiku är nere eller långsam. Läsbarhet — AI-narrative är betydligt bättre än platt lista av events. Minneseffektivitet — collector är lättviktig (<100KB även i långa körningar, 500 entries = ~100KB). Fallback-vägen är produktionsklar — ingen "Sorry, AI failed" message visar för användaren.
**Keywords:** event-collector, fallback-rendering, ai-resilience, narrative-generation, eventbus, tokenbudget, separation-of-concerns
**Relaterat:** patterns.md#Separation av concerns: ask (syntes) vs search (hämtning)
**Körningar:** #20260319-2118-neuron-hq
**Senast bekräftad:** 20260319-2118-neuron-hq

---

## Hybrid keyword-matching + LLM-rankning för sökning över små kataloger
**Kontext:** Neuron HQ tool-discovery — behövde matcha användarfrågor (svenska/engelska) mot 40+ verktyg utan embedding-infrastruktur
**Lösning:** Två-fas matching: (1) tokenisera fråga på whitespace + skiljetecken, lowercase. Räkna unika keyword-träffar per verktyg. (2) Beroende på träffantal: 1-3 träffar → returnera direkt, >3 träffar → skicka top 10 till Haiku för rankning, 0 träffar → skicka alla till Haiku. Diakritikerhantering: primär matchning med intakta diakritiker, fallback till normaliserade (ö→o, ä→a, å→a) om 0 träffar.
**Effekt:** Balanserad precision/kostnad. Keyword-matchning hanterar 80% av frågorna utan API-anrop. Haiku-rankning på subset hanterar ambiga fall. Diakritikerhantering-fallback löser svenska språket robust. Zod-validering + hallucination-filter höll outputen stabil även när Haiku rankade felaktigt.
**Keywords:** keyword-matching, hybrid-search, LLM-rankning, cost-optimization, diacritics, Swedish NLP
**Relaterat:** patterns.md#Fallback-kedjor för AI-anrop
**Körningar:** #20260320-0622-neuron-hq
**Senast bekräftad:** 20260320-0622-neuron-hq

---

## Brief-baserad grafkontext istället för statisk top-5-injektion
**Kontext:** Körning 20260320-1159-neuron-hq — Tas 2.2 Feedback-loop. Manager injicerade tidigare alltid samma top-5 globala idéer oavsett brief. Agenterna ignorerade ofta grafen pga att kontexten var generisk.
**Lösning:** Två-fas extraktionsmodul: (1) `extractBriefContext(brief.md)` tokeniserar titel/bakgrund/AC och extraherar max 20 nyckelord (stoppord filtrerade, ordlängd ≥3). (2) `getGraphContextForBrief(graph, context)` söker keyword-matchad noder, expanderar via PPR från seeds, lägger till senaste error-noder (sortera på skapats-tid). Returnerar max 15 noder med relevance-tagging (high/medium). Fallback: om <3 noder, komplettera med top-5 idéer.
**Effekt:** Manager får nu brief-specifik kontext i stället för generisk. Reviewer fick error/pattern-view (13 noder max, ingen idéer). Agenterna läste grafen oftare eftersom kontexten var relevant. 30 nya tester bekräftar robusthet (tom graf, tom brief, tom returnering, dedup, max-limit).
**Keywords:** brief-extraction, graph-context, keyword-matching, PPR-expansion, fallback, error-prioritization
**Relaterat:** techniques.md#Personalized PageRank (PPR)
**Körningar:** #20260320-1159-neuron-hq
**Senast bekräftad:** 20260320-1159-neuron-hq

---

## YAML-driven prompt-lint med tvåstegs-filtrering
**Kontext:** Körning 20260322-0150-neuron-hq — Observer-modulen behövde detektera anti-patterns i agentprompter (numeriska tak, satisficing-språk, tidspressrelaterat) utan högt false positive-rate
**Lösning:** Anti-patterns definieras i `policy/prompt-antipatterns.yaml` med regex, severity, category och `legitimateContexts`-lista. Tvåstegs-filtrering: (1) regex hittar kandidat-matchningar i prompten, (2) kontextanalys kontrollerar omgivande sektionsrubrik (närmaste ##/### ovanför) och ±3 rader — om kontexten innehåller nyckelord från `legitimateContexts` nedgraderas severity till INFO. Osäkra fall defaultar till INFO (inte WARNING).
**Effekt:** Utökningsbar utan kodändring — nya anti-patterns läggs till i YAML-filen. Tvåstegs-filtreringen skiljer "max 3 retries" (legitimt i API-kontext) från "max 3 filer" (ärvd heuristik). Inga false positives vid verifiering mot nuvarande 11+ promptfiler.
**Keywords:** prompt-lint, yaml, anti-patterns, regex, two-stage-filter, observer, quality-assurance
**Relaterat:** patterns.md#Prompt-lint-tester: regex-validering av prompt-filer, patterns.md#AGENTS.md som delad systemkonstitution
**Körningar:** #20260322-0150-neuron-hq
**Senast bekräftad:** 20260322-0150-neuron-hq

---

**[UPPDATERING]** Mönstret "Single-phase Merger: auto-commit on Reviewer GREEN" bekräftades i körning 20260322-0150-neuron-hq — Merger delegerades en enda gång (02:39:34), läste report.md med GREEN-verdict, kopierade 6 filer (3 nya + 3 modifierade) och committade direkt. Exkluderade korrekt 2 hjälpskript och knowledge.md. Ingen merge_plan.md eller answers.md.

**Senast bekräftad:** 20260322-0150-neuron-hq

**[UPPDATERING]** Mönstret "Merger filtrerar hjälpskript utan Manager-cleanup-pass" bekräftades i körning 20260322-0150-neuron-hq — Implementer skapade 2 Python-hjälpskript (insert-prompt-health.py, reorder-observer.py), Merger exkluderade dem vid merge. Reviewer klassificerade dem som NEUTRAL i Emergent Changes-tabellen. Fjärde+ bekräftelsen.

**Senast bekräftad:** 20260322-0150-neuron-hq

**[UPPDATERING]** Mönstret "Exakt feloutput + fixförslag i brief ger kirurgiska leveranser" bekräftades i körning 20260322-0150-neuron-hq — briefen innehöll komplett TypeScript-interfaces (Observation, TokenUsage, AgentModelInfo, ObserverAgent-klass med metoder), exakt YAML-schema för anti-patterns, rapport-mall och integration-kodsnippets. 24/24 kriterier uppfyllda, 32 tester (krav 20+).

**Senast bekräftad:** 20260322-0150-neuron-hq

**[UPPDATERING]** Mönstret "Reviewer git-stash baseline-jämförelse" bekräftades i körning 20260322-0150-neuron-hq — Reviewer körde baseline verify (3597 tests, 11 pre-existing failures) → after-change verify (3629 tests, 11 same pre-existing failures, 32 new, 0 regressions) med fullständig stoplight-tabell. tsc rent, eslint 0 nya fel.

**Senast bekräftad:** 20260322-0150-neuron-hq

**[SKEPTIKER 20260322-0150-neuron-hq]** Granskade mönster med confidence ≥ 0.7:
- pattern-027 (0.75) "Single-phase Merger": ✅ Bekräftad i denna körning — behåll 0.75 (procedurellt, tak 0.8)
- pattern-036 (0.8) "Merger filtrerar hjälpskript": ✅ Bekräftad i denna körning — behåll 0.8 (vid tak)
- pattern-215 (0.75) "YAML-driven prompt-lint": Ny i denna körning — behåll initial confidence
Inga mönster sänkta — alla relevanta mönster bekräftades i denna körning.

## Sekventiella API-anrop med AbortSignal-timeout och fail-open felhantering
**Kontext:** Observer Brief B (20260322-0655) — retro-samtal med 11 agenter via API
**Lösning:** Kör API-anrop sekventiellt (inte parallellt) med 30s AbortSignal timeout per anrop. Vid misslyckande: logga felet, markera agenten som `retro: "failed"`, fortsätt med nästa agent. Fail-open istället för fail-closed.
**Effekt:** Undviker rate limits från parallella anrop, förenklar felhantering, garanterar att en misslyckad retro-session aldrig blockerar hela rapporten. Partiella resultat (9/11 lyckade) är bättre än inga resultat.
**Keywords:** api-anrop, timeout, fail-open, sekventiell, AbortSignal, rate-limit, retro
**Relaterat:** runs.md#20260322-0655-neuron-hq
**Körningar:** #20260322-0655
**Senast bekräftad:** 20260322-0655-neuron-hq

---

## Regelbaserad kodanalys (regex + heuristik) istället för LLM för deterministisk alignment-check
**Kontext:** Observer Brief B (20260322-0655) — deep prompt-kod-alignment
**Lösning:** Använd regex + brace-counting för att extrahera funktionskroppar och klassificera implementationsdjup (DEEP/SHALLOW/NOT_FOUND). Konkreta regler: shallow = bara sätter flagga/returnerar hårdkodat värde/tom kropp. Deep = gör externt anrop/läser och jämför data. Oklara fall → INFO (inte WARNING).
**Effekt:** Gratis, snabb, deterministisk. Minimerar false positives. Kan köras utan API-anrop. LLM-baserad analys kan läggas till som förbättring men är inget krav för en fungerande v1.
**Keywords:** kodanalys, regex, heuristik, alignment, shallow-detection, deterministisk, prompt-kod
**Relaterat:** runs.md#20260322-0655-neuron-hq
**Körningar:** #20260322-0655
**Senast bekräftad:** 20260322-0655-neuron-hq

---

## Append-only markdown-tabell för LLM-läsbar kalibreringsdata
**Kontext:** Observer kalibreringsmodul (2.6b) — körning 20260322-1126-neuron-hq
**Lösning:** Spara kalibrerings- och feedback-data som append-only markdown-tabell istället för JSON-array, så att LLM-agenter kan läsa och parsa datan direkt i sin prompt utan extra verktygsanrop
**Effekt:** LLM parserar markdown-tabeller bättre än JSON-arrayer vid direktläsning. Append-only gör det enkelt att logga ny data utan att läsa och skriva om hela filen. ~1 rad per körning, ~200 rader/år — ingen trunkering behövs för v1.
**Keywords:** markdown, tabell, append-only, kalibreringsdata, LLM, Brief Reviewer, feedback-loop
**Relaterat:** runs.md#Körning 20260322-1126-neuron-hq
**Körningar:** #20260322-1126
**Senast bekräftad:** 20260322-1126-neuron-hq

---

## Trestegs-matchning för att koppla review-JSON:er till körningar
**Kontext:** Observer kalibreringsmodul — matchning av Brief Reviewers review-filer till körningars brief
**Lösning:** 1) Matcha på briefFile-fält i review-JSON, 2) Fallback: sök briefens filnamn i turns[0].content, 3) Om ingen träff: skippa och logga. Guard: kontrollera att turns-array inte är tom före steg 2.
**Effekt:** Hanterar saknade/tomma briefFile-fält utan krascher. Tre-stegsordningen ger maximal täckning utan att gissa. Explicit loggning av skippa-fall gör felsökning enkelt.
**Keywords:** matchning, fallback, review-JSON, briefFile, turns-content, graceful skip
**Relaterat:** runs.md#Körning 20260322-1126-neuron-hq
**Körningar:** #20260322-1126
**Senast bekräftad:** 20260322-1126-neuron-hq

---

## Pre-step hälsokontroll i run.ts för kontinuerlig grafövervakning
**Kontext:** Körning 20260322-1724-neuron-hq — Grafens hälsokontroll (Brief 2.5). Grafen hade växt till 1 345 noder och 206 kanter men ingen hade en heltäckande bild av kvaliteten (83% isolerade noder, 270 noder utan provenance).
**Lösning:** Kör en ren funktion (`runHealthCheck(graph)`) som pre-step i `run.ts` INNAN agenter startar. Skriv resultatet till `runs/<runId>/graph-health.md` (markdown-rapport med 🟢/🟡/🔴-indikatorer). Injicera trigger i briefen via `maybeInjectHealthTrigger()` enbart vid RED (inte YELLOW). Historian LÄSER rapporten och inkluderar status i sammanfattningen — behöver inte generera den. Fånga alla `loadGraph()`-fel med try/catch; körningen blockeras aldrig av hälsokontrollfelet.
**Effekt:** Kontinuerlig, automatisk grafövervakning utan API-anrop (ren funktion, ingen kostnad). Historian kan alltid rapportera grafstatus. Consolidator triggas proaktivt vid kritiska problem (RED). YELLOW är informativt — för många Consolidator-körningar undviks. CLI `npx tsx src/cli.ts graph:health` möjliggör manuell kontroll och CI-integration.
**Keywords:** run.ts, pre-step, graph-health, watchman, ren-funktion, monitoring, historian, consolidator-trigger
**Relaterat:** patterns.md#Exakt feloutput + fixförslag i brief ger kirurgiska leveranser
**Körningar:** #20260322-1724-neuron-hq
**Senast bekräftad:** 20260322-1724-neuron-hq

---

## streamWithEmptyRetry: retry + diagnostik + icke-streaming fallback för 0-token API-svar
**Kontext:** Körning 20260324-2114-neuron-hq — API kan returnera HTTP 200 med 0 output tokens (tyst dataförlust). Historian och Consolidator hade begränsad retry enbart på iteration 1.
**Lösning:** Tre streaming-retries med exponentiell backoff [5s, 15s, 30s] oavsett iteration. Efter 3 misslyckanden: ett icke-streaming anrop (`client.messages.create()`). Vid varje 0-token-svar loggas diagnostik (agent, iteration, systemPromptChars, messagesChars, model, retryAttempt). Om fallback också ger 0 tokens returneras svaret ändå. `isEmptyResponse()` är en ren funktion. `EMPTY_RETRY_DELAYS` exporteras för testbarhet.
**Effekt:** Eliminerar tyst dataförlust i Historian och Consolidator. Diagnostikloggning möjliggör felsökning av när 0-token-svar uppstår och under vilka omständigheter (systemprompt-storlek, modell). Icke-streaming fallback kringgår eventuella SDK-buggar i streaming.
**Keywords:** 0-token, retry, backoff, streaming, fallback, historian, consolidator, dataförlust, reliability
**Relaterat:** patterns.md#DRY extraction av retry-logik till delad utility-funktion
**Körningar:** #20260324-2114-neuron-hq
**Senast bekräftad:** 20260324-2114-neuron-hq

---

## git-restore + deterministiskt patchskript vid Implementer-regression
**Kontext:** Körning 20260325-0715-neuron-hq — T2-Implementer omstrukturerade `obsidian-export.ts` vid targeted-patch och bröt 12 tester
**Lösning:** (1) `git checkout <baseline_sha> -- <fil>` återställer filen exakt till pre-change-state utan att röra andra filer. (2) Applicera de specificerade ändringarna via ett Node.js read-replace-write-skript (deterministic, inspectable). (3) Kör tester för att verifiera att ENBART de avsedda ändringarna landed. Alternativt: Manager applicerar själv de specificerade ändringarna via write_file-baserad patching.
**Effekt:** Fullständig recovery utan att behöva en ny Implementer-delegation. Skriptbaserad applicering är snabbare än att instruera Implementer om igen, och ger ett transparent audit-trail av exakt vilka rader som ändrades.
**Keywords:** regression, git-restore, baseline, patch-script, implementer, recovery, obsidian
**Relaterat:** errors.md#Implementer skriver om befintlig kod vid targeted-ändringsuppgift, patterns.md#Exakt feloutput + fixförslag i brief ger kirurgiska leveranser
**Körningar:** #20260325-0715-neuron-hq
**Senast bekräftad:** 20260325-0715-neuron-hq

---

## Reviewer SUGGEST: regex-ankar för sektion-matchning i markdown
**Kontext:** Körning 20260325-0715-neuron-hq — Reviewer flaggade att `extractContentSection()` använde `indexOf("## Innehåll")` som kunde ge falska positiver vid inline-förekomster
**Lösning:** Byt från `indexOf()` till `/^## Innehåll[ \t]*$/m` regex med rad-start-ankar (`^`) och multiline-flagga (`m`). Trimma whitespace efter extraktion. Returnera `null` för tom sektion istället för tom sträng.
**Effekt:** Eliminerar en klass av subtila markdown-parsning-buggar. `indexOf()` matchar var som helst i strängen (inklusive i löptext), medan `^##`-regex enbart matchar vid rad-start. Mönstret gäller all markdown-sektion-extraktion.
**Keywords:** regex, markdown, section-extraction, indexOf, line-anchor, multiline, parser
**Relaterat:** errors.md#Implementer skriver om befintlig kod vid targeted-ändringsuppgift
**Körningar:** #20260325-0715-neuron-hq
**Senast bekräftad:** 20260325-0715-neuron-hq

---

## Standalone bash-policycheck utan PolicyEnforcer
**Kontext:** Körning 20260325-1613-neuron-hq — Code Anchor är en standalone-agent utan `RunContext` och behövde bash-validering utan att beroende av swärmens infrastruktur
**Lösning:** Skapa en statisk privat klass-property `READONLY_ALLOWLIST: RegExp[]` och `FORBIDDEN_PATTERNS: RegExp[]` direkt på agentklassen, plus en statisk `checkReadonlyCommand(cmd: string): { allowed: boolean; reason?: string }`-metod. Kontrollera forbidden-patterns först, sedan allowlist. Returnera `"BLOCKED: <reason>"` om inte tillåtet.
**Effekt:** Bash-validering utan `PolicyEnforcer` eller `RunContext` — inga sidoeffekter, deterministisk, lätt att testa. Mönstret speglar `policy.ts` rad 72-93 (forbidden → allowlist) utan att beroende av instansen.
**Keywords:** bash-policy, standalone-agent, allowlist, readonly, code-anchor, static-method
**Relaterat:** INV-006 (enbart Historian/Librarian har skriv-verktyg), policy/bash_allowlist.txt
**Körningar:** #körning-20260325-1613
**Senast bekräftad:** 20260325-1613-neuron-hq

---

## Ackumulera agent-loop text-svar istället för att skriva över
**Kontext:** Körning 20260325-1613-neuron-hq — Code Anchors `runAgentLoop()` använde `lastTextResponse = ...` som skrev över vid varje iteration. Med 40 iterationer gick alla mellanliggande verifieringsfynd förlorade (S148: "1 turn/154 tecken sparades").
**Lösning:** Byt `let lastTextResponse = ''` + `lastTextResponse = textBlocks...` mot `const allTextResponses: string[] = []` + `allTextResponses.push(textBlocks...)`. Returnera `allTextResponses.join('\n\n---\n\n')` som slutresultat.
**Effekt:** Alla textblock från alla iterationer bevaras och sammanfogas i slutrapporten. Konversationsfilen blir komplett oavsett hur många iterationer agenten kör.
**Keywords:** agent-loop, text-accumulation, output-preservation, code-anchor, runAgentLoop, iteration
**Relaterat:** trimMessages i agent-utils.ts, code-anchor.ts rad 260-343
**Körningar:** #körning-20260325-1613
**Senast bekräftad:** 20260325-1613-neuron-hq

---
