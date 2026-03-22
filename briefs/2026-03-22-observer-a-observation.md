# Brief: 2.6a Observer — Passiv observation + Prompt lint + Rapport

**Target:** neuron-hq
**Effort:** 1 körning
**Roadmap:** Fas 2 — Intelligens, punkt 2.6 (del 1 av 2)
**Följs av:** `2026-03-22-observer-b-retro.md` (retro-samtal + djup kodanalys)

## Bakgrund

Session 120 avslöjade 25+ artificiella begränsningar i 9 av 11 agentprompter som direkt motsade LLM Operating Awareness-preamble:n. Exempel: preamble:n säger "du har 1M context" men Manager-prompten sa "max 3 filer". Alla fixades manuellt — men utan automatiserad övervakning kommer de tillbaka.

**Insikten:** LLM:er som skriver prompter till LLM:er ärver mänskliga heuristiker (satisficing, YAGNI, "ship fast"). Prompterna är produkten — de behöver kvalitetskontroll.

**Kända problem som Observer ska fånga:**
- Manager: prompt säger "read every file you need" — läser 0 filer i körning #172 och #173
- KM: prompt säger "verify sources" — `verifySource` i koden stämplar utan kontroll
- Generellt: nya begränsningar kan smyga in vid framtida prompt-ändringar

**Denna brief (A)** bygger den passiva observationen, prompt-lint, token-tracking, enkel tool-lista-alignment och rapport-generering. Inga API-anrop — allt är lokal logik mot eventBus.

**Brief B** (separat) lägger till retro-samtal med alla 11 agenter och djup kodanalys.

## Förutsättningar

Briefen antar följande befintliga API:er. Om formatet avviker, anpassa — men logga varning och producera rapport ändå.

**eventBus (`src/core/event-bus.ts`):**
- `onAny(callback: (eventName: string, data: unknown) => void)` — lyssna på alla events
- `tokens`-event format: `{ runid: string, agent: string, input: number, output: number }`
- `agent:start`-event: `{ runid: string, agent: string, task?: string }`
- `agent:end`-event: `{ runid: string, agent: string, result?: string, error?: string }`
- `agent:text`-event: `{ runid: string, agent: string, text: string }`
- `audit`-event: `Record<string, unknown>` (tool-anrop, policy-blocks, etc.)
  - Tool-anrop identifieras via fältet `tool`: om `data.tool` finns → räkna som tool-anrop för `data.role` (agenten)
  - Förväntat format: `{ ts: string, role: string, tool: string, allowed: boolean, note?: string }`

**model-registry (`src/core/model-registry.ts`):**
- `resolveModelConfig(role: string, ...)` — returnerar `{ model: string, maxTokens: number }`
- Priser: om `model-registry.ts` exporterar prisinformation, använd den. Annars hårdkoda som fallback:
  - claude-opus-4-6: input $15/1M, output $75/1M
  - claude-sonnet-4-6: input $3/1M, output $15/1M
  - claude-haiku-4-5: input $0.80/1M, output $4/1M

## Vad ska byggas

### 1. Observer-modul (`src/core/agents/observer.ts`)

Huvudmodul för passiv observation under körning.

```typescript
interface Observation {
  timestamp: string;
  agent: string;
  type: 'prompt-violation' | 'anti-pattern' | 'absence' | 'note';
  severity: 'INFO' | 'WARNING' | 'CONCERN';
  promptClaim: string;        // vad prompten säger
  actualBehavior: string;     // vad som faktiskt hände (eller inte hände)
  evidence: string;           // event-data som stödjer observationen
}

interface TokenUsage {
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;               // USD
}

interface AgentModelInfo {
  agent: string;
  model: string;
  maxTokens: number;
}

class ObserverAgent {
  private observations: Observation[] = [];
  private agentPrompts: Map<string, string>;      // role → full prompt text
  private agentToolCalls: Map<string, string[]>;   // role → lista av tool-anrop
  private agentDelegations: Map<string, boolean>;  // role → delegerad?
  private tokenUsage: Map<string, TokenUsage>;     // role → ackumulerad token-usage
  private agentModels: Map<string, AgentModelInfo>; // role → modellinformation

  // Startas automatiskt vid run:start
  startObserving(): void {
    eventBus.onAny((eventName, data) => {
      this.processEvent(eventName, data);
    });
  }

  // Analyserar varje event mot prompterna
  private processEvent(eventName: string, data: unknown): void;

  // Körs efter run:end — analyserar samlad data
  analyzeRun(): Observation[];

  // Genererar prompt-health-rapport (utan retro-data i denna brief)
  generateReport(observations: Observation[]): string;
}
```

