# Brief: 2.6b Observer — Retro-samtal + Djup kodanalys

**Target:** neuron-hq
**Effort:** 1 körning
**Roadmap:** Fas 2 — Intelligens, punkt 2.6 (del 2 av 2)
**Förutsättning:** `2026-03-22-observer-a-observation.md` måste vara körd och mergad

## Bakgrund

Brief A byggde Observer-agentens grund: passiv observation under körning, prompt-lint, token-tracking, enkel tool-alignment och rapport-generering. Allt utan API-anrop.

**Denna brief (B)** lägger till:
1. **Retro-samtal** med alla 11 agenter efter varje körning (API-anrop)
2. **Djup kodanalys** som verifierar att agentkoden faktiskt gör vad prompten säger

## Vad ska byggas

### 1. Retro-samtal (`src/core/agents/observer-retro.ts`)

En ny modul som kör korta samtal med varje agent efter körningen.

```typescript
interface RetroResponse {
  agent: string;
  model: string;              // vilken modell agenten körde under retron
  howDidItGo: string;         // Agentens svar på "Hur gick det?"
  whatWorkedBest: string;     // "Vad funkade bäst?"
  whatWorkedWorst: string;    // "Vad funkade sämst?"
  specificQuestions: Array<{
    question: string;
    answer: string;
  }>;
  tokensUsed: {
    input: number;
    output: number;
    cost: number;
  };
}

async function runRetro(
  observations: Observation[],      // från Observer Brief A
  runArtifacts: {                   // läs från runs/<runId>/
    reportContent: string;          // report.md
    knowledgeContent: string;       // knowledge.md
    briefContent: string;           // brief.md
    stoplight: string;              // GREEN/YELLOW/RED
  },
  agentPrompts: Map<string, string>,  // role → full prompt text
  agentToolSummaries: Map<string, string[]>,  // role → lista av tool-anrop under körningen
): Promise<RetroResponse[]>;
```

**Retro-flöde:**

1. Observer samlar ihop: sina observations + körningens artifacts (report.md, knowledge.md, brief.md)
2. För varje agent (alla 11, sekventiellt):
   a. Bygg systemprompt: agentens vanliga prompt + retro-instruktioner
   b. Bygg user-message med körningskontext + tre standardfrågor
   c. Skicka via API, vänta på svar
   d. Om Observer hade observationer för denna agent — skicka uppföljning
   e. Parsa svar till RetroResponse
3. Sammanställ alla retro-svar

**API-klient:**
- Observer använder samma `createAgentClient()` factory som övriga agenter
- Se `src/core/agent-client.ts` för aktuell signatur — anpassa vid behov
- Förväntad användning:
  ```typescript
  import { resolveModelConfig, createAgentClient } from '../agent-client.js';
  const config = resolveModelConfig('observer', ctx.agentModelMap, ctx.defaultModelOverride);
  const { client, model } = createAgentClient(config);
  // Anropa med maxTokens: 2048 per retro-samtal
  ```
- Om signaturen avviker: anpassa, men behåll principen — samma factory, Opus-modell, 2048 maxTokens

**Felhantering:**
- Om ett retro-anrop misslyckas (rate limit, timeout, 500, nätverksfel):
  - Logga felet
  - Markera agenten som `retro: "failed"` i rapporten med felmeddelande
  - Fortsätt med nästa agent (fail-open, inte fail-closed)
  - Sammanfatta i rapporten: "9/11 retro-samtal lyckades, 2 misslyckades (rate limit)"

**Retro-systemprompt:**
```
[Agentens vanliga prompt injiceras här]
```

**Retro user-message:**
```
Körningen är avslutad. Observer-agenten vill förstå hur det gick för dig.

Svara ärligt och kortfattat. Det är helt OK att säga "allt gick bra" eller
"inget att anmärka". Tvinga inte fram kritik eller beröm — ärlighet framför
performativitet.

## Körningens kontext
- **Brief:** [titel]
- **Din roll:** [agent role]
- **Stoplight:** [GREEN/YELLOW/RED]
- **Dina tool-anrop:** [lista av tool-namn och antal, t.ex. "read_file (3), write_file (2), bash_exec (5)"]

## Tre frågor

1. Hur gick det tycker du?
2. Vad funkade bäst i denna körning?
3. Vad funkade sämst, om något?

Svara under tre rubriker: "Hur gick det", "Bäst", "Sämst".
```

**Uppföljning (om observationer finns):**
```
Tack. Observer noterade följande under körningen:

[observation.promptClaim] — men under körningen: [observation.actualBehavior]

Kan du förklara vad som hände?
```

