# Brief: patterns.md — Senast bekräftad-fält och glömska-struktur
**Datum:** 2026-02-24
**Target:** neuron-hq
**Körning:** #27

---

## Bakgrund

`memory/patterns.md` har 17 mönster idag och växer med varje körning — men inget tas bort eller nedvärderas. Gamla mönster kan bli inaktuella utan att systemet märker det.

Samtalet 2026-02-24: "patterns.md är en ackumulator utan glömska. Om fem år har vi 200 mönster. Ingen agent kan absorbera det effektivt."

Forskning bekräftar (Live-Evo, TAME, MIRA i techniques.md): minnessystem behöver en decay-mekanism för att inte ackumulera bias.

Lösningen nu: lägg till ett `**Senast bekräftad:**`-fält på varje mönster, och instruera Historian att uppdatera det när ett mönster används eller bekräftas i en körning.

---

## Uppgift

Tre delar:

1. Lägg till `**Senast bekräftad:**`-fält på alla befintliga 17 mönster i `memory/patterns.md`
2. Uppdatera `prompts/historian.md` med instruktion att sätta/uppdatera fältet
3. Uppdatera `prompts/historian.md` med Pattern Entry Format (nytt fält)

---

## Exakta ändringar

### 1. `memory/patterns.md` — Lägg till fält på alla 17 befintliga mönster

Lägg till `**Senast bekräftad:** okänd` på varje befintligt mönster, direkt efter `**Körningar:**`-fältet. Exempel:

```markdown
## Kompakt testutdata förhindrar context overflow
**Kontext:** ...
**Lösning:** ...
**Effekt:** ...
**Körningar:** #11
**Senast bekräftad:** okänd
```

### 2. `prompts/historian.md` — Uppdatera Pattern Entry Format

Nuvarande format:
```markdown
## <Short pattern title>
**Kontext:** <when/where this was discovered>
**Lösning:** <what was done>
**Effekt:** <why it worked / what it improved>
**Keywords:** <comma-separated keywords>
**Relaterat:** <optional links>
```

Ersätt med:
```markdown
## <Short pattern title>
**Kontext:** <when/where this was discovered>
**Lösning:** <what was done>
**Effekt:** <why it worked / what it improved>
**Keywords:** <comma-separated keywords>
**Relaterat:** <optional links>
**Körningar:** #<N>
**Senast bekräftad:** <runid or "okänd">
```

### 3. `prompts/historian.md` — Nytt steg i "Write to patterns"

Lägg till efter det befintliga steget 4 (Write to patterns):

```
When writing a new pattern, always include **Senast bekräftad:** set to the current runid.

When an existing pattern was visibly confirmed during this run (e.g. the brief explicitly
used that technique, or audit.jsonl shows the pattern in action), update its
**Senast bekräftad:** field using write_to_memory with the current runid.
```

---

## Baseline (verifierad 2026-02-24)

```
npm test → 292 passed (292), 31 test files
npx tsc --noEmit → 0 errors
memory/patterns.md har 17 mönster, inget har Senast bekräftad-fält
```

---

## Acceptanskriterier

1. Alla 17 mönster i `memory/patterns.md` har `**Senast bekräftad:**`-fält
2. `prompts/historian.md` innehåller `Senast bekräftad` i Pattern Entry Format
3. `prompts/historian.md` innehåller instruktion om att uppdatera fältet vid bekräftelse
4. `npm test` → **292 passed**
5. `npx tsc --noEmit` → 0 errors
6. `tests/prompts/historian-lint.test.ts` uppdateras med regex-test som verifierar att `Senast bekräftad` finns i prompten
7. Git commit: `feat: add Senast bekräftad field to patterns for memory decay tracking`

---

## Begränsningar

- Rör bara `memory/patterns.md`, `prompts/historian.md`, och `tests/prompts/historian-lint.test.ts`
- Ingen ändring i produktionskod (`src/`)
- Ingen automatisk borttagning av mönster — bara fältstruktur och instruktioner nu
