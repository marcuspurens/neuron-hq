# Neuron HQ — Rikare agent-till-agent-kommunikation

## Kör-kommando

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-26-agent-handoff-context.md --hours 1
```

## Problem

Idag returnerar `delegateToImplementer()` i `manager.ts` exakt denna sträng:

```
'Implementer agent completed successfully.'
```

Det är allt Manager vet om vad Implementer gjorde. Manager vet inte:
- Vilka beslut Implementer tog och varför
- Vad Implementer var osäker på
- Vilka alternativa lösningar som övervägdes och förkastades
- Vilka risker Implementer identifierade
- Vad som *inte* gjordes (och varför)

Konsekvens: Manager skickar Reviewer in i blindt. Reviewer hittar problem.
Manager förstår inte varför Reviewer hittar problemet. Det kostar 15–20 extra
iterationer och hundratusentals tokens att debugga kommunikationsluckan.

## Lösning

Implementer skriver en strukturerad handoff-fil (`implementer_handoff.md`) i
`runs/<runid>/` när den är klar. Manager läser den och inkluderar nyckelinfo
i sin delegation till Reviewer.

## Uppgifter

### 1. Implementer skriver `implementer_handoff.md`

I `prompts/implementer.md`, lägg till ett obligatoriskt sista steg:

```
## Avslutningssteg (obligatoriskt)

Innan du avslutar, skriv `runs/<runid>/implementer_handoff.md` med:

### Vad gjordes
- [Lista varje fil som ändrades och varför]

### Beslut och motiveringar
- [Varje icke-uppenbart val: varför approach X valdes över Y]

### Osäkerheter
- [Vad du inte är säker på — tekniska val, edge cases, tolkningar av brief]

### Risker
- [Vad som kan gå fel, vad Reviewer bör titta extra noga på]

### Vad som INTE gjordes
- [Saker från brief som medvetet lämnades utanför scope, och varför]
```

### 2. `delegateToImplementer()` returnerar handoff-innehållet

I `src/core/agents/manager.ts`, funktionen `delegateToImplementer()` (rad ~708):

**Före:**
```typescript
private async delegateToImplementer(input: { task: string }): Promise<string> {
  const implementer = new ImplementerAgent(this.ctx, baseDir);
  await implementer.run();
  return 'Implementer agent completed successfully.';
}
```

**Efter:**
```typescript
private async delegateToImplementer(input: { task: string }): Promise<string> {
  const implementer = new ImplementerAgent(this.ctx, baseDir);
  await implementer.run();

  // Läs handoff-fil om den finns
  const handoffPath = path.join(this.ctx.runDir, 'implementer_handoff.md');
  try {
    const handoff = await fs.readFile(handoffPath, 'utf-8');
    return `Implementer agent completed.\n\n--- IMPLEMENTER HANDOFF ---\n${handoff}`;
  } catch {
    return 'Implementer agent completed successfully. (No handoff written)';
  }
}
```

### 3. Manager-prompten instrueras att använda handoff

I `prompts/manager.md`, lägg till instruktion efter delegation till Implementer:

```
När du får tillbaka svar från `delegate_to_implementer`, läs IMPLEMENTER HANDOFF
noggrant. Identifiera:
- Osäkerheter som Reviewer bör undersöka extra
- Risker som bör verifieras i testerna
- Beslut som kräver din bedömning innan Reviewer kallas

Inkludera relevant context från handoff i din delegation till Reviewer.
```

### 4. Reviewer-prompten får tillgång till handoff

I `prompts/reviewer.md`, lägg till i kontextavsnittet:

```
Om `implementer_handoff.md` finns i runs-katalogen, läs den INNAN du börjar
granska. Fokusera extra på de osäkerheter och risker som Implementer flaggat.
```

I `src/core/agents/reviewer.ts`, lägg till `implementer_handoff.md` som en
fil som automatiskt läses in i kontexten om den finns (analogt med hur
`report.md` läses av Merger).

### 5. Tester

Lägg till i relevanta testfiler:

- `tests/agents/manager.test.ts`:
  - `test_delegate_to_implementer_includes_handoff_when_present` — om
    `implementer_handoff.md` finns, ska return-värdet innehålla handoff-innehållet
  - `test_delegate_to_implementer_graceful_without_handoff` — om filen saknas,
    ska delegation fortfarande lyckas med fallback-meddelande

- `tests/agents/implementer.test.ts` (eller prompt-lint):
  - `test_implementer_prompt_contains_handoff_instruction` — verifiera att
    prompten kräver att `implementer_handoff.md` skrivs

Befintliga 352 tester ska fortfarande passera.

## Verifiering

```bash
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test
npx tsc --noEmit
```

### Acceptanskriterier

| Kriterium | Hur det verifieras |
|---|---|
| `implementer_handoff.md` skapas i en riktig körning | Kör en dummy-körning, kontrollera att filen finns |
| `delegateToImplementer()` returnerar handoff-innehåll | Enhetstest |
| Graceful fallback om handoff saknas | Enhetstest |
| Reviewer-prompt nämner handoff | Prompt-lint-test |
| Manager-prompt nämner handoff | Prompt-lint-test |
| 352 befintliga tester passerar | `npm test` |

## Avgränsningar

- Implementera INTE samma pattern för Reviewer → Manager ännu (det är nästa steg)
- Implementera INTE typed message bus (det är ett större arkitekturarbete)
- Ändra INTE Tester, Historian, Librarian, Merger ännu — bara Implementer → Manager → Reviewer
- Håll `implementer_handoff.md` som fritext markdown, inget JSON-schema ännu

## Bakgrund

Inspirerat av ZeroClaw:s coordination protocol (`src/coordination/`) och
observation i djupsamtalet 2026-02-26: "Implementer kan ta ett beslut som
Manager inte förstår förrän Reviewer-agenten hittar problemet. Det kostar
15–20 iterationer och hundratusentals tokens att debugga mellan agenter."

Detta är det minimala steget mot rikare agent-till-agent-kommunikation.
