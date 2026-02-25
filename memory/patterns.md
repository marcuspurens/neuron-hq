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
