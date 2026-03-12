# Brief: S7 — Hierarkisk kontext

## Bakgrund

Varje agent laddas idag med hela sin prompt-fil som systemprompt — Manager
(234 rader), Reviewer (290 rader), etc. Alla sektioner laddas oavsett om de
behövs i den aktuella iterationen. Exempel:

- Manager-promptens "Auto-trigger Librarian" (20 rader) laddas varje
  iteration, men behövs bara vid milestone-körningar
- Reviewers "Two-Phase Commit" (13 rader) laddas alltid, men triggas bara
  vid HIGH risk
- Reviewers "Verification without existing tests" (8 rader) laddas alltid,
  men behövs bara om baseline saknar tester

**Problem:** Onödiga tokens slösar kontext som kunde använts till
meddelandehistorik. Med fler prompt-tillägg (S1–S6) växer promptarna.

**Lösning:** Dela varje prompt-fil i **core** (alltid laddad) och **archive**
(laddas vid behov). Markera sektioner i prompt-filen med taggar. En ny
`loadPromptHierarchy()` funktion returnerar core + en Map av arkiv-sektioner.
Agenter kan sedan ladda arkiv-sektioner dynamiskt.

**Inspiration:** Letta/MemGPT — core memory (alltid i kontext) vs archival
memory (hämtas vid behov). Vi tillämpar samma princip på systemprompts.

## Scope

Ny utility-funktion för prompt-hierarki + omstrukturering av Manager-
och Reviewer-prompterna med arkiv-markörer. Övriga promptar (implementer,
researcher, etc.) lämnas orörda i denna iteration.

## Uppgifter

### 1. Prompt-hierarki-funktion

Skapa `src/core/prompt-hierarchy.ts`:

```typescript
import { readFile } from 'node:fs/promises';

export interface PromptHierarchy {
  /** Always-loaded core sections */
  core: string;
  /** Archive sections keyed by name, loaded on demand */
  archive: Map<string, string>;
}

/**
 * Parses a prompt file into core and archive sections.
 *
 * Format: Sections between `<!-- ARCHIVE: name -->` and `<!-- /ARCHIVE -->`
 * markers are extracted into the archive map. Everything else is core.
 *
 * Example prompt file:
 * ```markdown
 * # Your Role
 * You are the Manager agent...
 *
 * <!-- ARCHIVE: task-planning -->
 * ## Task Planning
 * When creating a task plan...
 * <!-- /ARCHIVE -->
 *
 * ## Core Principles
 * 1. Small iterations...
 * ```
 *
 * Returns: { core: "# Your Role\n...\n## Core Principles\n...",
 *            archive: Map { "task-planning" => "## Task Planning\n..." } }
 */
export function parsePromptHierarchy(content: string): PromptHierarchy;

/**
 * Loads a prompt file and parses it into core + archive.
 */
export async function loadPromptHierarchy(
  promptPath: string
): Promise<PromptHierarchy>;

/**
 * Builds a system prompt from core + selected archive sections.
 * Archive sections are appended in order after core.
 */
export function buildHierarchicalPrompt(
  hierarchy: PromptHierarchy,
  archiveSections?: string[]
): string;
```

### 2. Manager-prompt omstrukturering

I `prompts/manager.md`, markera dessa sektioner som arkiv:

| Sektion | Arkivnamn | Trigger |
|---------|-----------|---------|
| Task Planning (rad ~21–51) | `task-planning` | Innan första delegering |
| Consult Knowledge Graph (rad ~75–100) | `knowledge-graph` | Under orienteringsfas |
| After Researcher Completes (rad ~121–130) | `after-researcher` | När Researcher rapporterar klart |
| Auto-trigger Librarian (rad ~160–179) | `auto-librarian` | Brief innehåller `⚡ Auto-trigger:` |
| Auto-trigger Meta-analys (rad ~181–189) | `auto-meta` | Brief innehåller `⚡ Meta-trigger:` |
| When target has no tests (rad ~191–197) | `no-tests` | Baseline visar `testsExist: false` |

**Viktigt:** Byt INTE plats på sektioner — behåll ordningen. Lägg bara till
`<!-- ARCHIVE: namn -->` och `<!-- /ARCHIVE -->` runt respektive sektion.

### 3. Reviewer-prompt omstrukturering

I `prompts/reviewer.md`, markera dessa sektioner som arkiv:

| Sektion | Arkivnamn | Trigger |
|---------|-----------|---------|
| Two-Phase Commit (rad ~113–125) | `two-phase` | Risk klassificerad som HIGH |
| Verification without existing tests (rad ~234–241) | `no-tests` | Baseline saknar tester |
| Handoff to Manager (rad ~244–270) | `handoff` | Efter report.md är skriven |
| Before You Write Your Verdict (rad ~272–283) | `self-check` | Innan slutgiltig dom |

### 4. Uppdatera buildSystemPrompt i manager.ts

I `src/core/agents/manager.ts`, uppdatera `buildSystemPrompt()`:

