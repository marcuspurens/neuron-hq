# E3: Schemalagd Knowledge Manager — automatisk kunskapscykel efter körningar

## Bakgrund

E1 skapade Knowledge Manager-agenten (scan → research → report). E2 gav den riktiga tänder med web-sökning, URL-ingest och gap resolution. Men KM körs bara manuellt idag (`npx tsx src/cli.ts km` eller MCP-tool). E3 gör KM automatisk — systemet lär sig kontinuerligt utan manuell intervention.

### Vad som finns idag

- `KnowledgeManagerAgent` i `src/core/agents/knowledge-manager.ts` — 3 faser: SCAN → RESEARCH → REPORT
- CLI: `npx tsx src/cli.ts km --topic X --max-actions N`
- MCP-tool: `neuron_knowledge_manager`
- `finalizeRun()` i `src/core/run.ts` — körs efter varje run, uppdaterar beliefs, skriver artifacts

### Vad E3 lägger till

1. **Post-run hook** — KM körs automatiskt efter varje lyckad körning
2. **Smart topic-fokus** — KM fokuserar automatiskt på det topic som körningen handlade om
3. **Rate limiting** — Förhindrar att KM körs för ofta eller kostar för mycket
4. **KM-körningslogg** — Spåra när KM körde, vad den hittade, kostnad

## Uppgifter

### 1. Post-run KM hook i finalizeRun()

Lägg till ett valfritt steg i slutet av `finalizeRun()` i `src/core/run.ts` som kör KM automatiskt efter en lyckad körning (stoplight GREEN eller YELLOW).

```typescript
// I slutet av finalizeRun(), efter beliefs-uppdatering:
if (shouldRunAutoKM(ctx, stoplight)) {
  const kmReport = await runAutoKM(ctx);
  // Spara KM-rapport som artifact
}
```

Implementera i en ny fil `src/core/auto-km.ts`:

```typescript
export interface AutoKMConfig {
  enabled: boolean;           // default false — opt-in
  minRunsBetween: number;     // default 3 — vänta N körningar mellan KM
  maxActionsPerRun: number;   // default 3 — färre actions än manuell KM
  skipOnRed: boolean;         // default true — kör inte efter RED
  topicFromBrief: boolean;    // default true — extrahera topic från brief
}

export function shouldRunAutoKM(
  ctx: RunContext,
  stoplight: string,
  config: AutoKMConfig,
  lastKMRun: number | null,   // run_counter vid senaste KM-körning
  currentRunNumber: number,
): boolean

export async function runAutoKM(
  ctx: RunContext,
  config: AutoKMConfig,
): Promise<KMReport>
```

**Logik i `shouldRunAutoKM()`:**
1. `config.enabled` måste vara true
2. `stoplight` måste vara GREEN eller YELLOW (om `skipOnRed`)
3. Minst `minRunsBetween` körningar sedan senaste auto-KM
4. Returnera true/false

**Logik i `runAutoKM()`:**
1. Extrahera topic från `ctx.brief` (titel eller första raden)
2. Skapa `KnowledgeManagerAgent` med `{ maxActions: config.maxActionsPerRun, focusTopic: topic }`
3. Kör `agent.run()`
4. Returnera rapport

### 2. KM-körningslogg i databasen

Skapa en ny tabell `km_runs` via migration:

```sql
CREATE TABLE km_runs (
  id SERIAL PRIMARY KEY,
  run_id TEXT,                    -- NULL om manuell körning
  run_number INTEGER,             -- run_counter vid tidpunkt
  trigger TEXT NOT NULL,          -- 'auto' | 'manual-cli' | 'manual-mcp'
  topic TEXT,
  gaps_found INTEGER NOT NULL DEFAULT 0,
  gaps_researched INTEGER NOT NULL DEFAULT 0,
  gaps_resolved INTEGER NOT NULL DEFAULT 0,
  urls_ingested INTEGER NOT NULL DEFAULT 0,
  facts_learned INTEGER NOT NULL DEFAULT 0,
  sources_refreshed INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_km_runs_created ON km_runs (created_at DESC);
CREATE INDEX idx_km_runs_run_id ON km_runs (run_id);
```

Implementera i `src/aurora/km-log.ts`:

```typescript
export async function logKMRun(entry: {
  runId?: string;
  runNumber?: number;
  trigger: 'auto' | 'manual-cli' | 'manual-mcp';
  topic?: string;
  report: KMReport;
  durationMs: number;
}): Promise<number>  // returnerar km_run id

export async function getLastAutoKMRunNumber(): Promise<number | null>
// Hämta run_number för senaste auto-KM (för rate limiting)

export async function getKMRunHistory(limit?: number): Promise<KMRunEntry[]>
// Hämta senaste KM-körningar (för dashboard/statistik)
```

