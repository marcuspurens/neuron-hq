# F2: Adaptiv Manager — statistik-driven delegering

## Bakgrund

Neuron HQ:s Manager-agent delegerar idag "blint" — den vet ingenting om hur bra agenterna brukar prestera. Sedan F1 (session 80) har vi ett Bayesiskt statistiksystem med 14 dimensioner och 170+ körningar. Exempel på aktuella beliefs:

| Dimension | Confidence | Körningar |
|-----------|-----------|-----------|
| agent:implementer | 0.94 | 170 |
| agent:librarian | 0.77 | 33 |
| brief:feature | 0.52 | 16 |
| agent:researcher | 0.47 | 22 |
| agent:consolidator | 0.43 | 17 |

Managern bör använda denna data för att fatta bättre beslut: varna vid svaga dimensioner, anpassa delegeringsstrategi, och ge agenter extra kontext.

## Uppgifter

### 1. Skapa `src/core/agents/adaptive-hints.ts`

En ren, testbar modul som tar beliefs och returnerar text-hints till Managerns systemprompt.

```typescript
export interface AdaptiveHints {
  /** Textblock att injicera i Managerns systemprompt */
  promptSection: string;
  /** Dimensioner med confidence < 0.5 */
  warnings: Array<{ dimension: string; confidence: number; suggestion: string }>;
  /** Dimensioner med confidence > 0.85 */
  strengths: string[];
}

/**
 * Generera adaptiva hints baserat på aktuella beliefs.
 * Ren funktion — ingen I/O, inga side-effects.
 */
export function generateAdaptiveHints(
  beliefs: RunBelief[],
  briefType: BriefType,
): AdaptiveHints
```

**Regler för hints:**

#### Agentvarningar (confidence < 0.5)
- `agent:researcher` låg → "Consider whether research is truly needed. Researcher has low success rate ({confidence}). If you do delegate, provide very specific search queries."
- `agent:consolidator` låg → "Consolidator has low success rate ({confidence}). Only delegate if knowledge graph truly needs consolidation."
- Generisk agent låg → "Agent {name} has below-average confidence ({confidence}). Monitor output carefully."

#### Brief-typ-varningar (confidence < 0.5)
- `brief:feature` låg → "Feature briefs have historically been challenging ({confidence}). Break into smaller tasks and verify each step."
- `brief:test` låg → "Test briefs sometimes fail. Ensure test framework is correctly detected before delegating."

#### Styrkor (confidence > 0.85)
- Listas som "Strengths: {dimension} ({confidence})" — ren information, ingen åtgärd.

#### Allmän statistik
- Sammanfatta: "Based on {N} runs: {successes} GREEN, {failures} non-GREEN."

### 2. Integrera i Manager

I `manager.ts`, metoden `buildSystemPrompt()`:

```typescript
// Efter befintlig contextInfo, före return:
const beliefs = await getBeliefs();
const briefType = await classifyBrief(path.join(this.ctx.runDir, 'brief.md'));
const hints = generateAdaptiveHints(beliefs, briefType);
// Lägg till hints.promptSection i systemprompten
```

**Villkor:** Om databasen inte är tillgänglig (`beliefs` är tom array), hoppa över — ingen förändring i beteende.

### 3. Logga hints till audit

När hints genereras, logga till audit:

```typescript
await this.ctx.audit.log({
  ts: new Date().toISOString(),
  role: 'manager',
  tool: 'adaptive_hints',
  allowed: true,
  note: `Generated ${hints.warnings.length} warnings, ${hints.strengths.length} strengths`,
});
```

### 4. Tester

**`tests/core/agents/adaptive-hints.test.ts`:**

- **Tom beliefs-array** → `promptSection` är tom eller minimal, inga warnings
- **Alla beliefs höga (>0.85)** → inga warnings, bara strengths
- **`agent:researcher` med 0.40** → warning med specifik researcher-text
- **`agent:consolidator` med 0.35** → warning med specifik consolidator-text
- **`brief:feature` med 0.45** → warning om feature briefs
- **Blandade beliefs** → rätt antal warnings + strengths
- **`briefType` påverkar output** — en `feature`-brief med låg `brief:feature`-confidence genererar warning
- **`briefType` som inte matchar** — en `refactor`-brief ignorerar låg `brief:feature`
- **Confidence exakt 0.5** → ingen warning (gränsvärde)
- **Confidence exakt 0.85** → ingen strength (gränsvärde)

**`tests/core/agents/manager-adaptive.test.ts`:**

- `buildSystemPrompt()` inkluderar adaptive hints-sektion när beliefs finns
- `buildSystemPrompt()` fungerar utan databas (graceful degradation)
- Audit-loggning sker vid hints-generering

## Avgränsningar

- Managern **läser** statistik men **ändrar INTE sitt beteende programmatiskt** — den får hints i prompten och bestämmer själv. Ingen if/else-logik som blockerar delegering.
- Inga nya databas-tabeller.
- Inga ändringar i `run-statistics.ts`.
- Hints är enbart engelska (Managerns prompt är på engelska).
- Ingen UI — hints syns i Managerns systemprompt och audit-loggen.

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `adaptive-hints.ts` skapad med `generateAdaptiveHints()` | Fil finns |
| Manager inkluderar hints i systemprompt | Grep i manager.ts |
| Graceful degradation utan databas | Test |
| Audit-loggning av hints | Test |
| ≥12 nya tester | `pnpm test` |
| Alla 1815 befintliga tester gröna | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |

## Risk

**Låg–Medel.** Ändring i `manager.ts` (buildSystemPrompt), men:
- Beteendeförändringen är mjuk (prompttext, inte logik)
- Graceful degradation om DB saknas
- Alla befintliga tester verifierar att inget går sönder

**Rollback:** Ta bort `adaptive-hints.ts` + revert ändringarna i `manager.ts`.
