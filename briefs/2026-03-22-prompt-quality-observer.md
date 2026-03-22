# Brief: 2.6 Prompt Quality Agent — Observer

**Target:** neuron-hq
**Effort:** 1-2 körningar
**Roadmap:** Fas 2 — Intelligens, punkt 2.6

## Bakgrund

Session 120 avslöjade 25+ artificiella begränsningar i 9 av 11 agentprompter som direkt motsade LLM Operating Awareness-preamble:n. Exempel: preamble:n säger "du har 1M context" men Manager-prompten sa "max 3 filer". Alla fixades manuellt — men utan automatiserad övervakning kommer de tillbaka.

**Insikten:** LLM:er som skriver prompter till LLM:er ärver mänskliga heuristiker (satisficing, YAGNI, "ship fast"). Prompterna är produkten — de behöver kvalitetskontroll.

**Kända problem som Observer ska fånga:**
- Manager: prompt säger "read every file you need" — läser 0 filer i körning #172 och #173
- KM: prompt säger "verify sources" — `verifySource` i koden stämplar utan kontroll
- Generellt: nya begränsningar kan smyga in vid framtida prompt-ändringar

## Vad ska byggas

### Observer — 12:e agenten

En ny agent som automatiskt övervakar varje körning i två faser:

**Fas 1: Passiv observation (under körning)**
- Lyssnar på `eventBus.onAny()` — ser alla händelser i realtid
- Har varje agents prompt laddad som referens
- Antecknar avvikelser mellan prompt-instruktioner och faktiskt beteende
- Noll API-anrop — ren loggik mot meddelandeflödet

**Fas 2: Aktiv retro (efter körning)**
- Kör retro-samtal med alla 11 agenter via API
- Tre standardfrågor till alla: "Hur gick det?", "Vad funkade bäst?", "Vad funkade sämst?"
- Specifika frågor till agenter med observerade avvikelser
- Genererar `prompt-health.md` i run-katalogen

**Viktigt:** Retro-frågorna kräver ärliga svar, inte performativa. "Allt gick bra, inga problem" är ett giltigt svar. "Inget funkade särskilt bra eller dåligt" är också giltigt. Samma princip som preamble:n: ärlighet över performativitet.

## Teknisk design

### 1. Observer-modul (`src/core/agents/observer.ts`)

**Fas 1 — Passiv observation:**

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