### 3. Konfiguration i limits.yaml

Lägg till i `policy/limits.yaml`:

```yaml
# Knowledge Manager auto-scheduling
km_auto:
  enabled: false              # opt-in, aktivera manuellt
  min_runs_between: 3         # vänta 3 körningar mellan auto-KM
  max_actions_per_run: 3      # max 3 gaps att researcha
  skip_on_red: true           # kör inte efter misslyckade körningar
  topic_from_brief: true      # extrahera topic automatiskt från brief
```

Uppdatera limits-parsning (Zod-schema) i befintlig limits-hantering.

### 4. Uppdatera CLI och MCP för trigger-tracking

Uppdatera `src/commands/knowledge-manager.ts` (CLI) och `src/mcp/tools/knowledge-manager.ts` (MCP) så att de loggar KM-körningar med rätt trigger:

```typescript
// CLI: logKMRun({ trigger: 'manual-cli', ... })
// MCP: logKMRun({ trigger: 'manual-mcp', ... })
// Auto: logKMRun({ trigger: 'auto', runId: ctx.runId, ... })
```

### 5. CLI-flagga för att aktivera/visa auto-KM

Lägg till flaggor på `run`-kommandot:

```bash
npx tsx src/cli.ts run <target> --brief <brief> --hours 1 --auto-km
# Aktiverar auto-KM för just denna körning (override av limits.yaml)
```

Lägg till nytt CLI-kommando för KM-historik:

```bash
npx tsx src/cli.ts km-log              # visa senaste 10 KM-körningar
npx tsx src/cli.ts km-log --limit 20   # visa fler
```

### 6. Tester

Skapa `tests/core/auto-km.test.ts`:
- `shouldRunAutoKM()` returnerar false om disabled
- `shouldRunAutoKM()` returnerar false om RED och skipOnRed
- `shouldRunAutoKM()` returnerar false om för få körningar sedan senaste
- `shouldRunAutoKM()` returnerar true vid GREEN + tillräckligt många körningar
- `runAutoKM()` extraherar topic från brief
- `runAutoKM()` skapar KM-agent med rätt config
- `runAutoKM()` loggar körning i km_runs

Skapa `tests/aurora/km-log.test.ts`:
- `logKMRun()` sparar i databasen
- `getLastAutoKMRunNumber()` returnerar senaste auto-körning
- `getLastAutoKMRunNumber()` returnerar null om ingen finns
- `getKMRunHistory()` returnerar senaste N körningar
- `getKMRunHistory()` sorterar DESC

Uppdatera befintliga tester:
- `tests/agents/knowledge-manager.test.ts` — verifiera att trigger skickas vidare
- `tests/commands/run.test.ts` (om det finns) — verifiera att auto-KM anropas vid GREEN

Minst **15 nya tester** totalt.

## Avgränsningar

- Auto-KM är **opt-in** (default disabled) — användaren måste aktivera det
- Max 3 actions per auto-KM (lägre än manuell KM:s default på 5)
- Ändra INTE KnowledgeManagerAgent själv — använd den som den är
- Ändra INTE befintliga agenter eller MCP-tools (utom trigger-tracking)
- Ingen cron/schemaläggare — bara post-run hook (cron-liknande timing via minRunsBetween)
- Ändra INTE web-search.ts eller intake.ts

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `shouldRunAutoKM()` i `auto-km.ts` | Tester |
| `runAutoKM()` kör KM med topic från brief | Tester |
| `km_runs` tabell via migration | Migration + tester |
| `logKMRun()` sparar körningsdata | Tester |
| `getLastAutoKMRunNumber()` för rate limiting | Tester |
| Konfiguration i `limits.yaml` (Zod-validerad) | Tester |
| `--auto-km` flagga på run-kommandot | Tester |
| `km-log` CLI-kommando | Tester |
| CLI + MCP loggar trigger | Tester |
| Alla befintliga tester gröna | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |
| ≥15 nya tester | `pnpm test` |

## Risk

**Låg.** Auto-KM är opt-in och kör samma KM-agent som redan är testad. Rate limiting förhindrar överdriven användning. Inga befintliga funktioner ändras — bara ett nytt steg i slutet av finalizeRun().

**Rollback:** `git revert <commit>` + ta bort migration.
