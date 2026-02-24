# Brief: Stäng falska larm + Librarian integration-test
**Datum:** 2026-02-23
**Target:** neuron-hq
**Körning:** #10
**Estimerad tid:** 1 timme

---

## Bakgrund

Två ⚠️-poster i `memory/errors.md` har identifierats som felaktigt diagnosticerade:

1. **"Librarian smoke test producerade inga artefakter"** (session `20260222-1639-aurora-swarm-lab`) — Audit-loggen `runs/20260222-1639-aurora-swarm-lab/audit.jsonl` visar att Librarian faktiskt körde och anropade `write_to_techniques` 8 gånger. Felet uppstod för att ingen kontrollerade audit.jsonl innan ⚠️-posten skapades.

2. **"Brief-baseline manuell process"** — Dokumenterat som löst i runbook (körning #9), men errors.md har status ⚠️ istället för ✅.

Dessutom: `memory/MEMORY.md` påstår "nästa auto-trigger Librarian vid #10" men auto-trigger slog redan till vid körning #9 (10:e entry i runs.md → `(9+1) % 5 = 0`). Nästa auto-trigger sker vid körning #15.

**Baseline (2026-02-23):**
```
npm test → 169/169 passed
npx tsc --noEmit → 0 errors
```

---

## Uppgift 1 — Researcher: Verifiera audit-loggar och dokumentera slutsatser

Läs följande filer och dokumentera vad du hittar i `knowledge.md`:

1. `runs/20260222-1639-aurora-swarm-lab/audit.jsonl` — räkna `write_to_techniques`-anrop
2. `runs/20260223-0700-neuron-hq/audit.jsonl` — bekräfta att Librarian auto-triggrade
3. `memory/techniques.md` — räkna hur många `## `-rubriker som finns

**Leverera:** `ideas.md` med rekommendation om vilka ⚠️-poster som ska stängas och hur.

---

## Uppgift 2 — Implementer: Stäng errors.md-poster + lägg till integration-test

### 2a. Uppdatera `memory/errors.md`

De två ⚠️-posterna ska uppdateras till ✅. Ändra `Status:` på befintliga poster — lägg INTE till nya dubblettposter.

**Post 1:** "Librarian smoke test producerade inga artefakter"
```
**Status:** ✅ Löst — audit.jsonl bekräftar att Librarian körde och skrev 8 poster till techniques.md.
Felet berodde på felaktig diagnos (ingen audit.jsonl-kontroll).
```

**Post 2:** "Brief med inaktuella ruff-fel" (status: ⚠️)
```
**Status:** ✅ Dokumenterat och löst — runbook-avsnitt tillagt i körning #9 (docs/runbook.md).
```

### 2b. Lägg till ett integration-test i `tests/agents/librarian.test.ts`

Lägg till ett nytt `describe`-block: `'integration: full write flow'` med ett test som:
- Skapar en LibrarianAgent med mockad policy och tempDir
- Anropar `executeWriteToTechniques` tre gånger med tre olika entries
- Verifierar att `memory/techniques.md` innehåller alla tre entries
- Verifierar att filen börjar med `# Techniques`

Detta testar att upprepade anrop appendar korrekt (inte överskriver).

### 2c. Kör testsviten och verifiera

```bash
cd /path/to/workspace && npm test
```

Alla 169 (+ det nya testet = 170) tester ska vara gröna.

### 2d. Git commit

```bash
git add memory/errors.md tests/agents/librarian.test.ts
git commit -m "fix: close 2 false-alarm errors, add librarian integration test"
```

---

## Uppgift 3 — Reviewer: STOPLIGHT-rapport

Acceptanskriterier:
1. ✅ `memory/errors.md` har NOLL kvarliggande ⚠️ med falsk diagnos
2. ✅ `tests/agents/librarian.test.ts` har ett nytt integration-test som är grönt
3. ✅ `npm test` är 100% grön (inga regressionstester)
4. ✅ Git commit skapad med korrekta filer
5. ✅ `knowledge.md` dokumenterar audit-logg-granskning och slutsatser

---

## Uppgift 4 — Merger: Applicera commit

Merger applicerar committen från workspace till neuron-hq main.

---

## Noteringar

- Auto-trigger: körning #10 triggar INTE Librarian automatiskt (nästa trigger vid #15)
- errors.md-problemet med dubbelposter: Historian ska UPPDATERA befintliga poster, inte lägga till nya. Instruera Implementer att göra detta manuellt via `write_file` på hela filen om Historian upprepar problemet.
- Historian: skapa entry för körning #10 i runs.md som normalt.