**Vad Observer kollar under körning:**

| Kontroll | Hur | Exempel |
|----------|-----|---------|
| **Tool-användning vs prompt** | Räkna tool-anrop per agent, jämför mot promptens instruktioner | Manager 0 read_file-anrop men prompt säger "read every file" |
| **Anti-patterns i agent-text** | Scanna `agent:text`-events för satisficing-språk | "good enough", "I'll skip this for now", "to save time" |
| **Frånvaro av handlingar** | Kolla att agenter som delegerades faktiskt utförde nyckelsteg | Implementer delegerad men 0 write_file-anrop |
| **Prompt-preamble-konflikter** | Scanna laddade prompter för numeriska tak och budget-logik | "max N", "head -N", "N% budget" |
| **Iterations-beteende** | Kolla om agent slutade tidigt (t.ex. 1 av max 50 iterationer) | Tester som körde 1 iteration och sa "done" |
| **Token-förbrukning** | Lyssna på `tokens`-events, ackumulera per agent | Input/output/totalt/kostnad per agent + totalt |

**Token-tracking:**
- Lyssna på `tokens`-events och ackumulera per agent
- Om `tokens`-events saknas eller har annat format → logga varning, sätt token-sektion i rapporten till "Token-data ej tillgänglig"
- Beräkna kostnad per agent baserat på modell-priser (från model-registry eller fallback-priser)
- Beräkna total kostnad för hela körningen

**Modell-information:**
- Vid `agent:start`, hämta modellkonfiguration via `resolveModelConfig()` för den agenten
- Spara modell + maxTokens per agent
- Om resolveModelConfig inte finns/failar → använd default "claude-opus-4-6" / 128000

### 2. Prompt-lint (integrerad i Observer)

Observer laddar `prompts/preamble.md` + alla `prompts/<role>.md` vid start och skannar efter anti-patterns.

**Hur Observer hittar alla roller:** Glob `prompts/*.md`, filtrera bort `preamble.md`. Varje kvarvarande fil är en agentprompt (filnamn utan `.md` = rollnamn). Ingen hårdkodad lista — nya roller plockas upp automatiskt.

**Anti-pattern-lista (`policy/prompt-antipatterns.yaml`):**

```yaml
# Anti-patterns som motsäger LLM Operating Awareness preamble:n.
# Observer laddar denna fil vid start och skannar alla agentprompter.
# Utöka genom att lägga till nya entries — ingen kodändring krävs.

patterns:
  # Numeriska tak
  - pattern: "\\bmax\\s+\\d+\\s+(fil|file|search|paper|grep|iteration)"
    flags: "gi"
    category: "numeric-cap"
    severity: "WARNING"
    legitimateContexts: ["api", "retry", "timeout", "rate.limit", "backoff"]

  - pattern: "\\bhead\\s+-\\d+"
    flags: "gi"
    category: "output-truncation"
    severity: "WARNING"
    legitimateContexts: ["log.rotation", "preview"]

  - pattern: "\\b\\d+%\\s*(budget|safety|buffer)"
    flags: "gi"
    category: "budget-logic"
    severity: "WARNING"
    legitimateContexts: []

  # Satisficing-språk
  - pattern: "\\bgood enough\\b"
    flags: "gi"
    category: "satisficing"
    severity: "INFO"
    legitimateContexts: ["commit.message", "style", "formatting"]

  - pattern: "\\bdon'?t overthink\\b"
    flags: "gi"
    category: "satisficing"
    severity: "WARNING"
    legitimateContexts: []

  - pattern: "\\bkeep it simple\\b"
    flags: "gi"
    category: "satisficing"
    severity: "INFO"
    legitimateContexts: ["commit.message", "style", "formatting", "naming"]

  # Tidspressrelaterat
  - pattern: "\\bif time is limited\\b"
    flags: "gi"
    category: "time-pressure"
    severity: "WARNING"
    legitimateContexts: []

  - pattern: "\\bship fast\\b"
    flags: "gi"
    category: "time-pressure"
    severity: "WARNING"
    legitimateContexts: []

  - pattern: "\\bto save time\\b"
    flags: "gi"
    category: "time-pressure"
    severity: "INFO"
    legitimateContexts: ["caching", "optimization"]
```

**YAML-parsning:** Använd `yaml`-paketet (finns redan i dependencies — kontrollera `package.json`). Om det saknas, använd `js-yaml` eller lägg till `yaml` som dependency.

