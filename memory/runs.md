# Runs — Körningshistorik

Körningsdagbok för Neuron HQ. Appendas automatiskt efter varje körning av Historian-agenten.

## Körning 20260222-1457-aurora-swarm-lab — aurora-swarm-lab
**Datum:** 2026-02-22
**Uppgift:** Kör kodkvalitetsaudit (ruff + mypy + git status) på aurora-swarm-lab och auto-fixa lint-fel med ruff --fix.
**Resultat:** ⚠️ 4 av 6 acceptanskriterier klara — analys och fixar korrekta men leveransen ofullständig (ingen commit, saknade artefakter)

**Vad som fungerade:**
Researcher dokumenterade ruff (11 fel), mypy (103 fel i 32 filer) och git-status grundligt i `ideas.md`. Implementer körde `ruff --fix` korrekt på enbart app-kod (9 filer, 13 rader), revertade testfiler med `git checkout -- tests/`, och verifierade att alla 187 tester var gröna efteråt. Diffen var ren och mekanisk — enbart borttagning av oanvända imports.

**Vad som inte fungerade:**
Implementer skapade aldrig git-committen `style: auto-fix ruff lint errors` trots att briefen explicit krävde det — ändringarna ligger kvar som unstaged i working tree. `knowledge.md` skapades aldrig av Researcher. De 2 kvarstående icke-auto-fixbara ruff-felen (F841, E741) dokumenterades inte i `questions.md` av Implementer — Reviewer fick skapa den artefakten i efterhand. Ingen merge genomfördes.

**Lärdomar:**
- Implementer måste ha en explicit checklista-steg för git commit efter lyckade fixar — det är lätt att glömma "sista steget" när testerna är gröna.
- Researcher behöver tydligare instruktion att `knowledge.md` är en obligatorisk artefakt, inte bara `ideas.md`.
- När briefen säger "dokumentera kvarstående fel i questions.md" bör det finnas en verifikation (eller påminnelse) innan körningen går vidare till Review — annars faller dokumentationssteget bort.

---

## Körning 20260222-1639-aurora-swarm-lab — aurora-swarm-lab
**Datum:** 2026-02-22
**Uppgift:** Smoke-testa Librarian-agenten genom att söka arxiv på tre topics och skriva resultat till memory/techniques.md
**Resultat:** ❌ 0 av 4 uppgifter klara — Körningen producerade bara brief.md, inga andra artefakter genererades

**Vad som fungerade:**
Brief.md var välstrukturerad med tydliga acceptanskriterier och specificerade exakt vilka arxiv-sökningar som skulle göras. Uppgiften var väl avgränsad (smoke test, ingen kod, ingen merge).

**Vad som inte fungerade:**
Ingen report.md, questions.md eller merge_summary.md genererades. Librarian-agenten verkar aldrig ha körts — inga resultat skrevs till memory/techniques.md eller memory/runs.md. Hela exekveringskedjan efter brief-skapandet saknas.

**Lärdomar:**
- En brief utan efterföljande exekvering ger noll värde — orchestratorn måste verifiera att delegering faktiskt sker efter brief-skapande
- Smoke tests av nya agenter bör ha en fallback/logg om agenten inte svarar eller inte finns tillgänglig
- Avsaknad av report.md tyder på att Reviewer aldrig kördes, vilket i sin tur tyder på att ingen agent före Reviewer producerade output

---

## Körning 20260222-1651-aurora-swarm-lab — aurora-swarm-lab
**Datum:** 2026-02-22
**Uppgift:** Smoke-testa Librarian-agenten genom att söka arxiv på tre topics och skriva technique-entries till memory/techniques.md
**Resultat:** ✅ Alla uppgifter klara — Librarian sökte arxiv, skrev 13 nya technique-entries med korrekt format

**Vad som fungerade:**
Librarian-agenten fungerade som förväntat — sökte alla tre topics (`ti:agent+memory+LLM`, `ti:autonomous+software+agent`, `ti:context+window+management`) med både originalsökning och AND-formaterade sökningar (totalt 6 fetch-anrop per delegation). Sammanlagt 13 nya entries skrevs till `memory/techniques.md` över två delegationer (9 + 4), alla med titel, arxiv-källa, kärna och relevans. Librarian verifierade sina egna skrivningar genom att läsa tillbaka techniques.md efter varje omgång.

**Vad som inte fungerade:**
Manager delegerade till Librarian två gånger istället för en — första gången skrev Librarian korrekt till den delade `memory/techniques.md`, men Manager letade efter filen i workspace-katalogen och hittade den inte. Manager skapade då manuellt en workspace-kopia och delegerade igen. Ett `curl`-kommando blockerades av säkerhetspolicyn (forbidden pattern). Report.md och questions.md skrevs till workspace-katalogen men kopierades aldrig till runs-katalogen.

**Lärdomar:**
- Librarian skriver till den delade `memory/techniques.md`, inte workspace-lokalt — Manager behöver veta detta för att verifiera korrekt
- Dubbel delegation slösade tokens — 9 entries redan skrevs vid första omgången, andra omgången skrev 4 till (troligen efter dedup-check)
- Run-artefakter (report.md, questions.md) måste kopieras från workspace till runs-katalogen för att Historian ska kunna läsa dem

---

## Körning 20260222-1757-aurora-swarm-lab — aurora-swarm-lab
**Datum:** 2026-02-22
**Uppgift:** Analysera aurora-swarm-lab och lista förbättringsförslag utan kodändringar, sedan delegera till Librarian för arxiv-sökning kopplad till fynden.
**Resultat:** ✅ 3 av 3 acceptanskriterier klara — ideas.md med 10 förslag finns i runs-katalogen, techniques.md uppdaterades med 6 nya entries, inga kodändringar gjordes

**Vad som fungerade:**
Researcher genomförde en grundlig analys — läste ~20 filer och körde ~25 bash-kommandon för att kartlägga kodbasen (radräkning, grep efter mönster, test-coverage). Resulterade i en utmärkt `ideas.md` med 10 detaljerade förbättringsförslag inklusive tradeoffs och åtgärdsförslag. Librarian sökte arxiv framgångsrikt (6 fetch-anrop) och skrev 6 nya technique-entries till `memory/techniques.md` med korrekt format och relevans-koppling. Inga filer ändrades i target-repot (verifierat via `git status`).

**Vad som inte fungerade:**
Manager duplicerade arbete genom att själv läsa ~15 filer och köra ~10 bash-kommandon efter att Researcher redan slutfört sin analys — skrev sedan en egen `ideas.md` och `knowledge.md` till workspace-katalogen (inte runs). Tre bash-kommandon från Manager blockerades av säkerhetspolicyn (kommentarer i bash-kommandon triggade "not in allowlist"). Report.md och questions.md skrevs återigen till workspace istället för runs-katalogen — samma kända problem som förra körningen.

**Lärdomar:**
- Manager bör lita på Researchers leverabler istället för att upprepa samma analys — det slösade ~30% av körningens tokens
- Bash-kommandon med inledande `#`-kommentarer blockeras av policy — Manager behöver lära sig att köra rena kommandon utan inbäddade kommentarer
- Run-artefakter (report.md, questions.md) hamnar fortfarande i workspace — det identifierade problemet från session 20260222-1651 är fortfarande olöst

---

## Körning 20260222-1901-aurora-swarm-lab — aurora-swarm-lab
**Datum:** 2026-02-22
**Uppgift:** Skapa tests/conftest.py med delade fixtures och refaktorera 3 testfiler att använda dem
**Resultat:** ✅ 7 av 7 uppgifter klara — conftest.py skapad med 4 fixtures, 3 testfiler refaktorerade, alla 187 tester gröna, merge till main (commit c329934)

**Vad som fungerade:**
Hela svärm-pipelinen körde felfritt från research till merge: Researcher analyserade 54 testfiler och identifierade 4 upprepade boilerplate-mönster (POSTGRES_DSN/init_db, ARTIFACT_ROOT, INGEST_ALLOWLIST, MEMORY_ENABLED). Implementer skapade `tests/conftest.py` med 4 dokumenterade fixtures och refaktorerade exakt 3 testfiler (`test_queue.py`, `test_ingest_auto.py`, `test_retrieval_feedback.py`) — klokt nog behöll den `init_db` i `test_queue.py` för ett test med annorlunda DSN-konfiguration. Reviewer var extremt noggrann med baseline-verifiering (git stash/pop), AST-analys av docstrings, ruff, mypy och diff-granskning. Merger kopierade 4 filer och committade med en tydlig conventional-commit-meddelande. Nettoreduktion: −37 rader kod.

**Vad som inte fungerade:**
Inga kända problem. Manager duplicerade viss research (läste testfiler och körde grep-analyser efter att Researcher redan gjort det), vilket är ett återkommande mönster — men det påverkade inte slutresultatet.

**Lärdomar:**
- Första körningen med komplett pipeline (Research → Implement → Test → Review → Merge) utan blockers — bevisar att svärmen fungerar end-to-end för avgränsade refaktoreringsuppgifter
- Implementer fixade ett importfel i `test_ingest_auto.py` (saknad `Path`-import) på egen hand efter att ha kört testerna lokalt — iterativ verifiering innan delegering vidare fungerar
- Reviewer-tekniken att göra `git stash` → köra baseline-tester → `git stash pop` → köra tester igen ger pålitlig before/after-jämförelse

---

## Körning 20260222-2113-aurora-swarm-lab — aurora-swarm-lab
**Datum:** 2026-02-22
**Uppgift:** Refaktorera tests/test_mcp_server.py (813 rader, 34 tester) att använda conftest.py-fixtures istället för upprepad boilerplate
**Resultat:** ✅ 7 av 7 uppgifter klara — 28 tester använder nu `db`-fixture, 111 rader borttagna netto, alla 187 tester gröna, merge till main (commit e65bf57)

