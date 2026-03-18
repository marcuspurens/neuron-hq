# E4c: EBUCore+ metadata alignment för multimedia-noder

## Bakgrund

Knowledge Library (E4) + Ontologi (E4b) ger oss koncept-noder med facetter och hierarki. Men våra multimedia-noder (transcript, voice_print, speaker_identity) saknar standardiserad metadata — allt lagras som ad hoc-properties.

EBUCore är European Broadcasting Unions metadata-standard för audio/video. Genom att mappa våra properties till EBUCore-vokabulär blir data:
1. **Sökbar** — standardiserade fält ger konsistenta queries
2. **Exporterbar** — mappningen möjliggör framtida JSON-LD/RDF-export
3. **Interoperabel** — andra verktyg förstår vårt format

## Vad ska göras

### 1. Metadata-mappningsmodul (`src/aurora/ebucore-metadata.ts`)

Skapa en modul som definierar EBUCore-mappningar och berikar noder:

```typescript
// Mappningskonstanter — EBUCore property-namn som vi använder i properties
const EBUCORE_MAPPINGS = {
  transcript: {
    'ebucore:duration': 'duration',           // sekunder
    'ebucore:dateCreated': 'publishedDate',
    'ebucore:hasLanguage': 'language',
    'ebucore:title': 'title',                 // top-level → properties
    'ebucore:locator': 'videoUrl',
    'ebucore:hasFormat': 'platform',          // youtube, svtplay etc.
    'ebucore:numberOfSegments': 'segmentCount',
  },
  voice_print: {
    'ebucore:speakerName': 'speakerLabel',
    'ebucore:speakerDuration': 'totalDurationMs',
    'ebucore:numberOfSegments': 'segmentCount',
  },
  speaker_identity: {
    'ebucore:personName': 'name',
    'ebucore:role': 'role',  // nytt fält (se nedan)
  },
};
```

**Funktioner:**
- `enrichWithEbucore(node: AuroraNode): AuroraNode` — lägger till `ebucore_*`-properties baserat på mappning. Kopierar inte data, skapar aliases.
- `getEbucoreMetadata(node: AuroraNode): Record<string, unknown>` — returnerar bara EBUCore-fälten från en nod
- `validateEbucoreCompleteness(node: AuroraNode): { complete: boolean; missing: string[] }` — visar vilka EBUCore-fält som saknas

### 2. Segment-metadata för transcript-chunks

Nuvarande chunks har `chunkIndex` och `wordCount` men inga tidskoder. Lägg till:

```typescript
// I video.ts vid chunk-skapande, om Whisper-segment finns:
properties: {
  ...existing,
  'ebucore:start': startTimeMs,      // segment-start i ms
  'ebucore:end': endTimeMs,          // segment-slut i ms
  'ebucore:partNumber': chunkIndex,  // EBUCore standard
}
```

**Viktig begränsning:** Tidskoder kan bara läggas till om Whisper-segmenten mappas till chunks. Om chunkning sker efter transkribering (nuvarande flow) — beräkna ungefärliga tidskoder baserat på ordposition/duration.

### 3. Speaker-roll i speaker_identity

Lägg till `role`-fält i speaker_identity-skapande:

```typescript
properties: {
  ...existing,
  role: 'unknown',  // default, kan sättas till 'host', 'guest', 'interviewer' etc.
}
```

### 4. Metadata-standard-registry

Skapa en enkel registry som mappar våra node-typer till vilka standarder som tillämpas:

```typescript
// I ebucore-metadata.ts
export function getAppliedStandards(nodeType: string): string[] {
  // Returnerar t.ex. ['EBUCore 1.10', 'Dublin Core'] för transcript
}
```

### 5. CLI-kommandon

Utöka `library`-CLI:

- `library metadata <nodeId>` — visa EBUCore-metadata för en nod
- `library metadata-coverage` — rapport: hur många noder har fullständig EBUCore-metadata

### 6. MCP-utökning

Lägg till i knowledge-library MCP:
- `ebucore_metadata` action — hämta metadata för en nod
- `metadata_coverage` action — sammanfattning av metadata-täckning

### 7. Migration 015

Index på `ebucore_*`-properties om de lagras separat, ELLER om de enbart är computed views — ingen migration behövs. Implementatören avgör.

## Acceptance Criteria

- [ ] `enrichWithEbucore()` mappar transcript/voice_print/speaker_identity korrekt
- [ ] `getEbucoreMetadata()` returnerar standardiserade fält
- [ ] `validateEbucoreCompleteness()` identifierar saknade fält
- [ ] Transcript-chunks får tidskods-estimat (start/end) om duration finns
- [ ] Speaker-identity får `role`-fält
- [ ] `getAppliedStandards()` returnerar rätt standarder per nodtyp
- [ ] CLI `library metadata` visar EBUCore-data
- [ ] CLI `library metadata-coverage` visar täckningsrapport
- [ ] MCP utökad med metadata-actions
- [ ] Alla befintliga tester gröna
- [ ] Typecheck grönt
- [ ] ≥20 nya tester

## Icke-mål

- Ingen faktisk RDF/JSON-LD-export (det är framtida arbete)
- Ingen ändring av befintlig databasstruktur — EBUCore-mappning sker i applikationslagret
- Ingen IPTC-mappning i denna iteration (kommer vid nyhetskällor)

## Risker

- **LÅG:** Rena tillägg, inget ändras i befintliga strukturer
- Tidskods-estimat blir ungefärliga om chunk-gränser inte matchar Whisper-segment exakt
