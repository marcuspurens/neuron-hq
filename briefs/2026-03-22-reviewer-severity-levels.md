# Brief: 3.1 Reviewer severity levels — BLOCK/SUGGEST/NOTE

**Target:** neuron-hq
**Effort:** 1-2 korningar
**Roadmap:** Fas 3 — Agent-mognad, punkt 3.1

## Bakgrund

Reviewerns verdict har idag tre nivaer (GREEN/YELLOW/RED) men enskilda *fynd* saknar klassificering. `blockers` och `suggestions` i `reviewer_result.json` ar bara string-arrayer — en stilistisk kommentar vager lika tungt som en riktig bugg.

**Nuvarande schema (`messages.ts` rad 43-56):**

```typescript
ReviewerResultSchema = z.object({
  verdict: z.enum(['GREEN', 'YELLOW', 'RED']),
  testsRun: z.number(),
  testsPassing: z.number(),
  acceptanceCriteria: z.array(z.object({
    criterion: z.string(),
    passed: z.boolean(),
    note: z.string().optional(),
  })),
  blockers: z.array(z.string()),     // <-- inga nivaer
  suggestions: z.array(z.string()),  // <-- inga nivaer
});
```

**Nuvarande flode:**
1. Reviewer skriver `reviewer_result.json` med verdict + blockers/suggestions
2. Manager laser JSON, loggar verdict, router till nasta agent
3. Merger kollar `\bGREEN\b` i `report.md`
4. Implementer far INGEN mojlighet att svara pa enskilda fynd

**Problemet:**
- Reviewer kan inte saga "detta bor fixas men ar inte kritiskt" — allt som inte ar GREEN blockerar
- Implementer kan inte argumentera mot enskilda fynd — bara fa RED och gora om allt
- Manager ser inte vilka problem som ar allvarliga vs smakfragor
- Korningen far onodigt manga iterationer nar Reviewer blockerar pa SUGGEST-niva-fynd

**Jfr SecurityScan:** `security-scan.ts` har redan 4-tier severity (critical/high/medium/info) for sakerhetsfynd. Samma princip, nu for alla review-fynd.

## Vad ska byggas

### 1. Schema-andring i `messages.ts`

Utoka `ReviewerResultSchema` med en `findings`-array:

```typescript
export const ReviewFindingSchema = z.object({
  id: z.string(),                                    // "F1", "F2", ...
  severity: z.enum(['BLOCK', 'SUGGEST', 'NOTE']),
  category: z.enum([
    'test-gap',        // saknade tester
    'design',          // designproblem
    'readability',     // lasbarhet, namngivning
    'security',        // sakerhetsproblem
    'performance',     // prestandaproblem
    'policy',          // policy-overtramp
    'scope',           // scope-avvikelse
    'other',           // ovrigt
  ]),
  description: z.string(),
  file: z.string().optional(),                       // vilken fil
  line: z.number().optional(),                       // vilken rad
});

export const ReviewerResultSchema = z.object({
  verdict: z.enum(['GREEN', 'YELLOW', 'RED']),
  testsRun: z.number(),
  testsPassing: z.number(),
  acceptanceCriteria: z.array(z.object({
    criterion: z.string(),
    passed: z.boolean(),
    note: z.string().optional(),
  })),
  findings: z.array(ReviewFindingSchema).default([]),   // NYT
  blockers: z.array(z.string()),                         // bakatkompat — BLOCK-fynd
  suggestions: z.array(z.string()),                      // bakatkompat — SUGGEST-fynd
});
```

**Unika ID:n:** Reviewer-prompten instruerar unika ID:n (F1, F2, ...). Schemat validerar INTE uniqueness via `.refine()` — det ar promptens ansvar. Om dubbletter uppstar behandlas de som separata findings (ingen krasch, men tradbarheten forsamras). Lags eventuellt till i framtida iteration.

**Bakatkompabilitet:** `blockers` och `suggestions` behalles med samma typ (string-array). Reviewer fyller bade `findings` (strukturerat) och `blockers`/`suggestions` (for befintlig kod som laser dem). Pa sikt kan `blockers`/`suggestions` fasas ut, men det ar utanfor denna briefs scope.

