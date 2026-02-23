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
