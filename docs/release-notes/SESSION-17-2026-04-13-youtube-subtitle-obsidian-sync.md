---
session: 17
datum: 2026-04-13
tags: [release-note, youtube, obsidian, sync, subtitles, cascade-delete]
---

# Session 17 — YouTube-subtitles & Obsidian-synk

## Vad är nytt?

- **YouTube-videos transkriberas snabbare och bättre.** Systemet laddar nu ner YouTubes egna undertexter innan det startar Whisper (en taligenkänningsmodell som kör lokalt och tar ~85 sekunder). Om videon har manuella undertexter, som är redigerade av en människa, används de direkt och Whisper körs inte alls. Om YouTube bara har automatiska undertexter (lägre kvalitet) körs Whisper ändå, men de automatiska sparas som referens. Resultatet: kortare ingestningstid för de flesta videor, och bättre metadata i kunskapsgrafen (kanalnamn, beskrivning, kapitel, kategorier och YouTubes egna taggar).

- **Obsidian-exporten är organiserad i mappar.** Alla dina kunskapsfiler i Obsidian läggs nu i rätt undermapp automatiskt: `Aurora/Video/`, `Aurora/Dokument/`, `Aurora/Artikel/` eller `Aurora/Koncept/`. Förut hamnade allt i en och samma mapp, vilket snabbt blev rörigt. Systemet söker rekursivt vid import, så gamla filer på fel ställe hittas ändå.

- **Talare visas som en redigerbar tabell.** I videotranskriptioner visades talare tidigare som teknisk YAML-kod i filhuvudet, som var svårt att redigera. Nu presenteras de som en ren tabell i dokumentet under rubriken "Talare", med kolumner för namn, titel, organisation och konfidenspoäng. Du kan redigera tabellen direkt i Obsidian och ändringarna importeras tillbaka till Aurora.

- **Radering skyddar data i 30 dagar.** Om du tar bort en fil i Obsidian och kör synk raderas noden ur Aurora, men en kopia sparas i 30 dagar. Om du ångrar dig kan du återställa den med kommandot `pnpm neuron obsidian-restore`. Efter 30 dagar rensas kopian automatiskt.

- **Automatisk synk utan polling.** Du kan nu installera en bakgrundstjänst (`pnpm neuron daemon install`) som bevakar din `Aurora/`-mapp i Obsidian. Så fort du sparar en fil triggas en synk direkt. Inga konstant köande processer, inget manuellt `pnpm neuron obsidian-import` behövs. Fungerar via macOS inbyggda launchd och överlever omstart.

## Hur använder jag det?

```bash
# Installera auto-synk-daemon
pnpm neuron daemon install

# Kontrollera status
pnpm neuron daemon status

# Lista raderade noder (30-dagars fönster)
pnpm neuron obsidian-restore --list

# Återställ en specifik nod
pnpm neuron obsidian-restore --id <node-id>
```

Ny YouTube-ingest fungerar som vanligt via Hermes eller direkt:

```bash
pnpm neuron aurora ingest-video <youtube-url>
```

## Vad saknas fortfarande?

Talaridentifieringen behöver förbättras. För IBM Technology-videor returnerade systemet inga namnförslag trots att kanalnamn och beskrivning gavs som kontext. Det verkar som att prompten behöver exempel på hur kanalnamn mappar till verkliga personer.

Talaridentifieringens tids-segmentering klipper på tidsgränser, inte meningsgränser. Det kan hända att en mening delas upp på två olika talare ("prata med din" i talare 1, "befintliga infrastruktur?" i talare 0). Det är ett känt problem som planeras fixas i nästa session.

`tldr`-fältet i videotranskriptioner är just nu den första raden i YouTubes beskrivning, som ofta är reklam eller SEO-text. En riktig sammanfattning från transkriptet kommer.
