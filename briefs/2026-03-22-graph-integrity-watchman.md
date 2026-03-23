# Brief: 2.5 Grafintegritet — watchman

**Target:** neuron-hq
**Effort:** 1 körning
**Roadmap:** Fas 2 — Intelligens, punkt 2.5

## Bakgrund

Neuron HQ:s kunskapsgraf (`memory/graph.json`) har växt till **1 345 noder** och **206 kanter** över 176+ körningar. Det finns ingen mekanism som kontrollerar grafens hälsa — ingen upptäcker att 83% av noderna saknar kopplingar, att 270 noder saknar provenance, eller att 117 noder har okänd scope.

**Nuläge:**
- `findDuplicateCandidates()` i `graph-merge.ts` hittar dubbletter via Jaccard (≥0.6) — men körs bara av Consolidator
- `findStaleNodes()` i `graph-merge.ts` hittar noder med confidence ≤0.15 som inte uppdaterats på 30 dagar — men körs bara av Consolidator
- `findMissingEdges()` i `graph-merge.ts` hittar nodpar med 2+ gemensamma grannar utan direkt kant — men körs bara av Consolidator
- Consolidator triggas var 10:e körning via `maybeInjectConsolidationTrigger()` i `run.ts` — men den kontrollerar inte grafens övergripande hälsa
- `aurora-integrity.ts` kontrollerar Aurora-korsreferenser — inte Neuron-grafens integritet

**Aktuell grafstatus (mätt manuellt):**

| Mätpunkt | Värde | Allvarlighet |
|----------|-------|-------------|
| Isolerade noder (0 kanter) | 1 120 av 1 345 (83%) | 🔴 Kritisk |
| Saknar provenance (`discovered_in`-kant) | 270 pattern/error/technique | 🟡 Hög |
| Okänd scope (`unknown`) | 117 noder | 🟡 Medel |
| Brutna kopplingar | 0 | 🟢 OK |
| Stale low-confidence (≤0.15, >30 dagar) | 4 noder | 🟢 OK |

**Problemet:** Utan en hälsokontroll som körs regelbundet kan grafens kvalitet degraderas tyst. Historian och Consolidator behöver data om grafens tillstånd för att prioritera sitt arbete. Idag arbetar Consolidator "blint" — den kör sina checks utan att veta vilka problem som är mest kritiska.

## Vad ska byggas

### 1. Grafens hälsokontroll-modul (`src/core/graph-health.ts`)

En modul med rena funktioner som analyserar grafens tillstånd.

**API:**

```typescript
interface HealthCheckResult {
  status: 'GREEN' | 'YELLOW' | 'RED';
  timestamp: string;
  summary: {
    totalNodes: number;
    totalEdges: number;
    edgesPerNode: number;  // totalEdges / totalNodes
  };
  checks: {
    isolatedNodes: IsolatedNodesCheck;
    duplicates: DuplicatesCheck;
    brokenEdges: BrokenEdgesCheck;
    staleLowConfidence: StaleCheck;
    missingProvenance: ProvenanceCheck;
    unknownScope: ScopeCheck;
    missingEdges: MissingEdgesCheck;
  };
  recommendations: string[];  // max 5, sorterade på allvarlighet
}

interface IsolatedNodesCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  percentage: number;
  byType: Record<string, { count: number; total: number; percentage: number }>;
  // RED om >50%, YELLOW om >25%
}

interface DuplicatesCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  candidateCount: number;
  topCandidates: Array<{ nodeA: string; nodeB: string; similarity: number }>;  // max 10
  // RED om >20, YELLOW om >5
}

interface BrokenEdgesCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  brokenEdges: Array<{ from: string; to: string; type: string }>;  // max 20
  // RED om >0
}

interface StaleCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  nodes: Array<{ id: string; title: string; confidence: number; lastUpdated: string }>;  // max 20
  // YELLOW om >10, RED om >50
}

interface ProvenanceCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  byType: Record<string, number>;
  // YELLOW om >10%, RED om >25%
}

interface ScopeCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  byType: Record<string, number>;
  // YELLOW om >10%, RED om >25%
}

interface MissingEdgesCheck {
  status: 'GREEN' | 'YELLOW' | 'RED';
  count: number;
  topCandidates: Array<{ from: string; to: string; sharedNeighbors: number }>;  // max 10
  // YELLOW om >20, aldrig RED (informativ check — saknade kanter är förslag, inte fel)
}
```

