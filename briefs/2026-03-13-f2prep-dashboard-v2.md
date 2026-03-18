# F2-prep v2: Utökad dashboard — körningar, tokens, modeller, kostnad, kunskap

## Bakgrund

Dashboard v1 (körning 123) visar enbart Bayesiska beliefs. Men databasen innehåller mycket mer data som ger en komplett bild av svärmen:

| Tabell | Data | Visas idag? |
|--------|------|-------------|
| `run_beliefs` | Confidence per dimension | ✅ Ja |
| `runs` | Körningar med status (GREEN/etc), datum, target, modell | ❌ Nej |
| `usage` | Tokens per körning, per agent (`by_agent` JSON), modellnamn | ❌ Nej |
| `kg_nodes` | Neuron-kunskapsgraf (268 noder) | ❌ Nej |
| `aurora_nodes` | Aurora-kunskapsgraf (27 noder) | ❌ Nej |
| `metrics` | Tests added, insertions, deletions, delegeringar | ❌ Nej |

**Befintlig prisberäkning finns redan** i `src/core/pricing.ts`:
- `MODEL_PRICING` — pris per million tokens (input/output) per modell
- `calcCost(inputTokens, outputTokens, modelKey)` — returnerar USD
- `getModelLabel(model)` / `getModelShortName(model)` — namnmappning

## Uppgifter

### 1. Skapa `src/commands/dashboard-data.ts`

Ny modul som samlar all dashboard-data. Separerad från template för testbarhet.

```typescript
export interface DashboardData {
  // Befintligt (v1)
  beliefs: RunBelief[];
  summary: RunSummary;
  historyMap: Record<string, RunBeliefAudit[]>;

  // Nytt (v2)
  runOverview: RunOverview;
  tokenUsage: TokenUsage;
  modelBreakdown: ModelBreakdown[];
  knowledgeStats: KnowledgeStats;
}

export interface RunOverview {
  totalRuns: number;
  greenCount: number;
  yellowCount: number;
  redCount: number;
  unknownCount: number;       // körningar utan status
  recentRuns: RecentRun[];    // senaste 20 med datum, target, status
}

export interface RecentRun {
  runid: string;
  target: string;
  status: string;
  model: string;
  date: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface TokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byAgent: Record<string, { input: number; output: number; cost: number }>;
  // Trend: tokens per körning de senaste 20
  recentTokenTrend: Array<{ runid: string; tokens: number; cost: number }>;
}

export interface ModelBreakdown {
  model: string;              // fullständigt modellnamn
  label: string;              // "Sonnet 4.5", "Haiku", etc
  runs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  avgCostPerRun: number;
}

export interface KnowledgeStats {
  neuronNodes: number;
  auroraNodes: number;
  neuronEdges: number;
  auroraEdges: number;
}

/**
 * Samla all data för dashboarden.
 * Graceful degradation: om DB inte tillgänglig, returnera tomma värden.
 */
export async function collectDashboardData(): Promise<DashboardData>
```

**Queries för ny data:**

```sql
-- RunOverview
SELECT status, COUNT(*) FROM runs GROUP BY status;
SELECT r.runid, r.target_name, r.status, r.started_at, u.model,
       u.total_input_tokens, u.total_output_tokens
FROM runs r LEFT JOIN usage u ON r.runid = u.runid
ORDER BY r.started_at DESC LIMIT 20;

-- TokenUsage — aggregera by_agent från alla körningar
SELECT by_agent FROM usage WHERE by_agent::text <> '{}';
-- Summera per agent-roll med JavaScript (by_agent är JSON)

-- ModelBreakdown
SELECT model, COUNT(*) as runs,
       SUM(total_input_tokens), SUM(total_output_tokens)
FROM usage GROUP BY model;

-- KnowledgeStats
SELECT COUNT(*) FROM kg_nodes;
SELECT COUNT(*) FROM aurora_nodes;
SELECT COUNT(*) FROM kg_edges;
SELECT COUNT(*) FROM aurora_edges;
```

**Kostnadsberäkning:** Använd `calcCost()` och `getModelShortName()` från `src/core/pricing.ts`.

