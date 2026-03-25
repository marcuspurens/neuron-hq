# Brief: Code Anchor härdning — bash-policycheck + output-bevarande

**Target:** neuron-hq
**Effort:** 1 körning
**Roadmap:** Infrastruktur — agentförbättring
**Prioritet:** MEDEL — säkerhetsgap + dataförlust i verifieringsrapporter

## Bakgrund

Code Anchor är en standalone verifieringsagent som kontrollerar att briefs stämmer mot faktisk kod. Den skapades i session 135 och har bevisat sitt värde (4 BLOCK + 3 WARN i S136, inga fel i S148). Men en djupanalys i session 149 identifierade 2 problem som bör fixas:

### Problem 1: bash_exec utan policycheck

Alla andra agenter som kör bash (Implementer, Merger, Reviewer, Tester, Manager, Librarian m.fl.) använder `executeSharedBash()` i `src/core/agents/shared-tools.ts` rad 49-98. Denna funktion validerar varje kommando mot `policy/bash_allowlist.txt` och `policy/forbidden_patterns.txt` via `ctx.policy.checkBashCommand()`.

Code Anchor kör bash direkt via `execAsync()` i `src/core/agents/code-anchor.ts` rad 223-241. Ingen validering. Prompten säger "read-only: grep, find, wc, head, tail, cat" men koden tvingar det inte.

Anledningen: Code Anchor är standalone (inget `RunContext`/`PolicyEnforcer`). Men att ha en öppen bash-kanal bryter mot Neurons princip att ALLA bash-kommandon MÅSTE matcha allowlist.

### Problem 2: Verifieringsrapport försvinner

`runAgentLoop()` i code-anchor.ts rad 260-343 har en variabel `lastTextResponse` (rad 264) som **skrivs över** vid varje iteration. Efter 40 iterationer innehåller den bara den sista text-outputen. Mellanliggande verifieringstext (som kan innehålla kodcitat och fynd) är borta.

Dessutom: `trimMessages()` (agent-utils.ts:127) raderar äldre tool-resultat efter 6 stycken (via `clearOldToolResults()` rad 74-126). Med 40 iterationer à 2-5 tool calls per iteration = ~100+ tool results, varav 94+ raderas.

S148 rapporterade: *"40 iterationer, outputen trunkerades (1 turn/154 tecken sparades)"* — hela verifieringsrapporten gick förlorad.

## Designbeslut

### 1. Lightweight readonly-allowlist i code-anchor.ts

Skapa en **ny privat statisk metod** `checkReadonlyCommand(command: string): { allowed: boolean; reason?: string }` i `CodeAnchor`-klassen. Den testar mot en hårdkodad lista av tillåtna kommandon — samma regex-approach och returtyp som `PolicyEnforcer.checkBashCommand()` men utan att behöva `RunContext` eller async init.

**Tillåtna kommandon (readonly):**

```typescript
private static readonly READONLY_ALLOWLIST: RegExp[] = [
  /^grep(\s|$)/,
  /^rg(\s|$)/,
  /^find(\s|$)/,
  /^wc(\s|$)/,
  /^head(\s|$)/,
  /^tail(\s|$)/,
  /^cat(\s|$)/,
  /^ls(\s|$)/,
  /^tree(\s|$)/,
  /^diff(\s|$)/,
  /^git\s+log/,
  /^git\s+show/,
  /^git\s+diff/,
  /^git\s+rev-parse/,
];

private static readonly FORBIDDEN_PATTERNS: RegExp[] = [
  /^rm\s/,
  /^sudo\s/,
  /\bsudo\b/,
  /^curl(\s|$)/,
  /^wget(\s|$)/,
  /`.*`/,
  /\$\(/,           // all command substitution
  /;\s*(sh|bash)\b/,
  /\|\s*rm\b/,      // pipe till rm
  /\|\s*sudo\b/,    // pipe till sudo
  /\|\s*sh\b/,      // pipe till sh
  /\|\s*bash\b/,    // pipe till bash
  /\|\s*tee\b/,     // pipe till tee (skrivning)
  />\s*\//,          // redirect till absolut sökväg
  />\s*\.\//,        // redirect till relativ sökväg
];
```

