# Session 136 — Code Anchor testkörning mot Brief 3.2b

**Datum:** 2026-03-23 22:00
**Branch:** `swarm/20260322-1724-neuron-hq`
**Commits:** `521fabe` (prompt-förbättring) + brief-fix (ej committad ännu)

## Vad som hände

### 1. Code Anchor-prompten förbättrad
Tre svagheter identifierade och fixade i `prompts/code-anchor.md`:

- **Severity-nivåer** (`BLOCK/WARN/INFO`) — varje avvikelse klassas efter allvarlighet, med tydliga exempel och gränsdragning
- **Nyanserad rekommendation** — tre mallar istället för binärt JA/NEJ (⛔ BLOCK > 0 / ⚠️ bara WARN / ✅ allt OK)
- **Explicit exit-villkor** — agenten vet exakt när den är klar och vad som saknas

Alla 30 code-anchor-tester gröna efter ändring. Committad: `521fabe`.

### 2. Manuell Code Anchor-körning mot Brief 3.2b

**Episkt moment:** Första riktiga testkörningen av Code Anchor — och den hittade 4 BLOCK, 3 WARN, 1 INFO.

#### BLOCK (briefen bygger på felaktig kod-bild)

| # | Fynd | Detalj |
|---|------|--------|
| 1 | `pprQuery` existerar inte | Funktionen heter `personalizedPageRank` — helt annat namn OCH helt annan signatur (`nodes[], edges[], seeds Map` — inte KnowledgeGraph) |
| 2 | `DuplicateCandidate`-typen existerar inte | Returtypen är inline: `Array<{ nodeA: string; nodeB: string; similarity: number }>` |
| 3 | `generalizes`-kanttyp finns inte | Refereras som "tillagd i 3.2a" men 3.2a har inte körts |
| 4 | `personalizedPageRank()` signatur kräver adapter | Tar primitiver, inte KnowledgeGraph — adapter-logik behövs |

#### WARN

| # | Fynd | Detalj |
|---|------|--------|
| 1 | "Bara Jaccard" stämmer inte | Consolidator kör redan Jaccard + Embeddings-fallback (rad 388-433) |
| 2 | Parameternamn `threshold` | Heter `similarityThreshold` i koden |
| 3 | Priority Order "position 5" | Är position 4 (0-indexerad tabell) |

#### INFO
- Sektionsnamn "Finding Candidates" → heter "Merge Duplicates" i prompten

### 3. Brief 3.2b korrigerad

Alla 4 BLOCK + 3 WARN + 1 INFO fixade direkt i briefen:
- `pprQuery` → `personalizedPageRank` med korrekt signatur och adapter-dokumentation
- `DuplicateCandidate` → faktisk inline-returtyp
- `generalizes`-referens med tydlig varning om 3.2a-beroende
- Embeddings-fallback dokumenterad (inte "bara Jaccard")
- Alla parameternamn och positionsreferenser korrigerade

## Insikter

**Code Anchor bevisar sitt värde direkt.** Briefen hade 4 blockerande avvikelser som Brief Reviewer ALDRIG hade hittat (den ser aldrig koden). Om briefen hade gått direkt till körning hade Implementern suttit fast.

Mest anmärkningsvärt: `pprQuery` vs `personalizedPageRank` — briefen refererade ett funktionsnamn som aldrig existerat. Det var en mental modell-hallucination av exakt den typ som Code Anchor designades för att fånga.

## Status

| Objekt | Status |
|--------|--------|
| Code Anchor prompt | ✅ Severity + exit-villkor (committad) |
| Brief 3.2b | ✅ Alla avvikelser korrigerade (ej committad) |
| Code Anchor testkörning | ✅ Manuell körning klar — agenten fungerar |
| 3844 tester | ✅ Gröna |

## Nästa steg

1. **Committa brief 3.2b-fix**
2. **Bolla 3.2b genom Brief Reviewer** — nu med korrekta kodreferenser
3. **Köra 3.2a** — 3.2b beror på den
4. **Köra 3.2b** — efter 3.2a