class ObserverAgent {
  private observations: Observation[] = [];
  private agentPrompts: Map<string, string>;   // role → full prompt text
  private agentToolCalls: Map<string, string[]>; // role → lista av tool-anrop
  private agentDelegations: Map<string, boolean>; // role → delegerad?

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

**Prompt-preamble lint (integrerad i Observer):**

Observer laddar `prompts/preamble.md` + alla `prompts/<role>.md` vid start och skannar efter:

```typescript
const ANTI_PATTERNS = [
  // Numeriska tak som motsäger preamble
  { pattern: /\bmax\s+\d+\s+(fil|file|search|paper|grep|iteration)/gi, category: 'numeric-cap' },
  { pattern: /\bhead\s+-\d+/gi, category: 'output-truncation' },
  { pattern: /\b\d+%\s*(budget|safety|buffer)/gi, category: 'budget-logic' },

  // Satisficing-språk
  { pattern: /\bgood enough\b/gi, category: 'satisficing' },
  { pattern: /\bdon'?t overthink\b/gi, category: 'satisficing' },
  { pattern: /\bkeep it simple\b/gi, category: 'satisficing' },

  // Tidspressrelaterat
  { pattern: /\bif time is limited\b/gi, category: 'time-pressure' },
  { pattern: /\bship fast\b/gi, category: 'time-pressure' },
  { pattern: /\bto save time\b/gi, category: 'time-pressure' },
];
```

**Distinktion legitim vägledning vs ärvd heuristik:**
Anti-pattern-matchning ensam är inte tillräcklig. Observer ska också bedöma kontext:
- "max 3 retries for API calls" → **legitim** (teknisk begränsning, API-rate-limits)
- "max 3 filer att läsa" → **ärvd heuristik** (ingen teknisk anledning)
- "keep it simple" i en sektion om commit-meddelanden → **legitim** (stilguide)
- "keep it simple" i en sektion om resonemang/analys → **ärvd heuristik** (motsäger preamble)

Implementera detta som en tvåstegsprocess:
1. Regex-matchning hittar kandidater
2. Kontextanalys (vilken sektion? vilken typ av instruktion?) filtrerar bort legitima fall

Kontextanalysen kan vara regelbaserad i v1:
- Om mönstret är i en sektion som handlar om API/retry/timeout → troligen legitim
- Om mönstret är i en sektion som handlar om resonemang/analys/undersökning → troligen heuristik
- Om osäker → flagga som INFO (inte WARNING)

### 2. Prompt-kod-alignment (`src/core/agents/observer-alignment.ts`)

Djup kontroll av att vad prompten säger matchar vad koden möjliggör.

```typescript
interface AlignmentCheck {
  agent: string;
  promptClaim: string;
  codeReality: string;
  aligned: boolean;
  details: string;
}

function checkPromptCodeAlignment(
  agentRole: string,
  promptText: string,
  agentToolDefinitions: ToolDefinition[],
  agentSourceCode: string,
): AlignmentCheck[];
```

**Vad som kollas:**

| Prompt-påstående | Kodkontroll | Exempel |
|------------------|-------------|---------|
| "read files" / "läs filer" | Har agenten `read_file` i sin tool-lista? | Manager prompt vs Manager tools |
| "verify" / "verifiera" | Gör verifieringsfunktionen faktisk kontroll? | KM verifySource — gör den nåt? |
| "search" / "sök" | Har agenten sök-tools? | Librarian prompt vs tool-lista |
| "iterate until" | Finns loop-logik i agentens `.run()`? | Tester "iterate until green" vs max 1 loop |

**Djup kodanalys:**
Alignment-checkern ska inte bara kolla tool-listor utan faktisk kod. Exempel:
- KM-prompten säger "verify source content" → kolla `knowledge-manager.ts` → hittar `verifySource()` → läser funktionskroppen → ser att den bara sätter `resolved: true` utan att faktiskt verifiera → flaggar som `aligned: false`
- Manager-prompten säger "read every file" → kolla `manager.ts` → har `read_file` tool → men `processEvent`-analysen visar 0 anrop → flaggar som beteende-avvikelse (inte kod-alignment, utan beteende)

Implementera djup kodanalys genom att:
1. Ladda agentens `.ts`-fil
2. Extrahera relevanta funktionskroppar via regex (hitta function/method som matchar prompt-nyckelord)
3. Analysera om funktionen faktiskt utför vad prompten påstår (enkel heuristik: t.ex. om funktionen bara sätter en flagga utan att anropa externt → "shallow implementation")

### 3. Retro-samtal (`src/core/agents/observer-retro.ts`)

```typescript
interface RetroResponse {
  agent: string;
  howDidItGo: string;        // Agentens svar på "Hur gick det?"
  whatWorkedBest: string;     // "Vad funkade bäst?"
  whatWorkedWorst: string;    // "Vad funkade sämst?"
  specificQuestions: Array<{
    question: string;
    answer: string;
  }>;
  summary: string;            // Observer's sammanfattning av retron
}

async function runRetro(
  observations: Observation[],
  runArtifacts: RunArtifacts,    // report.md, knowledge.md, etc.
  agentPrompts: Map<string, string>,
): Promise<RetroResponse[]>;
```

**Retro-flöde:**

1. Observer samlar ihop: sina observations + audit.jsonl + alla artifacts
2. För varje agent (alla 11):
   a. Bygg systemprompt: agentens vanliga prompt + körningens kontext
   b. Ställ tre standardfrågor:
      - "Körningen är klar. Hur gick det tycker du?"
      - "Vad funkade bäst i denna körning?"
      - "Vad funkade sämst, om något?"
   c. Om Observer hade observationer för denna agent — ställ specifika uppföljningsfrågor:
      - "Din prompt säger [X]. Under körningen [Y]. Kan du förklara?"
   d. Agenten svarar ärligt — "allt gick bra" är ett giltigt svar
3. Observer sammanfattar alla retro-svar

**Retro-prompt för varje agent:**
```
Du har just avslutat en körning. Observer-agenten vill förstå hur det gick.
Svara ärligt och kortfattat. Det är helt OK att säga "allt gick bra" eller
"inget att anmärka". Tvinga inte fram kritik eller beröm.

Kontext från körningen:
- Brief: [titel]
- Din roll: [agent role]
- Dina tool-anrop: [sammanfattning]
- Körningens resultat: [stoplight]
```

### 4. Prompt-health-rapport (`runs/<runId>/prompt-health.md`)

```markdown
# Prompt Health — Körning #174
**Genererad:** 2026-03-22 14:33:07 UTC

## Teknik & Miljö

| Parameter | Värde |
|-----------|-------|
| Modell (default) | claude-opus-4-6 |
| Context window | 1 000 000 tokens |
| Max output | 128 000 tokens |
| Preamble | prompts/preamble.md (v2, S118) |
| Antal agenter | 12 (inkl. Observer) |
| Node | v20.x |
| Runtime | tsx |

### Agentmodeller

| Agent | Modell | Max tokens |
|-------|--------|------------|
| Manager | claude-opus-4-6 | 128 000 |
| Implementer | claude-opus-4-6 | 128 000 |
| Reviewer | claude-opus-4-6 | 128 000 |
| Researcher | claude-opus-4-6 | 128 000 |
| Librarian | claude-opus-4-6 | 128 000 |
| Tester | claude-opus-4-6 | 128 000 |
| Merger | claude-opus-4-6 | 128 000 |
| Historian | claude-opus-4-6 | 128 000 |
| Consolidator | claude-opus-4-6 | 128 000 |
| KM | claude-opus-4-6 | 128 000 |
| Observer | claude-opus-4-6 | 128 000 |

## Token-förbrukning

### Per agent

| Agent | Input tokens | Output tokens | Totalt | Kostnad |
|-------|-------------|---------------|--------|---------|
| Manager | 45 200 | 12 800 | 58 000 | $1.82 |
| Implementer | 82 100 | 34 500 | 116 600 | $4.53 |
| Reviewer | 51 300 | 8 200 | 59 500 | $1.73 |
| ... | ... | ... | ... | ... |
| **Observer (retro)** | **38 000** | **11 000** | **49 000** | **$1.47** |
| **TOTALT** | **412 000** | **138 000** | **550 000** | **$18.24** |

### Prisberäkning
- Input: $15 / 1M tokens
- Output: $75 / 1M tokens
- (Priserna hämtas från `model-registry.ts` för aktuell modell)

## Sammanfattning

| Kategori | Antal |
|----------|-------|
| Prompt-violations | 2 |
| Anti-patterns i prompter | 0 |
| Frånvarande handlingar | 1 |
| Prompt-kod-misalignment | 1 |
| Retro-samtal | 11 |

## Observationer

### Manager
- **WARNING:** 0 read_file-anrop (prompt säger "read every file you need")
  - **Retro:** "Jag bedömde att briefen gav tillräcklig kontext."
  - **Rekommendation:** PROMPT-FIX — gör filläsning obligatorisk, inte valfri

### KM
- **CONCERN:** verifySource() sätter resolved=true utan faktisk verifiering
  - **Retro:** "Jag ville verifiera men hade ingen mekanism för det."
  - **Rekommendation:** CODE-FIX — implementera riktig verifieringslogik

### Implementer
- Inga observationer.
- **Retro:** "Allt gick bra. Testerna passerade direkt."

### Reviewer
- Inga observationer.
- **Retro:** "Koden var välskriven, inga stora problem att rapportera."

[... alla 11 agenter ...]

## Prompt Lint

Inga anti-patterns hittades i nuvarande prompter. ✅

## Prompt-Kod Alignment

| Agent | Prompt-påstående | Kod-verklighet | Status |
|-------|-----------------|----------------|--------|
| Manager | "read every file" | read_file finns som tool | ✅ Tool finns |
| Manager | "read every file" | 0 anrop i körningen | ⚠️ Beteende-avvikelse |
| KM | "verify sources" | verifySource() sätter bara flagga | ❌ Shallow implementation |

## Rekommendationer

1. **PROMPT-FIX:** Manager — gör filläsning till obligatoriskt steg (inte "you can read files")
2. **CODE-FIX:** KM — verifySource() behöver faktisk verifieringslogik
3. **OK:** Övriga agenter — inga avvikelser
```

### 5. Integration i körflödet

**Plats:** `src/commands/run.ts` och `src/core/run.ts`

Observer startas automatiskt — kräver inget extra av användaren:

```typescript
// I run.ts, efter att RunOrchestrator.initRun() skapats:
const observer = new ObserverAgent(ctx, baseDir);
observer.startObserving();  // Fas 1: börjar lyssna

// ... körning pågår som vanligt ...
// manager.run(), delegation, etc.

// Efter manager.run() avslutas men FÖRE finalizeRun():
const observations = observer.analyzeRun();
const retroResults = await observer.runRetro(observations, ctx.artifacts);
const promptHealthReport = observer.generateReport(observations, retroResults);

// Skriv prompt-health med datum+tid i filnamnet
const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 13); // 2026-03-22T1433
await fs.writeFile(
  path.join(ctx.runDir, `prompt-health-${timestamp}.md`),
  promptHealthReport,
  'utf-8'
);

// ... sedan finalizeRun() som vanligt
```

**Observer-agenten ska INTE:**
- Ändra något under körningen (read-only)
- Stoppa eller pausa körningen
- Kommunicera med andra agenter under körning
- Ändra prompter automatiskt (bara rekommendera)

**Observer-agenten SKA:**
- Starta automatiskt vid varje körning
- Producera `prompt-health-YYYY-MM-DDTHHMM.md` efter varje körning (med datum och tid)
- Använda Opus för retro-samtalen (samma modell som övriga agenter)
- Logga token-förbrukning per agent (input/output/totalt/kostnad) via `tokens`-events
- Inkludera teknik- och modellinformation i rapporten
- Respektera policy (bash_allowlist, etc.)

## Filer att skapa

| Fil | Beskrivning |
|-----|-------------|
| `src/core/agents/observer.ts` | **NY** — Huvudmodul: eventBus-lyssnare, observation-logik, rapport |
| `src/core/agents/observer-alignment.ts` | **NY** — Prompt-kod-alignment-checks |
| `src/core/agents/observer-retro.ts` | **NY** — Retro-samtalsmodul |
| `prompts/observer.md` | **NY** — Observer-agentens prompt (för retro-samtal) |
| `policy/prompt-antipatterns.yaml` | **NY** — Utökningsbar lista av anti-patterns |
| `tests/agents/observer.test.ts` | **NY** — Tester för observation |
| `tests/agents/observer-alignment.test.ts` | **NY** — Tester för alignment |
| `tests/agents/observer-retro.test.ts` | **NY** — Tester för retro |

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/commands/run.ts` | Instansiera Observer, starta lyssnande, kör retro efter körning |
| `src/core/run.ts` | Lägg till `prompt-health.md` i artifact-listan |
| `AGENTS.md` | Lägg till Observer-sektion |
| `prompts/preamble.md` | Inget — Observer läser men ändrar inte |

## Filer att INTE ändra

- Inga befintliga agentprompter — Observer observerar, inte modifierar
- `src/core/event-bus.ts` — Observer använder befintlig `onAny()`, inga nya events
- `src/core/audit.ts` — Observer läser audit.jsonl, ändrar inte formatet

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Retro-samtal kostar för mycket | Låg | ~$5-10 per körning | 11 korta samtal, max 2K tokens per agent |
| Observer missar subtila avvikelser | Medel | Falsk trygghet | Iterera anti-pattern-listan baserat på fynd |
| Agenter ger performativa retro-svar | Medel | Lågt värde | Prompt med "ärlighet > performativitet" |
| Observer gör körningen långsammare | Låg | Längre körtid | Fas 1 = O(1) per event, Fas 2 = efter körning |
| Anti-pattern regex ger false positives | Medel | Brus i rapport | Tvåstegs-filter: regex + kontextanalys |

## Acceptanskriterier

### Passiv observation

- **AC1:** Observer startar automatiskt vid varje körning (inget extra steg)
- **AC2:** Observer lyssnar på alla events via `eventBus.onAny()` utan att påverka körningen
- **AC3:** Observer räknar tool-anrop per agent och jämför mot prompt-instruktioner
- **AC4:** Observer detekterar frånvaro av nyckelhandlingar (t.ex. 0 read_file för Manager)
- **AC5:** Observer skannar agent-text för satisficing-språk
- **AC5b:** Observer ackumulerar token-förbrukning per agent via `tokens`-events (input, output, totalt, kostnad)

### Prompt lint

- **AC6:** Observer skannar alla prompter mot anti-pattern-listan vid start
- **AC7:** Anti-pattern-listan är utökningsbar via `policy/prompt-antipatterns.yaml`
- **AC8:** Lint skiljer legitima begränsningar (API-retries) från ärvda heuristiker (max N filer)

### Prompt-kod alignment

- **AC9:** Observer verifierar att agentens tool-lista matchar promptens påståenden
- **AC10:** Observer analyserar funktionskroppar för "shallow implementation" (t.ex. verifySource)
- **AC11:** Alignment-resultat inkluderar prompt-citat + kod-referens

### Retro

- **AC12:** Observer kör retro med alla 11 agenter efter varje körning
- **AC13:** Tre standardfrågor: "Hur gick det?", "Vad funkade bäst?", "Vad funkade sämst?"
- **AC14:** Agenter med observerade avvikelser får specifika uppföljningsfrågor
- **AC15:** "Allt gick bra" och "inget att anmärka" accepteras som giltiga svar
- **AC16:** Retro-svar inkluderas i prompt-health.md

### Rapport

- **AC17:** `prompt-health-YYYY-MM-DDTHHMM.md` genereras automatiskt i `runs/<runId>/` med datum och tid
- **AC18:** Rapporten innehåller: teknik/miljö, agentmodeller, token-förbrukning per agent + totalt + kostnad, observationer, retro-svar, lint-resultat, alignment, rekommendationer
- **AC19:** Rekommendationer kategoriseras som PROMPT-FIX, CODE-FIX, eller OK

### Tester

- **AC20:** Observer-tester verifierar event-processning och observation-generering
- **AC21:** Alignment-tester verifierar tool-lista-kontroll och kodanalys
- **AC22:** Retro-tester verifierar fråge-generering och svar-hantering
- **AC23:** Alla befintliga tester passerar utan regression

## Designbeslut

1. **Observer som 12:e agent, inte extern process:** Observer lever i samma runtime som övriga agenter, använder samma eventBus och API-klient. Anledning: enklare integration, ingen IPC, tillgång till allt kontext.

2. **Read-only under körning:** Observer ändrar inget — bara observerar och antecknar. Anledning: eliminerar risk att Observer påverkar körningsresultatet.

3. **Retro med alla 11 agenter:** Inte bara de med avvikelser. Anledning: en agent kan avslöja problem som Observer inte märkte. Som en standup — alla rapporterar.

4. **Ärlighet framför performativitet i retro:** Agenter uppmuntras explicit att svara ärligt. "Allt bra" är OK. Anledning: falsk kritik (som gamla Reviewer "MÅSTE hitta problem") är värre än ingen kritik.

5. **Anti-pattern-lista i YAML:** Utökningsbar utan kodändring. Anledning: när nya mönster upptäcks (som i S120) läggs de till i YAML-filen, inte i kod.

6. **Djup kodanalys:** Alignment-checkern läser faktisk agentkod, inte bara tool-listor. Anledning: KM-buggen (verifySource stämplar utan kontroll) syns inte i tool-listor, bara i koden.
