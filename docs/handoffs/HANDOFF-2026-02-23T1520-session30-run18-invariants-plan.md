# Handoff — Session 30
**Datum:** 2026-02-23T15:20
**Körning:** #18 klar
**Nästa:** Körning #19 — `memory/invariants.md` + Historian-uppdatering

---

## Status vid avlämning

### Tester
```
npm test → 267/267 gröna (30 testfiler)
npx tsc --noEmit → 0 errors
Öppna ⚠️ i errors.md → 0
```

### Senaste commit
`5e6808a` — test: negative regression guards + prompt coverage meta-test

### Vad körning #18 levererade
- 7 lint-testfiler: +1 negativt regressionstest vardera (`.replaceAll()` + `.not.toMatch()`)
- `tests/prompts/coverage.test.ts`: ny — 3 metatester, vaktar att alla `prompts/*.md` har lint-test
- `tests/prompts/librarian-lint.test.ts`: ny — 6 tester, skapades pga coverage-testet fångade luckan direkt
- Tester: 251 → 267 (+16), 28 → 30 testfiler

---

## Vad som diskuterades (session 30)

### Djup reflektion (sparad i `docs/samtal-2026-02-23T1455-djup-reflektion.md`)
- Memorysystemet är starkaste delen — feedback-loop: errors.md → brief → fix → commit
- Token-kostnad är hög (933k för #18, 1.1M för #15) — Manager läser för mycket för prescriptive briefs
- Systemet har aldrig testats under verklig stress (multi-fil TypeScript, otydliga krav, Reviewer säger 🔴)
- coverage.test.ts fångade en *implicit strukturinvariant* — det är en ny kategori av minne vi saknar

### Insikten om minne & agenter
Frågan var: är embedding dags?

**Svar: Nej — inte som nästa steg.**

Flaskhalsen är inte retrieval utan att *implicit strukturkunskap aldrig görs explicit*.
Coverage.test.ts löste ett symptom — vi behöver en systematisk lösning.

**Vägen framåt (prioritetsordning):**

1. **`memory/invariants.md`** — ny minnesfil för strukturkrav som alltid måste gälla
   - Format: `[INV-001] Beskrivning | Vaktas av: X | Tillagd: körning Y`
   - Historian uppdaterar vid varje körning när ny invariant identifieras
   - Bekräftat av: StructMemEval 2026, A-MEM NeurIPS 2025, LoCoMo-Plus 2026

2. **Live-Evo-metadata i `patterns.md`** — `Används:` + `Senast relevant:` per mönster
   - Enkelt att lägga till, ger synlighet om vilka mönster som faktiskt används

3. **Explicit länkning** — A-MEM-stil `Relaterat:`-fält mer konsekvent
   - Redan halvvägs i errors.md — standardisera

4. **Embedding-sökning** — *sedan*, när strukturen är bättre
   - BudgetMem: enkel uppgift → keyword, komplex → embedding

**Relevant research (redan i techniques.md):**
- LoCoMo-Plus: keyword-sökning misslyckas för implicita constraints
- StructMemEval: strukturerat minne >> ostrukturerat, men LLMs behöver explicit guidning om struktur
- A-MEM: länkade minnen är nästa steg efter kategorisering
- Live-Evo: förstärk/förfall för patterns.md
- TAME: dual-memory förhindrar att minnet eroderar

---

## Körning #19 — Brief-specifikation

### Uppgift
Implementera `memory/invariants.md` + uppdatera Historian-promten + lägga till Live-Evo-metadata-fält i patterns.md.

### Vad ska göras

**1. Skapa `memory/invariants.md`** med de invarianter vi redan vet om:
```
INV-001: Varje prompts/*.md → tests/prompts/*-lint.test.ts (vaktas av coverage.test.ts)
INV-002: Librarian körs FÖRE Historian (vaktas av manager.md ordning)
INV-003: Alla 8 agenter har withRetry() runt messages.stream() (vaktas av agent-utils.test.ts)
```

**2. Uppdatera `prompts/historian.md`** — ny instruktion:
- Läs `memory/invariants.md` innan skrivning
- Om körningen avslöjar en ny strukturinvariant → lägg till i invariants.md
- Format: `[INV-NNN] Beskrivning | Vaktas av: X | Tillagd: körning Y`

**3. Lägg till metadata-fält i `memory/patterns.md`**:
Varje befintligt mönster får `**Körningar:** #X, #Y, #Z` — populeras av Historian framöver.

**4. Lint-test för invariants.md** (`tests/memory/invariants-lint.test.ts`):
- Verifiera att filen finns och har minst 3 INV-poster
- Verifiera format: `[INV-` prefix

**5. Uppdatera coverage.test.ts** om det behövs för att inkludera invariants.md i sin täckningskontroll.

### Acceptanskriterier (körning #19)
1. `memory/invariants.md` skapad med minst 3 INV-poster
2. `prompts/historian.md` uppdaterad med invariants-instruktion
3. `tests/memory/invariants-lint.test.ts` skapad med 3+ tester
4. Varje befintligt mönster i patterns.md har `**Körningar:**`-metadata
5. `npm test` → 270+ gröna
6. `npx tsc --noEmit` → 0 errors
7. Git commit

---

## Filer att känna till

| Fil | Syfte | Status |
|-----|-------|--------|
| `memory/invariants.md` | NY — strukturkrav | Ska skapas i #19 |
| `memory/patterns.md` | Mönster | Ska få metadata |
| `memory/errors.md` | Fel | 0 öppna ⚠️ |
| `memory/techniques.md` | Arxiv-forskning | 29 papers |
| `prompts/historian.md` | Historian-instruktion | Ska uppdateras |
| `tests/prompts/coverage.test.ts` | Meta-test lint-täckning | ✅ Ny i #18 |
| `tests/memory/invariants-lint.test.ts` | NY lint-test | Ska skapas i #19 |

---

## Miljöpåminnelser
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
npm test                          # kör tester
npx tsx src/cli.ts run neuron-hq --brief briefs/<datum>-<slug>.md --hours 1
```
Brief-fil: skapa `briefs/2026-02-23-invariants-historian-live-evo.md`

---

## Nästa steg i prioritetsordning
1. **Körning #19** — invariants.md + Historian-uppdatering (detta dokument)
2. **Aurora-swarm-lab körning #9** — mypy hot-path i `swarm/route.py`
3. **Körning #20** — stresstest med öppen brief (testa systemets autonomi)
