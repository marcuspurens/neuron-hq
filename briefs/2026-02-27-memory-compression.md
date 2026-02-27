# Brief: Memory-komprimering — rensa runs.md och patterns.md

## Bakgrund

`memory/runs.md` och `memory/patterns.md` växer utan gräns. Historian uppdaterar dem
kontinuerligt (lägger till poster) men städar aldrig. `errors.md` har anti-dubbletter
men inga av de andra filerna har komprimeringslogik.

Konsekvenser:
- Agenter laddar in hela filen i kontext trots att äldre poster är irrelevanta
- Sökning i `memory/` ger många träffar för samma mönster (dubbletter och bekräftelser)
- `patterns.md` har `[UPPDATERING]`-block som är svåra att söka i

## Uppgift

Implementera en Historian-körning (en engångsrensning) som komprimerar `runs.md` och
`patterns.md` enligt de regler som definieras nedan. Det är INTE en kodändring —
det är en ren minneskörning där Historian skriver om filerna direkt.

## Acceptanskriterier

- [ ] `memory/runs.md`: Körningar äldre än 30 dagar komprimeras till en rad per körning
  (format: `| <datum> | <run-id> | <en mening om vad som gjordes> |`)
  Körningar nyare än 30 dagar behåller full formatering.
- [ ] `memory/patterns.md`: `[UPPDATERING]`-block slås samman med sin föräldrapost.
  Föräldraposten uppdateras med "Senast bekräftad: <datum>" och antal bekräftelser.
  Lösa `[UPPDATERING]`-block (utan tydlig föräldra) arkiveras i en ny sektion längst ned.
- [ ] `memory/patterns.md`: Mönstret "Tvåfas-Merger (PLAN/EXECUTE via answers.md)"
  markeras som `[OBSOLET — ersatt av Single-phase Merger, se nedan]` och arkiveras
  längst ned i filen. Det ska inte raderas (historisk referens).
- [ ] Inga data förloras — allt komprimerat innehåll är fortfarande sökbart
- [ ] Historian skriver en sammanfattning av vad som gjordes i `runs/<runid>/knowledge.md`

## Vad som INTE ska ändras

- `memory/errors.md` — har redan sin egen struktur, lämnas orörd
- `memory/techniques.md` — hanteras av Librarian, lämnas orörd
- `memory/invariants.md` — lämnas orörd
- Ingen kod ändras — detta är en ren minneskörning

## Tekniska detaljer

Historian ska:
1. Läsa `memory/runs.md` och `memory/patterns.md` med `read_memory_file`
2. Skriva om filerna med `write_memory_file` enligt reglerna ovan
3. Verifiera med `read_memory_file` efter varje skrivning (read-after-write)
4. Köra `pnpm test` och `pnpm typecheck` som baseline-verifiering (inga kodändringar,
   men testar att filerna är välformade och att systemet fungerar efter rensningen)

## Risk

Low — inga kodändringar. Historian skriver bara minnesfiler. Rollback: `git checkout
memory/runs.md memory/patterns.md` om något gick fel.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test
```

Förväntat baseline: 357 passed (eller fler om merger-auto-commit körts dessförinnan).