**Övergripande status:**
- **RED** om minst en check är RED
- **YELLOW** om minst en check är YELLOW och ingen är RED
- **GREEN** om alla checks är GREEN

**Rekommendationer:** Genereras baserat på vilka checks som är YELLOW/RED, max 5, sorterade på allvarlighet. Varje rekommendation ska vara en konkret åtgärd, t.ex. "Kör Consolidator med fokus på isolerade idea-noder (871 av 938)".

**Implementationsdetaljer:**
- Återanvänd `findDuplicateCandidates()`, `findStaleNodes()`, `findMissingEdges()` från `graph-merge.ts` — wrappa dem, duplicera inte logiken
- Isolerade noder: bygg adjacency set från `graph.edges`, filtrera `graph.nodes` vars ID inte finns i setet
- Brutna kanter: kontrollera att `edge.from` och `edge.to` finns bland `graph.nodes` ID:n
- Provenance: för varje nod med type `pattern`/`error`/`technique`, kontrollera att det finns minst en kant av typ `discovered_in` som kopplar noden till en run-nod. Kantriktning: `edge.from === nodeId` OCH `edge.to` pekar på en nod med `type === 'run'`. OBS: Verifiera konventionen genom att läsa befintliga `discovered_in`-kanter i `graph.json` eller `graph-tools.ts` — om konventionen är omvänd (`from: run, to: node`), anpassa. `solves` är en annan relation (error→pattern) och ska INTE räknas som provenance.
- Unknown scope: räkna noder med `scope === 'unknown'`

**Viktigt — granska signaturer först:**
Innan du implementerar wrapparna, läs `src/core/graph-merge.ts` och verifiera signaturerna för `findDuplicateCandidates()`, `findStaleNodes()`, `findMissingEdges()`. Wrappa dem med rätt parametrar.

**Krav:**
- Rena funktioner, inga sidoeffekter
- `runHealthCheck(graph)` är enda entry point — kör alla checks
- Hanterar tom graf gracefully (alla GREEN, alla counts 0)
- Hanterar saknad `graph.json` i CLI: fånga `loadGraph()`-fel och visa tydligt meddelande

### 2. Historian-tool (`graph_health_check`)

Nytt tool som Historian kan anropa för att få grafens hälsostatus.

**Plats:** Utöka `src/core/agents/graph-tools.ts`

```typescript
// Tool-definition:
{
  name: 'graph_health_check',
  description: 'Run a comprehensive health check on the knowledge graph. Returns status (GREEN/YELLOW/RED), detailed check results, and recommendations.',
  input_schema: {
    type: 'object',
    properties: {},
    required: []
  }
}

// Execution: ladda graf → runHealthCheck() → returnera JSON
```

**Krav:**
- Toolet returnerar `HealthCheckResult` som JSON
- Registrera toolet i samma tool-array som `graph_query`, `graph_assert` etc.
- Historian ska ha tillgång till toolet (lägg till i Historians tool-lista)

### 3. Historian-promptuppdatering

**Plats:** `prompts/historian.md`

Lägg till ett nytt steg mellan "Skeptiker-granskning"-steget och "Stop"-steget (hitta dem via namn, inte nummer — numreringen kan ha ändrats):

```markdown
N. **Grafens hälsokontroll** (varje körning):
    - Läs `graph-health.md` från körningens runs-katalog (genererad som pre-step i run.ts)
    - Om status är GREEN: notera kort i körningssammanfattningen ("Grafstatus: 🟢")
    - Om status är YELLOW: notera i sammanfattningen med vilka checks som är YELLOW
    - Om status är RED: skriv en separat error-post med detaljer
    - Inkludera alltid rekommendationerna i sammanfattningens "Lärdomar"
    - Toolet `graph_health_check` finns tillgängligt om du vill köra en ny check (rapporten kan ha genererats innan agenter ändrade grafen)
```