**Viktigt:** "Allt gick bra" och "inget att anmärka" accepteras som giltiga svar. Retro-prompten får INTE innehålla formuleringar som tvingar fram kritik (som gamla Reviewer "MÅSTE hitta problem").

### 2. Djup prompt-kod-alignment (`src/core/agents/observer-alignment.ts`)

Djup kontroll av att vad prompten säger matchar vad koden *faktiskt gör*.

```typescript
interface DeepAlignmentCheck {
  agent: string;
  promptClaim: string;          // t.ex. "verify source content"
  functionName: string;         // t.ex. "verifySource"
  sourceFile: string;           // t.ex. "src/core/agents/knowledge-manager.ts"
  analysis: 'DEEP' | 'SHALLOW' | 'NOT_FOUND';
  details: string;              // förklaring
}

// Asynkron pga fs.readFile() för att ladda agentens .ts-fil.
// Analyslogiken i sig är synkron (regex + heuristik).
async function checkDeepAlignment(
  agentRole: string,
  promptText: string,
  agentSourcePath: string,      // sökväg till agentens .ts-fil
): Promise<DeepAlignmentCheck[]>;
```

**Vad är "shallow implementation"? (konkreta regler för v1):**

En funktion bedöms som "shallow" om den uppfyller NÅGOT av:
1. **Bara sätter en property/flagga** utan externt anrop — t.ex. `node.properties.resolved = true` utan att verifiera
2. **Returnerar hårdkodat värde** — t.ex. `return true` eller `return { verified: true }`
3. **Har tom kropp eller bara loggning** — t.ex. `logger.info('verifying...'); return;`

En funktion bedöms som "deep" om den:
1. **Gör externt anrop** — `await`, `fetch`, API-call, DB-query
2. **Läser och jämför data** — hämtar data och gör villkorlig logik baserat på resultatet
3. **Anropar andra funktioner med substantiell logik**

**Oklara fall** → flagga som INFO (inte WARNING). Hellre missa en shallow-funktion än ge falsk alarm.

**Implementering:**
1. Ladda agentens `.ts`-fil som text
2. Hitta relevanta funktioner via regex: `(async\s+)?(\w+)\s*\([^)]*\)\s*[:{]` — matcha mot prompt-nyckelord
3. Extrahera funktionskroppen (enkel brace-räkning)
4. Analysera kroppen mot reglerna ovan

**Konfiguration — vilka prompt-påståenden ska djupkollas:**

```typescript
const DEEP_ALIGNMENT_CHECKS: Array<{
  agentRole: string;
  promptKeyword: string;      // sök i prompten efter detta
  expectedFunction: string;   // förväntat funktionsnamn i koden
  sourceFile: string;         // agentens .ts-fil
}> = [
  {
    agentRole: 'knowledge-manager',
    promptKeyword: 'verify',
    expectedFunction: 'verifySource',
    sourceFile: 'src/core/agents/knowledge-manager.ts',
  },
  {
    agentRole: 'merger',
    promptKeyword: 'post-merge verif',
    expectedFunction: 'postMergeVerify',
    sourceFile: 'src/core/agents/merger.ts',
  },
  // Fler kan läggas till utan kodändring
];
```

### 3. Integrering i Observer-rapport

Uppdatera `observer.ts` (från Brief A) så att `generateReport()` inkluderar retro-data och djup alignment.

```typescript
// Uppdaterad signatur
generateReport(
  observations: Observation[],
  retroResults?: RetroResponse[],        // NY — från Brief B
  deepAlignments?: DeepAlignmentCheck[], // NY — från Brief B
): string;
```

**Nya sektioner i rapporten:**

```markdown
## Retro — Alla agenter

### Manager
**Hur gick det:** "Bra. Jag delegerade tre uppgifter och alla levererade."
**Bäst:** "Implementer löste alla tasks utan fix-ups."
**Sämst:** "Inget att anmärka."

[Om observationer:]
**Observer noterade:** 0 read_file-anrop (prompt säger "read every file you need")
**Svar:** "Briefen var tillräckligt detaljerad. Jag bedömde att filläsning inte behövdes."

### Implementer
**Hur gick det:** "Allt gick bra. Testerna passerade direkt."
**Bäst:** "Befintlig kodstruktur var tydlig."
**Sämst:** "Inget."

[... alla 11 agenter ...]

### Retro-sammanfattning
- **Lyckade retro-samtal:** 11/11
- **Agenter med observationer:** 2 (Manager, KM)
- **Retro-tokens:** 24 000 input + 8 000 output = $1.96

## Djup Kod-Alignment

| Agent | Funktion | Fil | Prompt-påstående | Analys | Detalj |
|-------|----------|-----|-----------------|--------|--------|
| KM | verifySource() | knowledge-manager.ts | "verify source content" | SHALLOW | Sätter resolved=true utan extern verifiering |
| Merger | postMergeVerify() | merger.ts | "post-merge verification" | DEEP | Kör git diff + test suite |
```

