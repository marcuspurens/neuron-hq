# Brief: C2 Voiceprint-redigering — rename, merge, suggest

## Bakgrund

Aurora skapar `voice_print`-noder vid videoingest med talar-segmentering
(pyannote.audio). Dessa noder har generiska namn som `SPEAKER_1`, `SPEAKER_2`.
Idag finns ingen möjlighet att:

- Döpa om en talare till ett riktigt namn
- Slå ihop två talare som egentligen är samma person (t.ex. i olika videor)
- Få förslag på vilka talare som kan vara samma person

## Uppgifter

### 1. Core-modul: `src/aurora/voiceprint.ts`

Skapa en ny modul med tre funktioner:

```typescript
import {
  loadAuroraGraph,
  saveAuroraGraph,
  updateAuroraNode,
  removeAuroraNode,
  findAuroraNodes,
} from './aurora-graph.js';

/**
 * Rename a speaker in a voice_print node.
 *
 * Updates properties.speakerLabel and title.
 * Returns old and new name for confirmation.
 */
export async function renameSpeaker(
  voicePrintId: string,
  newName: string,
): Promise<{ oldName: string; newName: string; voicePrintId: string }> {
  const graph = await loadAuroraGraph();
  const node = graph.nodes.find((n) => n.id === voicePrintId);
  if (!node || node.type !== 'voice_print') {
    throw new Error(`Voice print not found: ${voicePrintId}`);
  }
  const oldName = (node.properties.speakerLabel as string) || node.title;
  const updated = updateAuroraNode(graph, voicePrintId, {
    properties: { ...node.properties, speakerLabel: newName },
    title: `Speaker: ${newName}`,
  });
  await saveAuroraGraph(updated);
  return { oldName, newName, voicePrintId };
}

/**
 * Merge two voice_print nodes (source → target).
 *
 * - Transfers all edges from source to target
 * - Aggregates segmentCount and totalDurationMs
 * - Removes source node
 * - Returns merge summary
 */
export async function mergeSpeakers(
  sourceId: string,
  targetId: string,
): Promise<{
  merged: boolean;
  targetId: string;
  targetName: string;
  sourceSegments: number;
  totalSegments: number;
}> {
  if (sourceId === targetId) {
    throw new Error('Cannot merge a speaker with itself');
  }
  const graph = await loadAuroraGraph();
  const source = graph.nodes.find((n) => n.id === sourceId);
  const target = graph.nodes.find((n) => n.id === targetId);
  if (!source || source.type !== 'voice_print') {
    throw new Error(`Source voice print not found: ${sourceId}`);
  }
  if (!target || target.type !== 'voice_print') {
    throw new Error(`Target voice print not found: ${targetId}`);
  }

  // Aggregate counts
  const sourceSegments = (source.properties.segmentCount as number) || 0;
  const targetSegments = (target.properties.segmentCount as number) || 0;
  const sourceDuration = (source.properties.totalDurationMs as number) || 0;
  const targetDuration = (target.properties.totalDurationMs as number) || 0;

  // Update target with combined counts
  let updated = updateAuroraNode(graph, targetId, {
    properties: {
      ...target.properties,
      segmentCount: targetSegments + sourceSegments,
      totalDurationMs: targetDuration + sourceDuration,
    },
  });

  // Transfer edges from source to target (avoid duplicates)
  const sourceEdges = updated.edges.filter(
    (e) => e.from === sourceId || e.to === sourceId,
  );
  const newEdges = [...updated.edges];
  for (const edge of sourceEdges) {
    const newFrom = edge.from === sourceId ? targetId : edge.from;
    const newTo = edge.to === sourceId ? targetId : edge.to;
    // Skip self-loops and duplicates
    if (newFrom === newTo) continue;
    if (!newEdges.find((e) => e.from === newFrom && e.to === newTo && e.relation === edge.relation)) {
      newEdges.push({ ...edge, from: newFrom, to: newTo });
    }
  }
  updated = { ...updated, edges: newEdges };

  // Remove source node (also removes its edges)
  updated = removeAuroraNode(updated, sourceId);
  await saveAuroraGraph(updated);

  return {
    merged: true,
    targetId,
    targetName: (target.properties.speakerLabel as string) || target.title,
    sourceSegments,
    totalSegments: targetSegments + sourceSegments,
  };
}

/**
 * Suggest speaker matches across videos.
 *
 * Heuristic approach (no embeddings needed):
 * - Same speakerLabel in different videos → high match
 * - Similar segment duration patterns → medium match
 *
 * Returns matches sorted by similarity (descending).
 */
export async function suggestSpeakerMatches(options?: {
  voicePrintId?: string;
  threshold?: number;
}): Promise<
  Array<{
    sourceId: string;
    sourceName: string;
    matchId: string;
    matchName: string;
    sourceVideo: string;
    matchVideo: string;
    similarity: number;
    reason: string;
  }>
> {
  const threshold = options?.threshold ?? 0.7;
  const graph = await loadAuroraGraph();
  const voicePrints = findAuroraNodes(graph, { type: 'voice_print' });

  if (voicePrints.length < 2) return [];

  // Filter to specific speaker if requested
  const sources = options?.voicePrintId
    ? voicePrints.filter((n) => n.id === options.voicePrintId)
    : voicePrints;

  const matches: Array<{
    sourceId: string;
    sourceName: string;
    matchId: string;
    matchName: string;
    sourceVideo: string;
    matchVideo: string;
    similarity: number;
    reason: string;
  }> = [];

  for (const source of sources) {
    for (const candidate of voicePrints) {
      if (source.id === candidate.id) continue;
      // Skip same video
      if (source.properties.videoNodeId === candidate.properties.videoNodeId) continue;
      // Skip if already added (avoid A↔B duplicates)
      if (matches.find((m) => m.sourceId === candidate.id && m.matchId === source.id)) continue;

      let similarity = 0;
      let reason = '';

      // Same speaker label = strong match
      const sourceLabel = (source.properties.speakerLabel as string) || '';
      const candidateLabel = (candidate.properties.speakerLabel as string) || '';
      if (sourceLabel && candidateLabel && sourceLabel === candidateLabel) {
        // Generic labels (SPEAKER_0) are weaker matches than named ones
        if (sourceLabel.startsWith('SPEAKER_')) {
          similarity = 0.5;
          reason = `Same auto-label: ${sourceLabel}`;
        } else {
          similarity = 0.95;
          reason = `Same name: ${sourceLabel}`;
        }
      }

      if (similarity >= threshold) {
        matches.push({
          sourceId: source.id,
          sourceName: source.title,
          matchId: candidate.id,
          matchName: candidate.title,
          sourceVideo: (source.properties.videoNodeId as string) || 'unknown',
          matchVideo: (candidate.properties.videoNodeId as string) || 'unknown',
          similarity,
          reason,
        });
      }
    }
  }

  return matches.sort((a, b) => b.similarity - a.similarity);
}
```

