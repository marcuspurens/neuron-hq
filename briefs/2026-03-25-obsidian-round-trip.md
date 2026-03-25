# Brief: A1 Obsidian Round-Trip — icke-video content import + konfliktvarning

**Target:** neuron-hq
**Effort:** 1 körning
**Roadmap:** Aurora Sprint-plan, Fas 2 — A1
**Prioritet:** HÖG — Obsidian-redigering av dokument-noder tappar data tyst

## Bakgrund

Obsidian-integrationen har export (`obsidian-export.ts`) och import (`obsidian-import.ts`). Video-transkript round-trip fungerar: användaren kan lägga till `#highlight`-taggar, `<!-- kommentar: -->` och byta talarnamn i Obsidian, och import sparar tillbaka till Aurora.

Men **icke-video-noder** (document, fact, concept, research, article) har en tyst dataförlust:

1. **Export** skriver nodens text under `## Innehåll` (`obsidian-export.ts:459-474`)
2. **Användaren redigerar** texten i Obsidian
3. **Import** ignorerar texten helt — `obsidianImportCommand()` (`obsidian-import.ts:121-172`) uppdaterar bara `properties.highlights` och `properties.comments`, aldrig `properties.text`

Dessutom raderar export hela Aurora/-mappen vid varje körning (`obsidian-export.ts:340`: `await rm(nodesDir, { recursive: true, force: true })`), vilket förstör manuellt skapade filer.

## Designbeslut

### 1. Utöka parsern med titel, confidence och text

`parseObsidianFile()` (`obsidian-parser.ts:315-354`) returnerar idag:
```typescript
{ id, speakers, highlights, comments }
```

Utöka till:
```typescript
{ id, speakers, highlights, comments, title, confidence, textContent }
```

Extrahera:
- **title**: Första `# Rubrik`-raden i markdown-body
- **confidence**: Från frontmatter YAML (`confidence: 0.8`)
- **textContent**: Allt under `## Innehåll`-rubriken (fram till nästa `##` eller filslut)

### 2. Importera non-video content-ändringar

I `obsidianImportCommand()` (`obsidian-import.ts:165-172`), efter befintlig highlight/comment-uppdatering, lägg till content-uppdatering för icke-video-noder:

```typescript
// Bygg properties med highlights/comments (alla noder)
const updatedProperties = { ...node.properties, highlights: matchedHighlights, comments: matchedComments };

// NYTT: icke-video-noder — uppdatera text, titel, confidence
// Importera från obsidian-export.ts: import { isVideoTranscript } from './obsidian-export.js';
const isVideo = isVideoTranscript(node);
if (!isVideo) {
  if (parsed.textContent !== null && parsed.textContent !== node.properties.text) {
    updatedProperties.text = parsed.textContent;
    totalContentUpdates++;
  }
}

// NYTT: konfliktvarning
if (parsed.exportedAt && node.updated > parsed.exportedAt) {
  logger.warn('Node updated in Aurora since last export', { nodeId: node.id, nodeUpdated: node.updated, exportedAt: parsed.exportedAt });
  totalConflictWarnings++;
}

// ETT anrop — alla uppdateringar samlade
const nodeUpdates: { properties: typeof updatedProperties; title?: string; confidence?: number } = {
  properties: updatedProperties,
};
if (!isVideo && parsed.title && parsed.title !== node.title) {
  nodeUpdates.title = parsed.title;
}
if (!isVideo && parsed.confidence !== null && parsed.confidence !== node.confidence) {
  nodeUpdates.confidence = parsed.confidence;
}

graph = updateAuroraNode(graph, node.id, nodeUpdates);
```

**VIKTIGT:** Alla uppdateringar sker i ETT `updateAuroraNode()`-anrop. Inte två separata anrop — det skulle orsaka att det andra anropet sprider gamla properties och skriver över det första.

Icke-video detekteras med `isVideoTranscript()` från `obsidian-export.ts:46-49`. **Exportera funktionen** (`export function isVideoTranscript(...)`) och importera den i `obsidian-import.ts`. Undvik duplicerad logik.

`updateAuroraNode()` (`aurora-graph.ts:92-108`) stöder redan `title`, `confidence`, `properties` — ingen ändring behövs där.

### 3. Sluta radera Aurora/-mappen vid export

Ersätt `rm()` + `mkdir()` (`obsidian-export.ts:340-341`) med:
1. `mkdir(nodesDir, { recursive: true })` (skapa om den inte finns)
2. Bygg en Set av filnamn som exporteras
3. Efter export: ta bort enbart filer som INTE längre motsvarar en Aurora-nod (stale exports)