Uppdatera numreringen av efterföljande steg (inklusive Stop).

**Krav:**
- Historian läser den förgenerade `graph-health.md` — behöver normalt inte köra check själv
- Health check-resultat ska synas i runs.md-posten

### 4. Hälsorapport som artifact (`runs/<runId>/graph-health.md`)

**Plats:** Ny funktion i `src/core/graph-health.ts`

```typescript
function generateHealthReport(result: HealthCheckResult): string;
```

**Format:**
```markdown
# Grafens hälsorapport

**Status:** 🟢 GREEN / 🟡 YELLOW / 🔴 RED
**Tidpunkt:** 2026-03-22T12:00:00Z
**Noder:** 1 345 | **Kanter:** 206 | **Kanter/nod:** 0.15

## Checks

| Check | Status | Detaljer |
|-------|--------|----------|
| Isolerade noder | 🔴 RED | 1 120 av 1 345 (83%) |
| Dubbletter | 🟢 GREEN | 0 kandidater |
| Brutna kopplingar | 🟢 GREEN | 0 |
| Stale low-confidence | 🟢 GREEN | 4 noder |
| Saknar provenance | 🟡 YELLOW | 270 noder (20%) |
| Okänd scope | 🟡 YELLOW | 117 noder (9%) |
| Saknade kanter | 🟡 YELLOW | 15 kandidater |

## Rekommendationer

1. 🔴 **Isolerade noder:** 871 av 938 idea-noder saknar kopplingar. Kör Consolidator med fokus på att koppla idea-noder till relevanta patterns/runs.
2. 🟡 **Saknar provenance:** 270 pattern/error/technique-noder saknar `discovered_in`-kant. Historian bör prioritera att koppla dessa vid nästa skeptiker-granskning.
3. 🟡 **Okänd scope:** 117 noder har `scope: 'unknown'`. Consolidator bör scope-tagga dessa.

## Detaljer per check

### Isolerade noder (1 120)

| Typ | Isolerade | Totalt | % |
|-----|-----------|--------|---|
| idea | 871 | 938 | 93% |
| technique | 112 | 115 | 97% |
| pattern | 101 | 182 | 55% |
| run | 28 | 78 | 36% |
| error | 8 | 32 | 25% |

### Dubbletter (topp-10)
(inga kandidater)

### Stale low-confidence (4)
| ID | Titel | Confidence | Senast uppdaterad |
|----|-------|------------|-------------------|
| ... | ... | 0.1 | 2026-01-15 |
```

**Krav:**
- Markdown-format, läsbart utan tooling
- Emoji-indikatorer (🟢/🟡/🔴) för snabb scanning
- Rapporten skrivs av `run.ts` som pre-step (se sektion 6). Historian LÄSER den — skriver den inte.

### 5. CLI-kommando

**Plats:** `src/commands/graph-health.ts` (NY)

```bash
npx tsx src/cli.ts graph-health [--json]
```

**Logik:**
1. Ladda graf via `loadGraph()` (importeras från `src/core/knowledge-graph.ts`)
2. Kör `runHealthCheck(graph)` (importeras från `src/core/graph-health.ts`)
3. Om `--json`: skriv `HealthCheckResult` som JSON till stdout
4. Annars: skriv `generateHealthReport(result)` till stdout

**Registrera i CLI:** Lägg till i `src/cli.ts`.

**Krav:**
- Exit code 0 för GREEN, 1 för YELLOW, 2 för RED
- Kan köras manuellt eller i CI

### 6. Consolidator auto-trigger vid RED

**Plats:** Utöka `src/core/run.ts`

Ny funktion:

```typescript
export function maybeInjectHealthTrigger(
  briefContent: string,
  healthStatus: 'GREEN' | 'YELLOW' | 'RED'
): string;
// Anropas BARA om health check lyckades (healthResult !== null).
// Om loadGraph() kastade → funktionen anropas aldrig.
```

