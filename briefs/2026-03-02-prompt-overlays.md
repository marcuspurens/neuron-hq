# Brief: S9 — Modell-specifika prompt-overlays

## Bakgrund

S5 (multi-provider) löste *vilken modell* varje agent kör. S7 (hierarchical prompts) löste *kontextoptimering* med ARCHIVE-markörer. Men alla agenter får idag exakt samma prompt oavsett om de kör Opus, Haiku eller en OpenAI-kompatibel modell.

Problemet: Haiku behöver kortare, mer explicita instruktioner. Opus klarar nuanserade resonemang. GPT-4 behöver annat tonfall. Utan modell-specifika overlays måste prompten vara en kompromiss som inte utnyttjar någon modells styrkor fullt ut.

S9 lägger till ett overlay-lager som automatiskt anpassar prompten baserat på aktiv modell.

## Scope

**Ingår:**
1. Overlay-laddningssystem (`src/core/prompt-overlays.ts`)
2. Overlay-filer i `prompts/overlays/` (minst `claude-opus.md` + `claude-haiku.md`)
3. Integration med `prompt-hierarchy.ts` (S7)
4. Uppdatering av alla 10 agenter att använda overlay-systemet
5. `model`-fält på knowledge graph-noder
6. Tester

**Ingår INTE:**
- Skriva om agenternas basprompts (bara lägga till overlay-stöd)
- Ändra S5:s model-registry eller agent-client
- Runtime prompt-switching (modell bestäms vid agentstart)

## Uppgifter

### 1. Prompt-overlay loader (`src/core/prompt-overlays.ts`)

Ny modul som laddar och mergar overlays med basprompts.

```typescript
export interface OverlayConfig {
  /** Model identifier, e.g. "claude-opus-4-6" */
  model: string;
  /** Agent role, e.g. "manager" */
  role: string;
}

/**
 * Resolves the overlay file path for a given model.
 * Maps model IDs to overlay families:
 *   "claude-opus-4-6" → "claude-opus"
 *   "claude-haiku-4-5-20251001" → "claude-haiku"
 *   "gpt-4o" → "gpt-4"
 * Returns undefined if no overlay file exists.
 */
export function resolveOverlayFamily(model: string): string | undefined;

/**
 * Loads a model-specific overlay for a given role.
 * Looks for: prompts/overlays/<family>/<role>.md
 * Falls back to: prompts/overlays/<family>/default.md
 * Returns undefined if neither exists.
 */
export async function loadOverlay(
  baseDir: string,
  config: OverlayConfig,
): Promise<string | undefined>;

/**
 * Merges base prompt with model overlay.
 * Strategy: overlay text is appended after core but before archive sections.
 * If no overlay exists, returns the base prompt unchanged.
 */
export function mergePromptWithOverlay(
  basePrompt: string,
  overlay: string | undefined,
): string;
```

Overlay-familjemappning (`resolveOverlayFamily`):
- `claude-opus-*` → `claude-opus`
- `claude-sonnet-*` → `claude-sonnet`
- `claude-haiku-*` → `claude-haiku`
- `gpt-4*` → `gpt-4`
- Okänd modell → `undefined` (ingen overlay)

### 2. Overlay-filstruktur

```
prompts/overlays/
├── claude-opus/
│   └── default.md        # Gäller alla Opus-agenter
├── claude-haiku/
│   ├── default.md        # Gäller alla Haiku-agenter
│   ├── manager.md        # Haiku-specifik Manager-override
│   └── implementer.md    # Haiku-specifik Implementer-override
└── README.md             # Förklaring av overlay-systemet
```

**Filformat** — enkel markdown utan ARCHIVE-markörer:

```markdown
## Model-Specific Instructions (Haiku)

- Keep responses concise — max 200 words per tool call
- Prefer explicit step-by-step reasoning over implicit leaps
- When uncertain, ask for clarification rather than guessing
- Avoid complex multi-step plans — break into smaller iterations
```

**Prioritetsordning vid laddning:**
1. `prompts/overlays/<family>/<role>.md` (mest specifik)
2. `prompts/overlays/<family>/default.md` (fallback för familjen)
3. Ingen overlay (basprompt oförändrad)

### 3. Integration med prompt-hierarchy (S7)

Uppdatera `buildHierarchicalPrompt` i `prompt-hierarchy.ts` att acceptera en valfri overlay:

```typescript
export function buildHierarchicalPrompt(
  hierarchy: PromptHierarchy,
  archiveSections?: string[],
  overlay?: string,        // ← nytt, valfritt
): string {
  const parts = [hierarchy.core];

  // Model overlay injiceras efter core, före archive
  if (overlay) {
    parts.push(overlay);
  }

  if (archiveSections) {
    for (const name of archiveSections) {
      const section = hierarchy.archive.get(name);
      if (section !== undefined) {
        parts.push(section);
      }
    }
  }

  return parts.join('\n\n');
}
```