**Tvåstegs-filtrering (regex + kontext):**

1. Regex-matchning hittar kandidater i prompten
2. Kontextanalys filtrerar bort legitima fall:
   - Extrahera markdown-sektionsrubriken där matchningen förekommer (närmaste `##` eller `###` ovanför)
   - Om sektionsrubriken eller omgivande text (±3 rader) innehåller nyckelord från `legitimateContexts` → nedgradera till INFO
   - Om osäker → flagga som INFO (inte WARNING)

### 3. Enkel tool-lista-alignment

Enkel kontroll att agentens tool-lista matchar promptens påståenden. **Djup kodanalys (läsa funktionskroppar) lämnas till Brief B.**

**Hur Observer får tillgång till tool-listor:** Observer läser tool-anrop från `audit`-events under körningen (fältet `data.tool` + `data.role`). Detta ger en lista av *faktiskt använda* tools per agent. För *tillgängliga* tools: inspektera agentklassernas tool-definitioner i `src/core/agents/*.ts` — varje agent exporterar eller registrerar sina tools. Om tool-definitioner inte är tillgängliga programmatiskt, basera alignment enbart på faktisk användning (tool-anrop från audit-events) och logga en INFO-notering.

```typescript
interface SimpleAlignmentCheck {
  agent: string;
  promptClaim: string;         // t.ex. "read every file you need"
  requiredTool: string;        // t.ex. "read_file"
  toolExists: boolean;         // finns i agentens tool-definition?
  toolUsed: boolean;           // anropades under körningen?
  status: 'OK' | 'TOOL_MISSING' | 'TOOL_UNUSED';
}
```

**Vad som kollas (v1 — enkel):**

| Prompt-nyckelord | Förväntat tool | Agent |
|------------------|----------------|-------|
| "read file" / "läs fil" | `read_file` | Manager, Implementer |
| "write file" / "skriv fil" | `write_file` | Implementer |
| "search" / "sök" | `aurora_search` eller `web_search` | Librarian, Researcher |
| "run test" / "kör test" | `bash_exec` (med test-kommando) | Tester |
| "read" / "granska" | `read_file` | Reviewer |
| "write" / "dokumentera" | `write_file` | Historian |
| "verify" / "verifiera" | (kontrolleras i Brief B — djup kodanalys) | KM |

Denna tabell är den **uttömmande listan för v1**. AC3 och AC4 implementeras genom denna tabell. Listan kan utökas i framtida iterationer.

### 4. Prompt-health-rapport

Filnamn: `prompt-health-YYYY-MM-DDTHHMM.md`

Timestamp-generering:
```typescript
// Generera timestamp för filnamn: 2026-03-22T1433
const now = new Date();
const ts = now.toISOString().slice(0, 16).replace(':', ''); // 2026-03-22T1433
const filename = `prompt-health-${ts}.md`;
```

**Rapportmall:**

```markdown
# Prompt Health — Körning #[runNumber]
**Genererad:** [YYYY-MM-DD HH:MM:SS UTC]

## Teknik & Miljö

| Parameter | Värde |
|-----------|-------|
| Modell (default) | [från model-registry] |
| Context window | 1 000 000 tokens |
| Max output | 128 000 tokens |
| Preamble | prompts/preamble.md |
| Antal agenter | [antal aktiva agenter i körningen] |
| Node | [process.version] |
| Runtime | tsx |

### Agentmodeller

| Agent | Modell | Max tokens |
|-------|--------|------------|
| [för varje aktiv agent] | [modell-ID] | [maxTokens] |

## Token-förbrukning

### Per agent

| Agent | Input tokens | Output tokens | Totalt | Kostnad |
|-------|-------------|---------------|--------|---------|
| [för varje aktiv agent] | [input] | [output] | [total] | $[kostnad] |
| **TOTALT** | **[sum input]** | **[sum output]** | **[sum total]** | **$[sum kostnad]** |

### Prisberäkning
- [modell]: Input $[pris]/1M, Output $[pris]/1M

## Observationer

### [Agent]
- **[severity]:** [beskrivning]
  - **Rekommendation:** [PROMPT-FIX | CODE-FIX | OK] — [detalj]

(Om inga observationer: "Inga avvikelser observerade.")

## Prompt Lint

### Hittade anti-patterns
| Prompt | Rad | Matchning | Kategori | Severity | Kontext |
|--------|-----|-----------|----------|----------|---------|
| [role].md | [rad] | "[matchad text]" | [kategori] | [severity] | [legitim/heuristik] |

(Om inga: "Inga anti-patterns hittades i nuvarande prompter. ✅")

## Tool-Alignment

| Agent | Prompt-påstående | Förväntat tool | Tool finns | Tool användes | Status |
|-------|-----------------|----------------|------------|--------------|--------|
| [agent] | "[claim]" | [tool] | ✅/❌ | ✅/❌ | [OK/TOOL_MISSING/TOOL_UNUSED] |

## Rekommendationer

1. **[PROMPT-FIX | CODE-FIX | OK]:** [Agent] — [rekommendation]

## Retro

_Retro-samtal aktiveras i Observer Brief B._
```

