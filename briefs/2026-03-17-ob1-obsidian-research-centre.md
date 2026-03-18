# OB-1: Obsidian Research Centre — Tidskodad talartidslinje & Interaktiv Research

## Bakgrund

Aurora indexerar YouTube-videor med transkribering (Whisper) och talaridentifiering (pyannote). Men segmentdata (tidsstämplar + text per talare) kastas idag — bara aggregerade siffror sparas. Obsidian-exporten visar chunks utan talarinfo och utan tidskoder.

Användaren vill att Obsidian ska fungera som **research centre** där man:
1. Ser en tidskodad talartidslinje
2. Kan identifiera/namnge talare med konfidensnivåer
3. Kan markera intressanta avsnitt
4. Får AI-förslag på vem talarna är

## Mål

### Del A: Spara segmentdata

Whisper-segment (tidskod, text) och diarization-segment (tidskod, speaker) finns redan under ingest men sparas inte. Spara dem. Alla tidsstämplar sparas internt som millisekunder men **visas alltid som hh:mm:ss** i all output, export och UI.

**Ändringar:**
- `src/aurora/video.ts` — spara `segments` array på transkript-noden (whisper) och diarization-segment på voice print-noder
- Ingen schema-ändring behövs (JSONB properties)

### Del B: LLM-korrekturläsning av transkript

Whisper gör sitt bästa men producerar ofta stavfel, felaktiga namn och hackig text. En LLM (lokal 20B eller Claude) korrekturläser mening för mening med kontext.

**Pipeline:**
1. Ta rå whisper-segment (med tidsstämplar)
2. För varje mening: skicka [föregående mening] + [aktuell mening] + [nästa mening] till LLM
3. LLM returnerar korrigerad version av den aktuella meningen
4. Spara korrigerad text som `correctedText` på transkript-noden (rå text bevaras som `rawText`)

**Vad LLM:en fixar:**
- Stavning av namn (t.ex. "dario amodai" → "Dario Amodei")
- Tekniska termer (t.ex. "claude code" → "Claude Code")
- Meningsstruktur och skiljetecken
- Repetitioner och filler words ("you know, you know" → "you know")
- Kontext-baserade gissningar (videotitel + kanal ger ledtrådar)

**Modellval:**
- Default: lokal 20B (gratis, snabbt) — t.ex. Qwen 20B via Ollama
- Flagga `--polish-model claude` för högre kvalitet (kostnad)
- Flagga `--no-polish` för att skippa steget helt

**Ny fil:** `src/aurora/transcript-polish.ts`

### Del C: Kombinera talare + text → tidslinje

Skapa en funktion som matchar whisper-segment mot diarization-segment baserat på tidsöverlapp. Resultatet blir en tidslinje:

```
[
  { speaker: "SPEAKER_00", start: "00:00:00", end: "00:00:15", text: "..." },
  { speaker: "SPEAKER_01", start: "00:00:15", end: "00:00:42", text: "..." },
  ...
]
```

> Internt lagras ms för precision, men all extern representation använder hh:mm:ss.

**Gruppering:** Intilliggande segment med samma talare slås ihop till ett block. Ny talare = nytt block.

**Ny fil:** `src/aurora/speaker-timeline.ts`

### Del D: Obsidian-export med talartidslinje

Istället för chunks, exportera video-transkript som en tidskodad vy:

```markdown
---
id: yt-EdZWPB1fIJc
type: transcript
platform: youtube
duration: "08:46"
speakers:
  SPEAKER_00:
    name: ""
    confidence: 0
    role: ""
  SPEAKER_01:
    name: ""
    confidence: 0
    role: ""
---

# Should You Learn Coding Now? Anthropic CEO Explains

## Talare
| ID | Namn | Konfidenspoäng | Roll |
|----|------|-----------|------|
| SPEAKER_00 | _ej identifierad_ | — | — |
| SPEAKER_01 | _ej identifierad_ | — | — |

> Fyll i namn ovan. Konfidenspoäng: 100 = säker, 50 = trolig, 0 = okänd.
> Kör `obsidian-import` för att synka tillbaka till Aurora.

---

## Tidslinje

### 00:00:15 — SPEAKER_00
A bunch of people at Anthropic write code, and so, you know,
we made this internal tool called Claude Code, and because we
ourselves write code, we have a special and unique insight into
how to best use the AI models to write code.

### 00:01:23 — SPEAKER_01
What industry do you think will get disrupted and what has
a certain runway left? I'm asking from the lens of, I'm trying
to figure out what book to read, which college to go to.

### 00:01:45 — SPEAKER_00
I would think about tasks that are human-centered, tasks that
involve relating to people. The stuff like code and software
engineering is becoming more and more AI focused.
```

**Regler:**
- Max 7 rader text per block (ca 150 ord)
- Ny header vid talarbyte
- Tidskod i hh:mm:ss format
- Chunks exporteras INTE för video-transkript (tidslinjen ersätter dem)

