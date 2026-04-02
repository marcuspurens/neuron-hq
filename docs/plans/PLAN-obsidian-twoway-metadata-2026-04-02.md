# Plan: Obsidian tvåvägs-metadata, provenance-schema och speaker-enrichment

**Datum**: 2026-04-02  
**Session**: 9 (implementation)  
**Förutsätter**: Session 8 handoff (timeout-fixes committed)

---

## Bakgrund

Aurora exporterar kunskapsnoder till Obsidian och importerar tillbaka redigeringar. Import stödjer redan: highlights, comments, speaker renames, text/title/confidence-uppdateringar, briefing-feedback, och konfliktsdetektering.

**Problem att lösa:**

1. **Tag-bugg**: Tags med mellanslag renderas som ~~strikethrough~~ i Obsidian (`tags: [job displacement]` → borde vara `tags: ["job displacement"]`)
2. **Tags importeras inte tillbaka**: Export skriver tags, men import läser dem aldrig
3. **Speaker-metadata för tunn**: Bara `name` + `confidence` + `role`. Saknar titel, organisation, biografisk info
4. **Inget provenance-lager**: Ingen spårning av _vem_ som producerade en kunskapsartefakt och _hur_
5. **Segment-korrektioner**: Användaren kan inte flytta text mellan talare i Obsidian

---

## Scope: 5 arbetspaket

### WP1: Tag-bugg fix (trivial, ~10 min)

**Fil**: `src/commands/obsidian-export.ts` rad 73

**Nuvarande**:

```typescript
if (tags.length > 0) lines.push(`tags: [${tags.join(', ')}]`);
```

**Fix**:

```typescript
if (tags.length > 0) {
  const quoted = tags.map((t) => (t.includes(' ') ? `"${t}"` : t));
  lines.push(`tags: [${quoted.join(', ')}]`);
}
```

**Test**: Befintligt test i `tests/commands/obsidian-export.test.ts` — lägg till case med mellanslag i tag.

**Verifiering**: `pnpm typecheck && pnpm test`

---

### WP2: Tags round-trip (import tags tillbaka) (~30 min)

**Mål**: Tags som användaren lägger till/tar bort i Obsidian frontmatter speglas tillbaka till Aurora-noden.

#### 2a. Parser: extrahera tags från frontmatter

**Fil**: `src/aurora/obsidian-parser.ts`

Utöka `ParsedObsidianFile` interfacet:

```typescript
export interface ParsedObsidianFile {
  // ... befintliga fält ...
  tags: string[] | null; // NYTT
}
```

I `parseObsidianFile()`, efter `extractSpeakers(frontmatter)`:

```typescript
const rawTags = frontmatter.tags;
const tags = Array.isArray(rawTags) ? rawTags.map(String).filter((t) => t.length > 0) : null;
```

**Test**: `tests/aurora/obsidian-parser.test.ts` — lägg till test för tag-parsning med och utan quotes.

#### 2b. Import: skriva tags till Aurora-nod

**Fil**: `src/commands/obsidian-import.ts`

I `obsidianImportCommand`, section som bygger `updatedProperties`:

```typescript
// Merge tags from Obsidian back to node properties
if (parsed.tags !== null) {
  updatedProperties.tags = parsed.tags;
}
```

Räkna `tagsUpdated` i result-interfacet.

**Test**: `tests/commands/obsidian-import.test.ts` — lägg till test som verifierar att ändrade tags skrivs tillbaka.

**Verifiering**: `pnpm typecheck && pnpm test`

---

### WP3: Speaker-enrichment i frontmatter (~45 min)

**Mål**: Varje talare i frontmatter har `name`, `title`, `organization`, `confidence`, `role`. Dessa fält är redigerbara i Obsidian Properties-vyn och importeras tillbaka.

#### 3a. Export: utöka speaker-fält

**Fil**: `src/commands/obsidian-export.ts`, funktion `formatVideoFrontmatter`

**Nuvarande YAML** (rad 92-97):

```yaml
speakers:
  SPEAKER_00:
    name: 'Marcus'
    confidence: 0.85
    role: ''
```

**Ny YAML**:

```yaml
speakers:
  SPEAKER_00:
    name: 'Anders Andersson'
    title: 'PhD Machine Learning'
    organization: 'KTH'
    confidence: 0.85
    role: 'guest'
```

