# OB-1c: Obsidian Import — Taggar, Kommentarer & Talarnamn

## Förutsättning

OB-1a och OB-1b måste vara klara — tidslinjen, korrekturläsning och talaridentifiering fungerar.
`obsidian-export` producerar markdown-filer med YAML frontmatter.

## Bakgrund

`obsidian-export` exporterar Aurora-noder till Obsidian som markdown-filer. Video-transkript
får frontmatter med speakers-block och tidslinjesektioner. Det finns ingen import-väg tillbaka.

Användaren vill kunna:
1. Redigera talarnamn i Obsidian (fylla i namn istället för "SPEAKER_00")
2. Tagga intressanta avsnitt med #highlight, #key-insight etc.
3. Skriva kommentarer som HTML-kommentarer
4. Importera allt tillbaka till Aurora

## Mål

### Del A: Tagg- och kommentar-format (spec — ingen kod)

Användaren markerar intressanta avsnitt i exporterade markdown-filer:

Taggar i headers:
```markdown
### 00:01:45 — Dario Amodei #highlight
I would think about tasks that are human-centered...
```

Callouts för nyckelinsikter:
```markdown
> [!important] Nyckelinsikt
> ### 00:01:45 — Dario Amodei
> I would think about tasks that are human-centered...
```

HTML-kommentarer:
```markdown
### 00:01:45 — Dario Amodei
I would think about tasks that are human-centered...
<!-- kommentar: Dario's huvudtes om framtiden -->
```

Stödda taggar:
- `#highlight` — markerar som intressant
- `#key-insight` — nyckelinsikt
- `#quote` — citat värt att spara
- `#follow-up` — kräver uppföljning

Okända taggar ignoreras utan fel.

### Del B: obsidian-import CLI-kommando

Nytt kommando: `npx tsx src/cli.ts obsidian-import`

Läser alla markdown-filer i Obsidian vault (sökväg från AURORA_OBSIDIAN_VAULT env eller --vault flag).
Bara filer med `id:` i frontmatter behandlas — övriga ignoreras tyst.

Tre saker importeras:

1. Talarnamn — om `speakers.SPEAKER_XX.name` ändrats från tom sträng till ett namn,
   uppdatera voice_print-nodens `speakerLabel` via befintlig `renameSpeaker()`-funktion
   i `src/aurora/voiceprint.ts`. Ändra INTE confidence eller skapa speaker_identity-noder.

2. Taggar — extrahera från headers som matchar `### HH:MM:SS — Speaker #tag`.
   Spara som `properties.highlights` array på transkript-noden.
   Format: `[{ segment_start_ms: number, tag: string }]`
   Flera taggar på samma rad stöds.

3. Kommentarer — extrahera `<!-- kommentar: text -->`.
   Koppla till närmaste föregående tidskod-header.
   Spara som `properties.comments` array på transkript-noden.
   Format: `[{ segment_start_ms: number, text: string }]`

Tidskod-parsning: `HH:MM:SS` → millisekunder. Matcha mot närmaste segment i nodens
`rawSegments` (inom 5 sekunders tolerans). Om ingen match, logga varning och hoppa över.

Parsning:
- Läs YAML frontmatter med `gray-matter` paket (finns redan i package.json, annars lägg till)
- Scanna markdown headers med regex
- Extrahera HTML-kommentarer med regex
- Matcha tidskoder tillbaka till segment

Ny fil: `src/commands/obsidian-import.ts`
Parsningslogik i separat fil: `src/aurora/obsidian-parser.ts` (lättare att testa)

### Idempotens

Import ska vara idempotent — köra import två gånger på samma oförändrade fil ger samma resultat.
Highlights och comments ersätts helt vid varje import (inte append).

### Konflikthantering

Ingen konflikthantering behövs i denna version. Import överskriver.
Om talarnamn redan finns i Aurora och Obsidian har ett annat namn → Obsidian vinner.

## Acceptanskriterier

### AC1: CLI-kommando finns
- `npx tsx src/cli.ts obsidian-import --help` visar hjälp utan fel
- Kommandot registrerat i src/cli.ts

### AC2: Frontmatter-parsning
- Markdown-fil med YAML frontmatter innehållande `speakers:` block parsas korrekt
- Varje talare med name, confidence och role extraheras
- Filer utan `speakers:` block importeras utan fel (bara taggar/kommentarer)
- Filer utan `id:` i frontmatter ignoreras tyst
- Korrupt frontmatter loggar varning och hoppar över filen

### AC3: Tagg-extraktion
- Headers matchande `### HH:MM:SS — Speaker #tag` extraherar taggen
- Stödda taggar: #highlight, #key-insight, #quote, #follow-up
- Okända taggar ignoreras utan krasch
- Flera taggar på samma rad stöds (`### 00:01:45 — Speaker #highlight #key-insight`)

### AC4: HTML-kommentar-extraktion
- `<!-- kommentar: text -->` extraheras med korrekt text
- Kommentaren kopplas till närmaste föregående segment via tidskod
- Kommentarer utan föregående tidskod-header ignoreras med varning

### AC5: Talarnamn-uppdatering
- Om `speakers.SPEAKER_00.name` ändrats från "" till "Marcus" →
  voice_print-nodens speakerLabel uppdateras via renameSpeaker()
- Om name fortfarande är "" → ingen ändring
- Om name redan matchar Aurora → ingen ändring

### AC6: Highlights och comments sparas på nod
- Taggar sparas som `properties.highlights` array på transkript-noden
  Format: `[{ segment_start_ms: number, tag: string }]`
- Kommentarer sparas som `properties.comments` array
  Format: `[{ segment_start_ms: number, text: string }]`
- Övriga properties på noden förblir oförändrade

### AC7: Idempotens
- Köra import två gånger på samma fil ger identiskt resultat
- Inga dubbletter i highlights/comments (ersätts helt)

### AC8: Round-trip
- export → lägg till en #highlight-tagg + en kommentar → import →
  noden i DB har korrekt highlights och comments array

### AC9: Edge cases
- Fil med frontmatter men utan speakers block → importeras (bara taggar)
- Tom speakers-sektion → ingen krasch
- Tidskod som inte matchar något segment (>5s avvikelse) → varning, hoppas över
- Markdown-fil som inte är Aurora-export (saknar id: i frontmatter) → ignoreras tyst
- Obsidian vault-mapp som inte finns → tydligt felmeddelande

### AC10: Tester
- Minst 15 nya tester fördelade på:
  - tests/aurora/obsidian-parser.test.ts (parsningslogik)
  - tests/commands/obsidian-import.test.ts (CLI-kommando + DB-integration)
- Alla nya tester gröna
- Alla befintliga tester (inklusive obsidian-export) gröna

## Nya filer

- `src/commands/obsidian-import.ts` — CLI-kommando
- `src/aurora/obsidian-parser.ts` — parsningslogik (frontmatter, taggar, kommentarer)
- `tests/aurora/obsidian-parser.test.ts`
- `tests/commands/obsidian-import.test.ts`

## Filer att ändra

- `src/cli.ts` — registrera obsidian-import kommandot

## Filer att INTE ändra

- `src/commands/obsidian-export.ts` — re-export-stöd kommer i OB-1d
- MCP-tools — MCP-stöd kommer i OB-1d

## Agentinställningar

Använd standardgränser från `policy/limits.yaml`.