**Logik:**
- Om `healthStatus === 'RED'`: lägg till `\n\n⚡ Health-trigger: Graph health is RED. After Historian completes, delegate to Consolidator with graph-health report as context.`
- Annars: returnera briefContent oförändrat

**Mekanismen (EN, inte två):**
Consolidator-triggern sker ENBART via `run.ts` — samma mönster som `maybeInjectConsolidationTrigger()`. Historian LÄSER och RAPPORTERAR `graph-health.md` men triggar INTE Consolidator själv. Flödet:

1. `run.ts` kör `runHealthCheck()` som pre-step (innan agenter startar)
2. Skriver `runs/<runId>/graph-health.md`
3. Om RED → `maybeInjectHealthTrigger()` injicerar text i briefen
4. Manager läser trigger-texten och delegerar till Consolidator
5. Historian läser rapporten och inkluderar status i sin sammanfattning

**Ingen dubbel triggering** — Historian rapporterar bara, `run.ts` triggar.

```typescript
// I run.ts, efter att brief laddats:
let healthResult: HealthCheckResult | null = null;
try {
  const graph = await loadGraph();
  healthResult = runHealthCheck(graph);
  const healthReport = generateHealthReport(healthResult);
  await writeFile(`${runDir}/graph-health.md`, healthReport);
  processedBrief = maybeInjectHealthTrigger(processedBrief, healthResult.status);
} catch (err) {
  logger.warn('Graph health check failed — skipping pre-step', { error: String(err) });
  // Körningen fortsätter utan graph-health.md
}
```

**Felhantering:** Om `loadGraph()` kastar (korrupt JSON, saknad fil), logga varning och hoppa över pre-step. Ingen `graph-health.md` genereras och ingen trigger injiceras. Körningen blockeras ALDRIG av health check-fel.