Titlar och organisation hämtas från `speaker_identity`-noden (om den finns via `related_to`-edge från voice_print). Om ingen `speaker_identity` finns, exporteras tomma strängar som placeholders.

Implementation:

1. Bygg en lookup: `voicePrintId → speaker_identity-nod` via edges
2. I `formatVideoFrontmatter`, för varje speaker:
   - Kolla om det finns en kopplad `speaker_identity`
   - Hämta `title` och `organization` från dess properties
   - Fallback: `title: ""`, `organization: ""`

**Filer att ändra**:

- `src/commands/obsidian-export.ts` — `formatVideoFrontmatter()` + lookup-logik
- Interface `SpeakerInfo` — utöka med `title: string`, `organization: string`
- `buildSpeakerMap()` — fylla i nya fält från `speaker_identity`-noder

#### 3b. Parser: extrahera title/organization från frontmatter

**Fil**: `src/aurora/obsidian-parser.ts`

Utöka `ParsedSpeaker`:

```typescript
export interface ParsedSpeaker {
  label: string;
  name: string;
  title: string; // NYTT
  organization: string; // NYTT
  confidence: number;
  role: string;
}
```

I `extractSpeakers()`:

```typescript
result.push({
  label,
  name: typeof v.name === 'string' ? v.name : '',
  title: typeof v.title === 'string' ? v.title : '',
  organization: typeof v.organization === 'string' ? v.organization : '',
  confidence: typeof v.confidence === 'number' ? v.confidence : 0,
  role: typeof v.role === 'string' ? v.role : '',
});
```

#### 3c. Import: skriva title/organization tillbaka till speaker_identity

**Fil**: `src/commands/obsidian-import.ts`

Nuvarande speaker-import (rad 206-235) hanterar bara rename. Utöka:

1. **Om name ändrats** → `renameSpeaker()` (redan implementerat)
2. **Om title/organization ändrats** → hitta eller skapa `speaker_identity`-nod, uppdatera dess properties

```typescript
for (const speaker of parsed.speakers) {
  if (!speaker.name) continue;

  // Hitta voice_print
  const vpNode = graph.nodes.find(
    (n) =>
      n.type === 'voice_print' &&
      n.properties.videoNodeId === parsed.id &&
      n.properties.speakerLabel === speaker.label
  );
  if (!vpNode) continue;

  // Rename om name ändrats
  if (vpNode.properties.speakerLabel !== speaker.name) {
    pendingRenames.push({ voicePrintId: vpNode.id, newName: speaker.name });
  }

  // Title/org: hitta eller skapa speaker_identity
  if (speaker.title || speaker.organization) {
    const identityId = findOrCreateSpeakerIdentity(speaker.name, vpNode.id);
    updateSpeakerIdentityMetadata(identityId, {
      title: speaker.title,
      organization: speaker.organization,
      role: speaker.role,
    });
  }
}
```

Ny hjälpfunktion `findOrCreateSpeakerIdentity`:

- Sök befintliga `speaker_identity`-noder med matchande `name`
- Om finns: returnera id
- Om inte: skapa via `createSpeakerIdentity()` och returnera id

Ny hjälpfunktion `updateSpeakerIdentityMetadata`:

- Uppdatera `title`, `organization`, `role` i properties
- Skapa/uppdatera `related_to`-edge om den inte redan finns

**Fil att ändra**: `src/aurora/speaker-identity.ts` — lägg till `title` och `organization` i `createSpeakerIdentity` properties + ny export `updateSpeakerMetadata()`

#### 3d. EBUCore-mapping

**Fil**: `src/aurora/ebucore-metadata.ts`

Lägg till i `EBUCORE_MAPPINGS.speaker_identity`:

```typescript
speaker_identity: {
  'ebucore:personName': 'name',
  'ebucore:role': 'role',
  'ebucore:personTitle': 'title',           // NYTT
  'ebucore:organisationName': 'organization', // NYTT
},
```

**Tester**: Utöka befintliga tester i `tests/aurora/speaker-identity.test.ts` + `tests/aurora/obsidian-parser.test.ts`

**Verifiering**: `pnpm typecheck && pnpm test`

---

### WP4: Provenance-lager (~30 min)

