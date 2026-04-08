---
session: 3
datum: 2026-03-30
tags: [release-note, pdf, briefing, decay, hermes]
---

# Session 3 — PDF och briefing verifierade + Hermes-plan

Session 3 handlade om att verifiera att grunden verkligen fungerar: kan Aurora läsa en PDF, generera en briefing, och städa bort föråldrad kunskap? Svaret är ja på alla tre. Dessutom lades en konkret plan för att koppla Aurora till en chattrobot (Hermes).

## Vad är nytt?

- **PDF-ingest verifierad end-to-end.** Det är en sak att bygga en PDF-pipeline i teorin, en annan att faktiskt köra den. Den här sessionen testades hela flödet med en verklig PDF (130 ord): pypdfium2 (ett bibliotek som läser PDF-filer) extraherade texten, texten delades upp i lagom stora bitar (chunks), varje bit omvandlades till en sökbar vektor (embedding), och resultatet landade som 2 noder i Aurora-grafen. Det bekräftar att inga steg föll bort mitt i kedjan.

- **Morgonbriefing verifierad.** Briefing-systemet söker igenom Aurora, väljer ut de mest relevanta noderna (i det här fallet 38 noder), låter en AI-modell formulera 3 frågor och insikter baserade på dem, och skriver sedan resultatet till Obsidian-vaulten som en datumstämplad fil. Testkörningen genererade filen `briefing-2026-03-29.md` med korrekt innehåll. Briefingen fungerar alltså som ett dagligt brev från kunskapsbasen till dig.

- **Decay-kommandot rapporterar nu vad det gör.** Decay är processen som låter äldre kunskap "tona ut" med tiden, precis som ett minne bleknar om man inte återkommer till det. Tidigare var decay en tyst operation utan kvitto. Nu skapar den två saker: (1) en JSON-loggfil i mappen `logs/decay/` som listar exakt vilka noder som påverkades och hur mycket deras konfidenspoäng sjönk, och (2) en sammanfattningsnod i Aurora-grafen med de 10 mest påverkade noderna och de parametrar som användes. I testkörningen sjönk 27 noder i snitt från 0.74 till 0.66 i konfidenspoäng. Du kan nu se vad som håller på att bli föråldrat innan det försvinner helt.

- **Plan för Hermes Agent klar (7 faser).** Hermes är det tänkta gränssnittet mot Aurora via chatt, Signal eller Telegram. Den här sessionen producerade ett konkret 7-fas gameplan för hur Hermes ska installeras och kopplas till Aurora. Signal undersöktes som första alternativ, men session 4 avslöjar att det inte fungerar i praktiken. Telegram valdes istället.

## Hur använder jag det?

```bash
# Se vilka noder som SKULLE påverkas utan att ändra något
pnpm neuron aurora:decay --dry-run

# Kör decay på riktigt (uppdaterar konfidenspoäng + skapar logg)
pnpm neuron aurora:decay

# Generera morgonbriefing till Obsidian-vaulten
pnpm neuron morning-briefing
```

## Vad saknas fortfarande?

- Hermes Agent är inte installerad ännu. Det finns bara en plan, inga terminaler som körs. Installation och driftsättning sker i session 4.
- Decay-loggfilen skapas men visas inte automatiskt i Obsidian. Du behöver öppna den manuellt i mappen `logs/decay/`.
