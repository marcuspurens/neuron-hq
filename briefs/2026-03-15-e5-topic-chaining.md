# E5: Topic Chaining — KM som kedjar luckor automatiskt

## Bakgrund

Knowledge Manager (E1–E4) kör en enda cykel: hitta luckor → researcha → lösa. Men research skapar ofta *nya* frågor. "Vad är SKOS?" leder till "Hur skiljer sig SKOS från OWL?" som leder till "När passar RDF vs property graph?".

Idag stannar KM efter en cykel. Topic chaining gör att KM automatiskt upptäcker nya luckor som uppstod från just-ingestad kunskap och kedjar vidare — tills kunskapen konvergerar eller budget tar slut.

## Vad ska göras

### 1. Chaining-logik i Knowledge Manager (`src/core/agents/knowledge-manager.ts`)

Utöka KM-agentens `run()` med en chaining-loop:

```
Cykel 1: getGaps() → research top 5 → resolve → ingest URLs → synthesize
         ↓
         Extrahera nya luckor från ingestad text
         ↓
Cykel 2: Nya luckor → research → resolve → ingest
         ↓
         Extrahera ännu fler luckor...
         ↓
Cykel N: Stopp om (inga nya luckor ELLER maxCycles nådd ELLER tidsgräns)
```

**Stoppvillkor (alla kontrolleras efter varje cykel):**
- `maxCycles` (default: 3) — max antal kedjelänkar
- `maxTimeMinutes` (default: 15) — total tidsgräns
- `convergence` — om nya luckor < 2, stanna (kunskapen har konvergerat)

### 2. Gap-emergence: extrahera nya luckor från ingestad text (`src/aurora/knowledge-gaps.ts`)

Ny funktion:

```typescript
async function extractEmergentGaps(input: {
  ingestedNodeIds: string[];   // noder som just ingestades
  existingGapIds: string[];    // luckor vi redan känner till (undvik dubbletter)
  maxGaps?: number;            // max antal nya luckor (default: 5)
}): Promise<EmergentGap[]>
```

**Hur det fungerar:**
1. Hämta text från ingestade noder
2. Skicka till LLM med prompt: "Vilka viktiga följdfrågor väcker denna text?"
3. Filtrera bort frågor som semantiskt matchar befintliga gaps (>0.85 similarity)
4. Returnera nya gaps med `source: 'emergent'` och `chainedFrom: originalGapId`

### 3. Emergent gap-prompt (`prompts/emergent-gaps.md`)

LLM-prompt som tar ingestad text och returnerar följdfrågor:

```
Given the following research text, identify 3-5 important follow-up questions
that a knowledge system should investigate next. Focus on:
- Concepts mentioned but not explained
- Claims that need verification from other sources
- Related topics that would deepen understanding
- Contradictions with common assumptions

Return JSON: { "questions": ["...", "..."] }
```

### 4. Chain-tracking i KMReport

Utöka `KMReport` med:

```typescript
interface KMReport {
  ...existing,
  chainId: string;           // UUID för hela kedjan
  cycleNumber: number;       // vilken cykel (1, 2, 3...)
  totalCycles: number;       // hur många cykler kördes
  emergentGapsFound: number; // nya luckor som uppstod
  stoppedBy: 'convergence' | 'maxCycles' | 'timeout' | 'noNewGaps';
}
```

### 5. Chain-logging i km_runs-tabellen

Utöka `km_runs`-loggning med `chain_id` och `cycle_number` så man kan följa en hel kedja:

```sql
-- Visa alla cykler i en kedja:
SELECT cycle_number, gaps_found, gaps_resolved, stopped_by
FROM km_runs WHERE chain_id = '...' ORDER BY cycle_number;
```

Migration 016: lägg till `chain_id UUID`, `cycle_number INT`, `stopped_by TEXT` i km_runs.

### 6. Konfiguration i limits.yaml

```yaml
km_chaining:
  enabled: true
  maxCycles: 3
  maxTimeMinutes: 15
  convergenceThreshold: 2    # stopp om < 2 nya gaps
  emergentGapsPerCycle: 5    # max nya gaps per cykel
```

### 7. CLI-utökning

- `km --chain` — kör KM med chaining aktiverat (default: en cykel som idag)
- `km --chain --max-cycles 5` — override max cykler
- `km chain-status <chainId>` — visa status för en kedja

### 8. MCP-utökning

Utöka `neuron_knowledge_manager` MCP-tool:
- `run` action: ny parameter `chain: boolean` (default: false)
- `chain_status` action: visa kedja med alla cykler

### 9. Integration med auto-KM

I `auto-km.ts`: om chaining är enabled i config, kör KM med chaining automatiskt efter varje swarm-körning. Begränsa till `maxCycles: 2` i auto-läge (spara tokens).

## Acceptance Criteria

- [ ] KM kan köra flera cykler (chain) med stoppvillkor
- [ ] `extractEmergentGaps()` hittar nya luckor från ingestad text
- [ ] Emergenta gaps filtreras mot befintliga (semantisk dedup)
- [ ] `chainId` + `cycleNumber` spåras i KMReport
- [ ] Konvergens-detektion fungerar (stoppar om < 2 nya gaps)
- [ ] `maxCycles` och `maxTimeMinutes` respekteras
- [ ] `stoppedBy` rapporteras korrekt
- [ ] Migration 016 lägger till chain-fält i km_runs
- [ ] Config i limits.yaml
- [ ] CLI `km --chain` fungerar
- [ ] CLI `km chain-status` visar kedja
- [ ] MCP utökad med chain-parameter och chain_status
- [ ] Auto-KM integrerar chaining om enabled
- [ ] Emergent-gaps prompt skapad
- [ ] Alla befintliga tester gröna
- [ ] Typecheck grönt
- [ ] ≥20 nya tester

## Icke-mål

- Ingen parallell research (cykler körs sekventiellt)
- Ingen kostnadskalkyl per cykel (framtida arbete)
- Ingen UI för att visualisera kedjor (dashboard-förbättring senare)

## Risker

- **MEDIUM:** LLM-kostnad — varje cykel kostar tokens för gap-extraction + research. Stoppvillkor begränsar.
- **LÅG:** Oändlig loop — maxCycles + maxTimeMinutes förhindrar
- **LÅG:** Emergenta gaps av låg kvalitet — semantisk dedup + convergence-check filtrerar