### 2. CLI-kommandon

#### `src/commands/aurora-rename-speaker.ts`

```typescript
/**
 * CLI command: aurora:rename-speaker
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:rename-speaker <voicePrintId> <newName>
 *
 * Example:
 *   npx tsx src/cli.ts aurora:rename-speaker vp-abc123-SPEAKER_1 "Marcus"
 */
```

Output:

```
🎤 Renaming speaker...
  ✅ Renamed!
    Old: SPEAKER_1
    New: Marcus
    Node: vp-abc123-SPEAKER_1
```

#### `src/commands/aurora-merge-speakers.ts`

```typescript
/**
 * CLI command: aurora:merge-speakers
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:merge-speakers <sourceId> <targetId>
 *
 * Example:
 *   npx tsx src/cli.ts aurora:merge-speakers vp-abc-SPEAKER_1 vp-def-Marcus
 */
```

Output:

```
🔗 Merging speakers...
  ✅ Merged!
    Source removed: vp-abc-SPEAKER_1
    Target kept: vp-def-Marcus
    Segments transferred: 12
    Total segments now: 28
```

#### `src/commands/aurora-suggest-speakers.ts`

```typescript
/**
 * CLI command: aurora:suggest-speakers
 *
 * Usage:
 *   npx tsx src/cli.ts aurora:suggest-speakers [--threshold 0.7]
 *
 * Example output:
 *   npx tsx src/cli.ts aurora:suggest-speakers
 */
```

Output:

```
🔍 Searching for speaker matches...

Suggested matches:
  1. Speaker: Marcus (video-abc) ↔ Speaker: Marcus (video-def)
     Similarity: 0.95 — Same name: Marcus

  2. Speaker: SPEAKER_0 (video-abc) ↔ Speaker: SPEAKER_0 (video-ghi)
     Similarity: 0.50 — Same auto-label: SPEAKER_0

No matches found above threshold? Try --threshold 0.5
```

Registrera alla tre i `src/cli.ts`:

```typescript
program
  .command('aurora:rename-speaker <voicePrintId> <newName>')
  .description('Rename a speaker in a voice print')
  .action(async (voicePrintId, newName) => {
    const { auroraRenameSpeakerCommand } = await import('./commands/aurora-rename-speaker.js');
    await auroraRenameSpeakerCommand(voicePrintId, newName);
  });

program
  .command('aurora:merge-speakers <sourceId> <targetId>')
  .description('Merge two voice prints (source → target)')
  .action(async (sourceId, targetId) => {
    const { auroraMergeSpeakersCommand } = await import('./commands/aurora-merge-speakers.js');
    await auroraMergeSpeakersCommand(sourceId, targetId);
  });

program
  .command('aurora:suggest-speakers')
  .description('Suggest matching speakers across videos')
  .option('--threshold <number>', 'Minimum similarity threshold', '0.7')
  .action(async (options) => {
    const { auroraSuggestSpeakersCommand } = await import('./commands/aurora-suggest-speakers.js');
    await auroraSuggestSpeakersCommand({ threshold: parseFloat(options.threshold) });
  });
```

### 3. MCP-tools

