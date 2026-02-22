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
