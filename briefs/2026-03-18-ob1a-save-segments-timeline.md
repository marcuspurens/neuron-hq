# OB-1a: Spara segmentdata & Bygg talartidslinje

## Bakgrund

Aurora indexerar YouTube-videor med Whisper (transkribering) och pyannote (talaridentifiering). Men segmentdata (tidsstämplar + text per talare) kastas idag — bara aggregerade siffror sparas. Vi behöver spara dem för att kunna bygga en tidskodad talartidslinje.

## Mål

### Del A: Spara segmentdata i video.ts

Whisper-segment (start_ms, end_ms, text) och diarization-segment (start_ms, end_ms, speaker) finns redan under ingest men sparas inte. Spara dem.

**Ändringar i `src/aurora/video.ts`:**

1. Spara whisper `segments` array på transkript-nodens properties:
   ```typescript
   properties: {
     ...existing,
     rawSegments: transcribeMeta.segments,  // [{start_ms, end_ms, text}, ...]
   }
   ```

2. Spara diarization-segment på voice print-nodens properties:
   ```typescript
   properties: {
     ...existing,
     segments: speakerSegments,  // [{start_ms, end_ms}, ...]
   }
   ```

- Ingen schema-ändring behövs (JSONB properties)
- Alla tidsstämplar sparas internt som millisekunder men **visas alltid som hh:mm:ss** i all output, export och UI

### Del B: speaker-timeline.ts — Kombinera talare + text

Ny fil: `src/aurora/speaker-timeline.ts`

Matchar whisper-segment mot diarization-segment baserat på tidsöverlapp:

```
[
  { speaker: "SPEAKER_00", start: "00:00:00", end: "00:00:15", text: "..." },
  { speaker: "SPEAKER_01", start: "00:00:15", end: "00:00:42", text: "..." },
]
```

> Internt lagras ms för precision, men all extern representation använder hh:mm:ss.

**Gruppering:** Intilliggande segment med samma talare slås ihop till ett block. Ny talare = nytt block.

**Hjälpfunktion:** `formatMs(ms: number): string` → "00:01:23" (hh:mm:ss)

### Del C: Uppdatera obsidian-export.ts

Istället för chunks, exportera video-transkript som en tidskodad talartidslinje:

```markdown
---
id: yt-EdZWPB1fIJc
type: transcript
platform: youtube
duration: "00:08:46"
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

---

## Tidslinje

### 00:00:15 — SPEAKER_00
A bunch of people at Anthropic write code, and so,
we made this internal tool called Claude Code, and because
we ourselves write code, we have a special and unique insight
into how to best use the AI models to write code.

### 00:01:23 — SPEAKER_01
What industry do you think will get disrupted and what has
a certain runway left?

### 00:01:45 — SPEAKER_00
I would think about tasks that are human-centered, tasks that
involve relating to people.
```

**Regler:**
- Max 7 rader text per block (ca 150 ord)
- Ny header vid talarbyte
- Tidskod i hh:mm:ss format
- Chunks exporteras INTE för video-transkript (tidslinjen ersätter dem)
- Icke-video-noder exporteras som förut (oförändrat)

### Del D: Uppdatera aurora:show

`aurora:show` ska också visa tidslinjen om segmentdata finns. Kort sammanfattning:
```
  Tidslinje (4 talarbyten)
  ├─ 00:00:15 SPEAKER_00 (3 block, 02:45)
  └─ 00:01:23 SPEAKER_01 (2 block, 01:12)
```

## Tester

- Spara och läsa segment-arrays från DB (round-trip)
- Korrekt tidsmatchning mellan whisper och diarization (överlapp, luckor)
- formatMs: 0 → "00:00:00", 90061 → "00:01:30"
- Gruppering: intilliggande samma talare → ett block
- Max 7 rader per block
- Talarbyte skapar ny header
- Icke-video-noder oförändrade i export
- aurora:show visar tidslinje

## Filer att ändra

- `src/aurora/video.ts` — spara segment-arrays
- `src/commands/obsidian-export.ts` — ny formattering för video
- `src/commands/aurora-show.ts` — visa tidslinje

## Nya filer

- `src/aurora/speaker-timeline.ts` — segment-matchning, gruppering, formatMs

## Notera

- Befintlig video (yt-EdZWPB1fIJc) behöver re-ingestas för att få segmentdata
- Briefen kräver INTE LLM-korrektur eller AI-gissning (det kommer i OB-1b)

## Agentinställningar

- Manager: max 120 iterationer
- Implementer: max 50 iterationer
- Reviewer: max 20 iterationer