```typescript
// Instead of loading the whole prompt:
// const agentPrompt = await this.loadPrompt();

// Load hierarchically:
import { loadPromptHierarchy, buildHierarchicalPrompt } from '../prompt-hierarchy.js';

const hierarchy = await loadPromptHierarchy(this.promptPath);

// Decide which archive sections to include based on context
const archiveSections: string[] = [];

// Always include task-planning and knowledge-graph in first iteration
if (this.iteration <= 1) {
  archiveSections.push('task-planning', 'knowledge-graph');
}

// Include auto-trigger sections if brief mentions them
if (this.briefContent?.includes('⚡ Auto-trigger:')) {
  archiveSections.push('auto-librarian');
}
if (this.briefContent?.includes('⚡ Meta-trigger:')) {
  archiveSections.push('auto-meta');
}

// Include no-tests if baseline says so
if (!this.baselineHasTests) {
  archiveSections.push('no-tests');
}

const agentPrompt = buildHierarchicalPrompt(hierarchy, archiveSections);
```

### 5. Uppdatera buildSystemPrompt i reviewer.ts

I `src/core/agents/reviewer.ts`, liknande uppdatering:

```typescript
const hierarchy = await loadPromptHierarchy(this.promptPath);
const archiveSections: string[] = [];

// HIGH risk → include two-phase
if (this.riskLevel === 'HIGH') {
  archiveSections.push('two-phase');
}

// No tests → include no-tests section
if (!this.baselineHasTests) {
  archiveSections.push('no-tests');
}

// Always include self-check (small, high value)
archiveSections.push('self-check', 'handoff');

const agentPrompt = buildHierarchicalPrompt(hierarchy, archiveSections);
```

### 6. Tester

Skriv tester i `tests/core/prompt-hierarchy.test.ts`:

1. `parsePromptHierarchy` — prompt utan arkiv → core = allt, archive = tom Map
2. `parsePromptHierarchy` — prompt med en arkivsektion → core exkluderar sektionen, archive har den
3. `parsePromptHierarchy` — prompt med flera arkivsektioner → alla extraheras
4. `parsePromptHierarchy` — arkivsektion mitt i prompten → core bevarar text före och efter
5. `parsePromptHierarchy` — nested markers ignoreras (robusthet)
6. `parsePromptHierarchy` — whitespace runt markörer hanteras korrekt
7. `buildHierarchicalPrompt` — utan arkivsektioner → returnerar bara core
8. `buildHierarchicalPrompt` — med arkivsektioner → core + valda sektioner
9. `buildHierarchicalPrompt` — okänd arkivsektion ignoreras tyst
10. `buildHierarchicalPrompt` — ordningen bevaras (sektioner appendas i angiven ordning)
11. `loadPromptHierarchy` — läser fil och returnerar PromptHierarchy
12. `loadPromptHierarchy` — fil utan arkivmarkörer → allt är core
13. Integration: Manager-prompten har minst 5 arkivsektioner efter omstrukturering
14. Integration: Reviewer-prompten har minst 3 arkivsektioner efter omstrukturering
15. Integration: Core-delen av Manager-prompten innehåller "Your Role" och "Core Principles"
16. Integration: Core-delen av Reviewer-prompten innehåller "Your Role" och "Blocking Criteria"
17. Integration: `buildHierarchicalPrompt` med alla Manager-arkiv = samma innehåll som original (minus markörer)

## Acceptanskriterier

- [ ] `src/core/prompt-hierarchy.ts` existerar med `parsePromptHierarchy()`, `loadPromptHierarchy()`, `buildHierarchicalPrompt()`
- [ ] `prompts/manager.md` har minst 5 sektioner markerade med `<!-- ARCHIVE: namn -->` / `<!-- /ARCHIVE -->`
- [ ] `prompts/reviewer.md` har minst 3 sektioner markerade med `<!-- ARCHIVE: namn -->` / `<!-- /ARCHIVE -->`
- [ ] `src/core/agents/manager.ts` använder `loadPromptHierarchy()` istället för `loadPrompt()`
- [ ] `src/core/agents/reviewer.ts` använder `loadPromptHierarchy()` istället för `loadPrompt()`
- [ ] Manager-promptens core-del är minst 30% kortare än hela prompten
- [ ] 17+ tester i `tests/core/prompt-hierarchy.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Medium.** Prompt-omstruktureringen ändrar inte innehållet — bara hur det
laddas. Markörer (`<!-- ARCHIVE: -->`) är HTML-kommentarer och syns inte i
rendering. Risken ligger i att agenter kan missa viktig kontext om
arkiv-triggers inte matchar rätt. Därför inkluderar vi generösa triggers
(t.ex. Reviewer laddar alltid `self-check` och `handoff`).

Fallback: Om `loadPromptHierarchy()` inte hittar markörer returnerar den
hela filen som core — bakåtkompatibelt med omodifierade promptar.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 631+ passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-01-hierarchical-context.md --hours 1
```
