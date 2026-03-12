# Brief: S9.1 — Historian sätter model-fält på graf-noder

## Bakgrund

S9 lade till `model`-fält i `KGNodeSchema` men Historian sätter det inte vid nodskapande. Det innebär att graf-noder saknar information om vilken modell som upptäckte mönstret — data som behövs för att lära sig vilka mönster som funkar med vilken modell.

## Scope

**Ingår:**
1. Lägg till `model` i `GraphToolContext`
2. Sätt `model` automatiskt i `graph_assert` (nod-skapande)
3. Skicka `this.model` från Historian till `GraphToolContext`
4. Skicka `this.model` från Consolidator till `GraphToolContext` (om den använder graf-verktyg)
5. Tester

**Ingår INTE:**
- Ändra befintliga noder (de får `model` vid nästa `graph_update`)
- Ändra KGNodeSchema (redan klart i S9)

## Uppgifter

### 1. Utöka `GraphToolContext` (`src/core/agents/graph-tools.ts`)

```typescript
export interface GraphToolContext {
  graphPath: string;
  runId: string;
  agent: string;
  model?: string;   // ← nytt, valfritt
  audit: { log: (entry: AuditEntry) => Promise<void> };
}
```

### 2. Sätt `model` i `graph_assert` (`src/core/agents/graph-tools.ts`)

I `executeGraphAssert`, efter att `newNode` skapas (rad ~281–297):

```typescript
const newNode: KGNode = {
  id,
  type: nodeInput.type,
  title: nodeInput.title,
  properties: {
    ...nodeInput.properties,
    provenance: {
      runId: ctx.runId,
      agent: ctx.agent,
      timestamp: now,
    },
  },
  created: now,
  updated: now,
  confidence: nodeInput.confidence,
  scope: nodeInput.scope || 'unknown',
  model: ctx.model,               // ← nytt
};
```

### 3. Skicka `model` från agenter

**Historian** (`src/core/agents/historian.ts`, rad ~386):
```typescript
const graphCtx: GraphToolContext = {
  graphPath: path.join(this.memoryDir, 'graph.json'),
  runId: this.ctx.runid,
  agent: 'historian',
  model: this.model,              // ← nytt
  audit: this.ctx.audit,
};
```

**Consolidator** (`src/core/agents/consolidator.ts`) — samma mönster om den skapar `GraphToolContext`.

### 4. Tester

Uppdatera `tests/core/graph-tools.test.ts`:
- `graph_assert` med `model` i context → nod har `model`-fält
- `graph_assert` utan `model` i context → nod har `model: undefined` (bakåtkompatibelt)

## Acceptanskriterier

- [ ] `GraphToolContext` har valfritt `model`-fält
- [ ] `graph_assert` sätter `model` på nya noder
- [ ] Historian skickar sin modell till `GraphToolContext`
- [ ] Consolidator skickar sin modell (om den använder graf-verktyg)
- [ ] Befintliga tester passerar
- [ ] Minst 2 nya tester
- [ ] `pnpm typecheck` passerar

## Risk

**Low.** Alla ändringar är additiva — `model` är valfritt överallt.

## Baseline

```bash
pnpm test
```

Förväntat baseline: **809+ passed**.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-02-historian-model-tag.md --hours 1
```