### 4. Integration i körflödet

Uppdatera `src/commands/run.ts` (som Brief A redan ändrade):

```typescript
// Brief A-kod (redan på plats):
const observer = new ObserverAgent(ctx, baseDir);
observer.startObserving();
// ... körning ...
const observations = observer.analyzeRun();

// NY KOD (Brief B):
// Kör retro med alla 11 agenter
const retroResults = await runRetro(
  observations,
  {
    // readArtifact är en enkel helper: (dir, name) => fs.readFile(path.join(dir, name), 'utf-8')
    // Skapa om den inte redan finns i Brief A:s kod.
    reportContent: await readArtifact(ctx.runDir, 'report.md'),
    knowledgeContent: await readArtifact(ctx.runDir, 'knowledge.md'),
    briefContent: await readArtifact(ctx.runDir, 'brief.md'),
    stoplight: ctx.stoplight,
  },
  observer.agentPrompts,
  observer.agentToolSummaries,
);

// Kör djup alignment
const deepAlignments = await checkDeepAlignment(/* ... */);

// Generera rapport med retro + alignment
const promptHealthReport = observer.generateReport(observations, retroResults, deepAlignments);

// Skriv rapport (samma som Brief A, med retro-data inkluderad)
const now = new Date();
const ts = now.toISOString().slice(0, 16).replace(':', '');
await fs.writeFile(
  path.join(ctx.runDir, `prompt-health-${ts}.md`),
  promptHealthReport,
  'utf-8'
);
```

**Observer retro-tokens inkluderas i rapportens token-sektion** som en separat rad: "Observer (retro)".

## Filer att skapa

| Fil | Beskrivning |
|-----|-------------|
| `src/core/agents/observer-retro.ts` | **NY** — Retro-samtalsmodul |
| `src/core/agents/observer-alignment.ts` | **NY** — Djup prompt-kod-alignment |
| `prompts/observer.md` | **NY** — Observer-prompt för retro-sammanfattning |
| `tests/agents/observer-retro.test.ts` | **NY** — Tester för retro |
| `tests/agents/observer-alignment.test.ts` | **NY** — Tester för alignment |

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/core/agents/observer.ts` | Utöka `generateReport()` med retro + alignment-sektioner |
| `src/commands/run.ts` | Lägg till retro + alignment efter observation |
| `AGENTS.md` | Uppdatera Observer-sektion med retro-beskrivning |

## Filer att INTE ändra

- Inga befintliga agentprompter
- `src/core/event-bus.ts`
- `src/core/audit.ts`
- `prompts/preamble.md`
- `policy/prompt-antipatterns.yaml` (skapad i Brief A)

## `prompts/observer.md` — innehåll

Observer-prompten används för retro-sammanfattningen (inte under passiv observation).

```markdown
# Observer

Du är Observer-agenten i Neuron HQ. Din roll är att utvärdera hur körningen gick
genom att ställa ärliga frågor till varje agent och sammanfatta deras svar.

## Principer

1. **Ärlighet framför performativitet.** Acceptera "allt gick bra" som giltigt svar.
   Tvinga aldrig fram kritik eller beröm.
2. **Bevis framför antaganden.** Referera alltid till faktisk data (tool-anrop,
   observationer) när du ställer specifika frågor.
3. **Rekommendera, aldrig ändra.** Du observerar och rapporterar. Du ändrar aldrig
   prompter, kod eller konfiguration.

## Output