Detta preserverar manuellt skapade filer.

### 4. `exported_at` i frontmatter

Lägg till `exported_at: <ISO-timestamp>` i frontmatter vid export. Både i `formatFrontmatter()` (`obsidian-export.ts:51-73`) och `formatVideoFrontmatter()` (`obsidian-export.ts:77-104`).

Vid import: parsern extraherar `exported_at` från frontmatter. Om noden har `updated > exported_at`, logga en varning:
```
logger.warn('Node updated in Aurora since last export — Obsidian changes may overwrite newer data', {
  nodeId, nodeUpdated: node.updated, exportedAt: parsed.exportedAt
});
```

**Typhantering:** Båda värdena (`node.updated` och `parsed.exportedAt`) är ISO 8601-strängar (t.ex. `"2026-03-25T07:00:00.000Z"`). `node.updated` sätts av `updateAuroraNode()` i `aurora-graph.ts:103` via `new Date().toISOString()`. ISO-strängar kan jämföras direkt med `>` (lexikografisk ordning = kronologisk ordning för ISO 8601). Ingen `new Date()`-konvertering behövs.

Importen fortsätter (inte blockerande) men varningen syns i loggen.

## Vad ska byggas

### 1. obsidian-parser.ts — utökad ParsedObsidianFile

Utöka `ParsedObsidianFile` interfacet (`obsidian-parser.ts:30-35`):
```typescript
export interface ParsedObsidianFile {
  id: string;
  speakers: ParsedSpeaker[];
  highlights: Highlight[];
  comments: Comment[];
  title: string | null;          // NYTT
  confidence: number | null;     // NYTT
  textContent: string | null;    // NYTT
  exportedAt: string | null;     // NYTT
}
```

Nya parser-funktioner:
```typescript
export function extractTitle(markdownBody: string): string | null
// Matchar första "# Rubrik"-raden. Returnerar null om ingen hittas.

export function extractContentSection(markdownBody: string): string | null
// Extraherar allt under "## Innehåll" fram till nästa "## " eller filslut.
// Trimmar whitespace. Returnerar null om sektionen inte finns.
```

Uppdatera `parseObsidianFile()` (`obsidian-parser.ts:315-354`) att:
1. Anropa `extractTitle(parsed.content)`
2. Läsa `frontmatter.confidence` (number eller null)
3. Anropa `extractContentSection(parsed.content)`
4. Läsa `frontmatter.exported_at` (string eller null)
5. Returnera dessa i det utökade interfacet

### 2. obsidian-export.ts — `exported_at` + ingen `rm()`

**`formatFrontmatter()`** (`obsidian-export.ts:51-73`):
- Lägg till `exported_at: "<ISO-timestamp>"` som sista rad före `---`

**`formatVideoFrontmatter()`** (`obsidian-export.ts:77-104`):
- Samma: lägg till `exported_at`

**`obsidianExportCommand()`** (`obsidian-export.ts:288-492`):
- **Ta bort** rad 340: `await rm(nodesDir, { recursive: true, force: true })`
- **Behåll** rad 341: `await mkdir(nodesDir, { recursive: true })`
- **Lägg till** efter export-loopen: ta bort stale filer

```typescript
// Efter export-loopen: rensa stale filer (noder som inte längre finns)
// OBS: filenameMap är en befintlig variabel (obsidian-export.ts:329) som byggs
// av buildNodeFilenameMap() INNAN export-loopen — den är redan i scope.
const exportedFilenames = new Set<string>();
for (const node of nodes) {
  if (skipChunkIds.has(node.id)) continue;
  exportedFilenames.add(`${filenameMap.get(node.id)!}.md`);
}
const existingFiles = await readdir(nodesDir);
for (const file of existingFiles) {
  if (file.endsWith('.md') && !exportedFilenames.has(file)) {
    logger.info('Removing stale export file', { file });
    await rm(join(nodesDir, file));
  }
}
```

Kräver två tillägg i `obsidian-export.ts`:
1. Lägg till `readdir` i import-raden (rad 2): `import { writeFile, mkdir, rm, readFile, access, readdir } from 'fs/promises';`
2. Lägg till logger: `import { createLogger } from '../core/logger.js';` + `const logger = createLogger('obsidian:export');` (export-filen saknar logger idag — import-filen har det redan)

### 3. obsidian-import.ts — non-video content + konfliktvarning

**Import non-video content** — efter befintlig highlight/comment-uppdatering (`obsidian-import.ts:165-172`):