### 5. Integration i körflödet

**Plats:** `src/commands/run.ts`

Observer startas automatiskt — kräver inget extra av användaren.

**Fallback vid Observer-kreationsfel:** Om Observer-konstruktorn kastar (t.ex. prompter saknas, YAML-fil oläsbar), logga varning och fortsätt körningen utan observation. Observer-buggar ska aldrig blockera produktion.

```typescript
// I run.ts, efter att RunOrchestrator.initRun() skapats:
const observer = new ObserverAgent(ctx, baseDir);
observer.startObserving();  // Börjar lyssna på eventBus

// ... körning pågår som vanligt ...
// manager.run(), delegation, etc.

// Efter manager.run() avslutas men FÖRE finalizeRun():
const observations = observer.analyzeRun();
const promptHealthReport = observer.generateReport(observations);

// Skriv prompt-health med datum+tid i filnamnet
const now = new Date();
const ts = now.toISOString().slice(0, 16).replace(':', '');
await fs.writeFile(
  path.join(ctx.runDir, `prompt-health-${ts}.md`),
  promptHealthReport,
  'utf-8'
);

// ... sedan finalizeRun() som vanligt
```

**Observer-agenten ska INTE:**
- Ändra något under körningen (read-only)
- Stoppa eller pausa körningen
- Kommunicera med andra agenter under körning
- Göra API-anrop (sparas till Brief B)
- Ändra prompter automatiskt (bara rekommendera)

**Observer-agenten SKA:**
- Starta automatiskt vid varje körning
- Producera `prompt-health-YYYY-MM-DDTHHMM.md` efter varje körning
- Logga token-förbrukning per agent (input/output/totalt/kostnad) via `tokens`-events
- Inkludera teknik- och modellinformation i rapporten
- Respektera policy (bash_allowlist, etc.)
- Vara förberedd för Brief B: `generateReport()` ska ta en optional `retroResults`-parameter som i v1 är undefined

## Filer att skapa