**Krav:**
- Health check körs i run.ts som pre-step (billigt, ren funktion, inga API-anrop)
- Historian LÄSER rapporten (behöver inte köra check själv, men har toolet tillgängligt)
- Consolidator triggas BARA vid RED (inte YELLOW — YELLOW är informativt)

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/core/graph-health.ts` | **NY** — hälsokontroll-modul med alla checks + rapportgenerering |
| `src/core/agents/graph-tools.ts` | Lägg till `graph_health_check`-tool |
| `src/core/agents/historian.ts` | Lägg till `graph_health_check` i Historians tool-lista |
| `src/core/run.ts` | Pre-step: kör health check, skriv rapport, injicera trigger |
| `src/commands/graph-health.ts` | **NY** — CLI-kommando |
| `src/cli.ts` | Registrera `graph-health`-kommandot |
| `prompts/historian.md` | Nytt steg (mellan "Skeptiker-granskning" och "Stop"): läs och rapportera grafstatus |
| `tests/core/graph-health.test.ts` | **NY** — tester |
| `tests/commands/graph-health.test.ts` | **NY** — CLI-tester |

## Filer att INTE ändra

- `src/core/graph-merge.ts` — Använd befintliga funktioner as-is (importera, duplicera inte)
- `src/core/knowledge-graph.ts` — Ingen schemaändring behövs
- `src/core/agents/consolidator.ts` — Agentkoden ändras inte
- `prompts/consolidator.md` — Consolidators prompt ändras inte (den kan redan hantera graph-health-kontext via briefen)
- `src/commands/aurora-integrity.ts` — Aurora-integritet är separat

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Health check tar för lång tid vid stor graf | Låg | Fördröjer run-start | findMissingEdges är O(n²) — profilea vid >5000 noder, skippa den checken om timeout |
| Consolidator triggras för ofta vid RED | Medel | Extra körningskostnad | Bara RED triggar, inte YELLOW. Historian rapporterar YELLOW informativt. |
| Historian skippar health check vid tidsbrist | Medel | Hälsodata saknas | Health check körs som pre-step i run.ts — Historian bara läser rapporten |
| Tröskelvärden för GREEN/YELLOW/RED stämmer inte | Medel | Falska larm eller missade problem | Dokumentera trösklar, gör dem konfigurerbara i framtiden |

## Acceptanskriterier

### Hälsokontroll-modul

- **AC1:** `runHealthCheck(graph)` returnerar `HealthCheckResult` med status, summary, checks, recommendations
- **AC2:** Tom graf → alla checks GREEN, alla counts 0
- **AC3:** Graf med 1 brutna kant → `brokenEdges.status === 'RED'`
- **AC4:** Graf med >50% isolerade noder → `isolatedNodes.status === 'RED'`
- **AC5:** Graf med 10-50% isolerade noder → `isolatedNodes.status === 'YELLOW'`
- **AC6:** Övergripande status = worst av alla checks
- **AC7:** Rekommendationer genereras för alla YELLOW/RED checks, max 5

### Historian-tool

- **AC8a:** `graph_health_check` registrerat som tool i `graph-tools.ts`
- **AC8b:** `graph_health_check` inkluderas i Historian-agentens tool-lista i `historian.ts`
- **AC9:** Toolet returnerar `HealthCheckResult` som JSON

### Historian-prompt

- **AC10:** Historian-prompten har nytt steg som instruerar att läsa `graph-health.md` och inkludera status i sammanfattningen

### Hälsorapport

- **AC11:** `generateHealthReport()` producerar markdown med sammanfattningstabell, rekommendationer, och detaljer per check
- **AC12:** Rapporten skrivs till `runs/<runId>/graph-health.md` under körningen

### CLI

- **AC13:** `npx tsx src/cli.ts graph-health` visar grafens hälsostatus
- **AC14:** `--json` flagga ger JSON-output
- **AC15:** Exit code: 0=GREEN, 1=YELLOW, 2=RED
- **AC16:** Kommandot registrerat i `src/cli.ts`

### Integration

- **AC17:** `run.ts` kör health check som pre-step och skriver `graph-health.md`
- **AC18:** `maybeInjectHealthTrigger()` injicerar trigger vid RED
- **AC19:** Om `healthResult.status === 'RED'` injicerar `maybeInjectHealthTrigger()` en text-trigger i briefen som instruerar Manager att delegera till Consolidator. Historian rapporterar RED men triggar INTE Consolidator själv — det är `run.ts`-mekanismen som äger triggern.

### Tester

- **AC20:** `graph-health.test.ts` har minst 20 tester (alla 7 checks × happy/unhappy, övergripande status, rekommendationer, tom graf)
- **AC21:** CLI-tester verifierar normal och JSON-output
- **AC22:** Unit-tester av `maybeInjectHealthTrigger()` i `tests/core/graph-health.test.ts`: verifierar att RED injicerar trigger-text, GREEN/YELLOW inte injicerar, och att texten matchar befintligt trigger-format i `run.ts`
- **AC23:** Alla befintliga tester passerar utan regression

## Designbeslut

1. **Pre-step i run.ts, inte Historian-exklusivt:** Health check körs som pre-step INNAN agenter startar. Anledning: garanterar att rapporten alltid finns, oavsett om Historian kör checks själv. Historian LÄSER rapporten men behöver inte generera den.

2. **Varje körning, inte var 10:e:** Health check är en ren funktion utan API-anrop — den kostar ingenting. Att köra den varje körning ger kontinuerlig övervakning istället för periodisk.

3. **RED triggar Consolidator, YELLOW är informativt:** Att trigga Consolidator vid YELLOW skulle ge för många extra körningar. RED indikerar kritiska problem som kräver åtgärd.

4. **Återanvänd graph-merge.ts-funktioner:** `findDuplicateCandidates`, `findStaleNodes`, `findMissingEdges` finns redan och är testade. Health-modulen wrappar dem med tröskelvärden och statusbedömning.

5. **CLI med exit codes:** Möjliggör CI-integration och snabb manuell kontroll. `graph-health --json | jq .status` ger ett ord.