**Logik i `executeBash()`:**
1. Anropa `CodeAnchor.checkReadonlyCommand(command)`
2. Om `!allowed` → returnera `"BLOCKED: {reason}"`
3. Om `allowed` → kör `execAsync()` som idag

**Logik i `checkReadonlyCommand()`:**
1. Kolla forbidden patterns först — om match → `{ allowed: false, reason: "matches forbidden pattern: {pattern}" }`
2. Kolla readonly allowlist — om ingen match → `{ allowed: false, reason: "not in readonly allowlist" }`
3. Om OK → `{ allowed: true }`

Denna approach:
- Kräver ingen `PolicyEnforcer`-instans eller `RunContext`
- Använder samma mönster som `policy.ts` rad 72-93 (forbidden → allowlist)
- Är statisk — inga sidoeffekter, lätt att testa
- Skyddar mot hallucerade destruktiva kommandon

### 2. Ackumulera text-svar istället för att skriva över

Ändra `runAgentLoop()` (rad 260-343):

**Nuvarande** (rad 264, 298):
```typescript
let lastTextResponse = '';
// ... (inner loop)
if (textBlocks.length > 0) {
  lastTextResponse = textBlocks.map((b) => b.text).join('\n');
}
// ... (return)
return lastTextResponse;
```

**Ny:**
```typescript
const allTextResponses: string[] = [];
// ... (inner loop)
if (textBlocks.length > 0) {
  allTextResponses.push(textBlocks.map((b) => b.text).join('\n'));
}
// ... (return)
return allTextResponses.join('\n\n---\n\n');
```

Detta bevarar ALLA text-svar från alla iterationer. Slutrapporten blir en sammanslagen vy av hela verifieringsprocessen.

### 3. Spara alla turns i konversationsfilen (inte bara sista)

`verify()` (rad 349-403) sparar redan slutrapporten som en turn. Men med ackumulerade text-svar blir den turnen komplett. Ingen annan ändring behövs i `verify()` — den tar emot `report` från `runAgentLoop()` och sparar den.

### 4. Parallell verktygsexekvering (bonus — ej blockerande)

Ändra sekventiell tool-exekvering (rad 317-337) till parallell. Alla verktyg är read-only så inga race conditions kan uppstå.

**Nuvarande:**
```typescript
for (const block of toolUseBlocks) {
  const result = await this.executeTool(block.name, block.input as Record<string, unknown>);
  toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
}
```

**Ny:**
```typescript
const toolResults = await Promise.all(
  toolUseBlocks.map(async (block) => {
    logger.info('Executing tool', { tool: block.name });
    try {
      const result = await this.executeTool(block.name, block.input as Record<string, unknown>);
      return { type: 'tool_result' as const, tool_use_id: block.id, content: result };
    } catch (error) {
      return { type: 'tool_result' as const, tool_use_id: block.id, content: `Error: ${error}`, is_error: true };
    }
  })
);
```

### 5. Lägg till `'code-anchor'` i AGENT_ROLES (trivial)

I `src/core/model-registry.ts` rad 15-18, lägg till `'code-anchor'` i `AGENT_ROLES`-arrayen så att modell kan konfigureras per agent.

## Filer att ändra

| Fil | Ändring |
|-----|---------|
| `src/core/agents/code-anchor.ts` | `READONLY_ALLOWLIST`, `FORBIDDEN_PATTERNS`, `isReadonlyCommand()`, ackumulerade text-svar, parallell tool-exekvering |
| `src/core/model-registry.ts` | Lägg till `'code-anchor'` i `AGENT_ROLES` (rad 15-18) |
| `tests/agents/code-anchor.test.ts` | Tester för bash-blockeringen + ackumulerade svar |

## Filer att INTE ändra