| Fil | Beskrivning |
|-----|-------------|
| `src/core/agents/observer.ts` | **NY** — eventBus-lyssnare, observation, lint, token-tracking, enkel alignment, rapport |
| `policy/prompt-antipatterns.yaml` | **NY** — Utökningsbar anti-pattern-lista (se schema ovan) |
| `tests/agents/observer.test.ts` | **NY** — Tester |

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/commands/run.ts` | Instansiera Observer vid run-start, kör analyzeRun + generateReport efter körning |
| `src/core/run.ts` | Lägg till `prompt-health-*.md` i artifact-listan |
| `AGENTS.md` | Lägg till Observer-sektion (kort: "Observer observerar körningen passivt och genererar prompt-health-rapport") |

## Filer att INTE ändra

- Inga befintliga agentprompter — Observer observerar, inte modifierar
- `src/core/event-bus.ts` — Observer använder befintlig `onAny()`, inga nya events
- `src/core/audit.ts` — Observer läser audit.jsonl, ändrar inte formatet
- `prompts/preamble.md` — Observer läser men ändrar inte
- `src/core/model-registry.ts` — Observer läser men ändrar inte

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Observer missar subtila avvikelser | Medel | Falsk trygghet | Iterera anti-pattern-listan baserat på fynd |
| Anti-pattern regex ger false positives | Medel | Brus i rapport | Tvåstegs-filter: regex + kontextanalys |
| `tokens`-events har annat format | Låg | Ingen token-data | Logga varning, sätt "ej tillgänglig" i rapport |
| `onAny()` existerar inte | Låg | Observer kan inte lyssna | Fallback: lyssna på specifika events: `eventBus.on('tokens', ...)`, `eventBus.on('agent:start', ...)`, `eventBus.on('agent:end', ...)`, `eventBus.on('agent:text', ...)`, `eventBus.on('audit', ...)`, `eventBus.on('iteration', ...)` |
| YAML-paket saknas | Låg | Kan inte ladda anti-patterns | Kontrollera package.json, lägg till om saknas |

## Acceptanskriterier

### Passiv observation

- **AC1:** Observer startar automatiskt vid varje körning (inget extra steg för användaren)
- **AC2:** Observer lyssnar på alla events via `eventBus.onAny()` utan att påverka körningen
- **AC3:** Observer räknar tool-anrop per agent och jämför mot sektion 3:s tool-alignment-tabell (den uttömmande listan för v1)
- **AC4:** Observer detekterar frånvaro av nyckelhandlingar baserat på samma tabell (t.ex. Manager delegerad men 0 read_file-anrop)
- **AC5:** Observer skannar `agent:text`-events för satisficing-språk

### Token-tracking

- **AC6:** Observer ackumulerar token-förbrukning per agent via `tokens`-events (input, output, totalt)
- **AC7:** Observer beräknar kostnad per agent baserat på modell-priser (model-registry eller fallback)
- **AC8:** Om `tokens`-events saknas eller har oväntat format, loggas varning och token-sektion visar "ej tillgänglig"

### Teknik & modeller

- **AC9:** Rapporten innehåller modell-ID och maxTokens per aktiv agent
- **AC10:** Rapporten innehåller Node-version, runtime, preamble-referens
- **AC11:** Modell-information hämtas via `resolveModelConfig()` med fallback till default

### Prompt lint

- **AC12:** Observer skannar alla prompter mot anti-pattern-lista vid start
- **AC13:** Anti-pattern-lista laddas från `policy/prompt-antipatterns.yaml`
- **AC14:** Lint skiljer legitima begränsningar (API-retries) från ärvda heuristiker (max N filer) via tvåstegs-filtrering (regex + kontextanalys)
- **AC15:** YAML-schema stödjer: pattern, flags, category, severity, legitimateContexts

### Tool-alignment (enkel)

- **AC16:** Observer verifierar att agentens tool-lista matchar promptens nyckel-påståenden
- **AC17:** Observer kollar om tool:et faktiskt användes under körningen
- **AC18:** Status rapporteras som OK, TOOL_MISSING, eller TOOL_UNUSED

### Rapport

- **AC19:** `prompt-health-YYYY-MM-DDTHHMM.md` genereras automatiskt i `runs/<runId>/`
- **AC20:** Rapporten innehåller alla sektioner: Teknik & Miljö, Agentmodeller, Token-förbrukning, Observationer, Prompt Lint, Tool-Alignment, Rekommendationer
- **AC21:** Rekommendationer kategoriseras som PROMPT-FIX, CODE-FIX, eller OK
- **AC22:** Rapporten har en Retro-sektion med placeholder-text ("aktiveras i Brief B")

### Tester

- **AC23:** `observer.test.ts` har minst 20 tester:
  - Event-processning (tool-calls, agent-text, tokens)
  - Observation-generering (frånvaro, anti-patterns, satisficing)
  - Token-ackumulering och kostnadsberäkning
  - Prompt-lint med tvåstegs-filtrering
  - YAML-laddning och parsning
  - Enkel tool-alignment
  - Rapport-generering (alla sektioner)
  - Edge cases: tom körning, saknade events, okänd modell
- **AC24:** Alla befintliga tester passerar utan regression

## Designbeslut

1. **Observer som 12:e agent, inte extern process:** Observer lever i samma runtime som övriga agenter, använder samma eventBus. Anledning: enklare integration, ingen IPC, tillgång till allt kontext.

2. **Read-only under körning:** Observer ändrar inget — bara observerar och antecknar. Anledning: eliminerar risk att Observer påverkar körningsresultatet.

3. **Noll API-anrop i Brief A:** All logik är lokal — regex, event-processning, rapport-generering. Retro-samtal (API-anrop) läggs till i Brief B. Anledning: minskar scope, ger ett fungerande fundament att bygga vidare på.

4. **Anti-pattern-lista i YAML:** Utökningsbar utan kodändring. Anledning: när nya mönster upptäcks (som i S120) läggs de till i YAML-filen, inte i kod.

5. **Fallback-priser:** Om model-registry inte exporterar priser, hårdkodas de. Anledning: token-rapporten ska alltid kunna genereras.

6. **Enkel alignment i A, djup i B:** Brief A kollar tool-listor och tool-användning. Brief B lägger till funktionskropps-analys. Anledning: scope-kontroll.