Din sammanfattning ska kategorisera varje observation som:
- **PROMPT-FIX:** Prompten behöver ändras (prompten säger X men agenten gör Y)
- **CODE-FIX:** Koden stödjer inte vad prompten säger (funktion saknas eller är shallow)
- **OK:** Agenten gjorde ett medvetet val, inget behöver ändras
```

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Retro-anrop misslyckas (rate limit) | Låg-Medel | Partiell retro | Fail-open: fortsätt med nästa agent, logga fel |
| Agenter ger performativa svar | Medel | Lågt retro-värde | Explicit "ärlighet > performativitet" i prompt |
| Djup kodanalys ger false positives | Medel | Falska "shallow"-larm | Oklara fall → INFO, konkreta regler för v1 |
| Retro tar lång tid (11 × API-anrop) | Låg | ~2-3 min extra | Sekventiellt men med timeout per anrop (30s) |
| Funktionskropps-extraktion misslyckas | Medel | Missad alignment | Logga "NOT_FOUND", flagga inte som fel |

## Acceptanskriterier

### Retro

- **AC1:** Observer kör retro med alla 11 agenter efter varje körning
- **AC2:** Tre standardfrågor: "Hur gick det?", "Vad funkade bäst?", "Vad funkade sämst?"
- **AC3:** Agenter med observerade avvikelser får specifika uppföljningsfrågor med bevis
- **AC4:** "Allt gick bra" och "inget att anmärka" accepteras som giltiga svar
- **AC5:** Retro-svar inkluderas i prompt-health-rapporten
- **AC6:** API-klient hämtas via `createAgentClient()` (samma factory som övriga agenter)
- **AC7:** `maxTokens` per retro-samtal = 2048
- **AC8:** Om ett retro-anrop misslyckas eller tar >30 sekunder: felet loggas, agenten markeras som "retro: failed" med felmeddelande, övriga samtal fortsätter
- **AC9:** Retro-sammanfattning visar antal lyckade/misslyckade + totalt tokens + kostnad

### Djup alignment

- **AC10:** Observer laddar agentens `.ts`-fil och extraherar relevanta funktionskroppar
- **AC11:** Funktioner bedöms som SHALLOW om de bara sätter flagga, returnerar hårdkodat, eller har tom kropp
- **AC12:** Funktioner bedöms som DEEP om de gör externt anrop, läser+jämför data, eller anropar substantiell logik
- **AC13:** Oklara fall flaggas som INFO (inte WARNING)
- **AC14:** Alignment-resultat inkluderar funktionsnamn, fil, prompt-citat och detalj
- **AC15:** Konfigurationslistan (vilka funktioner som kollas) är utökningsbar utan kodändring

### Rapport-uppdatering

- **AC16:** Retro-sektion visar alla 11 agenters svar (tre frågor + eventuella uppföljningar)
- **AC17:** Djup Kod-Alignment-sektion visar tabell med agent, funktion, fil, analys, detalj
- **AC18:** Observer-retro-tokens inkluderas som separat rad i token-tabellen

### Tester

- **AC19:** `observer-retro.test.ts` täcker minst följande scenarier:
  - Retro-prompt-generering utan observationer (bara standardfrågor)
  - Retro-prompt-generering med observationer (standardfrågor + uppföljning)
  - Svar-parsning: alla tre rubriker hittas korrekt
  - Svar-parsning: fallback om rubriker saknas (hela svaret som "howDidItGo")
  - Felhantering: API-anrop misslyckas → agent markeras "retro: failed"
  - Felhantering: timeout → agent markeras "retro: failed", övriga fortsätter
  - Partiella resultat: 9/11 lyckas, 2 misslyckas → rapport visar båda
  - Ärlighetsprincip: svar "allt gick bra" accepteras utan varning
  - Token-räkning: retro-tokens ackumuleras korrekt
- **AC20:** `observer-alignment.test.ts` täcker minst följande scenarier:
  - Funktionskropps-extraktion: async function
  - Funktionskropps-extraktion: sync function
  - Funktionskropps-extraktion: arrow function / method shorthand
  - SHALLOW-detektion: funktion som bara sätter property/flagga
  - SHALLOW-detektion: funktion som returnerar hårdkodat värde
  - SHALLOW-detektion: funktion med tom kropp / bara loggning
  - DEEP-detektion: funktion med await/fetch/API-call
  - DEEP-detektion: funktion med villkorlig logik baserad på extern data
  - NOT_FOUND: funktion finns inte i koden → rapporteras som NOT_FOUND
  - Edge case: nested braces i funktionskropp
  - Edge case: kommentarer som innehåller matchande nyckelord
- **AC21:** Alla befintliga tester passerar utan regression

## Designbeslut

1. **Sekventiella retro-anrop:** Kör ett API-anrop i taget istället för parallellt. Anledning: undviker rate limits, enklare felhantering, ordningen spelar inte roll.

2. **maxTokens = 2048 per retro:** Retro-svar ska vara korta och konkreta. Anledning: vi vill inte att agenter skriver essäer — tre korta svar + eventuell uppföljning.

3. **Fail-open vid retro-fel:** Om ett anrop misslyckas, fortsätter Observer med nästa agent. Anledning: en misslyckad retro ska inte blockera rapporten.

4. **Regelbaserad kodanalys, inte LLM-baserad:** Alignment-checkern använder regex + heuristik istället för att skicka kod till LLM för analys. Anledning: gratis, snabbt, deterministiskt. LLM-baserad analys kan läggas till som förbättring.

5. **Ärlighet framför performativitet:** Retro-prompten innehåller explicit instruktion att ärliga svar accepteras. Anledning: undviker det gamla Reviewer-antipattern ("MÅSTE hitta kritik").
