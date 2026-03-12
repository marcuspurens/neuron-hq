# TD-13: Extrahera gemensam agentverktygskod

## Bakgrund

Alla 6 standard-agenter (implementer, researcher, reviewer, tester, manager, merger) plus historian, librarian och consolidator har identiska eller nästan identiska implementationer av `executeReadFile`, `executeWriteFile`, `executeListFiles` och `executeBash`. Dessutom dupliceras verktygs-definitionerna (schemas för `bash_exec`, `read_file`, `write_file`, `list_files`) i varje agent.

Totalt uppskattningsvis **~500 rader duplicerad kod** bara i execute-funktionerna och tool-definitionerna. En ändring som TD-8 (catch-typer) krävde edits i 8 filer istället för 1.

### Nuläge

`agent-utils.ts` (211 rader) har redan delad kod: `truncateToolResult()`, `trimMessages()`, `withRetry()`, `searchMemoryFiles()`. Men ingen gemensam bas för tool-execution eller tool-definitioner finns.

### Variationer att hantera

| Funktion | Variation | Lösning |
|----------|-----------|---------|
| `executeBash` | Implementer/Researcher truncaterar stdout, Tester inkluderar stderr | Options-objekt: `{ truncate?: boolean, includeStderr?: boolean }` |
| `executeReadFile` | Implementer/Researcher truncaterar, övriga ej | Options-objekt: `{ truncate?: boolean }` |
| `executeWriteFile` | Olika baskataloger (workspaceDir vs runDir) | Parameter: `baseDir: string` |
| `executeListFiles` | 100% identisk i alla 4 agenter | Direkt extraktion |

## Uppgifter

### 1. Skapa `src/core/agents/shared-tools.ts`

Gemensamma execute-funktioner:

```typescript
export interface AgentToolContext {
  ctx: RunContext;           // workspaceDir, runDir, policy, etc.
  agentRole: string;         // för audit-loggning
}

export interface BashOptions {
  truncate?: boolean;        // default false
  includeStderr?: boolean;   // default false
}

export interface ReadFileOptions {
  truncate?: boolean;        // default false
}

// Gemensamma execute-funktioner
export async function executeSharedBash(
  toolCtx: AgentToolContext,
  command: string,
  options?: BashOptions
): Promise<string>

export async function executeSharedReadFile(
  toolCtx: AgentToolContext,
  filePath: string,
  options?: ReadFileOptions
): Promise<string>

export async function executeSharedWriteFile(
  toolCtx: AgentToolContext,
  filePath: string,
  content: string,
  baseDir: string
): Promise<string>

export async function executeSharedListFiles(
  toolCtx: AgentToolContext,
  dirPath: string
): Promise<string>
```

### 2. Skapa gemensamma tool-definitioner

```typescript
// Schemas som konstanter
export function coreToolDefinitions(roleDescription?: {
  bash?: string;
  readFile?: string;
  writeFile?: string;
  listFiles?: string;
}): ToolDefinition[]
```

Returnerar de 4 standard-verktygen med rollspecifika beskrivningar (om angivna) eller default-beskrivningar.

### 3. Migrera 6 agenter att använda shared-tools

Migrera i ordning (enklast till mest komplex):

1. **tester.ts** — Enkel agent, bra startpunkt. Använd `includeStderr: true`, `baseDir: ctx.runDir`
2. **reviewer.ts** — Enkel, inga specialfall
3. **researcher.ts** — Använder `truncate: true`
4. **implementer.ts** — Använder `truncate: true`, har GraphRAG-tools
5. **merger.ts** — Har 2 unika tools (`copy_to_target`, `merge_task_branch`), resten standard
6. **manager.ts** — Mest komplex, många specialverktyg. Migrera bara de 4 gemensamma

**Ej i scope:** historian, librarian, consolidator, brief-agent (kan göras i framtiden).

### 4. Behåll agent-specifik logik

Varje agent behåller:
- `runAgentLoop()` — agentens huvudloop
- `buildSystemPrompt()` — rollspecifik prompt
- `defineTools()` — anropar `coreToolDefinitions()` + lägger till egna verktyg
- `executeTools()` — dispatcher som anropar shared-funktioner + egna handlers

### 5. Tester

**Enhetstester för shared-tools.ts:**
- `executeSharedBash()` — policy-block, audit-loggning, timeout, truncate on/off, includeStderr on/off
- `executeSharedReadFile()` — path-validering, truncate on/off, audit-loggning
- `executeSharedWriteFile()` — policy-block, baseDir-hantering, mkdir, audit-loggning
- `executeSharedListFiles()` — katalog-listing, audit-loggning
- `coreToolDefinitions()` — returnerar 4 verktyg, custom descriptions fungerar

**Regressionstester:**
- Alla befintliga 1726 tester ska fortfarande vara gröna

## Avgränsningar

- Extrahera INTE `executeTools()` dispatcher — varje agent har unika tool-namn i sin switch
- Extrahera INTE `runAgentLoop()` — variationerna är för stora
- Migrera INTE historian/librarian/consolidator/brief-agent (framtida TD)
- Ändra INTE beteende — bara flytta kod

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `shared-tools.ts` skapad med 4 execute-funktioner + `coreToolDefinitions()` | Fil finns |
| 6 agenter använder shared-tools | Grep: inga egna `executeReadFile` etc. i de 6 filerna |
| Alla 1726 befintliga tester gröna | `pnpm test` |
| ≥10 nya tester för shared-tools | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |
| Netto minskning ≥150 rader i agentfilerna | `git diff --stat` |

## Risk

**Låg.** Ren refaktorering — inget beteende ändras. Alla befintliga tester verifierar att beteendet bevaras.

**Rollback:** Revertera commiten. Ingen funktionalitet påverkas.
