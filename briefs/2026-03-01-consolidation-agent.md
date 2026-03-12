# Brief: S6 — Konsolideringsagent

## Bakgrund

Kunskapsgrafen har 97 noder och 66 kanter. Historian och Librarian skapar nya noder
varje körning, men **ingen agent förädlar det som redan finns**. Det leder till:

- **Dubbletter**: Om Historian skapar "retry-med-backoff" och "exponential-backoff" som
  separata noder, förblir de separata. Ingen agent kollapsar dem.
- **Svaga kopplingar**: `related_to`-kanter skapas bara vid insättning — om Historian
  missar ett samband vid körning 30 upptäcks det aldrig i körning 45.
- **Ingen kunskapsluckeanalys**: Vi vet inte vilka områden grafen saknar täckning i.
- **Confidence-decay utan kontext**: `applyConfidenceDecay()` sänker alla gamla noder
  blint med 0.9×. En konsolideringsagent kan göra det mer intelligent.

**Observation från S52-samtalsloggen (2.3):**
> "69 noder, 56 kanter. Det är tillräckligt för att vara användbart men för litet
> för att vara *rikt*. Och viktigare: ingen automatisk konsolidering."

**Inspiration:** A-MEM (NeurIPS 2025) bygger minnesystem där agenten själv
organiserar minnen — skapar, länkar, och slår ihop dynamiskt. Neurons Historian
gör delar av detta men saknar sammanslagningslogiken.

## Koncept

Librarian söker **utåt** (arxiv, forskning). Konsolideringsagenten söker **inåt**
(befintlig graf). Den:

1. Identifierar dubbletter via fuzzy title-matchning
2. Slår ihop noder (canonical title, kombinerade properties, omdirigerade kanter)
3. Stärker saknade `related_to`-kanter
4. Identifierar kunskapsluckor
5. Arkiverar uttjänta noder (confidence < 0.15)

Kör var 10:e körning (inte varje körning — grafen behöver inte konsolideras
oftare än så).

## Scope

Ny agentroll `consolidator` med prompt, agent-fil, graph-merge-verktyg, trigger-logik
i orchestrator, och tester.

## Uppgifter

### 1. Graph-merge utility

Skapa `src/core/graph-merge.ts`:

```typescript
import { z } from 'zod';
import type { KnowledgeGraph, KGNode, KGEdge } from './knowledge-graph.js';

export const MergeProposalSchema = z.object({
  keepNodeId: z.string().describe('ID of the node to keep (canonical)'),
  removeNodeId: z.string().describe('ID of the node to merge into keepNodeId'),
  mergedTitle: z.string().describe('Combined/improved title for the kept node'),
  reason: z.string().describe('Why these nodes are duplicates'),
});

export type MergeProposal = z.infer<typeof MergeProposalSchema>;

/**
 * Merges removeNode into keepNode:
 * - Combines properties (keepNode wins on conflict)
 * - Redirects all edges from removeNode → keepNode
 * - Sets confidence to max(keepNode, removeNode)
 * - Removes the removeNode
 * - Returns new immutable graph
 */
export function mergeNodes(
  graph: KnowledgeGraph,
  proposal: MergeProposal
): KnowledgeGraph;

/**
 * Finds candidate duplicate pairs using normalized title similarity.
 * Returns pairs sorted by similarity score (highest first).
 * Only compares nodes of the same type.
 */
export function findDuplicateCandidates(
  graph: KnowledgeGraph,
  similarityThreshold?: number // default 0.6
): Array<{ nodeA: string; nodeB: string; similarity: number }>;

/**
 * Finds nodes with confidence below threshold that haven't been
 * updated in the last N days. Candidates for archival.
 */
export function findStaleNodes(
  graph: KnowledgeGraph,
  options?: { maxConfidence?: number; staleDays?: number }
): KGNode[];

/**
 * Finds node pairs that share multiple edges to common neighbors
 * but have no direct edge between them. Suggests missing links.
 */
export function findMissingEdges(
  graph: KnowledgeGraph
): Array<{ from: string; to: string; sharedNeighbors: number }>;
```

**Similarity-beräkning:** Normalisera titlar (lowercase, strip common words),
tokenisera, beräkna Jaccard-likhet. Ingen embedding behövs — titlarna är korta
och samma vokabulär.

### 2. Consolidator-prompt

Skapa `prompts/consolidator.md`:

