# Brief: Agent self-reflection & verification gates

## Bakgrund

Neuron HQ:s agenter arbetar idag i en linjär pipeline: Manager → Implementer → Reviewer → Merger.
Varje agent gör sitt jobb och lämnar ifrån sig. Det som saknas är **systematisk självkontroll**
innan en agent rapporterar sig klar.

Forskning visar att enkla reflektionssteg ("Innan du slutför — har jag missat något?") ger
mätbar kvalitetsförbättring. Kombinerat med striktare verifieringsportar (verification gates)
kan vi fånga fler problem utan att lägga till nya agenter.

**Problem idag:**
- Implementer kör tester men reflekterar inte över om lösningen matchar briefens intent
- Reviewer kontrollerar policy men frågar sig inte "missade jag en edge case?"
- Manager delegerar utan att dubbelkolla sin plan mot briefens acceptanskriterier
- Ingen agent har en explicit "checklista innan jag lämnar ifrån mig"

## Scope

Lägg till self-reflection-steg i alla tre huvudagenter (Manager, Implementer, Reviewer)
via prompt-uppdateringar + en ny verifieringsgate-funktion.

## Uppgifter

### 1. Self-reflection i Implementer-prompt

I `prompts/implementer.md`, lägg till en sektion **Before You Report Done**:

```markdown
### Before You Report Done
Stop and check:
1. Re-read the acceptance criteria from brief.md — did you address ALL of them?
2. Are there edge cases you didn't test?
3. Does your code match existing patterns in the repo, or did you introduce a new pattern?
4. Would a reviewer immediately spot something you missed?

Write your reflection in the implementer_handoff.md under a ## Self-Check section:
- Criteria covered: [list]
- Criteria NOT covered (if any): [list with reason]
- Confidence: HIGH / MEDIUM / LOW
- Concern: [one thing you're least sure about, or "None"]
```

### 2. Self-reflection i Reviewer-prompt

I `prompts/reviewer.md`, lägg till en sektion **Before You Write Your Verdict**:

```markdown
### Before You Write Your Verdict
Stop and check:
1. Did you actually RUN the tests, or just read the code?
2. Did you check EVERY acceptance criterion from brief.md?
3. Are there integration risks you haven't considered?
4. Is there a subtle bug hiding behind passing tests?

Add a ## Self-Check section to your report.md:
- Tests run: YES / NO (with output summary)
- Acceptance criteria checked: [x/y]
- Missed criterion: [list, or "None"]
- Gut feeling: [one concern, or "Clean"]
```

### 3. Self-reflection i Manager-prompt

I `prompts/manager.md`, lägg till en sektion **Before You Delegate**:

```markdown
### Before You Delegate
Stop and check:
1. Does your task breakdown cover ALL acceptance criteria from the brief?
2. Is each work item small enough for one Implementer pass (<150 lines)?
3. Did you consult the knowledge graph for relevant patterns?
4. Is there an acceptance criterion you're unsure how to verify?

Document any gaps in questions.md before delegating.
```

### 4. Verification gate utility

Skapa `src/core/verification-gate.ts`:

```typescript
/**
 * Checks that a handoff file contains required self-check sections.
 * Returns missing sections or empty array if all present.
 */
export function validateHandoff(content: string, requiredSections: string[]): string[] {
  const missing: string[] = [];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      missing.push(section);
    }
  }
  return missing;
}

export const IMPLEMENTER_REQUIRED = ['## Self-Check', 'Confidence:'];
export const REVIEWER_REQUIRED = ['## Self-Check', 'Tests run:', 'Acceptance criteria checked:'];
```

### 5. Manager använder verification gate

I `src/core/agents/manager.ts`, i `delegateToImplementer()` (efter att handoff lästs):

```typescript
import { validateHandoff, IMPLEMENTER_REQUIRED } from '../verification-gate.js';

// After reading implementer_handoff.md:
const missing = validateHandoff(handoff, IMPLEMENTER_REQUIRED);
if (missing.length > 0) {
  return `Implementer completed but handoff missing sections: ${missing.join(', ')}. Consider re-delegating.`;
}
```

Samma mönster i `delegateToReviewer()` med `REVIEWER_REQUIRED`.

### 6. Tester

Skriv tester i `tests/core/verification-gate.test.ts`:

1. `validateHandoff` returnerar tom array om alla sektioner finns
2. `validateHandoff` returnerar saknade sektioner
3. `IMPLEMENTER_REQUIRED` innehåller `## Self-Check` och `Confidence:`
4. `REVIEWER_REQUIRED` innehåller `## Self-Check` och `Tests run:`
5. Manager-prompten innehåller "Before You Delegate"
6. Implementer-prompten innehåller "Before You Report Done"
7. Reviewer-prompten innehåller "Before You Write Your Verdict"
8. Handoff med alla sektioner passerar validering (integration test)

## Acceptanskriterier

- [ ] `prompts/implementer.md` innehåller "Before You Report Done" med self-check-instruktioner
- [ ] `prompts/reviewer.md` innehåller "Before You Write Your Verdict" med self-check-instruktioner
- [ ] `prompts/manager.md` innehåller "Before You Delegate" med self-check-instruktioner
- [ ] `src/core/verification-gate.ts` existerar med `validateHandoff()`
- [ ] Manager använder `validateHandoff()` för Implementer- och Reviewer-handoffs
- [ ] 8+ tester i `tests/core/verification-gate.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Low.** Prompt-uppdateringar är additivt — agenter som redan skriver bra handoffs påverkas inte negativt.
Verification gate loggar varning men blockerar inte (Manager kan välja att fortsätta ändå).

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 474 passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-28-agent-self-reflection.md --hours 1
```
