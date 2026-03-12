# Brief: N4 — Typed Message Bus

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-03-typed-message-bus.md --hours 1
```

## Bakgrund

Idag kommunicerar alla 10 agenter via **fritext-strängar**. Delegeringsfunktionerna
i `manager.ts` returnerar `Promise<string>` — ostrukturerad markdown som parsas med
`string.includes()` för att kolla att rätt sektioner finns.

N13 (agent-handoff-context) löste det akuta problemet: Implementer skriver nu
`implementer_handoff.md` och Reviewer läser den. Men formatet är fortfarande fritext.
Det innebär:

- Manager validerar handoffs med `string.includes('## Self-Check')` — skört
- Ingen typkontroll vid compile-time på vad agenter skickar/tar emot
- Svårt att logga, söka i, eller analysera meddelandeflödet strukturerat
- Parallella tasks (`delegateParallelWave`) har redan en JSON-handoff — men resten har inte det

## Problem

1. **Skör validering** — `string.includes()` i `verification-gate.ts` missar formatfel
2. **Inget kontrakt** — Manager vet inte vad Implementer *garanterar* att leverera
3. **Svårt att debugga** — audit.jsonl loggar verktygscalls men inte agent-till-agent-meddelanden
4. **Inkonsekvent** — parallella tasks har JSON-schema, övriga har fritext

## Lösning

Skapa Zod-scheman för alla agent-till-agent-meddelanden. Behåll markdown-handoff-filer
som bieffekt (för läsbarhet), men låt all programmatisk kommunikation gå via typade objekt.

## Uppgifter

### 1. Skapa meddelandescheman (`src/core/messages.ts`)

Ny fil med Zod-scheman för varje delegerings-riktning:

```typescript
import { z } from 'zod';

// Manager → Implementer
export const ImplementerTaskSchema = z.object({
  taskId: z.string(),
  description: z.string(),
  files: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()),
});

// Implementer → Manager (ersätter fritext-handoff)
export const ImplementerResultSchema = z.object({
  taskId: z.string(),
  filesModified: z.array(z.object({
    path: z.string(),
    reason: z.string(),
  })),
  decisions: z.array(z.object({
    choice: z.string(),
    reason: z.string(),
  })),
  risks: z.array(z.string()),
  notDone: z.array(z.string()),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  concern: z.string().optional(),
  testsPassing: z.boolean(),
});

// Manager → Reviewer
export const ReviewerTaskSchema = z.object({
  implementerResult: ImplementerResultSchema,
  focusAreas: z.array(z.string()).optional(),
});

// Reviewer → Manager
export const ReviewerResultSchema = z.object({
  verdict: z.enum(['GREEN', 'YELLOW', 'RED']),
  testsRun: z.number(),
  testsPassing: z.number(),
  acceptanceCriteria: z.array(z.object({
    criterion: z.string(),
    passed: z.boolean(),
    note: z.string().optional(),
  })),
  blockers: z.array(z.string()),
  suggestions: z.array(z.string()),
});

