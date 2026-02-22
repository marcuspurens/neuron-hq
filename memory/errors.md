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