**Mål**: Varje Aurora-nod kan ha ett `provenance`-objekt som spårar vem/vad som producerade innehållet.

#### 4a. Typ-definition

**Fil**: `src/aurora/aurora-schema.ts` (eller ny fil `src/aurora/provenance.ts`)

```typescript
export interface Provenance {
  agent: 'VoicePrint' | 'Person' | 'LLM' | 'System';
  agentId: string | null; // voice_xyz, person_abc, null for System
  method:
    | 'transcription'
    | 'ocr'
    | 'vision'
    | 'manual'
    | 'llm_extraction'
    | 'web_scrape'
    | 'conversation';
  model: string | null; // whisper-large-v3, qwen3-vl:8b, etc.
  sourceId: string | null; // node-ID för källmedia
  timestamp: string; // ISO 8601
}
```

Provenance lagras i `node.properties.provenance` — kräver INGEN schema-ändring i `AuroraNodeSchema` eftersom `properties` redan är `Record<string, unknown>`.

#### 4b. Sätt provenance vid ingest

Filer att ändra (lägga till `provenance`-objekt vid nod-skapande):

- `src/aurora/video.ts` — transcript-noder: `agent: 'System', method: 'transcription', model: 'whisper-large-v3'`
- `src/aurora/ocr.ts` — PDF-noder: `agent: 'System', method: 'ocr', model: 'paddleocr-3.x'`
- `src/aurora/vision.ts` — vision-analys: `agent: 'System', method: 'vision', model: 'qwen3-vl:8b'`
- `src/mcp/tools/aurora-remember.ts` — manuella minnen: `agent: 'Person'` eller `agent: 'LLM'`
- `src/aurora/ingest-url.ts` — webbsidor: `agent: 'System', method: 'web_scrape'`

**Inga breaking changes** — provenance är opt-in. Befintliga noder utan provenance fungerar som förut.

#### 4c. Exportera provenance till Obsidian frontmatter

**Fil**: `src/commands/obsidian-export.ts`, funktion `formatFrontmatter`

Om `properties.provenance` finns, mappa till frontmatter:

```yaml
källa_typ: transcription
källa_agent: VoicePrint
källa_modell: whisper-large-v3
```

#### 4d. Importera provenance-redigeringar

**Beslut**: Provenance är **read-only i Obsidian** — det visar varifrån innehållet kom. Ingen import behövs. Framtida iteration kan göra det redigerbart om det behövs.

**Test**: Unit-test att provenance sätts korrekt vid ingest + exporteras korrekt till frontmatter.

**Verifiering**: `pnpm typecheck && pnpm test`

---

### WP5: Segment-korrektioner (flytta text mellan talare) (~60 min)

**Mål**: Användaren kan i Obsidian flytta text från en talare till en annan genom att ändra tidslinjens `### HH:MM:SS — Speaker`-header. Vid import detekteras ändringen och `rawSegments` + diarization uppdateras.

#### 5a. Konvention i Obsidian

Användaren ändrar headern:

```markdown
### 00:05:23 — SPEAKER_02 ← var

### 00:05:23 — SPEAKER_01 ← ändras till
```

Importern jämför current speaker per block med Aurora-data och skapar en diff.

#### 5b. Parser: extrahera speaker per tidslinje-block

**Fil**: `src/aurora/obsidian-parser.ts`

Ny funktion `extractTimelineBlocks`:

```typescript
export interface ParsedTimelineBlock {
  timecode_ms: number;
  speaker: string;
  text: string;
}

export function extractTimelineBlocks(markdownBody: string): ParsedTimelineBlock[];
```

Scannar `### HH:MM:SS — Speaker`-headers och samlar text fram till nästa header.

Utöka `ParsedObsidianFile`:

```typescript
export interface ParsedObsidianFile {
  // ... befintliga fält ...
  timelineBlocks: ParsedTimelineBlock[] | null; // NYTT — bara för video transcripts
}
```

#### 5c. Import: detektera speaker-ändringar i tidslinje

**Fil**: `src/commands/obsidian-import.ts`

För video-transkript-noder (de som har `rawSegments`):

1. Bygg tidslinje från Aurora-data (samma som export gör)
2. Jämför Obsidian-tidslinjen (från `extractTimelineBlocks`) med Aurora-tidslinjen
3. För varje block där speaker skiljer sig:
   - Hitta de `rawSegments` som faller inom blockets tidsintervall
   - Uppdatera diarization-segmentens `speaker`-tilldelning i voice_print-nodernas `segments`-array
