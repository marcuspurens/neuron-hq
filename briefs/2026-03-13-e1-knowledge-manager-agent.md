# E1: Knowledge Manager-agent — autonom kunskapsunderhåll

## Bakgrund

Neuron HQ har ett rikt kunskapssystem: Aurora-grafen med noder/kanter, gap-detektion, freshness-scoring, briefing-pipeline och suggest-research. Men allt triggas manuellt — en människa måste köra MCP-tools eller CLI-kommandon för att fylla luckor eller uppdatera gammal kunskap.

E1 introducerar en **Knowledge Manager-agent** som automatiskt:
1. Identifierar de viktigaste kunskapsluckorna
2. Fyller dem genom research (web-sökning + ingest)
3. Uppdaterar freshness på gamla källor
4. Rapporterar vad den lärde sig

### Vad som redan finns

| Byggblock | Fil | Status |
|-----------|-----|--------|
| Gap-detektion | `src/aurora/knowledge-gaps.ts` | ✅ Finns |
| Gap → research-brief | `src/aurora/gap-brief.ts` | ✅ Finns |
| URL-ingest | `src/aurora/intake.ts` | ✅ Finns |
| Freshness-scoring | `src/aurora/freshness.ts` | ✅ Finns |
| Source-verifiering | `src/aurora/source-verify.ts` | ✅ Finns |
| Semantisk sökning | `src/aurora/search.ts` | ✅ Finns |
| Remember/recall | `src/aurora/memory.ts` | ✅ Finns |
| Knowledge Manager-agent | — | ❌ Nytt |
| KM orchestrering | — | ❌ Nytt |
| KM MCP-tool | — | ❌ Nytt |

### Design

Knowledge Manager är agent #11. Den körs **fristående** via CLI eller MCP — inte som del av en swärm-körning. Den har tre faser:

```
Phase 1: SCAN — identifiera topp-N luckor + stale sources
Phase 2: RESEARCH — fyll luckor via web-sökning + ingest
Phase 3: REPORT — sammanfatta vad som lärdes
```

## Uppgifter

### 1. Agent-prompt: `prompts/knowledge-manager.md`

Skapa system-prompten. Agenten ska:
- Vara fokuserad på kunskapsunderhåll (inte kodskrivning)
- Ha tillgång till Aurora-tools (search, recall, ingest, gaps, freshness)
- Arbeta i 3 faser: scan → research → report
- Begränsa sig till max `maxActions` research-åtgärder per körning (default 5)
- Skriva en sammanfattning av vad den lärde sig

### 2. Agent-klass: `src/core/agents/knowledge-manager.ts`

Skapa agenten som en klass som följer befintligt mönster:

```typescript
export class KnowledgeManagerAgent {
  constructor(private ctx: RunContext, private options: KMOptions) {}
  async run(): Promise<KMReport> { ... }
}

interface KMOptions {
  maxActions?: number;    // default 5
  focusTopic?: string;    // optional — begränsa till ett ämne
  includeStale?: boolean; // default true — uppdatera gamla källor
}

interface KMReport {
  gapsFound: number;
  gapsResearched: number;
  sourcesRefreshed: number;
  newNodesCreated: number;
  summary: string;
}
```

Agenten ska:

**Phase 1 — SCAN:**
- Anropa `getGaps()` för att hämta alla kunskapsluckor
- Anropa freshness-check för att hitta stale sources (score < 0.3)
- Prioritera: hög frekvens + låg freshness först
- Om `focusTopic` angivet, filtrera på topic-relevans (semantisk likhet)
- Välj topp `maxActions` åtgärder

**Phase 2 — RESEARCH:**
- För varje gap: anropa `suggestResearch(gap.question)` för att få en research-brief
- Använd agentens Claude-loop för att söka webben och samla information
- Anropa `remember()` för att spara nya fakta till Aurora-grafen
- För stale sources: anropa source-verifiering för att uppdatera `last_verified`
- Logga varje åtgärd till audit

**Phase 3 — REPORT:**
- Sammanställ `KMReport` med statistik
- Skriv en läsbar sammanfattning av vad som lärdes
- Returnera rapporten

### 3. CLI-kommando: `src/commands/knowledge-manager.ts`

Registrera CLI-kommandot:

```bash
npx tsx src/cli.ts km                          # kör med defaults
npx tsx src/cli.ts km --topic "AI safety"      # fokusera på ett ämne
npx tsx src/cli.ts km --max-actions 10         # fler åtgärder
npx tsx src/cli.ts km --no-stale               # skippa stale-refresh
```

Kommandot ska:
- Skapa en `RunContext` (med audit-loggning)
- Instansiera `KnowledgeManagerAgent`
- Köra agenten
- Skriva ut rapporten till terminalen

### 4. MCP-tool: `neuron_knowledge_manager`

Registrera MCP-tool:

```typescript
{
  name: 'neuron_knowledge_manager',
  description: 'Run autonomous knowledge maintenance — fills gaps and refreshes stale sources',
  inputSchema: {
    type: 'object',
    properties: {
      maxActions: { type: 'number', description: 'Max research actions (default 5)' },
      focusTopic: { type: 'string', description: 'Focus on a specific topic' },
      includeStale: { type: 'boolean', description: 'Refresh stale sources (default true)' },
    },
  },
}
```

Returnerar `KMReport` som JSON.

### 5. Tester

Skapa `tests/core/agents/knowledge-manager.test.ts`:

- **Scan phase:** Mocka `getGaps()` + freshness-check, verifiera prioritering (hög frekvens först)
- **Scan med topic-filter:** Verifiera att irrelevanta gaps filtreras bort
- **Research phase:** Mocka `suggestResearch()` + `remember()`, verifiera att de anropas korrekt
- **Stale refresh:** Mocka source-verify, verifiera att stale sources uppdateras
- **maxActions-begränsning:** Ge 20 gaps, maxActions=3, verifiera att bara 3 researches körs
- **Empty gaps:** Inga luckor → rapport med 0/0/0
- **Report format:** Verifiera att KMReport har alla fält
- **Audit logging:** Verifiera att åtgärder loggas
- **Error handling:** En research misslyckas → resten fortsätter, fel loggas

Skapa `tests/commands/knowledge-manager.test.ts`:

- CLI-flaggor parsas korrekt
- Default-värden fungerar

Minst **15 nya tester** totalt.

## Avgränsningar

- Knowledge Manager kör INTE som del av Manager-svärmen — den är fristående
- Ingen schemaläggning (cron) — det kommer i E3
- Ingen YouTube-ingest i denna brief — bara web-sökning + URL-ingest
- Ingen approval-gate — agenten kör autonomt inom `maxActions`-gränsen
- Ändra INTE befintliga agenter eller deras prompts

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `prompts/knowledge-manager.md` finns | Fil finns |
| `KnowledgeManagerAgent` klass med scan/research/report | Kodgranskning |
| CLI `npx tsx src/cli.ts km` fungerar | Manuellt test |
| MCP-tool `neuron_knowledge_manager` registrerat | MCP-tool-lista |
| Scan prioriterar hög frekvens + låg freshness | Tester |
| maxActions begränsar antal åtgärder | Tester |
| KMReport returneras med korrekt format | Tester |
| Audit-loggning av varje åtgärd | Tester |
| Alla 1877 befintliga tester gröna | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |
| ≥15 nya tester | `pnpm test` |

## Risk

**Medel.** Ny agent med egna beroenden till Aurora-systemet. Men allt bygger på befintliga, testade funktioner (gaps, suggest-research, remember, freshness). Ingen produktionskod ändras.

**Rollback:** `git revert <commit>` — inga befintliga filer påverkas.