**Vad som fungerade:**
Hela pipeline-kedjan (Research → Implement → Test → Review → Merge) körde komplett utan blockers, andra körningen i rad med felfri end-to-end. Researcher kategoriserade alla 34 tester i fixture-grupper (A: no fixtures, B: db-only, C: db+extra env, D: db+artifact_root, E: db+ingest_allowlist, F: db+obsidian) med detaljerade Python-analyser. Implementer levererade en ren mekanisk refaktorering — 28 tester ersatte 3-raders db-boilerplate med `db`-fixture, 2 tester använder `artifact_root`, 3 använder `ingest_allowlist`, import av `init_db` borttagen. Reviewer verifierade alla 8 acceptanskriterier med konkreta kommandon (grep, git diff --numstat, ruff, mypy, baseline git stash-jämförelse).

**Vad som inte fungerade:**
Manager duplicerade Researchers arbete igen — körde ~10 egna bash-analyser (grep, python-kategorisering) efter att Researcher redan slutfört sin kartläggning. Implementer hade problem med sin första approach: en transform-script-strategi blockerades av policy (write_file utanför scope, bash-kommandon med backtick-mönster) och krävde git checkout + fullständig omskrivning av hela filen. Totalt 2 bash-kommandon från Researcher och 2 från Implementer blockerades av säkerhetspolicyn.

**Lärdomar:**
- Implementer bör skriva filen direkt istället för att skapa transform-skript — write_file till target-filen fungerar alltid, men hjälpskript blockeras ofta av policy
- Manager-duplicering av Researcher-arbete är ett ihållande mönster (dokumenterat i 3 av 6 körningar) — behöver arkitekturell lösning, inte bara påminnelse
- Conftest-fixture-refaktorering av test_mcp_server.py var en naturlig uppföljning till körning 20260222-1901 — briefen var utmärkt på att specificera exakt vilka tester som behövde vilka fixtures, vilket gjorde implementeringen mekanisk och förutsägbar

---

## Körning 20260222-2253-aurora-swarm-lab — aurora-swarm-lab
**Datum:** 2026-02-22
**Uppgift:** Fixa kvarstående ruff-fel (3 specificerade), lägg till `[tool.ruff]` i pyproject.toml, och kör testcoverage-rapport
**Resultat:** ✅ 5 av 5 acceptanskriterier klara — ruff passerar utan fel, 187 tester gröna, ruff-config tillagd, coverage-rapport skapad (75%)

**Vad som fungerade:**
Implementern upptäckte att 2 av 3 specificerade ruff-fel (E741 i whisper_client.py, F841 i main.py) redan var fixade i repot sedan tidigare, och anpassade sig korrekt genom att istället fixa de 8 faktiska felen (7× F401 oanvända imports i testfiler, 1× F841 i test_intake_youtube.py). Ruff-konfigurationen i pyproject.toml inkluderade pragmatiska ignores för E501 (107 fel) och I001 (75 fel) med TODO-kommentarer — väldokumenterat i questions.md och knowledge.md. Hela pipelinen (Research → Implement → Test → Review → Merge-plan) körde komplett. Reviewer verifierade alla 9 individuella kriterier med konkreta kommandon och git-diff-analys (86 rader total, 16 rader faktisk kodändring).

