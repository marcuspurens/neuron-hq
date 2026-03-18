# TD-4: Idé-noder i Kunskapsgrafen

## Bakgrund

Varje körning genererar en `ideas.md` med förbättringsförslag, men dessa sparas bara som markdownfiler i `runs/<runid>/`. Systemet kan inte söka i dem, referera till dem, eller prioritera dem. Idéer "glöms bort" omedelbart.

**Nuvarande flöde:**
```
Researcher → ideas.md (fil) → ... inget mer
```

**Önskat flöde:**
```
Researcher → ideas.md (fil) → Historian → idea-noder (KG) → Researcher/KM kan söka
```

## Mål

- Ny nodtyp `idea` i kunskapsgrafen med impact/effort/status
- Historian parsar `ideas.md` efter varje körning och skapar idea-noder
- Idea-noder kopplas till körningen de uppstod i (`discovered_in`)
- Idéer kan sökas, prioriteras och markeras som genomförda
- Ny kanttyp `inspired_by` — kopplar idéer till de patterns/errors som inspirerade dem

## Arkitektur

### Ändringar i befintliga filer

**1. `src/core/knowledge-graph.ts` — lägg till nodtyp och kanttyp**

```typescript
// Rad 10-16: Lägg till 'idea'
export const NodeTypeSchema = z.enum([
  'pattern', 'error', 'technique', 'run', 'agent', 'idea',
]);

// Rad 24-30: Lägg till 'inspired_by'
export const EdgeTypeSchema = z.enum([
  'solves', 'discovered_in', 'related_to', 'causes', 'used_by', 'inspired_by',
]);
```

**2. `src/core/agents/graph-tools.ts` — uppdatera tool-definitioner**

Alla `graph_assert`, `graph_query`, etc. som refererar till nodtyper behöver inkludera `'idea'` i sina enum-beskrivningar.

**3. Ny migration: `src/core/migrations/017_idea_nodes.sql`**

```sql
-- Utöka CHECK constraint för kg_nodes.type
ALTER TABLE kg_nodes DROP CONSTRAINT IF EXISTS kg_nodes_type_check;
ALTER TABLE kg_nodes ADD CONSTRAINT kg_nodes_type_check
  CHECK (type IN ('pattern', 'error', 'technique', 'run', 'agent', 'idea'));

-- Utöka CHECK constraint för kg_edges.type
ALTER TABLE kg_edges DROP CONSTRAINT IF EXISTS kg_edges_type_check;
ALTER TABLE kg_edges ADD CONSTRAINT kg_edges_type_check
  CHECK (type IN ('solves', 'discovered_in', 'related_to', 'causes', 'used_by', 'inspired_by'));
```

**4. `src/core/agents/historian.ts` — parsa ideas.md och skapa noder**

Efter att Historian skrivit till memory-filerna, lägg till ett steg:

```typescript
// Läs ideas.md från körningens runDir
// Parsa varje idé (rubrik + beskrivning)
// Skapa idea-nod med properties: { impact, effort, status: 'proposed', source_run }
// Skapa discovered_in-kant till körningens run-nod
// Om idén refererar till ett pattern/error → skapa inspired_by-kant
```

### Idea-nodens properties

```typescript
{
  // Standard KG-fält
  type: 'idea',
  title: 'Event batching för agent:text',
  confidence: 0.5,  // initial, ökar om idén refereras igen
  scope: 'project-specific',

  // Idea-specifika properties (i JSONB)
  properties: {
    impact: 'medium',       // 'low' | 'medium' | 'high'
    effort: 'low',          // 'low' | 'medium' | 'high'
    status: 'proposed',     // 'proposed' | 'accepted' | 'implemented' | 'rejected'
    source_run: '20260316-1002-neuron-hq',
    description: 'Batcha agent:text-events för att minska SSE-overhead...',
    implemented_in?: '20260320-0900-neuron-hq',  // om/när den genomförs
  }
}
```

### Parsning av ideas.md

Historian behöver en enkel parser. ideas.md har typiskt detta format:

```markdown
# Ideas

## For RT-1b (Dashboard Server + UI)
- EventBus is ready — subscribe with...
- `eventBus.history` provides reconnect state...

## Future Improvements
- Consider adding `eventBus.onceAny()`...
- Event batching for high-frequency events...
```

**Parsningsregel:**
- Varje `##`-rubrik = en grupp
- Varje `- ` under rubriken = en idé
- Rubrikens kontext (t.ex. "For RT-1b") → tagg på idé-noden
- Om texten nämner en befintlig KG-nod (pattern/error) → `inspired_by`-kant

### Dedup

Före skapande: kör semantisk sökning (embedding) mot befintliga idea-noder. Om likhet > 0.85 → uppdatera befintlig nod (öka confidence) istället för att skapa ny. Samma mönster som redan finns för pattern/technique-noder.

## Krav

### Måste ha (acceptance criteria)
- [ ] `idea` tillagd i `NodeTypeSchema` enum
- [ ] `inspired_by` tillagd i `EdgeTypeSchema` enum
- [ ] Migration 017 uppdaterar Postgres CHECK constraints
- [ ] Historian parsar `ideas.md` efter varje körning och skapar idea-noder
- [ ] Varje idea-nod har properties: impact, effort, status, source_run, description
- [ ] `discovered_in`-kant skapas till körningens run-nod
- [ ] Dedup via semantisk sökning (likhet > 0.85 → uppdatera istället för skapa ny)
- [ ] `graph_query` kan filtrera på `type: 'idea'`
- [ ] Alla befintliga tester passerar
- [ ] Minst 10 nya tester:
  - Idea-nod skapas korrekt
  - Properties-schema valideras
  - Dedup fungerar (liknande idé → uppdatering)
  - ideas.md-parsning (rubrik + bullets)
  - inspired_by-kant skapas
  - discovered_in-kant skapas
  - graph_query med type='idea' returnerar idéer

### Bra att ha (stretch goals)
- [ ] MCP-tool `aurora_ideas` med actions: list, search, update-status
- [ ] CLI-kommando `npx tsx src/cli.ts ideas` — visa alla idéer sorterat på impact
- [ ] Backfill: parsa ideas.md från alla befintliga körningar i `runs/`
- [ ] Researcher läser idea-noder och undviker att föreslå samma idéer igen

## Tekniska beslut

- **JSONB properties** — impact/effort/status lagras i properties-fältet, inte som egna kolumner
- **Parsning i Historian** — enklaste integrationspunkten, kör redan efter varje run
- **Semantisk dedup** — samma mönster som technique/pattern, undviker duplicerade idéer
- **Status-fält** — `proposed` → `accepted` → `implemented` (eller `rejected`). Uppdateras manuellt eller av Manager vid framtida körningar.

## Riskanalys

| Risk | Sannolikhet | Hantering |
|------|-------------|-----------|
| ideas.md har inkonsistent format | Medel | Defensiv parsning — ta vad vi kan, skippa resten |
| Historian timeout med extra KG-arbete | Låg | ideas-parsning är snabb (~5 noder per körning) |
| Gamla CHECK constraints blockerar migration | Låg | DROP + ADD i migration |

## Dependencies

Inga nya.

## Uppskattad omfattning

- ~30 rader: Schema-ändringar (knowledge-graph.ts + graph-tools.ts)
- ~15 rader: Migration 017
- ~80 rader: ideas.md-parser + nod-skapande i Historian
- ~20 rader: Dedup-logik (reuse befintlig semantisk sökning)
- ~150 rader: Tester
- **Totalt: ~295 rader**
