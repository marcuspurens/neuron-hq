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
**Status:** ⚠️ Identifierat, ej åtgärdat i prompten ännu

---

## Researcher skapade inte knowledge.md
**Session:** 13-prep (körning 20260222-1457)
**Symptom:** knowledge.md saknades som körningsartefakt
**Orsak:** Researcher-prompten betonade ideas.md mer än knowledge.md
**Lösning:** Förtydliga att knowledge.md är obligatorisk i Researcher-prompten
**Status:** ⚠️ Identifierat, ej åtgärdat i prompten ännu

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
**Status:** ⚠️ Identifierat

---

## Manager söker Librarian-output i workspace istället för delat minne
**Session:** 20260222-1651-aurora-swarm-lab
**Symptom:** Manager hittade inte techniques.md i workspace efter lyckad Librarian-delegation, trots att Librarian korrekt skrev 9 entries till den delade memory/techniques.md
**Orsak:** Librarian skriver till den delade `memory/techniques.md` (via write_to_techniques), men Manager letade i workspace-katalogen `workspaces/.../aurora-swarm-lab/memory/techniques.md`
**Lösning:** Manager-prompten eller verifieringslogiken behöver uppdateras för att veta att Librarian-output hamnar i den delade memory-katalogen, inte i workspace. Alternativt bör Librarian-agenten returnera en sammanfattning av vad som skrevs så Manager inte behöver leta själv.
**Status:** ⚠️ Identifierat

---

## Run-artefakter skrivs till workspace men inte till runs-katalogen
**Session:** 20260222-1651-aurora-swarm-lab
**Symptom:** report.md och questions.md saknas i runs-katalogen, trots att Manager skrev dem till workspace
**Orsak:** Manager skrev artefakter (report.md, questions.md, ideas.md, knowledge.md) till workspace-katalogen men de kopierades aldrig till runs-katalogen. Historian kunde därför inte läsa dem.
**Lösning:** Orchestratorn eller Manager behöver kopiera run-artefakter (report.md, questions.md) till runs-katalogen efter körning, eller skriva direkt dit. Alternativt bör Historian kunna läsa från workspace-katalogen som fallback.
**Status:** ⚠️ Identifierat

---

## Manager duplicerar Researchers arbete
**Session:** 20260222-1757-aurora-swarm-lab
**Symptom:** Manager läste ~15 filer och körde ~10 bash-kommandon efter att Researcher redan slutfört identisk analys och levererat ideas.md med 10 förslag
**Orsak:** Manager verifierar inte bara att Researcher levererade korrekt — den upprepar hela analysen själv och skriver egna ideas.md/knowledge.md till workspace
**Lösning:** Manager-prompten bör instruera att (1) läsa Researchers ideas.md, (2) verifiera att den uppfyller briefens krav, (3) delegera vidare utan att upprepa analysen. Manager ska vara koordinator, inte utförare.
**Status:** ⚠️ Identifierat

---

## Bash-kommentarer i Manager-kommandon triggar policyblockering
**Session:** 20260222-1757-aurora-swarm-lab
**Symptom:** Tre bash_exec-anrop från Manager blockerades med "BLOCKED: not in allowlist"
**Orsak:** Kommandon innehöll inledande `#`-kommentarer (t.ex. `# Check for type hints coverage\ngrep -rn ...`), vilket troligen inte matchade den tillåtna kommandomönsterlistan
**Lösning:** Agenter bör köra rena kommandon utan inbäddade kommentarer. Alternativt bör allowlisten uppdateras för att tillåta kommentarer i bash-kommandon.
**Status:** ⚠️ Identifierat

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