```markdown
# Consolidator Agent

You are a knowledge graph curator. Your job is to **refine and improve** the
existing knowledge graph — not to add new knowledge.

## Your Operations

### 1. Merge Duplicates
- Use `find_duplicate_candidates` to get pairs with high similarity
- Review each pair: are they truly the same concept?
- If yes → call `graph_merge_nodes` with a clear reason
- If no → call `graph_update` to add a `related_to` edge instead

### 2. Strengthen Connections
- Use `find_missing_edges` to discover unlinked but related nodes
- Add `related_to` edges where the connection is genuine
- Don't create edges between unrelated nodes just because they share neighbors

### 3. Identify Knowledge Gaps
- Query each node type (pattern, error, technique) and look for:
  - Runs without any discovered patterns (gap in observation)
  - Errors without a matching pattern that solves them (unsolved problems)
  - Techniques from research without connections to practical patterns (theory-practice gap)
- Write findings to consolidation_report.md

### 4. Archive Stale Nodes
- Use `find_stale_nodes` to find very low-confidence, old nodes
- If a node has no edges or only connects to other stale nodes → archive it
- Archiving = set properties.archived = true, not deletion

## Rules
1. **Never create new knowledge nodes** — you only refine existing ones
2. **Be conservative with merges** — only merge if clearly the same concept
3. **Always provide a reason** for every merge
4. **Preserve provenance** — merged properties should note both original sources
5. **Log everything** — write a consolidation_report.md with all actions taken

## Self-Reflection
Before reporting done, verify:
- [ ] No nodes were accidentally deleted (only merged or archived)
- [ ] All merge reasons are documented
- [ ] Edge count did not decrease (merges should redirect, not remove)
- [ ] consolidation_report.md is written
```

### 3. Consolidator agent-fil

Skapa `src/core/agents/consolidator.ts`:

- Ny agent som följer samma mönster som `historian.ts` / `librarian.ts`
- Verktyg:
  - `graph_query` (läs — redan i `graph-tools.ts`)
  - `graph_traverse` (läs — redan i `graph-tools.ts`)
  - `graph_update` (skriv — redan i `graph-tools.ts`)
  - `graph_merge_nodes` (nytt — wrapper runt `mergeNodes()`)
  - `find_duplicate_candidates` (nytt — wrapper runt funktionen)
  - `find_stale_nodes` (nytt — wrapper runt funktionen)
  - `find_missing_edges` (nytt — wrapper runt funktionen)
  - `write_consolidation_report` (nytt — skriver till `runs/<runid>/consolidation_report.md`)

### 4. Trigger-logik i orchestrator

I `src/core/run-orchestrator.ts`, lägg till konsolideringssteg:

```typescript
// After Historian, check if consolidation should run
const runNumber = getCurrentRunNumber(); // count existing run dirs
if (runNumber % 10 === 0) {
  await runConsolidator(runContext);
}
```

- Kör **efter Historian** (behöver uppdaterad graf)
- Kör **före** eventuell Librarian (konsolidera före nytt tillägg)
- Konfigurerbar frekvens via `policy/limits.yaml`: `consolidation_frequency: 10`

### 5. Tester

Skriv tester i `tests/core/graph-merge.test.ts`:

1. `findDuplicateCandidates` hittar noder med liknande titlar
2. `findDuplicateCandidates` returnerar tom lista om inga likheter
3. `findDuplicateCandidates` jämför bara samma nodtyp
4. `mergeNodes` kombinerar properties korrekt
5. `mergeNodes` omdirigerar kanter från borttagen nod
6. `mergeNodes` sätter confidence till max av bägge
7. `mergeNodes` kastar om keepNodeId inte finns
8. `mergeNodes` kastar om removeNodeId inte finns
9. `findStaleNodes` hittar gamla noder med låg confidence
10. `findStaleNodes` skippar nyligen uppdaterade noder
11. `findMissingEdges` hittar noder som delar grannar utan direkt kant
12. `findMissingEdges` returnerar tom lista om alla kopplingar finns
13. Jaccard-likhet beräknar korrekt (test helper)
14. Consolidator-prompten finns och innehåller nyckelord

Skriv tester i `tests/core/agents/consolidator.test.ts`:

15. Consolidator-agenten skapas med rätt verktyg
16. `graph_merge_nodes`-verktyget anropar `mergeNodes()` korrekt
17. `write_consolidation_report` skriver fil till run-katalog

## Acceptanskriterier

- [ ] `src/core/graph-merge.ts` existerar med `mergeNodes()`, `findDuplicateCandidates()`, `findStaleNodes()`, `findMissingEdges()`
- [ ] `prompts/consolidator.md` existerar med konsolideringsregler
- [ ] `src/core/agents/consolidator.ts` existerar med alla verktyg
- [ ] Trigger-logik i orchestrator kör konsolidering var 10:e körning
- [ ] `consolidation_frequency` konfigurerbar i `policy/limits.yaml`
- [ ] 15+ tester i `tests/core/graph-merge.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Relaterade problem från samtalsloggen (S52)

### 2.1 — Manager följer inte alltid sina egna regler
Manager delegerade allt på en gång i S2 trots "en uppgift i taget". Koden borde
enforcea detta, men det är en separat brief (eventuellt S-spåret).

### 2.2 — Ingen parallellism
S3 i ROADMAP:en. High risk — kräver att Merger hanterar merge-konflikter.
Inte del av denna brief.

### 2.4 — Ingen feedback-loop från produktion
Kräver monitoreringsagent + produktionsmiljö. Framtida arbete.

## Risk

**Medium.** Ny agent med egna verktyg — additivt, men merge-logiken kan
förstöra grafdata om den är buggig. Skyddsmekanismer:
- `mergeNodes()` är immutabel (returnerar ny graf, muterar inte)
- Consolidator arkiverar men raderar aldrig
- Kör bara var 10:e körning — feleffekt begränsad
- `consolidation_report.md` dokumenterar alla åtgärder

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 523+ passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-01-consolidation-agent.md --hours 1
```
