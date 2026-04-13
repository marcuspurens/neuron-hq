# Dagbok — Projekt Bifrost, 13 april 2026 (Session 5)

> Version: Senior Developer / Arkitekt

---

## Kontext

Meta-session: analys av leveransgate-mönstret från SYSTEMPROMPT-BIFROST.md. Inte ny arkitekturproduktion — utan undersökning av *varför* kvalitetsmekanismen fungerar, med implikationer för LLM-instruktionsdesign generellt.

## Analysens kärnfynd

### Rotorsak (5-varför)

1. Varför fungerar gaten? → Tvingar paus + perspektivskifte
2. Varför behövs tvång? → Default-generation efter leverans = avslutning
3. Varför avslutning? → Statistisk vikt från träningsdata (leverera → "vad härnäst?")
4. Varför bryter inte bakgrundsinstruktioner det? → Uppgifter har högre attention-vikt
5. **Varför?** → **RLHF optimerar för uppgiftslösning, inte processfölsamhet**

**Slutsats:** Gaten fungerar för att den förvandlar process till uppgift — samma format som modellen redan optimerar för.

### Avgörande formuleringar i prompten

| Formulering | Mekanism |
|---|---|
| "INNAN du presenterar" | Gate på kritiska vägen, inte eftertanke |
| "kollade INTE" + "minst 2 specifika" | Negation + minimum → tvingar frånvaro-sökning |
| "jag är nu [roll]" | Persona-aktivering > "tänk som" |
| "kör" + "skriv resultatet" | Imperativ + synlighet → extern signal, inte text om signal |
| "teater, inte gate" | Emotionell laddning som skärper skillnaden |
| "vilket i sig är en signal" | Stänger nödutgångar utan att straffa |

### Identifierade risker

1. **Ritualisering** — gate som alltid producerar fynd kan generera plausibel fyllnad
2. **Fossilisering** — samma format varje gång → samma typ av svar
3. **Meta-gaten är svag** — "aldrig hittar något" triggar omprövning, men "alltid hittar något" granskas inte

### Designprinciper (generaliserbara)

1. Uppgift slår bakgrund — processer måste formuleras som uppgifter
2. Struktur slår intention — "skriv 4 rader i detta format" > "var noggrann"
3. Explicit frånvaro kräver tvång — "minst 2" > öppen fråga
4. Extern signal bryter intern koherens — sökning > reflektion
5. Timing > innehåll — obligatorisk gate på rätt ställe > sofistikerad valfri process

## Leverabler

- `docs/samtal/samtal-2026-04-13T2200-leveransgate-djupanalys.md` (~550 rader)
  - Del 0: Annoterad källtext med avgörande formuleringar
  - Del 1-9: Ordagrant tankeresor
  - 2 Mermaid-diagram (komplett flöde + session 4-exempel)
  - Sammanfattningstabell

## Implikation för Bifrost

Leveransgaten är inte bara en Bifrost-intern mekanism — den är ett mönster för LLM-styrning generellt. Om Bifrost bygger agent-pipelines för 3000 anställda behöver varje agent-typ sin egen variant av detta: obligatoriska kvalitetsgates formulerade som uppgifter, inte som bakgrundsinstruktioner.