#### `src/mcp/tools/aurora-rename-speaker.ts`

```typescript
server.tool(
  'aurora_rename_speaker',
  'Rename a speaker in a voice print (e.g., SPEAKER_1 → "Marcus")',
  {
    voicePrintId: z.string().describe('ID of the voice_print node (e.g., vp-abc123-SPEAKER_1)'),
    newName: z.string().min(1).describe('New speaker name'),
  },
  async (args) => {
    const result = await renameSpeaker(args.voicePrintId, args.newName);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);
```

#### `src/mcp/tools/aurora-merge-speakers.ts`

```typescript
server.tool(
  'aurora_merge_speakers',
  'Merge two voice prints — source is removed, its segments transfer to target',
  {
    sourceId: z.string().describe('Voice print to remove (merged into target)'),
    targetId: z.string().describe('Voice print to keep (receives segments)'),
  },
  async (args) => {
    const result = await mergeSpeakers(args.sourceId, args.targetId);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  },
);
```

#### `src/mcp/tools/aurora-suggest-speakers.ts`

```typescript
server.tool(
  'aurora_suggest_speakers',
  'Suggest which speakers might be the same person across different videos',
  {
    voicePrintId: z.string().optional().describe('Limit to matches for this voice print'),
    threshold: z.number().min(0).max(1).optional().default(0.7)
      .describe('Minimum similarity threshold (0-1)'),
  },
  async (args) => {
    const matches = await suggestSpeakerMatches({
      voicePrintId: args.voicePrintId,
      threshold: args.threshold,
    });
    return {
      content: [{
        type: 'text' as const,
        text: matches.length > 0
          ? JSON.stringify(matches, null, 2)
          : 'No matches found above threshold.',
      }],
    };
  },
);
```

Registrera alla tre i `src/mcp/server.ts`.

### 4. Tester

#### `tests/aurora/voiceprint.test.ts` — core-tester

- `renameSpeaker updates speakerLabel and title`
- `renameSpeaker throws on non-existent node`
- `renameSpeaker throws on non-voice_print node`
- `mergeSpeakers transfers segments and removes source`
- `mergeSpeakers aggregates segmentCount and totalDurationMs`
- `mergeSpeakers transfers edges from source to target`
- `mergeSpeakers avoids duplicate edges`
- `mergeSpeakers throws on same source and target`
- `mergeSpeakers throws on non-existent source`
- `mergeSpeakers throws on non-existent target`
- `suggestSpeakerMatches finds same-name speakers across videos`
- `suggestSpeakerMatches treats auto-labels as weaker matches`
- `suggestSpeakerMatches respects threshold`
- `suggestSpeakerMatches filters by voicePrintId`
- `suggestSpeakerMatches returns empty for single voice print`
- `suggestSpeakerMatches skips same-video matches`
- `suggestSpeakerMatches avoids duplicate A↔B pairs`

#### `tests/commands/aurora-rename-speaker.test.ts` — CLI-tester

- `shows success message with old and new name`
- `shows error for non-existent voice print`

#### `tests/commands/aurora-merge-speakers.test.ts` — CLI-tester

- `shows merge confirmation with segment counts`
- `shows error when merging same speaker`

#### `tests/commands/aurora-suggest-speakers.test.ts` — CLI-tester

- `shows matches sorted by similarity`
- `shows "no matches" message when none found`
- `respects --threshold option`

#### `tests/mcp/tools/aurora-rename-speaker.test.ts` — MCP-tester

- `renames speaker and returns result`
- `returns error for missing voice print`

#### `tests/mcp/tools/aurora-merge-speakers.test.ts` — MCP-tester

- `merges speakers and returns summary`
- `returns error for self-merge`

#### `tests/mcp/tools/aurora-suggest-speakers.test.ts` — MCP-tester

- `returns matches above threshold`
- `returns empty when no matches`
- `filters by voicePrintId when provided`

**Befintliga ~1526 tester ska passera oförändrade.**

## Avgränsningar

- **Ingen embedding-baserad matchning** — heuristik (namnmatchning) räcker som första steg.
  Embedding-matchning kan läggas till senare via pgvector.
- **Ingen Postgres-skrivning** — bara aurora-grafen (graph.json). `db-import` synkar
  till Postgres vid behov.
- **Ingen automatisk merge** — suggest visar förslag, användaren beslutar.
- **Confidence** uppdateras inte automatiskt — kan läggas till i C2.1 om önskat.

## Verifiering

```bash
pnpm test
pnpm typecheck
# Manuellt (kräver voice_print-noder i grafen):
npx tsx src/cli.ts aurora:rename-speaker <id> "Namn"
npx tsx src/cli.ts aurora:merge-speakers <sourceId> <targetId>
npx tsx src/cli.ts aurora:suggest-speakers
```

## Risk

**Låg.** Helt nya filer. Befintlig kod ändras bara:
1. `src/cli.ts` — 3 nya `.command()`-registreringar
2. `src/mcp/server.ts` — 3 nya imports + registreringar

**Rollback:** `git revert <commit>`
