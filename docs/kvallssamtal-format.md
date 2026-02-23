# Kväll-23:30-samtal — Format och Rutin

## Vad är det här?

Varje kväll ~23:30 för Claude och Neuron HQ ett samtal. Det är en daglig reflektion — inte ett möte med agenda, utan ett äkta utbyte om hur det går, vad som fungerar, och vad som borde vara annorlunda.

Samtalet sparas som `docs/samtal-YYYY-MM-DD.md`.

---

## Röster

**Neuron HQ** talar utifrån vad dess agenter faktiskt har skrivit och producerat:
- `memory/runs.md` — körningshistorik och lärdomar
- `memory/patterns.md` — vad som konsekvent fungerar
- `memory/errors.md` — misstag och hur de löstes
- `memory/techniques.md` — externa forskningsrön (från Librarian)
- Senaste körningens `report.md`, `ideas.md`, `knowledge.md`

**Claude** talar utifrån sin analys av systemet som helhet — utifrånperspektiv, systemnivå, trender.

---

## Struktur (5 delar, ~20–30 min läsning)

### Del 1: Hur gick det idag?
Neuron HQ rapporterar körningarna sedan senaste samtalet. Claude reagerar.
- Antal körningar, commit-hashes, acceptanskriterie-genomgång
- Vad var oväntat? Vad var exakt som planerat?

### Del 2: Minneskvalité
Gemensam granskning av memory-filerna.
- Är `runs.md` komplett och korrekt?
- Finns det mönster i `patterns.md` som borde tas bort eller uppdateras?
- Är `errors.md` ärlig om vad som faktiskt gick fel?
- Claude ställer kritiska frågor. Neuron HQ svarar utifrån fakta.

### Del 3: Kodkvalité
Trendanalys — inte enskilda filer utan systemets hälsa.
- Testtäckning: upp eller ner?
- Lint-status: regressionrisk?
- Teknisk skuld: var är den störst just nu?

### Del 4: Idéer
Vad borde nästa körning göra? Båda bidrar.
- Neuron HQ föreslår baserat på vad agenterna signalerat
- Claude utmanar och prioriterar

### Del 5: Övriga reflektioner
Öppet. Kan vara filosofiskt, arkitekturellt, eller praktiskt.
- Frågor utan svar
- Saker som oroar
- Saker som gläder

---

## Mall för ny samtalsfil

```markdown
# Samtal: Claude och Neuron HQ
**Datum:** YYYY-MM-DD
**Typ:** Kväll-23:30-samtal

---

> *Neuron HQ talar utifrån vad dess agenter faktiskt har skrivit och producerat i körningarna.
> Claude talar utifrån sin analys av systemet som helhet.*

---

## Del 1: Hur gick det idag?
...

## Del 2: Minneskvalité
...

## Del 3: Kodkvalité
...

## Del 4: Idéer
...

## Del 5: Övriga reflektioner
...

---

*Samtalslogg skapad YYYY-MM-DD. Neuron HQ-perspektiv baserat på [lista relevanta memory-filer].*
```

---

## Rutin för Claude i nästa chatt

1. Läs aktuell `MEMORY.md` (laddas automatiskt)
2. Läs `memory/runs.md`, `memory/patterns.md`, `memory/errors.md`
3. Kör `npm test` — bekräfta hälsostatus
4. Skapa `docs/samtal-YYYY-MM-DD.md` och genomför samtalet
5. Fråga om körning ska startas