4. Logga varje ändring

**Viktigt**: Ändra INTE `rawSegments` (det är Whisper-originalet). Ändra diarization-data i `voice_print`-noderna.

#### 5d. Ny import-result fält

```typescript
export interface ObsidianImportResult {
  // ... befintliga fält ...
  segmentReassignments: number; // NYTT
}
```

**Tester**:

- Parser: test med ändrad timeline-header
- Import: test att segment-reassignment ändrar rätt voice_print-noder
- Round-trip: export → ändra header → import → re-export → verifiera att ändringen överlevde

**Verifiering**: `pnpm typecheck && pnpm test`

---

## Implementation-ordning

```
WP1 (tag-bugg)           ← snabbast, mest synlig fix
  ↓
WP2 (tags round-trip)    ← bygger på WP1, fortfarande enkelt
  ↓
WP3 (speaker-enrichment) ← mest användarsynligt, medium komplexitet
  ↓
WP4 (provenance)         ← infrastruktur, inga beroenden på WP1-3
  ↓
WP5 (segment-korrektion) ← mest komplext, bygger på förändringar i WP3
```

WP1+WP2 kan committas som ett. WP3, WP4, WP5 som separata commits.

---

## Risker

| Risk                                                                   | Sannolikhet | Åtgärd                                                                              |
| ---------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------- |
| WP5 segment-reassignment bryter diarization-konsistens                 | Medium      | Validera att alla segment-ms fortfarande matchar rawSegments. Bygg invariant-check. |
| gray-matter parsern hanterar inte nested YAML (speakers med title/org) | Låg         | gray-matter stödjer full YAML — redan testat med speakers.name/confidence           |
| Provenance-lagret bloatar node properties                              | Låg         | Provenence är ett enda objekt, max 6 fält                                           |
| Obsidian Properties-vy visar inte nested objects snyggt                | Medium      | Obsidian Properties stödjer nested YAML sedan 1.4. Verifiera manuellt.              |

---

## Filer som ändras (komplett lista)

| Fil                                      | WP    | Vad                                                        |
| ---------------------------------------- | ----- | ---------------------------------------------------------- |
| `src/commands/obsidian-export.ts`        | 1,3,4 | Tag-quoting, speaker title/org, provenance frontmatter     |
| `src/aurora/obsidian-parser.ts`          | 2,3,5 | Tags-parsning, ParsedSpeaker title/org, timeline-blocks    |
| `src/commands/obsidian-import.ts`        | 2,3,5 | Tags import, speaker metadata import, segment-reassignment |
| `src/aurora/speaker-identity.ts`         | 3     | title/organization properties, updateSpeakerMetadata()     |
| `src/aurora/ebucore-metadata.ts`         | 3     | personTitle, organisationName mappings                     |
| `src/aurora/video.ts`                    | 4     | Provenance vid transcript-skapande                         |
| `src/aurora/ocr.ts`                      | 4     | Provenance vid PDF-ingest                                  |
| `src/aurora/vision.ts`                   | 4     | Provenance vid vision-analys                               |
| `src/mcp/tools/aurora-remember.ts`       | 4     | Provenance vid manuella minnen                             |
| `src/aurora/ingest-url.ts`               | 4     | Provenance vid web scrape                                  |
| `tests/commands/obsidian-export.test.ts` | 1,3,4 | Nya test cases                                             |
| `tests/aurora/obsidian-parser.test.ts`   | 2,3,5 | Nya test cases                                             |
| `tests/commands/obsidian-import.test.ts` | 2,3,5 | Nya test cases                                             |
| `tests/aurora/speaker-identity.test.ts`  | 3     | Title/org test cases                                       |
| `tests/aurora/ebucore-metadata.test.ts`  | 3     | Nya mappings                                               |

---

## Definition of Done

- [ ] Alla 5 WP:er implementerade
- [ ] `pnpm typecheck` — 0 errors
- [ ] `pnpm test` — alla befintliga + nya tester passerar
- [ ] Manuell verifiering: exportera → redigera i Obsidian → importera → verifiera round-trip
- [ ] Handoff skriven