**Krav:**
- `findings` ar `.default([])` — gamla reviewer_result.json utan findings validerar fortfarande
- Exportera `ReviewFinding` och `ReviewFindingSchema` for ateranvandning
- Uppdatera `ReviewerResult`-typen automatiskt via `z.infer`

### 2. Reviewer-promptandring (`prompts/reviewer.md`)

Lagg till en ny sektion **efter** "Core Responsibilities" och **fore** "Blocking Criteria":

```markdown
### Finding Classification

Classify every finding with a severity level:

| Severity | Meaning | Effect |
|----------|---------|--------|
| **BLOCK** | Must fix before merge. Policy violation, failing test, security issue, missing AC. | Verdict cannot be GREEN while unresolved BLOCK exists. |
| **SUGGEST** | Should fix, but Implementer can argue against with reasoning. Design improvement, readability, test gap for edge case. | Does not block GREEN. Implementer responds in next iteration. |
| **NOTE** | Observation for future reference. No action required this run. | Informational only. Logged but ignored for verdict. |

**Rules:**
- Every finding in your Code Critique MUST have a severity
- Policy violations and failing acceptance criteria are ALWAYS BLOCK
- If you are unsure between BLOCK and SUGGEST, choose BLOCK — err on the side of safety
- If you are unsure between SUGGEST and NOTE, choose SUGGEST
- Each finding gets a unique ID (F1, F2, ...) used for traceability
```

**Uppdatera "Output Requirements" (reviewer_result.json-exemplet)** sa att `findings`-arrayen ar med:

```json
{
  "verdict": "YELLOW",
  "findings": [
    {
      "id": "F1",
      "severity": "BLOCK",
      "category": "test-gap",
      "description": "Ingen test for edge case nar input ar tom array",
      "file": "src/core/foo.ts",
      "line": 42
    },
    {
      "id": "F2",
      "severity": "SUGGEST",
      "category": "readability",
      "description": "Funktionsnamnet processData ar for generellt — foreslr processHealthMetrics",
      "file": "src/core/foo.ts",
      "line": 10
    },
    {
      "id": "F3",
      "severity": "NOTE",
      "category": "design",
      "description": "Denna modul borjar bli stor (350 rader). Over tid, overag att bryta ut health-checks till egen fil."
    }
  ],
  "blockers": ["F1: Ingen test for edge case nar input ar tom array"],
  "suggestions": ["F2: Funktionsnamnet processData ar for generellt"]
}
```

**Uppdatera "Verdict"-logik i prompten:**

```markdown
### Verdict Rules

1. **Any unresolved BLOCK finding** -> verdict MUST be RED or YELLOW (never GREEN)
2. **Only SUGGEST + NOTE findings** -> verdict can be GREEN if overall quality is good
3. **SUGGEST findings do not block GREEN** — they are logged and Implementer responds in next iteration
4. **NOTE findings are informational** — no effect on verdict
5. **Acceptance criteria that fail are always BLOCK** — never SUGGEST or NOTE
```

**Krav:**
- Behall befintlig Code Critique-sektion — findings ar struktureringen av det Reviewer redan gor
- Behall `report.md`-format oforandrat (svensk sammanfattning, stoplight, etc.)
- Reviewer maste fortfarande fylla `blockers`/`suggestions` string-arrayer for bakatkompat

### 3. Implementer-responslogik (`prompts/implementer.md`)

Lagg till en ny sektion **efter** "Quality Checklist":

```markdown
### Responding to Reviewer Findings

When you receive a task that includes Reviewer findings (from a previous iteration):

1. **BLOCK findings**: Fix them. No discussion — these must be resolved.
2. **SUGGEST findings**: You have three options:
   - **Accept**: Fix it. Note "Accepted F2" in your handoff.
   - **Argue**: Write a brief reasoning why the suggestion should not be applied. Note "Disputed F2: [reason]" in your handoff. Manager will arbitrate.
   - **Partial**: Apply a simpler version. Note "Partial F2: [what you did instead]" in your handoff.
3. **NOTE findings**: Read them for context. No action required.

Document your responses in `implementer_handoff.md` under a new section:

```markdown
## Finding Responses