### 2. Utöka `src/commands/dashboard-template.ts`

Utöka `renderDashboard()` att ta emot `DashboardData` (v2) istället för v1-interfacet. Lägg till nya sektioner i HTML:

#### E. Körningsöversikt (ny sektion, efter sammanfattningskort)

**4 nya kort (andra raden):**
- Totalt antal körningar
- GREEN-procent (cirkeldiagram eller procent)
- Total kostnad (USD)
- Kunskapsnoder (Neuron + Aurora)

**Tabell med senaste 20 körningar:**
- Datum, Run ID, Target, Status (färgkodad), Modell, Tokens (in/ut), Kostnad (USD)

#### F. Modeller & Kostnad (ny sektion)

**Tabell:**
- Modell (label), Antal körningar, Input-tokens, Output-tokens, Total kostnad, Snitt per körning

**Stapeldiagram (Chart.js):**
- X-axel: modellnamn
- Y-axel: total kostnad (USD)
- Staplad: input-kostnad + output-kostnad

#### G. Token-fördelning per agent (ny sektion)

**Cirkeldiagram (Chart.js doughnut):**
- Visa hur tokens fördelas mellan manager, implementer, reviewer, researcher, etc.
- Beräkna kostnad per agent med `calcCost()`

**Tabell:**
- Agent, Input-tokens, Output-tokens, Kostnad (USD), Andel (%)

#### H. Kunskapsgraf-statistik (ny sektion)

**4 siffror:**
- Neuron-noder, Aurora-noder, Neuron-kanter, Aurora-kanter

### 3. Uppdatera `src/commands/dashboard.ts`

Ändra `collectDashboardData()` att använda den nya `dashboard-data.ts` modulen.

### 4. Uppdatera MCP-tool

`neuron_dashboard` behöver ingen ändring — den anropar redan `collectDashboardData()` + `renderDashboard()`.

### 5. Tester

**`tests/commands/dashboard-data.test.ts` (ny):**
- `collectDashboardData()` med mockad DB → returnerar alla fält
- `collectDashboardData()` utan DB → alla numeriska fält 0, arrayer tomma
- Kostnadsberäkning korrekt (verifiera mot `calcCost()`)
- `by_agent` JSON aggregering fungerar med tom + icke-tom data
- ModelBreakdown beräknas korrekt

**`tests/commands/dashboard-template.test.ts` (utöka):**
- Ny data renderas i HTML: körningsöversikt, modell-tabell, token-diagram
- Tom v2-data → graceful "no data"-meddelanden
- Kostnad visas med 2 decimaler och $-tecken
- Modell-label (inte rått modellnamn) visas

## Avgränsningar

- Inga nya databas-tabeller eller migreringar
- Inga ändringar i `run-statistics.ts` eller `pricing.ts`
- Enbart SELECT-queries — ingen skrivning
- `by_agent` JSON-aggregering sker i TypeScript, inte SQL (enklare, snabbare att implementera)

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `dashboard-data.ts` skapad med `collectDashboardData()` | Fil finns |
| Körningsöversikt med status-räkning | HTML innehåller GREEN/YELLOW/RED |
| Modell-tabell med label, körningar, kostnad | HTML test |
| Token-fördelning per agent (cirkeldiagram) | HTML innehåller doughnut-chart |
| Kostnad per körning och totalt (USD) | HTML test |
| Kunskapsgraf-statistik (4 siffror) | HTML test |
| Befintlig v1-data (beliefs, trender) fortfarande synlig | Befintliga tester gröna |
| Graceful degradation utan DB | Test |
| ≥12 nya tester | `pnpm test` |
| Alla 1815 befintliga tester gröna | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |

## Risk

**Låg–Medel.** Ändrar befintlig `dashboard-template.ts` och `dashboard.ts`, men:
- Bara additiva ändringar (nya sektioner, utökat data-interface)
- Befintliga tester verifierar att v1-funktionalitet bevaras
- Inga produktionskritiska moduler påverkas

**Rollback:** Revertera ändringarna i dashboard-filerna + ta bort `dashboard-data.ts`.
