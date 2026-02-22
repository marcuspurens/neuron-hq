# Patterns — Mönster som fungerar

Beprövade lösningar och arbetssätt som konsekvent ger bra resultat.
Appendas av Historian-agenten när ny lärdom identifieras.

---

## Kompakt testutdata förhindrar context overflow
**Kontext:** Session 11 — Tester-agenten kraschade pga context overflow
**Lösning:** Kör tester med `-q --cov-report=term` och begränsa output till max 30 rader
**Effekt:** Tester-agenten klarar nu hela testsviten utan overflow

---

## initWorkspace() isolerar workspace-git från neuron-hq
**Kontext:** Session 11 — git-commits hamnade i neuron-hq repo istället för workspace
**Lösning:** `initWorkspace()` i `src/core/git.ts` sätter upp separat git-repo i workspace-mappen
**Effekt:** Alla commits från Implementer hamnar i rätt repo

---

## Brief-innehåll injiceras i Reviewer för korrekt kriteriecheck
**Kontext:** Session 9 — Reviewer godkände körningar utan att kontrollera mot acceptanskriterier
**Lösning:** `src/core/agents/reviewer.ts` skickar brief-innehåll till Reviewer i system prompt
**Effekt:** Reviewer kontrollerar nu faktiskt levererat vs planerat per kriterium

---

## Datumstämplade briefs förhindrar förvirring
**Kontext:** Session 9 — `today.md` överskrevs av misstag
**Lösning:** Briefs namnges `briefs/<YYYY-MM-DD>-<slug>.md`
**Effekt:** Historik bevaras, rätt brief pekas ut med `--brief`-flaggan

---

## Tvåfas-Merger (PLAN/EXECUTE via answers.md)
**Kontext:** Session 10 — Merger behövde mänskligt godkännande innan kopiering
**Lösning:** Merger skriver merge_plan.md, väntar på att `answers.md` innehåller "APPROVED"
**Effekt:** Säker merge-process — inget kopieras utan explicit godkännande

---

## Librarian dubbelkontrollerar med read-after-write
**Kontext:** Körning 20260222-1651 — Librarian smoke test
**Lösning:** Librarian läser tillbaka `techniques.md` efter att ha skrivit alla entries, vilket verifierar att skrivningarna faktiskt sparades korrekt
**Effekt:** Ger tillförlitlig bekräftelse att entries skrevs — Manager kan lita på Librarian-resultatet utan att själv behöva verifiera filen

---

## Researcher: multi-signal kodbasanalys ger rika förbättringsförslag
**Kontext:** Körning 20260222-1757 — Researcher analyserade aurora-swarm-lab utan kodändringar
**Lösning:** Researcher kombinerade tre signaltyper: (1) filläsning av nyckelfiler (config, core, moduler), (2) kvantitativa bash-grep-analyser (radräkning, mönsterfrekvens som `load_settings()` 46 gånger, `except Exception` 89 gånger), (3) arkitekturella observationer (2590-raders god-modul, saknad conftest.py). Resulterade i ideas.md med 10 prioriterade förslag med impact/effort/risk-bedömning och konkreta tradeoffs.
**Effekt:** Hög kvalitet på leverabeln — varje förslag backas av kvantitativa data snarare än subjektiva omdömen. Gör det möjligt att direkt prioritera och agera.

---

## Reviewer git-stash baseline-jämförelse
**Kontext:** Körning 20260222-1901 — Reviewer verifierade conftest.py-refaktorering mot 187 tester
**Lösning:** Reviewer körde `git stash` → `pytest tests/ -x -q` (baseline: 187 passed) → `git stash pop` → `pytest tests/ -x -q` (after: 187 passed) för att verifiera att ändringarna inte bröt något. Kombinerades med AST-analys för docstrings och ruff/mypy på enbart ändrade filer.
**Effekt:** Ger objektivt bevis att refaktoreringen är neutral — samma testantal före och efter. Mycket starkare verifiering än att bara köra testerna en gång.
**Keywords:** reviewer, baseline, git-stash, pytest, verifiering
**Relaterat:** patterns.md#Brief-innehåll injiceras i Reviewer för korrekt kriteriecheck

---