| Finding | Severity | Response | Reasoning |
|---------|----------|----------|-----------|
| F1 | BLOCK | Fixed | Added test for empty array edge case |
| F2 | SUGGEST | Disputed | processData matches the convention in this module — all 4 sibling functions use process* |
| F3 | NOTE | Acknowledged | Will address in future refactoring |
```\n```

**Krav:**
- Implementer maste svara pa ALLA BLOCK-fynd (= fixa dem)
- Implementer FAR svara pa SUGGEST-fynd med motivering
- Responses dokumenteras i handoff (inte i nagon ny JSON-fil — behall det enkelt)

### 4. Manager-arbitrering (`prompts/manager.md`)

Uppdatera routing-tabellen under "Routing table":

```markdown
### Handling disputed SUGGEST findings

When Implementer disputes a SUGGEST finding:
1. Read Reviewer's finding (description + reasoning)
2. Read Implementer's response (dispute reasoning)
3. Decide: Accept Implementer's argument OR re-delegate as BLOCK
4. Document your decision in audit log
5. If you accept dispute → finding is resolved, proceed
6. If you reject dispute → re-delegate to Implementer with finding upgraded to BLOCK
```

**Uppdatera routing-tabellen:**

| Verdict | Recommendation | Next agent | What to include |
|---------|---------------|------------|-----------------|
| GREEN | MERGE | **Merger** | Standard handoff |
| YELLOW (SUGGEST only) | ITERATE | **Implementer** | Findings with severity — Implementer responds |
| YELLOW (BLOCK) | ITERATE | **Implementer** | BLOCK findings — must fix |
| RED | INVESTIGATE | **Implementer** or **Librarian** | BLOCK findings + context |
| Any | Disputed SUGGEST | **Manager decides** | Arbitrate and route |

**Flodet efter SUGGEST-iteration:**
1. Reviewer ger YELLOW med SUGGEST-fynd (inga BLOCK)
2. Manager delegerar till Implementer med findings
3. Implementer fixar/disputerar/partial SUGGEST-fynd
4. Manager laser Implementers handoff → om alla SUGGEST hanterade (Accept/Dispute/Partial):
   - Om Implementer **bara disputerat/partial** (inga kodandringar) → Manager kan ruta direkt till Merger
   - Om Implementer **accepterat** ≥1 SUGGEST (dvs gjort kodandringar) → Manager delegerar till Tester+Reviewer for en ny runda (kodandring kräver verifiering)
   - Om Manager avvisar en dispyt → re-delegera till Implementer med det specifika fyndet uppgraderat till BLOCK
5. Manager korer INTE om Reviewer for rent disputerade SUGGEST — det vore sloseri. Men kodandringar kräver alltid verifiering.

**Krav:**
- Manager loggar varje arbitreringsbeslut till audit
- Manager behover inte agera pa NOTE-fynd
- Om alla BLOCK ar losta och alla SUGGEST ar hanterade (fixed/disputed/partial) → Manager kan ruta till Merger direkt

### 5. Manager-kodsandring (`src/core/agents/manager.ts`)

**Rad 1069-1141 (handleReviewerResult):** Utoka parsningen sa att Manager laser `findings` fran JSON och loggar severity-fordelning:

**Steg A — Logga severity-fordelning till audit (rad ~1098, efter `parsed.success`):**

```typescript
if (parsed.data.findings?.length) {
  const severityCounts = { BLOCK: 0, SUGGEST: 0, NOTE: 0 };
  for (const f of parsed.data.findings) {
    severityCounts[f.severity]++;
  }
  await this.ctx.audit.log({
    ts: new Date().toISOString(),
    role: 'manager',
    tool: 'agent_message',
    allowed: true,
    note: JSON.stringify({
      event: 'agent_message',
      payload_type: 'ReviewerFindings',
      counts: severityCounts,
      blockFindings: parsed.data.findings.filter(f => f.severity === 'BLOCK').map(f => f.id),
    }),
  });
}
```

**Steg B — Injicera findings i STRUCTURED RESULT-strängen (rad ~1123):**