1. Kolla om noden är icke-video (`node.type !== 'transcript'` eller inte har `rawSegments`)
2. Om `parsed.title` finns och skiljer sig: uppdatera `title`
3. Om `parsed.confidence` finns och skiljer sig: uppdatera `confidence`
4. Om `parsed.textContent` finns och skiljer sig från `node.properties.text`: uppdatera `properties.text`
5. Räkna `contentUpdates` (ny räknare i resultatet)

**Konfliktvarning** — före uppdatering:

1. Läs `parsed.exportedAt` och `node.updated`
2. Om `node.updated > parsed.exportedAt`: logga varning (inte blockera)

**Utöka `ObsidianImportResult`** (`obsidian-import.ts:29-35`):
```typescript
export interface ObsidianImportResult {
  filesProcessed: number;
  highlights: number;
  comments: number;
  speakersRenamed: number;
  feedbackNodes: number;
  contentUpdates: number;   // NYTT
  conflictWarnings: number; // NYTT
}
```

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/aurora/obsidian-parser.ts` | `extractTitle()`, `extractContentSection()`, utökad `ParsedObsidianFile` |
| `src/commands/obsidian-export.ts` | `exported_at` i frontmatter, ta bort `rm()`, rensa stale filer |
| `src/commands/obsidian-import.ts` | Non-video content import, konfliktvarning, utökad result |

## Filer att INTE ändra

- `src/aurora/aurora-graph.ts` — `updateAuroraNode()` stöder redan title, confidence, properties
- `src/aurora/voiceprint.ts` — inget med non-video round-trip att göra
- `src/aurora/speaker-timeline.ts` — samma
- `src/mcp/tools/aurora-obsidian.ts` — MCP-tools wrapprar kommandona, inga API-ändringar
- `src/core/db.ts` — ingen schemaändring
- `policy/` — inga policyändringar

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| `extractContentSection` matchar fel rubrik | Låg | Fel text importeras | Regex matchar exakt `## Innehåll` (samma rubrik som export skriver) |
| Stale fil-rensning raderar manuellt skapad fil | Låg | Användardata försvinner | Rensning tar bara bort `.md`-filer, och loggar vilka filer som tas bort |
| Konfliktvarning spammar loggen vid stor vault | Låg | Oöversiktlig output | Bara 1 rad per konflikt, och bara om `updated > exported_at` |
| Non-video import skriver över Aurora-ändring | Medel | Dataförlust om Aurora ändrats | Konfliktvarning loggas. Framtida brief kan lägga till interaktiv merge |

## Acceptanskriterier

### Parser (obsidian-parser.ts)

- **AC1:** `extractTitle("# Min Rubrik\n\nText")` returnerar `"Min Rubrik"`. `extractTitle("Ingen rubrik")` returnerar `null`.
- **AC2:** `extractContentSection("## Innehåll\n\nHello world\n\n## Kopplingar")` returnerar `"Hello world"`. `extractContentSection("Inget innehåll")` returnerar `null`. `extractContentSection("## Innehåll\n\n## Kopplingar")` returnerar `null` (tom sektion = null, inte `""`).
- **AC3:** `parseObsidianFile()` returnerar `{ title, confidence, textContent, exportedAt }` utöver befintliga fält. Befintliga tester passerar fortfarande.

### Export (obsidian-export.ts)

- **AC4:** Exporterad fil innehåller `exported_at:` i frontmatter med ett giltigt ISO-timestamp.
- **AC5:** Export raderar INTE Aurora/-mappen. Beteendetest: exportera, skapa en fil manuellt i Aurora/-mappen (`manually-created.md`), exportera igen — den manuella filen finns kvar. Implementationscheck: `rm(nodesDir, { recursive: true, force: true })` finns INTE längre i koden.
- **AC6:** Filer för noder som inte längre finns i Aurora tas bort vid export (stale cleanup).

### Import (obsidian-import.ts)

- **AC7:** Import av icke-video-nod med ändrad text under `## Innehåll` uppdaterar `properties.text` i Aurora-grafen.
- **AC8:** Import av icke-video-nod med ändrad `# Titel` uppdaterar `title` i Aurora-grafen.
- **AC9:** Import av icke-video-nod med ändrad `confidence:` i frontmatter uppdaterar `confidence` i Aurora-grafen.
- **AC10:** Om `node.updated > exported_at`: en varning loggas med nodeId. Importen fortsätter (inte blockerande).
- **AC11:** `ObsidianImportResult` inkluderar `contentUpdates` och `conflictWarnings` med korrekta räkningar.

### Regression

- **AC12:** Alla befintliga tester passerar utan regression (`pnpm test`).
