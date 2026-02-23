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

## Implementer: direktskrivning slår transform-skript
**Kontext:** Körning 20260222-2113 — Implementer försökte först skapa ett Python-transform-skript för att mekaniskt refaktorera test_mcp_server.py, men write_file till /tmp blockerades och bash med inline-skript blev för komplext
**Lösning:** Implementer gjorde git checkout, läste hela originalfilen, applicerade ändringarna mentalt, och skrev hela den refaktorerade filen med en enda write_file-anrop direkt till target-filen
**Effekt:** Snabbare och pålitligare — inga policy-blockeringar, inga mellansteg som kan misslyckas. write_file till workspace-filer är alltid tillåtet.
**Keywords:** implementer, write_file, transform-skript, policy, refaktorering
**Relaterat:** errors.md#Implementer transform-skript blockeras av policy

---

## Implementer anpassar sig till faktiskt repo-tillstånd vid inaktuell brief
**Kontext:** Körning 20260222-2253 — Briefen specificerade 3 ruff-fel att fixa, men 2 av dem var redan lösta i repot sedan en tidigare körning
**Lösning:** Implementer körde `ruff check .` för att se faktiska fel (8 st, inte 3), använde `ruff --fix` för auto-fixbara F401-fel och fixade kvarvarande F841 manuellt. Dokumenterade avvikelsen från briefen i knowledge.md.
**Effekt:** Alla faktiska ruff-fel fixades istället för att fastna på att specificerade fel inte fanns. Leveransen överträffade briefen (8 fixade istället för 3). Reviewer verifierade mot faktiskt resultat, inte briefens obsoleta lista.
**Keywords:** implementer, brief, baseline, ruff, anpassning, stale-brief
**Relaterat:** errors.md#Brief med inaktuella ruff-fel

---

## Resume-körning hoppar direkt till Review+Merge
**Kontext:** Körning 20260222-2314-resume — Implementation var redan klar i workspace från föregående körning 20260222-2253 som avbröts innan merge
**Lösning:** Manager kontrollerade workspace-tillståndet (git status, ruff check, pytest), konstaterade att allt var klart, och delegerade direkt till Reviewer utan att köra Researcher eller Implementer. Efter godkänd review delegerades till Merger som slutförde merge till target.
**Effekt:** Snabb och effektiv körning — ingen onödig duplicering av arbete. Hela resume-cykeln (verify → review → merge plan → approve → merge → post-verify) tog ~6 minuter. Bevisar att svärmen kan hantera avbrutna körningar genom att återuppta vid rätt steg.
**Keywords:** resume, manager, reviewer, merger, pipeline, avbruten-körning
**Relaterat:** patterns.md#Tvåfas-Merger (PLAN/EXECUTE via answers.md)

---

## Self-hosting: svärmen fixar sina egna dokumenterade fel
**Kontext:** Körning 20260223-0619-neuron-hq — Första gången svärmen riktades mot sin egen kodbas (neuron-hq) istället för ett externt target
**Lösning:** Brief byggdes direkt på errors.md-entries från 7 tidigare körningar. Varje uppgift mappade 1:1 till ett dokumenterat fel: (1) Researcher saknar knowledge.md → lägg till i prompten, (2) Manager duplicerar arbete → lägg till "After Researcher Completes"-avsnitt, (3) Implementer glömmer commit → lägg till explicit git commit-steg. Plus tester för otestade verktyg. Manager hoppade över Researcher eftersom briefen redan innehöll all kontext.
**Effekt:** Stänger feedback-loopen — errors.md → brief → prompt-fix → commit. Alla tre dokumenterade problem åtgärdades i en enda körning. Bevisar att memory-systemet (runs.md + errors.md + patterns.md) fungerar som kunskapskälla för förbättring av svärmen själv.
**Keywords:** self-hosting, errors.md, feedback-loop, prompt-fix, meta-förbättring
**Relaterat:** errors.md#Implementer glömde git commit efter lyckade fixar, errors.md#Researcher skapade inte knowledge.md, errors.md#Manager duplicerar Researchers arbete

---