Idag ser raden ut sa har:
```typescript
result += `\n\n--- STRUCTURED RESULT ---\nVerdict: ${structuredResult.verdict}\nTests: ${structuredResult.testsPassing}/${structuredResult.testsRun}\nBlockers: ${structuredResult.blockers.length}\nSuggestions: ${structuredResult.suggestions.length}`;
```

Utoka den med findings-summary SA ATT Manager ser dem i sin konversation:
```typescript
let resultSuffix = `\n\n--- STRUCTURED RESULT ---\nVerdict: ${structuredResult.verdict}\nTests: ${structuredResult.testsPassing}/${structuredResult.testsRun}\nBlockers: ${structuredResult.blockers.length}\nSuggestions: ${structuredResult.suggestions.length}`;

if (structuredResult.findings?.length) {
  resultSuffix += `\n\n--- FINDINGS ---`;
  for (const f of structuredResult.findings) {
    resultSuffix += `\n[${f.severity}] ${f.id}: ${f.description}`;
    if (f.file) resultSuffix += ` (${f.file}${f.line ? ':' + f.line : ''})`;
  }
}
result += resultSuffix;
```

**Mekanismen:** Manager ser findings i sin konversation → nar Manager bestammer sig for att ITERATE, inkluderar den naturligt findings i task-beskrivningen till `delegate_to_implementer`. Inga andringar i `delegateToImplementer()`-metoden kravs — Manager skriver task-strängen baserat pa vad den sett (inklusive findings).

**Krav:**
- Bakatkompat: om `findings` ar tom/undefined, beter sig koden exakt som idag (ingen findings-sektion lags till)
- Severity-fordelning loggas till audit med `payload_type: 'ReviewerFindings'` och `counts`-objekt
- Findings-summary visas i Manager-kontexten via STRUCTURED RESULT-strängen
- Samma findings-suffix lags till pa ALLA stallen dar STRUCTURED RESULT appendas (rad ~1123 OCH rad ~1137)

**OBS — Verifiera radnummer:** Radnumren ovan ar ungefärliga. Sok pa identifierarna `--- STRUCTURED RESULT ---` och funktionsnamnet som hanterar reviewer-resultat istallet for att forlita dig pa radnummer. Verifiera mot faktisk fil innan andring.

### 6. Verification gate-uppdatering (`src/core/verification-gate.ts`)

`validateReviewerResult()` anvander redan `ReviewerResultSchema.safeParse()` — inga andringar kravs tack vare `.default([])` pa `findings`. Verifiera att befintliga tester fortfarande passerar.

## Filer att andra

| Fil | Andring |
|-----|---------|
| `src/core/messages.ts` | Lagg till `ReviewFindingSchema`, utoka `ReviewerResultSchema` med `findings` |
| `prompts/reviewer.md` | Ny sektion Finding Classification, uppdatera verdict-logik + JSON-exempel |
| `prompts/implementer.md` | Ny sektion Responding to Reviewer Findings |
| `prompts/manager.md` | Uppdatera routing-tabell, ny sektion for SUGGEST-arbitrering |
| `src/core/agents/manager.ts` | Parsa findings, logga severity-fordelning, injicera findings i Implementer-kontext |
| `tests/core/messages.test.ts` | Tester for nya schema-falt |
| `tests/core/verification-gate.test.ts` | Verifiera bakatkompat (gamla JSON utan findings) |

## Filer att INTE andra

- `src/core/agents/reviewer.ts` — Agentlogiken andras via prompten, inte i koden
- `src/core/agents/implementer.ts` — Responslogiken ar prompt-driven, inte kod-driven
- `src/core/agents/merger.ts` — Merger laser fortfarande verdict, behover inte kanna till findings
- `src/core/security-scan.ts` — Separat system, inget att andra
- `reviewer_result.json`-parsning i manager.ts behover inte omskrivas — `ReviewerResultSchema` ar redan anvand

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Reviewer klassificerar allt som BLOCK | Medel | Ingen forandring fran idag | Prompten ar explicit: "Policy violations ALWAYS BLOCK, readability USUALLY SUGGEST" |
| Reviewer klassificerar allt som SUGGEST | Lag | Viktiga problem missas | Prompten: "If unsure between BLOCK and SUGGEST, choose BLOCK" |
| Implementer disputerar allt | Lag | Manager overbelastas | Manager kan avfarda dalgrundat dispute |
| Gamla reviewer_result.json (utan findings) gor parsing-fel | Lag | Korning kraschar | `.default([])` gor att gamla JSON validerar |
| Manager-koden ar komplex nog — fler villkor okar risk | Medel | Buggar i routing | Findings-logik ar additive (logga + injicera), inte omskrivning av befintlig routing |