**Vad som inte fungerade:**
Briefen var delvis inaktuell — 2 av 3 specificerade ruff-fel existerade inte längre i repot (troligen fixade i körning #4). Implementern behövde köra `ruff --fix` först för att ta de auto-fixbara felen, sedan manuellt fixa den kvarvarande F841. Manager delegerade till Merger två gånger — andra gången berodde troligen på att `answers.md` saknades vid första delegationen. Två bash-kommandon från Merger blockerades av policy (diff-kommandon mellan workspace och target). Coverage-rapporten skapades i workspace-katalogen (`runs/20260222-.../coverage_report.md`) snarare än direkt i runs-artefaktkatalogen.

**Lärdomar:**
- Brief bör bygga på färsk baseline — kör `ruff check .` direkt innan brief-skapande för att undvika att specificera redan fixade fel
- Ruff-konfiguration med `select = ["E", "F", "W", "I"]` kan trigga hundratals nya fel — ignore-listan behöver planeras i förväg eller läggas till iterativt
- Implementer som anpassar sig till verkligt repo-tillstånd istället för att slaviskt följa en inaktuell brief producerar bättre resultat — flexibiliteten var avgörande här

---

## Körning 20260222-2314-aurora-swarm-lab-resume — aurora-swarm-lab
**Datum:** 2026-02-22
**Uppgift:** Återuppta körning 20260222-2253 för att granska och merga ruff-fixar, ruff-konfiguration och coverage-rapport till aurora-swarm-lab
**Resultat:** ✅ 5 av 5 uppgifter klara — Review godkänd, merge genomförd (commit 99f0168), alla verifieringar gröna

**Vad som fungerade:**
Resume-flödet fungerade smidigt — Manager identifierade att all implementation redan var klar i workspace och hoppade direkt till Review + Merge utan att delegera till Researcher eller Implementer. Reviewer var extremt grundlig: verifierade alla 9 individuella acceptanskriterier med konkreta kommandon, körde säkerhetsskanning av diffen, bekräftade att 2 av 3 briefens specificerade ruff-fel redan var fixade i tidigare körningar. Merger kopierade 8 filer (pyproject.toml + 7 testfiler, totalt 9 insertions/7 deletions) och committade med tydligt conventional-commit-meddelande. Manager körde post-merge-verifiering i target-repot: `ruff check .` → "All checks passed!", `pytest` → 187 passed.

**Vad som inte fungerade:**
Merger fick ett `git commit`-kommando blockerat av policy — commit-meddelandet innehöll backtick-tecken (`\``) som matchade förbjudna mönster. Merger anpassade sig direkt genom att byta till enkla citattecken och lyckades vid andra försöket. Utöver detta inga problem.

**Lärdomar:**
- Resume-körningar som enbart gör Review + Merge är effektiva — ingen duplicering av research/implementation, ren verifierings- och leveranskedja
- Merger bör undvika backtick-tecken i git commit-meddelanden — enkla citattecken och vanlig text fungerar alltid
- Post-merge-verifiering i target-repot (inte bara workspace) ger sista-instans-bekräftelse att merge var korrekt

---

## Körning 20260223-0619-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Self-hosting: åtgärda tre dokumenterade promptproblem (researcher.md, manager.md, implementer.md) och lägga till enhetstester för truncateToolResult och trimMessages
**Resultat:** ✅ 6 av 6 acceptanskriterier klara — alla promptfixer levererade, 11 nya tester (164 totalt), merge till main (commit 08596bc)

**Vad som fungerade:**
Första self-hosting-körningen — svärmen riktades mot sin egen kodbas för att fixa dokumenterade fel från errors.md. Manager hoppade smart över Researcher och delegerade direkt till Implementer eftersom briefen var tillräckligt prescriptiv. Implementer levererade alla 4 ändringar (3 promptfiler + testfil, 124 rader diff) och verifierade med tsc och npm test. Reviewer var extremt grundlig — verifierade varje acceptanskriterium med grep-kommandon, bekräftade att inga förbjudna filer ändrats, och godkände med LOW risk. Tester verifierade 164/164 gröna. Alla tre dokumenterade errors (knowledge.md saknas, Manager duplicering, Implementer glömmer commit) åtgärdades direkt i prompterna.

**Vad som inte fungerade:**
Merger delegerades tre gånger. Första gången skrev Merger merge_plan.md och väntade på answers.md — men Manager hade skrivit answers.md till workspace-katalogen, inte runs-katalogen. Manager behövde manuellt kopiera filen med `cp`. Merger hade också 4 bash-kommandon blockerade av policy (diff och md5 mot target) vid första delegationen, och ytterligare 3 md5-kommandon blockerade vid andra. Ändringarna låg kvar som unstaged i workspace — ironiskt nog exakt det problem som uppgift 3 adresserade för framtida körningar.

**Lärdomar:**
- Self-hosting fungerar — svärmen kan framgångsrikt modifiera sina egna promptfiler och tester, vilket stänger feedback-loopen från errors.md
- Manager bör skriva answers.md direkt till runs-katalogen (inte workspace) — Merger letar efter den i runs-katalogen
- Att hoppa över Researcher vid prescriptiva briefs sparar tokens och tid utan kvalitetsförlust

---

## Körning 20260223-0700-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Åtgärda Librarian-sökvägsproblem i manager.md, lägga till baseline-verifieringsavsnitt i runbook.md, och skapa runDir-tester i manager.test.ts
**Resultat:** ✅ 5 av 5 acceptanskriterier klara — alla dokumentfixar och tester levererade, merge till main (commit 0ef6cc0)

**Vad som fungerade:**
Hela pipeline-kedjan (Researcher → Implementer → Tester → Reviewer → Merger) körde komplett utan blockers. Researcher var grundlig — analyserade ~20 filer och identifierade exakt vad som behövde ändras i varje fil, levererade detaljerad ideas.md och knowledge.md. Implementer levererade alla tre ändringar (manager.md +4 rader Librarian-vägledning, runbook.md +23 rader baseline-avsnitt, manager.test.ts +3 nya tester) och verifierade med tsc + vitest. Manager städade bort en engångs-hjälpskript (`scripts/insert_runbook_section.py`) som Implementer skapat för att infoga runbook-avsnittet. Reviewer verifierade alla 5 acceptanskriterier och godkände med LOW risk. 169 tester gröna (baseline 166, +3 nya).

**Vad som inte fungerade:**
Merger fick 3 `diff`-kommandon och 1 `md5`-kommando blockerade av policyn vid första delegationen — samma mönster som i tidigare körningar. Merger arbetade runt problemet genom att använda `git diff` inom workspace istället. Utöver detta inga problem. Implementer skapade ett Python-hjälpskript för att infoga text i runbook.md, vilket är onödigt och kräver manuell städning — bättre att skriva hela filen direkt.

**Lärdomar:**
- Denna körning stänger feedback-loopen för två ⚠️-entries i errors.md (Librarian-sökvägsproblem och brief-baseline) — self-hosting-modellen fungerar för att systematiskt åtgärda dokumenterade problem
- Merger bör använda `git diff` inom workspace-repo istället för `diff` mellan workspace och target — det senare blockeras alltid av policyn
- Implementer bör undvika att skapa engångshjälpskript — skriv filen direkt med write_file istället, annars krävs manuell städning efteråt

---

## Körning 20260223-0728-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Stäng två falska ⚠️-larm i errors.md (Librarian smoke test + brief-baseline) och lägg till ett Librarian integration-test
**Resultat:** ✅ 7 av 7 uppgifter klara — båda falska larm stängda, integration-test tillagt, 170/170 tester gröna, merge till main (commit c416326)

**Vad som fungerade:**
Hela pipelinen (Researcher → Implementer → Tester → Reviewer → Merger) körde komplett utan blockers. Researcher var grundlig — verifierade audit.jsonl från två tidigare körningar, räknade 8 `write_to_techniques`-anrop och 35 technique-entries, och levererade detaljerad knowledge.md och ideas.md med rekommendationer. Implementer uppdaterade exakt de två rätta ⚠️-posterna i errors.md (rad 58 och 114) till ✅ utan att skapa dubblettposter, och la till `describe('integration: full write flow')` i librarian.test.ts. Reviewer verifierade alla 5 acceptanskriterier med grep, npm test (170/170), tsc --noEmit, och git-logg — godkände med LOW risk. Diff var minimal: 24 rader, 2 filer.

**Vad som inte fungerade:**
Merger hade 4 bash-kommandon blockerade av policyn (diff och md5 mellan workspace och target) vid första delegationen — samma återkommande mönster som i alla tidigare körningar. Merger löste det genom att använda git-kommandon inom workspace istället. Utöver detta inga problem.

**Lärdomar:**
- Audit.jsonl är den pålitliga sanningskällan för vad som faktiskt hände i en körning — Historian/Researcher bör alltid granska den innan ⚠️-poster skapas i errors.md
- Att uppdatera befintliga errors.md-poster in-place (ändra Status-rad) istället för att appenda nya dubblettposter kräver att Implementer skriver hela filen med write_file — fungerade korrekt denna gång
- Tvåfas-Merger-mönstret (merge_plan.md → answers.md → execute) fungerade smidigt med Manager som skrev APPROVED direkt till answers.md

---

## Körning 20260223-0927-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Lägga till `grep_audit`-verktyg i Historian-agenten för effektiv sökning i audit.jsonl istället för att läsa hela filen
**Resultat:** ✅ 10 av 10 acceptanskriterier klara — grep_audit implementerat, prompten uppdaterad, 5 nya tester, 189/189 gröna, merge till main (commit 167e598)

**Vad som fungerade:**
Hela pipeline-kedjan (Implementer → Tester → Reviewer → Merger) körde komplett. Manager hoppade smart över Researcher eftersom briefen var fullt prescriptiv med exakt kod att infoga. Implementer levererade alla tre filerna (`historian.ts` med tool definition + method + switch case, `historian.md` med uppdaterad Tools-sektion och punkt 1, `historian.test.ts` med 5 nya tester + 1 defineTools-assertion). 189/189 tester gröna, 0 TypeScript-fel. Reviewer var extremt noggrann — verifierade alla 10 acceptanskriterier individuellt med grep-kommandon och identifierade att implementeringsfilerna inte var committade i workspace (bara testerna). Merger kopierade alla 3 filer till target och skapade en samlad commit (121 insertions, 1 deletion).

**Vad som inte fungerade:**
Implementer committade bara testfilen (`historian.test.ts`) men inte implementeringsfilerna (`historian.ts`, `historian.md`) — de låg kvar som unstaged working directory-ändringar. Reviewer fångade detta och flaggade det som CONDITIONAL PASS. Implementer hade också en `sed -i`-kommando blockerad av policy (forbidden pattern med backtick-escape i flerradigt sed-kommando) och behövde skapa Python-hjälpskript (`scripts/add_grep_audit_method.py`, `fix_backticks.py`, `fix_template_literals.py`, `fix_template_literals2.py`) som workaround — totalt 4 hjälpskript för att korrekt infoga metoden. Baseline-verifieringen i `baseline.md` använde `pnpm` istället för `npm`, men Reviewer verifierade manuellt med korrekt pakethanterare.

**Lärdomar:**
- Implementer committade bara en av tre filer trots att alla var modifierade — git add/commit-steget behöver explicit inkludera ALLA ändrade filer, inte bara den senast redigerade
- Python-hjälpskript som workaround för blockerade sed-kommandon fungerar men skapar onödig komplexitet (4 skript för en metodinfogning) — direktskrivning med write_file av hela filen hade varit enklare
- Reviewer-kvaliteten var hög — identifierade commit-problemet och gav Merger tydliga instruktioner, vilket räddade körningen

---

## Körning 20260223-1016-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Uppdatera `prompts/implementer.md` med tre tillförlitlighetsförbättringar: explicit `git status`-kontroll före commit, iteration-budget-nödbroms (>40 iterationer), och checklista-rad för staging-verifiering. Plus lint-tester som verifierar att instruktionerna finns i prompten.
**Resultat:** ✅ 7 av 7 uppgifter klara — alla acceptanskriterier uppfyllda, 194/194 tester gröna, merge till main (commit 0104ee2)

**Vad som fungerade:**
Hela pipeline-kedjan körde felfritt (Manager → Implementer → Reviewer → Merger). Manager hoppade smart över Researcher eftersom briefen var fullt prescriptiv. Implementer levererade exakt det som specificerades — `prompts/implementer.md` uppdaterad med git status-kontroll (steg 3), iteration-budget (steg 8), och checklista-rad (+10/-1 rader), plus ny testfil `tests/prompts/implementer-lint.test.ts` med 5 regex-tester (+27 rader). Implementer körde dessutom `git add -A && git status` före commit — alltså precis det beteende som prompten nu instruerar. Reviewer verifierade alla 7 kriterier med specifika grep-kommandon och godkände utan anmärkningar.

**Vad som inte fungerade:**
Inga kända problem. Merger fick två `bash_exec_in_target`-anrop blockerade (test -f med `&&`/`||` mönster) men arbetade runt det genom att använda `bash_exec` direkt mot workspace istället. Minimal påverkan på resultatet.

**Lärdomar:**
- Prompt-lint-tester (regex mot markdown-filer) är ett effektivt nytt testmönster för att säkerställa att kritiska instruktioner inte tas bort av misstag i framtida prompt-ändringar.
- Self-hosting-cykeln fungerar väl: errors.md från körning #13 → brief → prompt-fix → tester → commit. Feedback-loopen stängs på ett par körningar.
- Prescriptiva briefs med exakt kod att infoga gör att Researcher kan hoppas över, vilket sparar iterationer och minskar risken för avvikelser.

---

## Körning 20260223-1117-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Lägg till prompt-lint-tester för merger.md, historian.md och manager.md (15 nya tester totalt) samt förstärk steg 3 i historian.md med search-before-write-guardrail.
**Resultat:** ✅ 8 av 8 acceptanskriterier klara — alla lint-tester skapade, historian.md uppdaterad, 209 tester gröna, merge till main (commit 8679a3a)

**Vad som fungerade:**
Hela pipeline-kedjan (Manager → Implementer → Tester → Reviewer → Merger) körde smidigt. Implementer levererade exakt det som briefen specificerade: +4 rader i historian.md (search_memory-kall + ⚠️/ny post-logik) plus tre nya testfiler (merger-lint, historian-lint, manager-lint) med 5 tester var. Reviewer verifierade alla 8 kriterier med specifika grep-kommandon och godkände utan anmärkningar. Merge gick igenom på andra försöket (commit 8679a3a, 87 insertions). Testsviten ökade från 194 → 209 tester.

**Vad som inte fungerade:**
Briefen specificerade `⚡ Auto-trigger: Librarian (körning #15 — var 5:e körning)` men Manager delegerade aldrig till Librarian. Audit.jsonl visar inga librarian-relaterade anrop alls. Merger fick ett `diff`-kommando blockerat av policy (BLOCKED: not in allowlist) men arbetade runt det.

**Lärdomar:**
- Auto-trigger-instruktioner i briefen (`⚡ Auto-trigger: Librarian`) behöver starkare formulering eller stöd i Manager-prompten — Manager ignorerade instruktionen helt
- Prompt-lint-testmönstret skalas bra: tre nya filer à 28 rader var, alla gröna på första försöket, copy-paste-struktur med filspecifika regex
- Search-before-write-guardrail i historian.md är nu skyddad av lint-test som verifierar att `search_memory`, `update_error_status` och `duplikat`-varning finns kvar

---

## Körning #16 — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Fixa timing-problem där Historian kördes före Librarian och inte kunde verifiera dess arbete — ändra delegationsordning i manager.md och lägg till guardrail i historian.md
**Resultat:** ✅ 7 av 7 acceptanskriterier klara — alla promptändringar genomförda, tester gröna, merge klar

**Vad som fungerade:**
Implementer ändrade `prompts/manager.md` (delegationsordning: Librarian före Historian) och `prompts/historian.md` (guardrail: `read_memory_file` som primärkälla istället för `grep_audit`). Reviewer verifierade alla 7 kriterier med grep och testkörningar. Merger applicerade commit `2c80e49` till main med 2 filer (13 insertions, 3 deletions). Alla 236 tester gröna, 0 tsc-errors.

**Vad som inte fungerade:**
Implementer fick ett BLOCKED-anrop tidigt (python3-script via `bash_exec` blockades av policy) men återhämtade sig med sed-kommandon istället. En extra fil `scripts/update_prompts.py` inkluderades i workspace-committen men filtrerades bort vid merge (bara manager.md och historian.md kopierades). Inga allvarliga problem.

**Lärdomar:**
- Prescriptive briefs med exakta text-till-text-ersättningar gör reviewer-verifiering enkel och pålitlig
- Policy-blockering av python3-inline-scripts tvingar implementer att använda sed, vilket faktiskt ger mer spårbara ändringar
- Tidsberoenden mellan agenter (Historian→Librarian) måste dokumenteras explicit i prompt-ordningen — implicit ordning leder till race conditions

---

## Körning 20260223-1322-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Skapa prompt-lint-tester för researcher.md, reviewer.md och tester.md (5 tester vardera, totalt 15 nya tester)
**Resultat:** ✅ 7 av 7 uppgifter klara — alla acceptanskriterier uppfyllda, 251/251 tester gröna, merge till main (commit 0a1b859)

**Vad som fungerade:**
Hela pipeline-kedjan (Manager → Implementer → Tester → Reviewer → Merger → Historian) körde framgångsrikt. Implementer skapade alla tre testfiler exakt som specificerat i briefen. Reviewer verifierade varje acceptanskriterium individuellt med specifika kommandon — körde lint-testerna var för sig (5+5+5=15 passed), full testsvit (251 gröna), och TypeScript-kompilering (0 errors). Merger kopierade och committade alla tre filer korrekt.

**Vad som inte fungerade:**
Merger fick 8 bash-kommandon blockerade under första delegationen (diff och md5 med `&&`-mönster — samma kända policy-begränsning som dokumenterats tidigare). Merger delegerades en andra gång och lyckades då genom att arbeta runt blockeringarna. Minimal påverkan — bara ett extra delegationsanrop.

**Lärdomar:**
- Prescriptiva briefs med exakt testkod ger konsekvent bra resultat — Implementer behöver inte tolka eller designa, bara skapa filerna.
- Prompt-lint-mönstret (regex mot markdown) skalas väl: nu 28 testfiler totalt med lint-tester för 6 av 6 agentpromptar (implementer, merger, historian, manager, researcher, reviewer, tester).
- Merger-policyn blockerar fortfarande `diff` och `&&`-kommandon — detta är ett känt mönster men orsakar en extra delegationsrunda varje gång.

---

## Körning 20260223-1348-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Lägg till negativa regressionstester i alla 7 prompt-lint-testfiler och skapa en meta-testfil (`coverage.test.ts`) som vaktar att alla promptfiler har motsvarande lint-tester.
**Resultat:** ✅ 11 av 11 acceptanskriterier klara — alla negativa tester, coverage-test, gröna tester (267 st), TypeScript rent, och merge genomförd

**Vad som fungerade:**
Implementer följde briefens mönster exakt — lade till `replaceAll`-baserade regressionstester i alla 7 befintliga lint-filer och skapade `coverage.test.ts` med 3 tester. Dessutom identifierade Implementer proaktivt att `prompts/librarian.md` saknade lint-test, vilket skulle gjort coverage-testet rött, och skapade `librarian-lint.test.ts` (32 rader, 6 tester) som bonus. Reviewer verifierade alla 11 kriterier med `grep -c`, `npm test` (267 passed), och `npx tsc --noEmit` (0 errors). Merger kopierade 9 filer (100 insertions, 0 deletions) till target och committade som `5e6808a`.

**Vad som inte fungerade:**
Inga kända problem. Inga blockers, inga policy-blockeringar, inga felaktiga filer. En mindre avvikelse: historian-lint-testets negativa test använde `grep_audit` istället för briefens förslag `errors.md` — men Reviewer bedömde detta som korrekt eftersom `grep_audit` är ett mer unikt/kritiskt nyckelord i historian-prompten.

**Lärdomar:**
- Meta-tester (coverage.test.ts) som vaktar att varje promptfil har en lint-test avslöjar luckor omedelbart — Implementer tvingades skapa librarian-lint.test.ts för att coverage-testet skulle bli grönt
- Negativa regressionstester med `.replaceAll()` + `.not.toMatch()` är ett billigt och effektivt sätt att verifiera att lint-regex:ar inte är trivialt breda
- Prescriptive briefs med exakt kodskelett och nyckelord per fil ger snabba, felfria körningar — hela implementationen gick utan iteration eller omstart

---

## Körning 20260223-1509-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Skapa `memory/invariants.md` med 3 strukturinvarianter, uppdatera historian.md med invariants-steg, lägga till `Körningar:`-metadata i patterns.md, och skapa `invariants-lint.test.ts` med 4 tester.
**Resultat:** ✅ 7 av 7 acceptanskriterier klara — alla filer skapade/uppdaterade, 271/271 tester gröna, merge till main (commit 281063c)

**Vad som fungerade:**
Hela pipeline-kedjan körde komplett och felfritt. Implementer levererade alla 4 filändringar exakt enligt brief: `memory/invariants.md` (27 rader, 3 INV-poster), `prompts/historian.md` (+10 rader: steg 5 + invariants i Tools), `memory/patterns.md` (+16 Körningar-rader), och `tests/memory/invariants-lint.test.ts` (36 rader, 4 tester). Reviewer verifierade alla 7 kriterier — npm test (271 gröna = 267 befintliga + 4 nya), tsc --noEmit (0 errors), och korrekt format i invariants.md. Merger kopierade och committade 4 filer (125 insertions, 4 deletions) utan problem.

**Vad som inte fungerade:**
Merger fick 4 `diff`-kommandon blockerade av policyn (diff mellan workspace och target, samma återkommande mönster). Merger arbetade runt det genom alternativa verifieringsmetoder. Minimal påverkan — inget extra delegationsanrop krävdes denna gång.

**Lärdomar:**
- Invariants.md formaliserar implicita strukturkrav som tidigare bara levde i test-assertions — gör dem synliga för alla agenter och sökbara via memory-systemet
- Att lägga till metadata (`Körningar:`-fält) retroaktivt i patterns.md kräver korrekta körningsnummer — briefen löste detta genom att mappa varje mönster till sin upphovskörning, med `#?` som fallback för oklara nummer
- Minnesförbättrings-körningar (inga src/-ändringar) är snabba och lågrisk — 89 rader totalt, ren leverans utan iteration

---

## Körning 20260223-1620-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Förbättra kodkvaliteten i `src/core/run.ts` genom att extrahera gemensam init-logik, lägga till `getTimeRemainingMs()`, och samla skip-mönster i `copyDirectory()`
**Resultat:** ✅ 6 av 6 acceptanskriterier klara — alla refaktoriseringar genomförda, 276 tester gröna, mergad till main

**Vad som fungerade:**
Fullständig pipeline Researcher → Implementer → Reviewer → Merger kördes utan blockerare. Researcher analyserade `run.ts`, `run.test.ts` och `types.ts` grundligt med ~15 grep/bash-kommandon för att kartlägga beroenden innan den bekräftade approach. Implementer levererade alla tre förbättringar i en ren commit (+82/-25 rader): `_buildContext()` helper som eliminerade DRY-violation, `getTimeRemainingMs(ctx)` med delegation från `isTimeExpired()`, och `COPY_SKIP_DIRS` som `ReadonlySet<string>`. Reviewer verifierade varje kriterium individuellt (grep efter duplicering, funktioner, konstanter) och körde `npm test` (276 pass) + `tsc --noEmit` (0 errors). Merger kopierade 2 filer och committade som `d1cb316`.

**Vad som inte fungerade:**
Merger fick 6 blockerade bash-kommandon (`diff`, `md5`, `git hash-object` på target) som inte fanns i allowlisten. Merger ville verifiera filintegritet innan merge men fick arbeta runt blockeringarna. Påverkade inte slutresultatet men indikerar att Merger-agentens verifieringsstrategi inte är fullt anpassad till säkerhetspolicyn.

**Lärdomar:**
- Researcher-first-strategi med grundlig beroende-analys (grep efter alla anrop till funktioner som ska refaktoriseras) ger Implementer tydliga instruktioner och minskar risken för oväntade bieffekter
- Ren intern refaktorisering av en enda fil med befintliga tester är en idealisk uppgift för swarm-pipelinen — låg risk, tydliga kriterier, snabb verifiering
- Merger bör använda `cp` + `git commit` direkt istället för att först köra `diff`/`md5` på target (dessa blockeras av policy) — verifiering kan ske efter commit via `git diff`

---

## Körning 20260223-2150-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Lägg till `diff` i `policy/bash_allowlist.txt` så Merger kan använda det för filverifiering, plus nytt test i `policy.test.ts`
**Resultat:** ✅ 5 av 5 acceptanskriterier klara — `diff` tillagd i allowlist, test skapat, 277 tester gröna, tsc rent, merge till main (commit 4dc2c33)

**Vad som fungerade:**
Hela pipeline-kedjan (Manager → Implementer → Tester → Reviewer → Merger → Librarian → Historian) körde komplett. Manager hoppade smart över Researcher då briefen var fullt prescriptiv (2-raders ändring + 1 test). Implementer la till `^diff(\s|$)` under "Read operations" i allowlisten och skapade `should allow diff command`-testet — totalt 5 rader i 2 filer. Reviewer verifierade alla 5 kriterier med grep, npm test (277 gröna), tsc --noEmit (0 errors) och git log. Merger kopierade och committade utan blockeringar — notabelt att inga `diff`-kommandon blockerades denna gång, troligen tack vare alternativa verifieringsmetoder (wc -l, git log).

**Vad som inte fungerade:**
Inga kända problem. Merger delegerades två gånger (första gången för merge_plan.md, andra gången för exekvering efter APPROVED) men detta är det förväntade tvåfas-mönstret. Inga policy-blockeringar, inga felaktiga filer, inga iterationer.

**Lärdomar:**
- Denna körning stänger det permanenta fixet för Merger-policyproblemet som dokumenterats sedan körning #20 — `diff` i allowlisten eliminerar behovet av workarounds
- Prescriptiva briefs med exakt regex och teststruktur ger konsekvent snabba, felfria körningar — inga tolkningsproblem
- Minimal ändring (5 rader, 2 filer) = minimal risk — LOW-bedömningen bekräftades av full testsvit utan regressioner

---

## Körning 20260223-2209-neuron-hq — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Lägg till 3 nya prompt-lint-tester i `merger-lint.test.ts` som vaktar nytt innehåll i merger.md (diff-verifiering, `git diff HEAD~1`, `MERGER_PLAN_READY`).
**Resultat:** ✅ 7 av 7 acceptanskriterier klara — alla 3 tester skapade, 280/280 tester gröna, tsc rent, merge till main (commit ace7fcf)

**Vad som fungerade:**
Hela pipeline-kedjan (Manager → Implementer → Reviewer → Merger) körde komplett utan blockers. Manager hoppade smart över Researcher eftersom briefen var fullt prescriptiv med exakta testnamn och regex-mönster. Implementer levererade alla 3 tester (12 rader tillagda i en enda fil) med `expect(prompt).toMatch()` mot rätt regex, verifierade med tsc + npm test, och committade med `git add -A` före commit. Reviewer var extremt grundlig — verifierade alla 7 acceptanskriterier individuellt med grep-kommandon, npm test (280 passed), tsc --noEmit (0 errors), och bekräftade att bara `merger-lint.test.ts` ändrats med `git diff HEAD~1 --name-only`. Merger kopierade och committade till main utan policyblockering.

**Vad som inte fungerade:**
Inga kända problem. Inga policy-blockeringar, inga extra delegationsrundor, inga iterationer. Reviewers enda observation var att test 1 (`/diff/`) har en bred regex som matchar alla förekomster av "diff" — men bedömde det som acceptabelt.

**Lärdomar:**
- Prescriptiva briefs med exakta testnamn och regex ger körningar utan iteration — Implementer behövde bara 6 tool-anrop (read, write, tsc, test, add, commit)
- Merger utan policy-blockeringar bekräftar att `diff`-tillägget i allowlisten (körning #21) löste det återkommande problemet — inga workarounds behövdes
- Minimal diff (12 rader, 1 fil) = minimal risk — hela körningen från start till merge tog under 4 minuter

---

## Körning 20260223-2218-neuron-hq-resume — neuron-hq
**Datum:** 2026-02-23
**Uppgift:** Resume-körning av #22 — verifiera och merga 3 nya merger-lint-tester (diff, git diff HEAD~1, MERGER_PLAN_READY)
**Resultat:** ✅ 5 av 5 acceptanskriterier klara — NO-OP merge, ändringarna fanns redan i target från körning 20260223-2209

**Vad som fungerade:**
Manager identifierade snabbt att workspace redan hade alla ändringar committade (commit `3fd300f`) och delegerade direkt till Reviewer. Reviewer verifierade alla 7 kriterier grundligt — 9 tester i filen, 3 nya med `.toMatch()`, 280/280 tester gröna, tsc rent, rätt commit, bara en fil ändrad. Merger upptäckte att target-repot redan hade identiska filer (byte-identical, `diff` producerade ingen output) och rapporterade korrekt NO-OP — ingen onödig commit skapades.

**Vad som inte fungerade:**
Resume-körningen var i praktiken onödig — den ursprungliga körningen 20260223-2209 hade redan gjort merge till main (commit `ace7fcf`). Hela resume-körningen resulterade i NO-OP. Ingen faktisk ny leverans.

**Lärdomar:**
- Resume-körningar bör kontrollera om original-körningens merge redan lyckades innan de startar — en snabb `git log` i target-repot hade kunnat avbryta tidigt
- Merger hanterade NO-OP-scenariot korrekt: detekterade identiska filer, skapade ingen tom commit, rapporterade tydligt
- Prescriptiva briefs med alla detaljer gör att även redundanta körningar slutförs snabbt och utan fel

---

## Körning 20260223-2248-aurora-swarm-lab — aurora-swarm-lab
**Datum:** 2026-02-23
**Uppgift:** Fixa 9 mypy-fel i `route.py` och 2 mypy-fel (+ runtime-krasch) i `readable_text.py`
**Resultat:** ✅ 6 av 6 acceptanskriterier klara — alla mypy-fel borta, runtime-krasch åtgärdad, 187 tester gröna, merge till main (commit 806b10c)

**Vad som fungerade:**
Svärmen levererade kirurgiska fixar: typ-annotationen i `route.py` ändrades till `dict[str, str | list[str]]` och `# type: ignore[call-overload]` lades till på `int(value)` (som redan hade try/except). I `readable_text.py` ersattes den borttagna `HTMLParser.unescape` med `html.unescape` — standardmigrering för Python ≥3.9. Reviewer verifierade alla 6 acceptanskriterier med faktiska kommandon (mypy, pytest, ruff, git log, git diff). Merger kopierade de 2 filerna och committade med rätt meddelande. Hela diffen var 5 insertions, 4 deletions.

**Vad som inte fungerade:**
Inga kända problem. Körningen gick smidigt från implementation genom review till merge utan blockerare.

**Lärdomar:**
- Väl avgränsade briefs med exakt mypy-output och föreslagna fixar ger snabba, korrekta leveranser — svärmen behövde inte experimentera.
- Pre-existing mypy-fel i andra filer (egress_policy.py rad 104) bör dokumenteras för framtida körningar så att Reviewer inte behöver förklara dem varje gång.
- `# type: ignore` är acceptabelt när runtime-säkerhet redan finns (try/except), men bör markeras som "pragmatic tradeoff" i review-rapporten — vilket Reviewer gjorde bra.

---

## Körning 20260223-2300-aurora-swarm-lab-resume — aurora-swarm-lab
**Datum:** 2026-02-23
**Uppgift:** Resume-körning av mypy-fixar i route.py och readable_text.py — verifiera och merga ändringar som redan levererats i körning 20260223-2248
**Resultat:** ✅ 6 av 6 uppgifter klara — alla ändringar redan mergade (commit 806b10c), Reviewer och Merger bekräftade NO-OP

**Vad som fungerade:**
Manager delegerade till Reviewer som genomförde fullständig verifiering av alla 6 acceptanskriterier (mypy 0 fel i båda filerna, 187 tester gröna, ruff clean, rätt commit-meddelande, rätt filer ändrade). Tester kördes och bekräftade 187 passed. Merger detekterade att target-repot redan innehöll identiska ändringar (commit 806b10c) och rapporterade "No action required" utan att skapa en tom commit. Hela kedjan (Review → Test → Merge-verify) fungerade smidigt på ~7 minuter.

**Vad som inte fungerade:**
Merger delegerades två gånger (23:05 och 23:06 enligt audit.jsonl) — troligen första försöket producerade merge_plan.md som krävde godkännande, och andra körningen genomförde bekräftelsen. Detta är standardflödet (plan/execute) men värt att notera.

**Lärdomar:**
- Resume-körningar mot redan mergade ändringar hanteras korrekt: Reviewer verifierar fullt, Merger detekterar NO-OP, ingen redundant commit skapas
- Merger NO-OP-detektionen (jämför workspace vs target med diff) fungerar pålitligt — bekräftar mönstret dokumenterat i patterns.md
- Denna resume-körning var onödig eftersom 20260223-2248 redan slutförde allt inklusive merge — framtida körningar bör kontrollera target-repots HEAD innan resume startas

---

## Körning 20260224-0557-neuron-hq — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Lägga till 6 nya edge-case-tester i `tests/core/run.test.ts` för `generateRunId`, `resumeRun` och `COPY_SKIP_DIRS`, plus exportera `COPY_SKIP_DIRS` från `src/core/run.ts`
**Resultat:** ✅ 7 av 7 uppgifter klara — alla acceptanskriterier uppfyllda, 286/286 tester gröna, merge till main (commit 8893493)

**Vad som fungerade:**
Hela pipeline-kedjan (Manager → Implementer → Reviewer → Merger → Librarian → Historian) körde komplett utan blockers. Implementer levererade alla 6 tester exakt som specificerat i briefen: 2 för `generateRunId` (format + slug), 3 för `resumeRun` (workspace saknas → throw, workspace-path-verifiering, brief-fallback), 1 för `COPY_SKIP_DIRS` (innehåller .git, node_modules, workspaces, runs, .venv). Reviewer verifierade alla 7 acceptanskriterier individuellt med grep, npm test (286 passed), tsc --noEmit (0 errors), och git diff — godkände med LOW risk. Merger kopierade 2 filer (105 insertions, 2 deletions) och committade rent. Librarian skrev 5 nya technique-entries till `memory/techniques.md`.

**Vad som inte fungerade:**
Commit-meddelandet avviker något från briefens specifikation: `test: add 6 edge-case tests for RunOrchestrator and export COPY_SKIP_DIRS` istället för `test: add edge-case tests for generateRunId, resumeRun, and COPY_SKIP_DIRS`. Reviewer bedömde det som icke-blockerande (semantiskt korrekt, följer conventional commits). Inga andra problem.

**Lärdomar:**
- Prescriptiva briefs med exakt testnamn, regex-mönster och mock-kod ger konsekvent felfria leveranser — Implementer behövde inte designa eller tolka, bara implementera
- Edge-case-tester för `resumeRun` krävde äkta git-repo i testsetup (GitOperations.initWorkspace) — briefen dokumenterade detta korrekt, vilket sparade Implementer felsökningstid
- Körningen bekräftar att swarm-pipelinen hanterar rena test-only-uppgifter (plus minimal export-ändring) effektivt — 107 raders diff, LOW risk, inga iterationer

---

## Körning 20260224-0647-neuron-hq-resume — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Resume-körning av #23 — verifiera att 6 nya edge-case-tester för `generateRunId`, `resumeRun` och `COPY_SKIP_DIRS` redan är mergade
**Resultat:** ✅ 7 av 7 acceptanskriterier klara — NO-OP, alla ändringar redan mergade (commit 8893493) från körning 20260224-0557

**Vad som fungerade:**
Manager agerade helt solo utan att delegera till någon sub-agent (förutom Historian). Verifierade workspace-tillståndet genom att läsa filerna direkt, köra `git status`, `git log`, `vitest run tests/core/run.test.ts` (17 passed), `tsc --noEmit` (0 errors), och `npm test` (286 passed). Bekräftade att commit `8893493` redan finns på main i target-repot. Skrev report.md och questions.md direkt — snabbaste resume-körningen hittills.

**Vad som inte fungerade:**
Resume-körningen var i praktiken onödig — den ursprungliga körningen 20260224-0557 hade redan gjort fullständig merge till main. Hela resume-körningen resulterade i NO-OP utan ny leverans. Ingen Reviewer eller Merger behövdes eftersom Manager själv bekräftade att allt redan var klart.

**Lärdomar:**
- Manager-only resume-körningar (utan delegering till sub-agenter) är det leanaste mönstret när allt redan är mergat — ~10 tool-anrop istället för 30+ vid full pipeline
- Resume-körningar bör idealt avbrytas tidigt med en `git log --oneline -1` i target-repot — om commit redan finns behövs ingen vidare verifiering
- Tredje NO-OP resume-körningen i rad (efter 20260223-2218 och 20260223-2300) bekräftar att mönstret är stabilt men onödigt — briefing-systemet bör kontrollera merge-status innan resume triggas

---

## Körning 20260224-0730-neuron-hq — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Lägga till 6 integrationstester för `RunOrchestrator.initRun` (3 st) och `RunOrchestrator.finalizeRun` (3 st) i `tests/core/run.test.ts`
**Resultat:** ✅ 7 av 7 uppgifter klara — 23 tester i filen, 292 passed totalt, 0 tsc-errors, merge till main (commit f748a34)

**Vad som fungerade:**
Hela pipeline-kedjan (Manager → Implementer → Reviewer → Merger) körde komplett utan blockers eller policy-blockeringar. Manager hoppade smart över Researcher och analyserade briefens kontext (types.ts, run.ts) direkt innan delegering. Implementer levererade alla 6 tester exakt som specificerat — 3 för `initRun` (workspace-sökväg, run-sökväg, endTime) och 3 för `finalizeRun` (report.md, usage.json, redaction_report.md) — med korrekt setup-mönster (tmpDir, sourceDir, briefFile). Reviewer verifierade alla kriterier (23 tester, 292 passed, 0 tsc-errors, bara en fil ändrad) och godkände med LOW risk. Merger kopierade och committade utan policyblockering (110 insertions, diff clean). Inga BLOCKED-kommandon i hela körningen.

**Vad som inte fungerade:**
Inga kända problem. Noll policy-blockeringar (första gången på flera körningar), inga extra delegationsrundor, ingen iteration krävdes. Commit-meddelandet avviker minimalt från briefens specifikation (`test: add 6 integration tests for RunOrchestrator.initRun and finalizeRun` istället för `test: add initRun and finalizeRun integration tests`) men semantiskt korrekt.

**Lärdomar:**
- Prescriptiva briefs med exakt setup-kod, testnamn och verifieringsmönster ger konsekvent felfria körningar — Implementer behövde bara 1 write_file-anrop för hela testfilen
- Integrationstester som kräver tmpDir + verkliga RunOrchestrator-instanser fungerar väl med briefens setup-mönster — ger äkta end-to-end-verifiering av initRun/finalizeRun utan mocking
- Noll BLOCKED-kommandon bekräftar att policy-justeringarna från körning #21 (diff i allowlist) och accumulated prompt-förbättringar har eliminerat det återkommande blockerings-problemet

---

## Körning 20260224-0743-aurora-swarm-lab — aurora-swarm-lab
**Datum:** 2026-02-24
**Uppgift:** Fixa mypy `no-redef`-fel i `egress_policy.py` genom att lägga till `# type: ignore[no-redef]` på rad 84 och 104
**Resultat:** ✅ 4 av 4 acceptanskriterier klara — mypy 0 errors, 187 tester gröna, bara 1 fil ändrad (2 rader), merge till main (commit 7df784b)

**Vad som fungerade:**
Implementer lade till de två `# type: ignore[no-redef]`-kommentarerna exakt som briefen specificerade och verifierade med både mypy och pytest direkt efteråt. Tester (187 passed), Reviewer (🟢 GREEN, alla 4 kriterier verifierade med faktiska kommandon), och Merger (kopierade 1 fil, committade med rätt meddelande) levererade alla utan problem. Hela kedjan — från delegation till merge — tog under 6 minuter.

**Vad som inte fungerade:**
Inga kända problem. Körningen gick helt friktionsfritt. Commit-meddelandet avvek marginellt från briefens förslag ("fix: add type: ignore[no-redef] comments to suppress mypy errors in egress_policy.py" istället för "fix: suppress mypy no-redef for reason_codes in egress_policy") men det är funktionellt ekvivalent.

**Lärdomar:**
- Kirurgiska briefs med exakta radnummer och föreslagna fixar fortsätter att ge snabbast möjliga leverans — svärmen behöver ingen experimentering.
- Mönstret att följa upp pre-existing mypy-fel dokumenterade i förra körningen (#9) fungerar bra: lärdomarna från en körning leder direkt till nästa brief.
- Reviewern verifierade mypy-output med flera kommandon (enskild fil + hela repot) — bra praxis som fångar eventuella sidoeffekter.

---

## Körning 20260224-0812-neuron-hq — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Uppdatera `prompts/tester.md` så att Tester-agenten vid testmisslyckanden inkluderar stack traces, felrader och strukturerat format (Location/Trace) i Failing Tests-rapporten
**Resultat:** ✅ 7 av 7 uppgifter klara — alla acceptanskriterier godkända, merge till main (commit 0e91465)

**Vad som fungerade:**
Implementer levererade exakt de tre ändringsblock som briefen specificerade: uppdaterade re-run-kommandon (--no-header, head -80), nytt strukturerat Failing Tests-format med Location/Trace-fält, och utökat returmeddelande med testnamn. 3 nya lint-tester i `tester-lint.test.ts` verifierar att de nya fälten finns kvar. Alla 295 tester (292 baseline + 3 nya) passerade. Merger fixade commit-meddelandet till briefens exakta formulering vid merge till target.

**Vad som inte fungerade:**
Implementer använde en egen formulering på commit-meddelandet (`feat: improve Tester agent failure reporting with structured trace details`) istället för briefens exakta (`feat: improve tester failure reporting with stack traces and file locations`). Merger korrigerade detta vid merge till target, så slutresultatet blev korrekt. Inga andra problem.

**Lärdomar:**
- Merger-agenten fungerar som en sista kvalitetsbarriär — den korrigerade commit-meddelandet till briefens specifikation vid merge, vilket visar att tvåstegsprocessen (workspace-commit → target-merge) ger en chans att rätta till avvikelser.
- Prompt-lint-tester är ett utmärkt mönster för att vakta nya prompt-tillägg — 3 nya regex-tester på 27 rader säkerställer att Location/Trace-formatet inte försvinner vid framtida redigeringar.
- Enbart prompt- och testfiler ändrades (41 rader, 2 filer) — detta bekräftar att scope-begränsningar i briefen respekteras väl av svärmen.

---

## Körning 20260224-0820-neuron-hq — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Uppdatera `prompts/researcher.md` så att Researcher läser `memory/techniques.md` som steg 1b och refererar forskning via `Research support`-fält i ideas.md-formatet
**Resultat:** ✅ 6 av 6 acceptanskriterier klara — ren leverans med låg risk

**Vad som fungerade:**
Implementer läste båda targetfilerna, applicerade ändringarna (steg 1b med `read_memory_file(file="techniques")` + `Research support`-fält) och skapade lint-tester i en smidig sekvens — allt committades korrekt på första försöket. Reviewer verifierade alla 6 kriterier systematiskt med grep och körde npm test (297 passed) + tsc --noEmit (0 errors). Merger kopierade 2 filer och committade med `feat(researcher):` scope (commit ef5c916). Librarian auto-triggades och skrev 3 nya entries till techniques.md (MemAdapter, ALMA, BudgetMem). Totalt 22 rader tillagda, 0 borttagna — minimalt scope.

**Vad som inte fungerade:**
Inga kända problem. Commit-meddelandet avvek marginellt från briefens exakta formulering (`feat(researcher): add techniques.md lookup step...` istället för `feat: researcher reads techniques.md...`) men Merger accepterade det som bättre konventionell commit-praxis. Testantalet ökade från 292 till 297 (+5) — 2 nya lint-tester plus 3 som kan ha tillkommit utanför denna körning.

**Lärdomar:**
- Prompt-only-ändringar (inga TS-filer) ger de snabbaste och renaste leveranserna — låg risk, enkel review, inga kompileringsfel möjliga
- Briefens exakta kodsnuttar (steg 1b-texten, ideas.md-formatet) gör att Implementer kan applicera ändringar nästan mekaniskt utan tolkningsutrymme
- Librarian auto-trigger fungerade smidigt i rätt delegationsordning (Merger → Librarian → Historian) — techniques.md växte till 40+ entries

---

## Körning 20260224-0833-neuron-hq-resume — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Resume-körning av brief #25 (Tester-felsignal) — verifiera att tester.md-uppdateringar med stack trace/Location/Trace-format redan är mergade från körning 20260224-0812
**Resultat:** ✅ 7 av 7 uppgifter klara — NO-OP, alla ändringar redan mergade (commit 0e91465), 297 tester gröna

**Vad som fungerade:**
Manager agerade helt ensam — läste workspace-filerna från föregående körning, verifierade git-loggen i target-repot, grep:ade efter `Location:` och `Trace:` i `prompts/tester.md`, körde `npx vitest run` (297 passed) och `npx tsc --noEmit` (0 errors). Alla 7 acceptanskriterier bekräftades utan att delegera till någon annan agent (varken Reviewer, Implementer, Tester eller Merger). Rapporten skrevs direkt som 🟢 GREEN.

**Vad som inte fungerade:**
Resume-körningen var i praktiken onödig — körning 20260224-0812 hade redan levererat allting inklusive merge till main. Hela körningen resulterade i NO-OP. Ingen ny leverans, inga nya filer.

**Lärdomar:**
- Manager kan vara helt självständig i resume-körningar där merge redan är gjord — den grep:ade direkt i target-repot istället för att delegera verifiering till Reviewer, vilket sparade tid och tokens
- Resume-körningar bör ha en tidig "already merged?"-check som kan avbryta körningen innan full verifiering — en snabb `git log --oneline -5` i target borde räcka för att se om briefens commit redan finns
- Mönstret med NO-OP resume-körningar upprepas (minst 4 gånger nu) — detta tyder på att orchestratorn borde kontrollera merge-status innan den startar en resume

---

## Körning 20260224-0835-neuron-hq-resume — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Resume-körning av #26 — verifiera att `prompts/researcher.md` (steg 1b med `read_memory_file(file="techniques")` + `Research support`-fält) redan är mergat från körning 20260224-0820
**Resultat:** ✅ 6 av 6 acceptanskriterier klara — NO-OP, alla ändringar redan mergade (commit ef5c916) från körning 20260224-0820

**Vad som fungerade:**
Manager agerade solo utan att delegera till sub-agenter. Verifierade workspace-tillståndet grundligt: grep efter `read_memory_file(file="techniques")` (rad 36) och `Research support` (rad 84) i researcher.md, kontrollerade lint-tester i researcher-lint.test.ts, körde `npx vitest run` (297 passed, 31 files) och `npx tsc --noEmit` (0 errors). Bekräftade att commit `ef5c916` redan finns på main. Skrev report.md med GREEN stoplight och questions.md utan blockers.

**Vad som inte fungerade:**
Resume-körningen var i praktiken onödig — ursprungliga körningen 20260224-0820 hade redan gjort fullständig merge till main inklusive Librarian-trigger. Hela körningen resulterade i NO-OP. Detta är nu den femte NO-OP resume-körningen i serien.

**Lärdomar:**
- NO-OP resume-mönstret är stabilt och konsekvent — Manager identifierar redan-mergade körningar utan att delegera onödigt
- Briefing-systemet bör idealt kontrollera om senaste commit redan finns i target-repot innan det skapar en resume-körning
- Manager-only verifiering (utan Reviewer/Merger) tar minimalt antal tool-anrop (~15) jämfört med fullständig pipeline (~40+)

---

## Körning 20260224-0839-neuron-hq — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Lägga till `Senast bekräftad:`-fält på alla mönster i `memory/patterns.md`, uppdatera `prompts/historian.md` med nytt Pattern Entry Format och instruktioner om att uppdatera fältet, samt skapa lint-test
**Resultat:** ✅ 7 av 7 uppgifter klara — alla acceptanskriterier uppfyllda, 298 tester gröna, merge till main (commit 5197957)

**Vad som fungerade:**
Hela pipeline-kedjan (Manager → Implementer → Reviewer → Merger) körde komplett utan blockers eller policy-blockeringar. Implementer hanterade diskrepansen mellan briefens "17 mönster" och repots faktiska 22 mönster korrekt — alla 22 fick `Senast bekräftad: okänd`. Fem mönster som saknade `Körningar:`-fält fick också det tillagt med `#?` som fallback. Reviewer verifierade alla 7 kriterier med grep-kommandon, npm test (298 passed = 292 baseline + 6 nya), tsc --noEmit (0 errors), och git diff (43 rader, 3 filer). Merger kopierade och committade rent (96 insertions, 2 deletions).

**Vad som inte fungerade:**
Inga kända problem. Briefen angav 17 mönster men repot hade 22 vid körningen — Implementer anpassade sig korrekt till faktiskt tillstånd. Inga BLOCKED-kommandon, inga extra delegationsrundor, inga iterationer. Testantalet ökade med 6 (från 292 till 298) — 2 nya lint-tester i historian-lint.test.ts plus eventuellt ytterligare från parallella ändringar.

**Lärdomar:**
- Memory-systemets glömska-problem (patterns.md som ackumulator utan decay) adresseras nu strukturellt med `Senast bekräftad:`-fältet — Historian kan nu spåra vilka mönster som aktivt bekräftas
- Briefen med 17 mönster vs repots 22 visar att parallella körningar kan ändra baseline — mönstret "Implementer anpassar sig till faktiskt repo-tillstånd" bekräftades återigen
- Minnesförbättrings-körningar (inga src/-ändringar, bara prompts/memory/tester) fortsätter vara snabba och lågrisk — ren leverans utan iteration

---

## Körning 20260224-0852-neuron-hq — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Lägg till `⚡ Meta-trigger:`-hantering i manager.md och `META_ANALYSIS`-läge i researcher.md så att Researcher kan göra trendanalys av runs.md och patterns.md var 10:e körning
**Resultat:** ✅ 7 av 7 uppgifter klara — alla acceptanskriterier uppfyllda, 300 tester gröna, merge till main (commit 0910c8a)

**Vad som fungerade:**
Hela pipeline-kedjan (Manager → Implementer → Reviewer → Merger → Historian) körde komplett utan blockers. Implementer lade till `⚡ Meta-trigger:` och `META_ANALYSIS`-avsnitt i manager.md, `META_ANALYSIS`-läge med meta_analysis.md-format i researcher.md, samt 2 nya lint-tester (Meta-trigger regex i manager-lint, META_ANALYSIS regex i researcher-lint). Reviewer verifierade alla 7 kriterier individuellt med grep-kommandon, npm test (300 passed), tsc --noEmit (0 errors), och godkände med LOW risk. Merger kopierade 4 filer (63 insertions, 1 deletion) och committade rent. Diffen var minimal och additivt — inga befintliga funktioner påverkades.

**Vad som inte fungerade:**
Commit-meddelandet avviker marginellt från briefens specifikation: `feat: add META_ANALYSIS meta-trigger mode for Researcher and Manager prompts` istället för `feat: add meta-analysis mode for Researcher every 10th run`. Reviewer bedömde det som icke-blockerande. Testantalet (300) överstiger briefens baseline (292) med 8 — 2 nya i denna körning plus 6 från tidigare parallella körningar. Inga andra problem.

**Lärdomar:**
- Prompt-only-ändringar med lint-tester är den snabbaste och renaste typen av körning — inga kompileringsrisker, ren additivt, minimal diff
- Briefen med exakta textblock att infoga i varje fil gör implementeringen närmast mekanisk — Implementer behöver inte tolka eller designa
- Meta-analys-infrastrukturen (var 10:e körning) bygger vidare på Librarian-triggern (var 5:e) med samma `⚡`-mönster, vilket ger konsistens i how milestone-åtgärder triggas

---

## Körning 20260224-0905-neuron-hq-resume — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Resume-körning av #27 — verifiera att `Senast bekräftad:`-fält på alla mönster i patterns.md, historian.md-uppdateringar och lint-tester redan var mergade från föregående körning (20260224-0839-neuron-hq, commit 5197957)
**Resultat:** ✅ 7 av 7 uppgifter klara — allt redan mergat, ren verifieringskörning utan implementation

**Vad som fungerade:**
Manager agerade som ren verifieringsagent — läste workspace-filer (patterns.md, historian.md, historian-lint.test.ts) och föregående körningens merge_summary.md, konstaterade att alla 7 acceptanskriterier redan var uppfyllda (22 mönster med Senast bekräftad, historian.md uppdaterad, 298 tester gröna, commit 5197957 på main). Ingen delegering till Implementer, Reviewer eller Merger behövdes. Report.md skrevs direkt av Manager med tydlig verifieringstabell.

**Vad som inte fungerade:**
Inga kända problem. Resume-körningen var i praktiken en no-op eftersom originalkörningen (20260224-0839) hade fullföljt hela pipeline inklusive merge. Enda potentiella inefficiensen är att resume-körningen överhuvudtaget startades trots att originalrundans merge redan var klar.

**Lärdomar:**
- Mönstret "Manager-only verifiering" bekräftas igen — vid redan mergade resume-körningar räcker det med ~7 tool-anrop (3 filläsningar + merge_summary-kontroll) för att konstatera att allt är klart
- Resume-körningar bör helst inte startas alls om föregående körning redan avslutades med lyckad merge — en pre-check av target-repots git log innan swarm-start skulle eliminera onödiga körningar
- Briefens angivna "17 mönster" vs faktiska 22 i repot dokumenterades korrekt i föregående körning — inga nya avvikelser i denna resume

---

## Körning 20260224-0948-neuron-hq — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Skapa en interaktiv Brief Agent med CLI-kommando `npx tsx src/cli.ts brief <target>` som chattar med användaren, läser target-repots struktur, och genererar en färdig brief.md
**Resultat:** ✅ 10 av 10 acceptanskriterier klara — alla kriterier verifierade, 313 tester gröna, merge till main (commit 7599801)

**Vad som fungerade:**
Hela pipeline-kedjan (Researcher → Implementer → Tester → Reviewer → Merger → Historian) körde komplett. Researcher analyserade kodbasens agentmönster (~20 filer), CLI-struktur och befintliga briefs som referens. Implementer levererade alla 4 nya filer (`brief-agent.ts` 244 rader, `brief-agent.md` 94 rader, `brief-agent.test.ts` 8 tester, `brief-agent-lint.test.ts` 5 tester) plus ändringar i `cli.ts` (+9 rader) och `coverage.test.ts` (+4 rader). Tester körde 313 tester (alla gröna), Reviewer verifierade alla 10 acceptanskriterier individuellt med grep-kommandon och godkände. Merger kopierade 6 filer (453 insertions, 4 deletions) och committade rent. Total diff överskred 300-raders-tröskeln men Reviewer motiverade detta korrekt — funktionell kod var 253 rader (inom estimat), överskottet var obligatoriska tester och prompt.

**Vad som inte fungerade:**
Tre BLOCKED-kommandon: Reviewer fick 2 `export PATH=...`-kommandon blockerade (forbidden pattern), och Merger fick 1 `git commit`-kommando blockerat pga backticks i commit-meddelandet (samma kända mönster som dokumenterats i errors.md). Reviewer arbetade runt PATH-blockering genom att köra kommandon utan export, och Merger skrev om commit-meddelandet utan backticks. Baseline-verifiering flaggade "pnpm not found" men npm test passerade — miljöproblem, inte kodfel.

**Lärdomar:**
- Största feature-leveransen hittills (453 rader, 6 filer, ny agent) gick igenom hela pipelinen utan blockers — visar att svärmen skalar till medelstora features, inte bara kirurgiska fixar
- Merger backtick-problemet upprepas (dokumenterat sedan körning 20260222-2314) — commit-meddelanden med backticks (`\`...\``) blockeras av policy, och agenter måste arbeta runt det varje gång
- Reviewer-agenten bör undvika `export PATH=...` i bash-kommandon — detta mönster blockeras konsekvent av policy

---

## Körning 20260224-1104-neuron-hq — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Bygg om Brief Agent från formulärbaserat flöde till interaktiv chattloop med streaming-svar, där Claude svarar på varje input i realtid
**Resultat:** ✅ 8 av 8 acceptanskriterier klara — chattloop med streaming, alla 313 tester gröna, merge till main (commit 753963c)

**Vad som fungerade:**
Hela pipeline-kedjan (Implementer → Reviewer → Merger → Historian) körde komplett utan blockeringar. Implementer studerade befintliga mönster i `manager.ts` och `agent-utils.ts` (streamResponse, trimMessages, withRetry) och återanvände dem i brief-agent.ts — ren 1:1 refaktorering utan nya dependencies. Reviewer verifierade alla 8 kriterier individuellt med grep, sed och testkommandon, inklusive git-diff-analys av borttagna typer (`BriefAnswers`, `normalizeRisk`). Merger kopierade 2 filer (172 insertions, 162 deletions) och committade rent. Inga bash-kommandon blockerades — helt friktionsfri körning.

**Vad som inte fungerade:**
Commit-meddelande avvek: briefen specificerade `feat:` men Implementer använde `refactor:`. Merger behöll `refactor:` istället för att korrigera till briefens specifikation. Diff-storlek överskred 300-radersgränsen (332 rader totalt), men Reviewer motiverade korrekt att 117 rader var markdown-prompt — godkänt. Inga blockers eller allvarliga problem.

**Lärdomar:**
- Att återanvända befintliga utility-funktioner (trimMessages, withRetry, streamResponse) gör stora refaktoreringar säkrare — Implementer behövde inte uppfinna nytt, bara omstrukturera
- Pre-loading filträd i systemprompten är enklare än tool-use för `ls` vid runtime, men ger en snapshot som inte uppdateras under konversationen — tradeoff värd att känna till
- MAX_TURNS=30 hard limit med graceful fallback (tom sträng + `if (briefPath)` check) är en bra guardrail mot oändliga loopar i chattbaserade agenter

---

## Körning 20260224-1211-neuron-hq-resume — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Resume-körning av 20260224-1104 — verifiera att BriefAgent-ombyggnaden (formulär → interaktiv chattloop med streaming) redan var mergad
**Resultat:** ✅ 8 av 8 uppgifter klara — alla kriterier redan uppfyllda, commit 753963c på main

**Vad som fungerade:**
Manager identifierade att all implementation och merge redan var klar i föregående körning (20260224-1104-neuron-hq, commit 753963c). Verifierade direkt i workspace: läste brief-agent.ts, brief-agent.md, cli.ts, relevanta testfiler, körde `npm test` (313 passed) och `npx tsc --noEmit` (0 errors), kontrollerade git log. Inga sub-agenter delegerades — ren solo-verifiering av Manager. Report.md sammanfattade alla 8 acceptanskriterier som uppfyllda.

**Vad som inte fungerade:**
Inga kända problem. Körningen var redundant — originalköringens merge var redan fullständig. Resume-triggern var onödig men hanterades korrekt av Manager utan overhead.

**Lärdomar:**
- Manager-only verifieringsmönstret fungerar stabilt vid redan mergade resume-körningar — tredje bekräftelsen (efter 20260224-0647 och 20260224-0905)
- Att läsa merge_plan.md från föregående körning (Manager grep:ade 20260224-1104-körningens merge_plan) är en bra strategi för att snabbt avgöra om merge redan skett
- Redundanta resume-körningar kostar minimalt (~30 tool-anrop) men ger inget nytt värde — en pre-check i startflödet som verifierar om commit redan finns på main kunde undvika dem helt

---

## Körning 20260224-1225-neuron-hq — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Lägg till kod i `src/core/run.ts` som räknar befintliga körningar och automatiskt injicerar `⚡ Meta-trigger: META_ANALYSIS` i briefen var 10:e körning
**Resultat:** ✅ 6 av 6 uppgifter klara — alla acceptanskriterier uppfyllda, 318 tester gröna, merge till main (commit 17fd3a1)

**Vad som fungerade:**
Hela pipeline-kedjan (Researcher → Implementer → Reviewer → Merger → Historian) körde komplett utan blockers eller policy-blockeringar. Implementer skapade två rena funktioner (`countCompletedRuns` som exkluderar `-resume`-suffix, `maybeInjectMetaTrigger` med `runCount % 10 === 0` guard) och integrerade dem i `initRun()` — räkningen sker före `mkdir` så aktuell körning inte räknas. Reviewer verifierade alla 6 kriterier med specifika grep-kommandon, npm test (318 passed, +18 från baseline 300), tsc --noEmit (0 errors), och bekräftade 5 nya tester (trigger vid 10/20/30, INTE vid 9/11/15, resume-exkludering). Merger kopierade 2 filer (86 insertions, 3 deletions) och committade med exakt commit-meddelande från briefen.

**Vad som inte fungerade:**
Inga kända problem. Noll BLOCKED-kommandon, inga extra delegationsrundor, inga iterationer. Diff-storlek (86 rader) var väl under 150-raders-tröskeln. Testantalet ökade från 300 till 318 (+18) — 5 nya i denna körning plus 13 från parallella körningar.

**Lärdomar:**
- Briefens tekniska krav med exakta funktionssignaturer (`countCompletedRuns`, `maybeInjectMetaTrigger`) och TypeScript-snuttar gör implementeringen närmast mekanisk — Implementer behövde inte designa utan bara integrera
- Denna körning stänger feedback-loopen från körning #28 som lade till Meta-trigger i prompterna — nu finns det också kod som faktiskt injicerar triggern automatiskt
- Två rena/isolerade funktioner utan sidoeffekter (utom brief-modifiering) gör testning och review trivialt — pure functions med tydliga in/ut är ideala för swarm-leverans

---

## Körning 20260224-1253-neuron-hq-resume — neuron-hq
**Datum:** 2026-02-24
**Uppgift:** Resume-körning av 20260224-1225 — verifiera att META_ANALYSIS auto-trigger-kod i `src/core/run.ts` (countCompletedRuns + maybeInjectMetaTrigger) redan var mergad (commit 17fd3a1)
**Resultat:** ✅ 6 av 6 uppgifter klara — NO-OP, alla ändringar redan mergade från originalkörningen

**Vad som fungerade:**
Manager verifierade workspace-tillståndet grundligt (läste run.ts och run.test.ts, körde tsc --noEmit, vitest run, git log/diff) och bekräftade att commit 17fd3a1 redan fanns. Delegerade sedan till full pipeline: Reviewer verifierade alla 6 acceptanskriterier individuellt (318/318 tester, 5 nya meta-trigger-tester, rätt funktioner i koden), Merger jämförde workspace och target och konstaterade byte-identiska filer → NO-OP utan ny commit, Tester körde hela testsviten (318 passed). Merge_summary dokumenterade tydligt att allt redan var mergat.

**Vad som inte fungerade:**
Resume-körningen var i praktiken onödig — körning 20260224-1225 hade redan slutfört fullständig merge till main. Till skillnad från de senaste NO-OP resume-körningarna (där Manager agerade solo) delegerade Manager här till full pipeline (Reviewer + Merger + Tester), vilket innebar ~50+ tool-anrop istället för ~10-15 vid Manager-only-mönstret. Mer overhead än nödvändigt för en NO-OP-verifiering.

**Lärdomar:**
- NO-OP resume-mönstret upprepas — detta är sjätte (eller fler) gången. Det befintliga felet i errors.md (orchestrator saknar pre-flight merge-check) kvarstår
- Manager delegerade full pipeline trots att allt var mergat — det tidigare observerade Manager-only-verifieringsmönstret tillämpades inte konsekvent denna gång
- Merger NO-OP-detektionen fungerade korrekt: byte-identiska filer identifierades, ingen tom commit skapades, merge_summary var tydlig

---

## Körning 20260224-2155-aurora-swarm-lab — aurora-swarm-lab
**Datum:** 2026-02-24
**Uppgift:** Implementera `aurora library` (lista alla inmatade källor med metadata) och `aurora delete-source` (radera en källa med tillhörande embeddings, jobs, manifests och disk-artefakter) som CLI-kommandon.
**Resultat:** ✅ 5 av 5 uppgifter klara — fullständig implementation inklusive CLI-integration, ny modul, tester och merge till main.

**Vad som fungerade:**
Hela pipelinen körde felfritt: Researcher analyserade befintlig kodstruktur (cli/main.py, manifest.py, db.py, embedding_store.py, storage.py, ids.py), Implementer skapade 5 filer (list_sources.py, delete_source.py, __init__.py, uppdaterad main.py, test_library.py med 7 testfall), Tester verifierade 197 passing tests, Reviewer utförde grundlig stoplight-verifiering (ruff PASS, mypy +1 trivial, 197/197 tests, parameteriserad SQL, path sanitization). Merger genomförde merge till main (commit 32c2670) med 308 insertions över 5 filer.

**Vad som inte fungerade:**
Inga signifikanta problem. Diff-storleken (308 insertions) var marginellt över 300-raderströskeln, men Reviewer bedömde att feature-kohesionen motiverade detta. En ny trivial mypy-typ-hint-varning (fixture `object` istället för `Path`) adderades — konsistent med befintligt mönster i kodbasen men borde helst fixas.

**Lärdomar:**
- Ny feature med DELETE-operationer kräver att Reviewer explicit verifierar SQL-injektion och path traversal — i detta fall klarade Reviewer det utmärkt (parameteriserade queries + safe_source_id).
- Heuristik-baserad statusderivation (_derive_status via step-namnmönster) kan bli fragil om namnkonventioner ändras — bör dokumenteras som känd teknisk skuld.
- När diff-storleken är nära tröskeln men all kod tillhör en enda sammanhängande feature, är Reviewers bedömning "acceptable despite threshold" rätt approach.

---