- `src/core/agents/shared-tools.ts` — Code Anchor är standalone, ska inte använda shared tools (de kräver RunContext)
- `src/core/policy.ts` — PolicyEnforcer oförändrad, Code Anchor har sin egen lightweight variant
- `policy/bash_allowlist.txt` — Neurons allowlist oförändrad. Code Anchors readonly-lista är en delmängd
- `policy/forbidden_patterns.txt` — Oförändrad. Code Anchor har sin egen kopia av de viktigaste
- `prompts/code-anchor.md` — Prompten är redan bra, tool-beskrivningen säger redan "read-only"
- `src/core/agents/agent-utils.ts` — `trimMessages()` fungerar korrekt, problemet var att text-svar skrevs över, inte att trimming var fel

## Risker

| Risk | Sannolikhet | Konsekvens | Mitigation |
|------|-------------|------------|------------|
| Readonly-allowlist blockerar legitimt kommando agenten behöver | Låg | Verifiering misslyckas | Allowlisten täcker alla kommandon i promptens "read-only"-beskrivning + git read-ops |
| Ackumulerade text-svar gör rapporten lång | Medel | Stor konversationsfil | OK — bättre att ha för mycket data än att förlora rapporten |
| Parallell tool-exekvering orsakar race condition | Mycket låg | Felaktig output | Alla verktyg är read-only (grep, read_file) — inga sidoeffekter |
| `AGENT_ROLES`-ändring bryter befintlig config | Mycket låg | Annan modell för code-anchor | Om `agent_models: {}` är tom (nuvarande) → ingen effekt |
| Duplicerade forbidden patterns avviker från `policy/forbidden_patterns.txt` över tid | Medel | Code Anchor tillåter kommandon som Neuron blockerar | Medvetet val: Code Anchor har en delmängd. Kommentar i koden pekar till policy-filerna. Framtida brief kan extrahera till delad util. |

## Acceptanskriterier

### Bash-policycheck

- **AC1:** `executeBash('rm -rf /')` returnerar `"BLOCKED: matches forbidden pattern"` — inte ett felmeddelande från bash
- **AC2:** `executeBash('curl http://example.com')` returnerar `"BLOCKED: matches forbidden pattern"`
- **AC3:** `executeBash('python -c "import os; os.system(\"rm -rf /\")"')` returnerar `"BLOCKED: not in readonly allowlist"`
- **AC4:** `executeBash('grep -rn "functionName" src/')` fungerar som idag (tillåtet)
- **AC5:** `executeBash('find src -name "*.ts" -type f')` fungerar som idag (tillåtet)
- **AC6:** `executeBash('git log --oneline -5')` fungerar som idag (tillåtet)
- **AC7:** `READONLY_ALLOWLIST` och `FORBIDDEN_PATTERNS` är statiska properties på klassen — inte instansvariabler
- **AC8:** `executeBash('grep "foo" | rm -rf /')` returnerar `"BLOCKED: matches forbidden pattern"` — pipe-bypass blockeras
- **AC9:** `executeBash('grep "foo" > /etc/passwd')` returnerar `"BLOCKED: matches forbidden pattern"` — redirect-bypass blockeras

### Output-bevarande

- **AC10:** Unit-test: Anropa `runAgentLoop()` med en mockad Anthropic-klient som returnerar text i turn 1 ("rapport del 1") och turn 3 ("rapport del 2"). Resultatet innehåller båda strängarna separerade med `\n\n---\n\n`
- **AC11:** Konversationsfilen (`runs/verifications/verification-*.json`) innehåller den fullständiga ackumulerade rapporten i `turns[].content` — integration-test med tmp-katalog

### Parallell exekvering (bonus)

- **AC12:** Kodverifiering: `code-anchor.ts` använder `Promise.all(toolUseBlocks.map(...))` — inte en `for...of`-loop med `await` — för tool-exekvering i `runAgentLoop()`. Grep-verifiering räcker.

### Model registry

- **AC13:** `'code-anchor'` finns i `AGENT_ROLES` i model-registry.ts

### Regression

- **AC14:** Alla befintliga tester passerar (`pnpm test`) inklusive code-anchor-tester