### Del E: Markera intressant data

Användaren ska kunna markera avsnitt som extra intressanta — i **Obsidian** och/eller **VS Code**.

#### Obsidian

**Taggar i headers:**
```markdown
### 00:01:45 — SPEAKER_00 #highlight
I would think about tasks that are human-centered...
```

**Callouts för nyckelinsikter:**
```markdown
> [!important] Nyckelinsikt
> ### 00:01:45 — SPEAKER_00
> I would think about tasks that are human-centered...
```

#### VS Code

Exporterade transkript är vanliga markdown-filer — fungerar direkt i VS Code:

- **Kommentarer:** Använd VS Code-tillägget "Comment Anchors" eller "Todo Highlight" för att markera rader med `// HIGHLIGHT`, `// KEY-INSIGHT` etc.
- **Bookmarks:** VS Code's inbyggda bookmarks (Ctrl+Shift+P → "Toggle Bookmark") för att snabbnavigera
- **Inline-kommentarer:** Skriv HTML-kommentarer i markdown som `obsidian-import` kan läsa:
  ```markdown
  ### 00:01:45 — SPEAKER_00
  I would think about tasks that are human-centered...
  <!-- kommentar: Dario's huvudtes om framtiden -->
  ```

#### Stöd för taggar (båda editorer)
- `#highlight` — markerar som intressant
- `#key-insight` — nyckelinsikt
- `#quote` — citat värt att spara
- `#follow-up` — kräver uppföljning
- `<!-- kommentar: fritext -->` — HTML-kommentar (synlig i VS Code, dold i Obsidian preview)

### Del F: AI-gissning av talare

Vid export, använd Claude (eller lokal modell) för att gissa vilka talarna är baserat på:
- Videotitel (t.ex. "Anthropic CEO Explains" → en talare är troligen Dario Amodei)
- Kanalnamn (om tillgängligt)
- Innehållet i transkriptet (t.ex. "we at Anthropic" → sannolikt Anthropic-anställd)
- Talarmönster (intervjuare ställer frågor, gäst svarar)

**Output:** Föreslå namn + konfidenspoäng i frontmatter:
```yaml
speakers:
  SPEAKER_00:
    name: "Dario Amodei"
    confidence: 80
    role: "Gäst / CEO Anthropic"
    reason: "Videotitel nämner 'Anthropic CEO', talaren refererar till 'we at Anthropic'"
  SPEAKER_01:
    name: ""
    confidence: 0
    role: "Intervjuare"
    reason: "Ställer frågor, nämns ej vid namn"
```

### Del G: Obsidian → Aurora synk (obsidian-import)

Nytt CLI-kommando: `npx tsx src/cli.ts obsidian-import`

Läser tillbaka Obsidian-filer och synkar:
- Talarnamn och konfidenspoäng → uppdaterar speaker_identity-noder i Aurora
- Taggar (#highlight, #key-insight) → sparas som metadata på relevanta noder
- Dubbelriktad synk: Aurora → Obsidian (export) och Obsidian → Aurora (import)

## Körordning

1. **Del A** — Spara segmentdata (liten ändring i video.ts)
2. **Del B** — LLM-korrekturläsning (transcript-polish.ts)
3. **Del C** — speaker-timeline.ts (matcha talare + polerad text)
4. **Del D** — Uppdatera obsidian-export.ts för talartidslinje
5. **Del E** — Taggar och markeringar i export-formatet
6. **Del F** — AI-gissning av talare (Claude/lokal vid export)
7. **Del G** — obsidian-import (synk tillbaka från Obsidian)

## Tester

- Spara och läsa segment från DB
- Korrekt tidsmatchning mellan whisper och diarization
- Tidskods-formatering (hh:mm:ss)
- Max 7 rader per block
- Talarbyte skapar ny header
- Frontmatter-parsning vid import
- Tagg-extraktion (#highlight etc.)

## Befintliga filer att ändra

- `src/aurora/video.ts` — spara segment-arrays
- `src/commands/obsidian-export.ts` — ny formattering
- `aurora-workers/diarize_audio.py` — redan fixad för pyannote 4.x

## Nya filer

- `src/aurora/speaker-timeline.ts` — segment-matchning och tidslinje
- `src/commands/obsidian-import.ts` — synk tillbaka från Obsidian

## Risker

- Tidsmatchning whisper↔diarization kan ha luckor/överlapp
- Segment-arrays kan bli stora för långa videor (1h+ → 1000+ segment)
- AI-gissning kräver API-anrop (kostnad)
- Obsidian-import behöver robust frontmatter-parsning

## Beroenden

- pyannote 4.x (fixat i S97)
- torchcodec 0.10.0 (fixat i S97)
- Befintlig obsidian-export infrastruktur
- Befintlig speaker-identity.ts för Del F
