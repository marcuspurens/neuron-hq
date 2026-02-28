# Brief: Skeptiker-agent — Confidence decay + grafvalidering

## Bakgrund

Kunskapsgrafen har 72 noder med confidence 0.0–1.0. Idag kan confidence bara *öka* (via `graph_update`).
Det finns ingen mekanism som sänker confidence på noder som inte bekräftats på länge.
Det finns heller ingen process som ifrågasätter om en nod fortfarande är relevant.

**Problem:** Grafen kan utveckla "övertygelser" som aldrig ifrågasätts — en form av
organisatoriskt grupptänkande i maskinformat.

**Källa:** Djupsamtal session 50 — [samtal-2026-02-27T1730](../docs/samtal-2026-02-27T1730-neuron-opus-djupsamtal-minne-och-framtid.md)

## Scope

**Två delar: automatisk confidence-decay + ny Skeptiker-funktion i Historian.**

## Uppgifter

### 1. Confidence-decay i `knowledge-graph.ts`

Lägg till en ny exporterad funktion:

```typescript
export function applyConfidenceDecay(
  graph: KnowledgeGraph,
  options: { maxRunsSinceConfirm?: number; decayFactor?: number }
): KnowledgeGraph
```

**Logik:**
- Iterera alla noder
- För varje nod: kolla `updated`-timestamp
- Om noden inte uppdaterats de senaste `maxRunsSinceConfirm` körningarna (default 20):
  - Multiplicera `confidence` med `decayFactor` (default 0.9)
  - Uppdatera `updated`-timestamp till now
  - Sätt `properties.decay_applied = true`
- Noder med confidence under 0.1 flaggas med `properties.stale = true`
- Returnera ny graf (immutable pattern)

### 2. Kör decay i Historian vid varje körning

I Historian-agentens `run()`-metod, **efter** alla skrivningar men **före** `saveGraph()`:

```typescript
graph = applyConfidenceDecay(graph, { maxRunsSinceConfirm: 20, decayFactor: 0.9 });
```

Det betyder att varje körning automatiskt degraderar gamla noder. Historian behöver inte
tänka på det — det sker automatiskt.

### 3. Skeptiker-prompt i Historian

Lägg till i `prompts/historian.md` efter steg 6 (graph writing):

```markdown
7. **Skeptiker-granskning** (varannan körning):
   - Kör `graph_query({ min_confidence: 0.7 })` — hitta höga confidence-noder
   - För varje nod med confidence >= 0.7: fråga dig själv:
     - Bekräftades detta mönster i den *aktuella* körningen?
     - Är det fortfarande relevant med nuvarande kodbasens struktur?
     - Har det testats i fler än ett target-repo?
   - Om svaret på alla tre är "nej" → `graph_update` med sänkt confidence (-0.1)
   - Skriv en kort notering i `patterns.md`: "Skeptiker: pattern-X ej bekräftad, confidence sänkt"
```

### 4. Tester

Skriv tester i `tests/core/confidence-decay.test.ts`:

1. `applyConfidenceDecay` sänker confidence på noder som inte uppdaterats
2. `applyConfidenceDecay` rör INTE noder som uppdaterats nyligen
3. `applyConfidenceDecay` sätter `stale = true` på noder under 0.1
4. `applyConfidenceDecay` respekterar anpassat `decayFactor`
5. `applyConfidenceDecay` respekterar anpassat `maxRunsSinceConfirm`
6. Noder som uppdaterats exakt vid gränsen (20 körningar) degraderas INTE
7. Decay appliceras inte dubbelt (properties.decay_applied check)

## Acceptanskriterier

- [ ] `applyConfidenceDecay()` exporterad från `knowledge-graph.ts`
- [ ] Historian kör decay automatiskt varje körning
- [ ] Historian-prompten innehåller skeptiker-granskning
- [ ] 7+ tester i `tests/core/confidence-decay.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Medium.** Ändrar confidence-värden i grafen automatiskt. Men decay är konservativ (0.9 per körning)
och kräver 20 körningars inaktivitet innan den slår in. Inga noder raderas — bara degraderas.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test
```

Förväntat baseline: 443 passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-28-skeptiker-agent.md --hours 1
```
