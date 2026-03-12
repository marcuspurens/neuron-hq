# Brief: Reviewer → Manager handoff

## Bakgrund

Implementer skriver redan en strukturerad `implementer_handoff.md` som Manager läser efter
delegering. Men Reviewer returnerar bara strängen `'Reviewer agent completed successfully.'`
till Manager — ingen strukturerad data om verdict, risk eller missade kriterier.

Det betyder att Manager inte vet:
- Om resultatet var GREEN, YELLOW eller RED
- Vilka acceptanskriterier som missades (om några)
- Vilken risknivå Reviewer bedömde
- Om Reviewer rekommenderar merge, iteration eller undersökning

**Problem:** Manager kan inte fatta informerade beslut om nästa steg efter review.

## Scope

Reviewer skriver en `reviewer_handoff.md` efter granskning. Manager läser den.

## Uppgifter

### 1. Reviewer skriver handoff-fil

I `src/core/agents/reviewer.ts`, efter att Reviewer skrivit `report.md`, skriv också
`reviewer_handoff.md` i run-katalogen.

Instruera Reviewer via `prompts/reviewer.md` att skriva filen med denna struktur:

```markdown
# Reviewer Handoff — [runid]

## Verdict
- **Status**: GREEN / YELLOW / RED
- **Confidence**: HIGH / MEDIUM / LOW
- **Summary**: [En mening]

## Acceptance Criteria
| Criterion | Status | Note |
|-----------|--------|------|
| (från brief) | PASS/FAIL | Kort kommentar |

## Risk
- **Level**: LOW / MEDIUM / HIGH
- **Reason**: [Om MEDIUM/HIGH, varför]

## Recommendation
- **Action**: MERGE / ITERATE / INVESTIGATE
- **If iterate**: [vad som behöver fixas]
```

### 2. Manager läser reviewer_handoff.md

I `src/core/agents/manager.ts`, i `delegateToReviewer()` (rad ~762–774):

```typescript
// Efter reviewer.run(), läs handoff
const handoffPath = path.join(this.ctx.runDir, 'reviewer_handoff.md');
try {
    const handoff = await fs.readFile(handoffPath, 'utf-8');
    return `Reviewer agent completed.\n\n--- REVIEWER HANDOFF ---\n${handoff}`;
} catch {
    return 'Reviewer agent completed successfully. (No handoff written)';
}
```

Samma mönster som redan finns för `implementer_handoff.md` (rad ~750–756).

### 3. Uppdatera Manager-prompt

I `prompts/manager.md`, lägg till en sektion:

```markdown
### Reviewer Handoff
After Review, you will receive a `--- REVIEWER HANDOFF ---` block containing:
- **Verdict** (GREEN/YELLOW/RED) and confidence
- **Acceptance criteria** status per criterion
- **Risk** assessment
- **Recommendation** (MERGE/ITERATE/INVESTIGATE)

Use this to decide next steps:
- GREEN + MERGE → Proceed to Merger
- YELLOW + ITERATE → Re-delegate to Implementer with specific fixes
- RED + INVESTIGATE → Research the issue before re-implementing
```

### 4. Tester

Skriv tester i `tests/agents/reviewer-handoff.test.ts`:

1. Reviewer-prompten innehåller instruktion att skriva `reviewer_handoff.md`
2. Manager-prompten innehåller "Reviewer Handoff"-sektion
3. `delegateToReviewer` returnerar handoff-innehåll (mock test)
4. Handoff-template innehåller Verdict, Acceptance Criteria, Risk, Recommendation
5. Fallback om handoff saknas returnerar "(No handoff written)"

## Acceptanskriterier

- [ ] `prompts/reviewer.md` innehåller instruktion att skriva `reviewer_handoff.md`
- [ ] `prompts/manager.md` innehåller "Reviewer Handoff"-sektion
- [ ] `src/core/agents/manager.ts` läser `reviewer_handoff.md` i `delegateToReviewer()`
- [ ] 5+ tester i `tests/agents/reviewer-handoff.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Low.** Additivt — lägger till en fil och en läsning. Befintligt beteende ändras inte om
handoff-filen saknas (graceful fallback).

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 474 passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-28-reviewer-handoff.md --hours 1
```