## Acceptanskriterier

### Schema

- **AC1:** `ReviewFindingSchema` validerar objekt med `id`, `severity` (BLOCK/SUGGEST/NOTE), `category`, `description`, och valfritt `file`/`line`
- **AC2:** `ReviewerResultSchema` accepterar `findings`-array (default `[]`)
- **AC3:** Gammal `reviewer_result.json` utan `findings`-falt validerar utan fel (bakatkompat)

### Reviewer-prompt

- **AC4:** Reviewer-prompten har sektion "Finding Classification" med severity-tabell
- **AC5:** Reviewer-promptens verdict-regler ar uppdaterade (BLOCK → inte GREEN, SUGGEST → kan vara GREEN)
- **AC6:** JSON-exemplet i prompten inkluderar `findings`-array

### Implementer-prompt

- **AC7:** Implementer-prompten har sektion "Responding to Reviewer Findings"
- **AC8:** Sektionen instruerar Accept/Argue/Partial for SUGGEST-fynd
- **AC9:** Handoff-format dokumenterar finding-responses i tabell

### Manager-prompt

- **AC10:** Manager-promptens routing-tabell inkluderar SUGGEST-hantering
- **AC11:** Ny sektion for SUGGEST-arbitrering

### Manager-kod

- **AC12:** `manager.ts` parsar `findings` fran `reviewer_result.json` och loggar severity-fordelning till audit
- **AC13:** STRUCTURED RESULT-strangen som returneras till Manager-konversationen innehaller en `--- FINDINGS ---`-sektion med severity, id och description for varje finding nar `findings.length > 0`. Nar `findings` ar tom/undefined laggs ingen FINDINGS-sektion till.
- **AC14:** Om `findings` ar tom/undefined beter sig koden exakt som idag

### Tester

- **AC15:** Schema-tester for `ReviewFindingSchema` (valid + invalid)
- **AC16:** Schema-tester for `ReviewerResultSchema` med och utan `findings`
- **AC17:** Bakatkompat-test: gammal JSON utan `findings` validerar
- **AC18:** Manager audit-loggning av severity-fordelning — testet verifierar att `audit.log` anropas med ett objekt som innehaller `payload_type: 'ReviewerFindings'` och ett `counts`-objekt med `BLOCK`/`SUGGEST`/`NOTE`-nycklar
- **AC18b:** Om `findings` ar tom/undefined anropas INTE `audit.log` med `payload_type: 'ReviewerFindings'` (negativ-test)
- **AC19:** `ReviewFinding`-typen (via `z.infer`) exporteras fran `messages.ts` och ar importerbar
- **AC20:** Alla befintliga tester passerar utan regression

## Designbeslut

1. **Findings i prompt, inte i kod-logik:** Reviewer klassificerar via prompten. Koden parsar och loggar — den beslutar inte severity. Detta gor systemet flexibelt utan kodandringar.

2. **Implementer-respons i handoff-markdown, inte JSON:** Att lata Implementer svara i en strukturerad JSON-fil okar komplexiteten (ny schema, ny parsning, ny validering). Handoff-markdown racker — Manager laser det anda.

3. **Bakatkompat via `.default([])`:** Gammal reviewer_result.json utan `findings` validerar fortfarande. Ingen migrering kravs. Systemet ar gradvist — nasta korning producerar findings automatiskt.

4. **Fasta kategorier, inte fritext:** `z.enum` for kategorier ger konsistens och mojliggor framtida aggregering (t.ex. "Reviewer hittar flest test-gap-fynd"). Fritext-kategorier leder till inkonsistens.

5. **Merger oforandrad:** Merger laser `\bGREEN\b` i report.md. Findings paverkar verdict-logiken i Reviewer — Merger behover inte kanna till dem. Separation of concerns.
