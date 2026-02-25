# Errors — Misstag och lösningar

Dokumenterade fel, fallgropar och hur de löstes.
Appendas av Historian-agenten när problem identifieras.

---

## Context overflow i Tester-agenten
**Session:** 11
**Symptom:** Tester-agenten kraschade mitt i körningen
**Orsak:** Full pytest-output med coverage-rapport överskred context-fönstret
**Lösning:** Lade till `-q --cov-report=term` i tester-prompten + max 30 rader output
**Status:** ✅ Löst

---

## Git-commits hamnade i neuron-hq istället för workspace
**Session:** 11
**Symptom:** Alla commits från Implementer dök upp i neuron-hq git-historik
**Orsak:** `git commit` kördes utan att workspace hade eget git-repo
**Lösning:** Ny `initWorkspace()` i `src/core/git.ts` som init:ar separat repo i workspace
**Status:** ✅ Löst

---

## Implementer glömde git commit efter lyckade fixar
**Session:** 13-prep (körning 20260222-1457)
**Symptom:** ruff-fixar låg kvar som unstaged trots att testerna var gröna
**Orsak:** Ingen explicit checklista-steg för commit i Implementer-prompten
**Lösning:** Lägg till "git commit"-steg i Quality Checklist i `prompts/implementer.md`
**Status:** ✅ Löst (körning #8: explicit git commit-steg tillagt i implementer.md Quality Checklist)

---

## Researcher skapade inte knowledge.md
**Session:** 13-prep (körning 20260222-1457)
**Symptom:** knowledge.md saknades som körningsartefakt
**Orsak:** Researcher-prompten betonade ideas.md mer än knowledge.md
**Lösning:** Förtydliga att knowledge.md är obligatorisk i Researcher-prompten
**Status:** ✅ Löst (körning #8: Required Outputs-sektion tillagd i researcher.md med knowledge.md som mandatory)

---

## mcp-tools plugin stöder inte externa MCP-servrar
**Session:** 9
**Symptom:** aurora-swarm-lab MCP-server syntes inte i mcp-tools plugin
**Orsak:** mcp-tools v0.2.27 stöder bara inbyggda verktyg, inte externa servrar
**Lösning:** Obsidian-koppling sker via vault-watcher (frontmatter-kommandon) istället
**Status:** ✅ Dokumenterat, alternativ lösning implementerad

---

## Librarian smoke test producerade inga artefakter
**Session:** 20260222-1639-aurora-swarm-lab
**Symptom:** Endast brief.md skapades. Ingen report.md, questions.md eller merge_summary.md finns. Librarian-agenten verkar aldrig ha exekverats.
**Orsak:** Okänt — troligen delegerade orchestratorn aldrig till Librarian, eller så saknas Librarian-agenten i swarm-konfigurationen. Ingen audit.jsonl kontrollerad.
**Lösning:** Verifiera att Librarian-agenten är registrerad och tillgänglig i swarm-konfigurationen. Kontrollera audit.jsonl för eventuella felmeddelanden. Säkerställ att orchestratorn korrekt delegerar efter att brief skapats.
**Status:** ✅ Löst — audit.jsonl bekräftar att Librarian körde och skrev 8 poster till techniques.md. Felet berodde på felaktig diagnos (ingen audit.jsonl-kontroll).

---

## Manager söker Librarian-output i workspace istället för delat minne
**Session:** 20260222-1651-aurora-swarm-lab
**Symptom:** Manager hittade inte techniques.md i workspace efter lyckad Librarian-delegation, trots att Librarian korrekt skrev 9 entries till den delade memory/techniques.md
**Orsak:** Librarian skriver till den delade `memory/techniques.md` (via write_to_techniques), men Manager letade i workspace-katalogen `workspaces/.../aurora-swarm-lab/memory/techniques.md`
**Lösning:** Manager-prompten eller verifieringslogiken behöver uppdateras för att veta att Librarian-output hamnar i den delade memory-katalogen, inte i workspace. Alternativt bör Librarian-agenten returnera en sammanfattning av vad som skrevs så Manager inte behöver leta själv.
**Status:** ✅ Löst — körning #9 lade till explicit vägledning i prompts/manager.md om att Librarian-output hamnar i delat memory/, inte workspace. Se "Librarian-sökvägsproblem löst i manager.md" i samma fil.

---

## Run-artefakter skrivs till workspace men inte till runs-katalogen
**Session:** 20260222-1651-aurora-swarm-lab
**Symptom:** report.md och questions.md saknas i runs-katalogen, trots att Manager skrev dem till workspace
**Orsak:** Manager skrev artefakter (report.md, questions.md, ideas.md, knowledge.md) till workspace-katalogen men de kopierades aldrig till runs-katalogen. Historian kunde därför inte läsa dem.
**Lösning:** Orchestratorn eller Manager behöver kopiera run-artefakter (report.md, questions.md) till runs-katalogen efter körning, eller skriva direkt dit. Alternativt bör Historian kunna läsa från workspace-katalogen som fallback.
**Status:** ✅ Löst — session 21 exponerade runDir i manager.ts, uppdaterade manager.md med absolut sökväg, och lade till workspace-fallback i merger.ts. Se "Manager skriver answers.md till workspace istället för runs-katalogen" i samma fil.

---

## Manager duplicerar Researchers arbete
**Session:** 20260222-1757-aurora-swarm-lab
**Symptom:** Manager läste ~15 filer och körde ~10 bash-kommandon efter att Researcher redan slutfört identisk analys och levererat ideas.md med 10 förslag
**Orsak:** Manager verifierar inte bara att Researcher levererade korrekt — den upprepar hela analysen själv och skriver egna ideas.md/knowledge.md till workspace
**Lösning:** Manager-prompten bör instruera att (1) läsa Researchers ideas.md, (2) verifiera att den uppfyller briefens krav, (3) delegera vidare utan att upprepa analysen. Manager ska vara koordinator, inte utförare.
**Status:** ✅ Löst (körning #8: "After Researcher Completes"-sektion tillagd i manager.md med explicit "do NOT repeat analysis")

---

## Bash-kommentarer i Manager-kommandon triggar policyblockering
**Session:** 20260222-1757-aurora-swarm-lab
**Symptom:** Tre bash_exec-anrop från Manager blockerades med "BLOCKED: not in allowlist"
**Orsak:** Kommandon innehöll inledande `#`-kommentarer (t.ex. `# Check for type hints coverage\ngrep -rn ...`), vilket troligen inte matchade den tillåtna kommandomönsterlistan
**Lösning:** Agenter bör köra rena kommandon utan inbäddade kommentarer. Alternativt bör allowlisten uppdateras för att tillåta kommentarer i bash-kommandon.
**Status:** ✅ Löst (session 21: explicit "Never # comments" instruktion tillagd i prompts/manager.md)

---

## Implementer transform-skript blockeras av policy
**Session:** 20260222-2113-aurora-swarm-lab
**Symptom:** Implementer försökte skriva ett Python-transformskript till /tmp/transform.py — blockerades med "file write outside allowed scope". Försökte sedan köra inline Python via bash med heredoc (cat > /tmp/transform.py << 'PYEOF') — blockerades med "matches forbidden pattern". Även `rm` av hjälpfil blockerades.
**Orsak:** Säkerhetspolicyn tillåter bara write_file till workspace-katalogen och specifika runs-katalogen. /tmp och bash-kommandon med `.*`-liknande mönster (heredocs, backticks) blockeras.
**Lösning:** Implementer bör alltid skriva direkt till target-filen med write_file istället för att skapa hjälpskript. Om filen är stor, läs originalet först, gör ändringarna mentalt, och skriv hela filen i ett anrop.
**Status:** ✅ Löst (Implementer lyckades efter att byta strategi till direkt write_file)
**Keywords:** implementer, policy, write_file, transform-skript, bash-block, tmp
**Relaterat:** patterns.md#Implementer: direktskrivning slår transform-skript

---

## Brief med inaktuella ruff-fel
**Session:** 20260222-2253-aurora-swarm-lab
**Symptom:** Briefen specificerade 3 ruff-fel (E741 whisper_client:183, F841 main.py:308, F841 test_intake_youtube:33) men vid körning visade sig 2 av 3 (E741, F841 i main.py) redan vara fixade i repot. Istället fanns 8 andra fel (7× F401, 1× F841).
**Orsak:** Briefen baserades på analys från körning #4 (20260222-1316) utan att verifiera aktuellt tillstånd. Mellan körning #4 och #7 hade repot ändrats (troligen genom körning #4:s egna auto-fixar eller manuella ändringar).
**Lösning:** Kör alltid en baseline-verifiering (`ruff check .`, `pytest tests/ -x -q`) som del av brief-skapandet, inte bara vid körningens start. Briefen bör innehålla faktisk `ruff check`-output, inte cachade resultat från äldre körningar.
**Status:** ✅ Dokumenterat och löst — runbook-avsnitt tillagt i körning #9 (docs/runbook.md).
**Keywords:** brief, baseline, ruff, stale-data, inaktuell
**Relaterat:** patterns.md#Implementer anpassar sig till faktiskt repo-tillstånd vid inaktuell brief

---

## Merger git commit blockerat av backtick i commit-meddelande
**Session:** 20260222-2314-aurora-swarm-lab-resume
**Symptom:** Merger försökte köra `git commit -m "..."` med backtick-tecken i meddelandet (t.ex. `\`from pathlib import Path\``). Kommandot blockerades av säkerhetspolicyn med "BLOCKED: matches forbidden pattern: \`.*\`".
**Orsak:** Policyn tolkar backtick-tecken som potentiellt farliga (command substitution i bash). Merger använde backticks för att markera kodnamn i commit-meddelandet.
**Lösning:** Merger anpassade sig direkt — skrev om commit-meddelandet med enkla citattecken (`'from pathlib import Path'`) istället för backticks. Fungerade vid andra försöket.
**Status:** ✅ Löst
**Keywords:** merger, git-commit, policy, backtick, forbidden-pattern
**Relaterat:** errors.md#Implementer transform-skript blockeras av policy

---

## Manager skriver answers.md till workspace istället för runs-katalogen
**Session:** 20260223-0619-neuron-hq
**Symptom:** Merger delegerades tre gånger. Vid andra delegationen hittade Merger fortfarande inte answers.md i runs-katalogen trots att Manager hade skrivit "APPROVED" — filen låg i workspace-katalogen. Manager fick manuellt `cp` filen till runs-katalogen innan tredje delegationen lyckades.
**Orsak:** Manager använde `write_file` till workspace-sökvägen (`workspaces/.../neuron-hq/answers.md`) istället för runs-katalogen (`runs/20260223-.../answers.md`). Merger letar specifikt i runs-katalogen.
**Lösning:** Manager-prompten bör instruera att answers.md ska skrivas direkt till runs-katalogen, alternativt bör Merger även kontrollera workspace-katalogen som fallback. Detta är ett återkommande mönster — samma typ av sökvägsproblem dokumenterades i session 20260222-1651 (run-artefakter i workspace).
**Status:** ✅ Löst (session 21: manager.ts exponerar nu runDir, manager.md instruerar absolut sökväg, merger.ts fallback till workspace)
**Keywords:** manager, merger, answers.md, runs-katalog, workspace, sökväg
**Relaterat:** errors.md#Run-artefakter skrivs till workspace men inte till runs-katalogen

---

## Librarian-sökvägsproblem löst i manager.md
**Session:** 20260223-0700-neuron-hq
**Symptom:** Ursprungligt problem (session 20260222-1651): Manager sökte Librarian-output i workspace istället för delat minne
**Orsak:** Manager-prompten saknade information om att Librarian skriver till delat `memory/techniques.md`, inte workspace
**Lösning:** Körning #9 lade till explicit vägledning i `prompts/manager.md` (+4 rader) som förklarar att Librarian-output hamnar i delat minne och inte ska sökas i workspace
**Status:** ✅ Löst
**Keywords:** librarian, manager, sökväg, techniques.md, delat-minne
**Relaterat:** errors.md#Manager söker Librarian-output i workspace istället för delat minne

---

## Brief-baseline-rutin dokumenterad i runbook
**Session:** 20260223-0700-neuron-hq
**Symptom:** Ursprungligt problem (session 20260222-2253): Brief baserades på inaktuella data — ruff-fel som redan var fixade specificerades
**Orsak:** Ingen rutin för att köra baseline-verifiering vid brief-skapande, bara vid körningens start
**Lösning:** Körning #9 lade till `## Baseline-verifiering vid brief-skapande` i `docs/runbook.md` (+23 rader) med steg: (1) kör alltid baseline, (2) kopiera faktisk output, (3) datumstämpla
**Status:** ✅ Löst
**Keywords:** brief, baseline, runbook, stale-data, verifiering
**Relaterat:** errors.md#Brief med inaktuella ruff-fel

---

## Implementer committade bara testfil, inte implementeringsfiler
**Session:** 20260223-0927-neuron-hq
**Symptom:** Efter att Implementer körde `git add tests/agents/historian.test.ts && git commit`, låg `src/core/agents/historian.ts` och `prompts/historian.md` kvar som unstaged ändringar — bara testfilen committades
**Orsak:** Implementer körde `git add` på enbart testfilen (den senast redigerade) utan att inkludera de andra ändrade filerna. Troligen en följd av att Implementer delegerades i två omgångar — första omgången modifierade historian.ts och historian.md, andra omgången modifierade testerna och committade bara sitt eget arbete.
**Lösning:** Implementer bör alltid köra `git status` före commit för att verifiera att ALLA ändrade filer inkluderas. Alternativt: `git add -A` eller explicit `git add` med alla tre filnamn. Reviewer fångade problemet och Merger inkluderade alla filer i den slutliga commiten.
**Status:** ✅ Löst — Merger inkluderade alla 3 filer i commit 167e598
**Keywords:** implementer, git-commit, partiell-commit, unstaged
**Relaterat:** errors.md#Implementer glömde git commit efter lyckade fixar

---

## Librarian auto-trigger ignorerades av Manager
**Session:** 20260223-1117-neuron-hq
**Symptom:** Briefen specificerade `⚡ Auto-trigger: Librarian (körning #15 — var 5:e körning)` men Manager delegerade aldrig till Librarian. Audit.jsonl visar delegationer till Implementer, Tester, Reviewer, Merger och Historian — men ingen `delegate_to_librarian`.
**Orsak:** Manager-prompten har troligen inget stöd för att tolka auto-trigger-instruktioner i briefen. Manager fokuserar på den linjära pipeline-kedjan (Researcher → Implementer → Tester → Reviewer → Merger → Historian) och plockar inte upp extra delegationer som anges i briefens noteringar.
**Lösning:** Antingen (1) lägg till explicit stöd i Manager-prompten för `⚡ Auto-trigger`-sektioner i briefen, eller (2) gör Librarian-triggern till en egen numrerad uppgift i briefen (t.ex. "Uppgift 6 — Librarian: Sök arxiv") istället för en notering i slutet, eller (3) bygg in auto-trigger-logik i orchestratorn baserat på körningsnummer.
**Status:** ✅ Löst — I körning #16 visade det sig att Librarian faktiskt körde i #15 (audit.jsonl bekräftar), men Historian sökte i audit.jsonl för tidigt (innan Librarian hade delegerats). Grundorsaken var att manager.md instruerade Historian att köra FÖRE Librarian. Fixat genom att ändra delegationsordning i manager.md (Librarian före Historian) och lägga till guardrail i historian.md (använd read_memory_file istället för grep_audit). Commit 2c80e49.
**Keywords:** librarian, auto-trigger, manager, delegation, brief
**Relaterat:** errors.md#Librarian smoke test producerade inga artefakter, errors.md#Manager söker Librarian-output i workspace istället för delat minne

---

## Merger-agentens verifieringskommandon blockeras av policy
**Session:** 20260223-1620-neuron-hq
**Symptom:** Merger försökte köra `diff`, `md5` och `git hash-object` på target-repot via `bash_exec` och `bash_exec_in_target` — alla 6 anrop blockerades med "BLOCKED: not in allowlist"
**Orsak:** Merger vill verifiera att workspace-filer matchar target innan kopiering, men dessa kommandon finns inte i target-allowlisten. `diff` med absoluta sökvägar blockeras av `bash_exec`, och `md5`/`git hash-object` blockeras av `bash_exec_in_target`.
**Lösning:** Merger bör hoppa över pre-merge-verifiering och istället verifiera post-merge via `git diff HEAD~1..HEAD` i target (som redan fungerar). Alternativt: lägg till `diff`, `md5`, `git hash-object` i target-allowlisten.
**Status:** ✅ Löst — `diff` tillagd i `policy/bash_allowlist.txt` (commit 4dc2c33, körning #21). Workaround i `prompts/merger.md` med `wc -l`/`grep` (commit 9f68e1e, körning #20) kvarstår som fallback.
**Keywords:** merger, BLOCKED, allowlist, policy, diff, bash_exec_in_target
**Relaterat:**

---

## Upprepade NO-OP resume-körningar slösar resurser
**Session:** 20260224-0833-neuron-hq-resume (samt 20260223-2218, 20260223-2300, 20260224-0746)
**Symptom:** Resume-körningar startas trots att föregående körning redan har mergat allt till target. Hela körningen blir en NO-OP — ingen ny kod, inga nya filer, bara verifiering av redan existerande merge.
**Orsak:** Orchestratorn kontrollerar inte om original-körningens merge redan lyckades innan den startar en resume. Det saknas en tidig "already merged?"-guard.
**Lösning:** Lägg till en pre-flight check i orchestratorn: innan resume-körning startas, kör `git log --oneline -10` i target-repot och matcha mot briefens förväntade commit-meddelande. Om committen redan finns → avbryt körningen direkt med ett meddelande "Already merged in <commit>".
**Status:** ⚠️ Identifierat — ytterligare bekräftat i körning 20260225-0844-neuron-hq-resume (5:e NO-OP resume-körningen). Pre-flight merge-check saknas fortfarande i orchestratorn.
**Keywords:** resume, NO-OP, orchestrator, merge-check, redundant, token-waste
**Relaterat:** runs.md#Körning 20260223-2218-neuron-hq-resume, runs.md#Körning 20260223-2300-aurora-swarm-lab-resume

---

## Reviewer använder export PATH i bash-kommandon
**Session:** 20260224-0948-neuron-hq
**Symptom:** Reviewer fick 2 bash_exec-anrop blockerade med "BLOCKED: matches forbidden pattern: ^export\s+PATH=" när den försökte köra `export PATH="/opt/homebrew/opt/node@20/bin:$PATH" && npx tsc --noEmit` och liknande.
**Orsak:** Säkerhetspolicyn förbjuder `export PATH=...` i bash-kommandon — troligen för att förhindra PATH-manipulation. Reviewer kopierade mönstret från briefens manuella testscenario som innehöll `export PATH=...`.
**Lösning:** Reviewer (och alla agenter) bör köra kommandon direkt utan `export PATH=...`-prefix. Node-binärer finns redan i systemets PATH. Om node/npm-versioner behöver specifieras, använd absoluta sökvägar (`/opt/homebrew/opt/node@20/bin/npx ...`) istället.
**Status:** ⚠️ Identifierat
**Keywords:** reviewer, export-PATH, policy, BLOCKED, bash_exec, forbidden-pattern
**Relaterat:** errors.md#Merger git commit blockerat av backtick i commit-meddelande

---

## Reviewer-säkerhetsskanning blockeras av policy
**Session:** 20260225-0844-neuron-hq-resume
**Symptom:** Reviewer kör `git diff main | grep -iE '(eval|exec|rm -rf|...)'` som en säkerhetsskanning av diffen. Kommandot blockeras av policy eftersom strängen `rm -rf` matchar det förbjudna mönstret `\brm\s+.*-rf\b`, trots att kommandot bara söker efter mönstret — inte utför det.
**Orsak:** Policy-filtret matchar mot hela kommandosträngen inklusive grep-argument, inte bara den faktiska operationen.
**Lösning:** Reviewer bör undvika att inkludera `rm -rf` som en literal sträng i grep-kommandon. Alternativ: (1) dela upp i separata grep-anrop utan `rm -rf`, (2) använda `grep -c 'rm.*-rf'` med escape, eller (3) söka efter farliga mönster via `read_file` + manuell inspektion istället för bash grep.
**Status:** ⚠️ Identifierat
**Keywords:** reviewer, security-scan, policy-block, grep, rm-rf, forbidden-pattern
**Relaterat:** —

---