// Generisk wrapper för alla meddelanden
export const AgentMessageSchema = z.object({
  from: z.string(),
  to: z.string(),
  timestamp: z.string().datetime(),
  payload: z.unknown(),
});
```

Exportera TypeScript-typer med `z.infer<>` så att compile-time-typkontroll fungerar.

### 2. Uppdatera `delegateToImplementer()` i `manager.ts`

**Före (rad ~896):**
```typescript
private async delegateToImplementer(input: { task: string }): Promise<string> {
```

**Efter:**
```typescript
private async delegateToImplementer(input: ImplementerTask): Promise<ImplementerResult> {
```

Flöde:
1. Manager skickar `ImplementerTask` (inte fritext)
2. Implementer skriver fortfarande `implementer_handoff.md` (för läsbarhet)
3. Implementer skriver OCKSÅ `implementer_result.json` med strukturerad data
4. Manager läser JSON, validerar med `ImplementerResultSchema.parse()`
5. Om parse misslyckas → fallback till fritext-handoff (bakåtkompatibelt)

### 3. Uppdatera `delegateToReviewer()` i `manager.ts`

Samma mönster:
1. Manager skickar `ReviewerTask` (inkluderar `ImplementerResult`)
2. Reviewer skriver `reviewer_result.json`
3. Manager läser och validerar med `ReviewerResultSchema.parse()`
4. Fallback till fritext om JSON saknas

### 4. Uppdatera Implementer-prompten (`prompts/implementer.md`)

Lägg till instruktion att skriva `implementer_result.json` vid sidan av befintlig
`implementer_handoff.md`. Definiera exakt JSON-format i prompten med ett exempel.

Behåll `implementer_handoff.md` — den är fortfarande användbar för mänsklig läsning.

### 5. Uppdatera Reviewer-prompten (`prompts/reviewer.md`)

Samma mönster: skriv `reviewer_result.json` vid sidan av befintlig handoff.

### 6. Logga meddelanden i audit.jsonl

Varje typat meddelande ska loggas som en audit-entry med:
```json
{
  "event": "agent_message",
  "from": "implementer",
  "to": "manager",
  "payload_type": "ImplementerResult",
  "timestamp": "..."
}
```

Payload-innehållet loggas INTE i audit (kan vara stort) — bara typen och metadata.

### 7. Uppdatera `verification-gate.ts`

Ersätt `string.includes('## Self-Check')` med Zod-validering:
- Om `implementer_result.json` finns → validera med schema
- Om inte → fallback till befintlig string-validering (bakåtkompatibelt)

### 8. Tester

Nya tester:

- `tests/core/messages.test.ts`:
  - Schema-validering: giltiga meddelanden passerar
  - Schema-validering: ogiltiga meddelanden avvisas (saknar fält, fel typer)
  - Varje schema testat med minst 2 giltiga + 2 ogiltiga exempel

- `tests/agents/manager.test.ts`:
  - `delegateToImplementer` returnerar typat `ImplementerResult`
  - `delegateToReviewer` returnerar typat `ReviewerResult`
  - Fallback till fritext om JSON saknas (bakåtkompatibilitet)

- `tests/core/verification-gate.test.ts`:
  - Validering via schema när JSON finns
  - Fallback till string-validering när JSON saknas

Befintliga 811 tester ska fortfarande passera.

## Avgränsningar

- Typa BARA Implementer- och Reviewer-kommunikation i denna brief
- Researcher, Tester, Merger, Historian, Librarian, Consolidator, BriefAgent får
  sina scheman i ett framtida steg
- Behåll markdown-handoff-filer parallellt (ta INTE bort dem)
- Ändra INTE AgentLoop eller SDK-integrationen — bara delegerings-funktionerna
- Parallella tasks (`delegateParallelWave`) har redan JSON — synka formatet men
  bryt inte befintligt flöde

## Verifiering

### Snabbkoll

```bash
pnpm test
pnpm typecheck
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `messages.ts` finns med Zod-scheman | Fil existerar, exporterar scheman |
| `ImplementerResultSchema` validerar korrekt | Enhetstest |
| `ReviewerResultSchema` validerar korrekt | Enhetstest |
| `delegateToImplementer` returnerar `ImplementerResult` | Enhetstest + typkontroll |
| `delegateToReviewer` returnerar `ReviewerResult` | Enhetstest + typkontroll |
| Fallback till fritext fungerar | Enhetstest |
| `verification-gate` använder schema om tillgängligt | Enhetstest |
| Agent-meddelanden loggas i audit.jsonl | Enhetstest |
| 811 befintliga tester passerar | `pnpm test` |

## Risk

**Medel.** Ändrar hur Manager kommunicerar med Implementer och Reviewer — kärnan i
orkestreringsflödet. Men fallback till fritext gör det bakåtkompatibelt: om agenten
inte skriver JSON-filen funkar allt som förut.

**Rollback:** `git revert <commit>` — inga databas- eller infrastrukturändringar.