### 4. Uppdatera agenter

Alla 10 agenter behöver veta vilken modell de kör för att ladda rätt overlay. Mönstret:

**Manager och Reviewer** (redan har hierarchical loading):
```typescript
// I manager.ts buildSystemPrompt():
const hierarchy = await loadPromptHierarchy(this.promptPath);
const overlay = await loadOverlay(this.baseDir, {
  model: this.modelConfig.model,
  role: 'manager',
});
const managerPrompt = buildHierarchicalPrompt(hierarchy, archiveSections, overlay);
```

**Övriga 8 agenter** (enkla prompt-filer):
```typescript
// I implementer.ts getSystemPrompt():
const base = await fs.readFile(this.promptPath, 'utf-8');
const overlay = await loadOverlay(this.baseDir, {
  model: this.modelConfig.model,
  role: 'implementer',
});
return mergePromptWithOverlay(base, overlay);
```

Varje agent har redan tillgång till sin `ModelConfig` via S5:s `resolveModelConfig()`. Det som behövs:
- Spara `ModelConfig` som instansvariabel (om det inte redan görs)
- Anropa `loadOverlay()` + `mergePromptWithOverlay()` vid prompt-laddning

### 5. Knowledge graph: `model`-fält

Lägg till `model` som valfritt fält i `KGNodeSchema`:

```typescript
export const KGNodeSchema = z.object({
  id: z.string().min(1),
  type: NodeTypeSchema,
  title: z.string().min(1),
  properties: z.record(z.unknown()),
  created: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  updated: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  confidence: z.number().min(0).max(1),
  scope: NodeScopeSchema.default('unknown'),
  model: z.string().optional(),           // ← nytt
});
```

Historian ska sätta `model` när den skapar noder:
```typescript
// historian.ts — vid nodskapande
const node: KGNode = {
  // ...existing fields...
  model: this.modelConfig.model,  // "claude-opus-4-6", "claude-haiku-4-5-20251001", etc.
};
```

### 6. Tester

Filer att skapa:
- `tests/core/prompt-overlays.test.ts` — overlay loader + merge
- Uppdatera `tests/core/prompt-hierarchy.test.ts` — overlay-parameter i `buildHierarchicalPrompt`
- Uppdatera `tests/core/knowledge-graph.test.ts` — `model`-fält

Testfall för `prompt-overlays.test.ts`:
- `resolveOverlayFamily` mappar korrekt (opus, haiku, sonnet, gpt-4, okänd)
- `loadOverlay` hittar role-specifik fil
- `loadOverlay` faller tillbaka till default.md
- `loadOverlay` returnerar undefined om ingen overlay finns
- `mergePromptWithOverlay` appendar overlay efter base
- `mergePromptWithOverlay` returnerar base oförändrad om overlay är undefined

Testfall för uppdaterad `buildHierarchicalPrompt`:
- Med overlay: core + overlay + archive-sektioner i rätt ordning
- Utan overlay: beteende oförändrat (bakåtkompatibelt)

Testfall för knowledge graph:
- Nod med `model`-fält validerar OK
- Nod utan `model`-fält validerar OK (valfritt)
- Befintliga tester fortsätter passera

## Acceptanskriterier

- [ ] `src/core/prompt-overlays.ts` existerar med `resolveOverlayFamily`, `loadOverlay`, `mergePromptWithOverlay`
- [ ] `prompts/overlays/claude-opus/default.md` existerar
- [ ] `prompts/overlays/claude-haiku/default.md` existerar
- [ ] `buildHierarchicalPrompt` accepterar valfri `overlay`-parameter
- [ ] Manager och Reviewer laddar overlay via hierarchical system
- [ ] Övriga 8 agenter laddar overlay via `mergePromptWithOverlay`
- [ ] `KGNodeSchema` har valfritt `model`-fält
- [ ] Alla befintliga tester passerar (bakåtkompatibilitet)
- [ ] Minst 15 nya tester
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm lint` passerar

## Risk

**Medium.** Bygger på S5 ✅ och S7 ✅ som redan är klara. Huvudrisk:

1. **Overlay-merge kan förvirra modellen** — Om overlay + basprompt har motstridiga instruktioner. Mitigation: overlays ska komplettera, inte motsäga.
2. **Filsystemsanrop per agent-start** — Varje agent gör 1–2 extra `readFile`. Mitigation: filerna är små (<1 KB), negligerbar kostnad.
3. **Bakåtkompatibilitet** — `buildHierarchicalPrompt` får ny parameter. Mitigation: parametern är valfri, default `undefined`.

## Baseline

```bash
pnpm test
```

Förväntat baseline: **781+ passed**.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-02-prompt-overlays.md --hours 1
```
