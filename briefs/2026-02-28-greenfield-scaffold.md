# Brief: Greenfield scaffold — Starta nya projekt från noll

## Bakgrund

Neuron HQ kan idag bara arbeta med *befintliga* repos (registrerade i `targets/repos.yaml`).
Om du vill att Neuron bygger något nytt — t.ex. en MCP-server — måste du först manuellt
skapa repot, installera dependencies, och sätta upp testramverk.

**Problem:** Neuron kan inte bootstrappa ett greenfield-projekt. Det begränsar användningsområdet
till "förbättra befintligt" istället för "skapa nytt".

**Källa:** Djupsamtal session 50 — identifierat som en av tre saker som "inte fungerar ännu".

## Scope

**Ny `scaffold`-funktion som skapar ett minimalt projektskelett innan körning startar.**

Inga ändringar i agenternas logik — bara ett nytt förberedelsesteg.

## Uppgifter

### 1. Ny scaffold-modul (`src/core/scaffold.ts`)

Skapa en modul som genererar ett minimalt projekt:

```typescript
export interface ScaffoldOptions {
  name: string;           // projektnamn
  language: 'typescript' | 'python';
  template: 'library' | 'cli' | 'mcp-server' | 'api';
  targetDir: string;      // var projektet skapas
}

export async function scaffoldProject(options: ScaffoldOptions): Promise<void>
```

**TypeScript-template (`library`):**
```
<name>/
  package.json          ← name, version, scripts (test, typecheck, lint, build)
  tsconfig.json         ← strict mode, NodeNext
  vitest.config.ts      ← test runner
  src/
    index.ts            ← export placeholder
  tests/
    index.test.ts       ← 1 smoke test ("it should exist")
  .gitignore
```

**Python-template (`library`):**
```
<name>/
  pyproject.toml        ← name, version, pytest config
  src/
    <name>/
      __init__.py
  tests/
    test_init.py        ← 1 smoke test
  .gitignore
```

**Övriga templates** (`cli`, `mcp-server`, `api`) kan läggas till senare — för nu räcker `library`.

### 2. Nytt CLI-kommando: `scaffold`

Lägg till i `src/cli.ts`:

```bash
npx tsx src/cli.ts scaffold <name> --language typescript --template library
```

**Vad det gör:**
1. Skapar katalogen
2. Kör `scaffoldProject()`
3. Kör `git init`
4. Kör `pnpm install` (eller `pip install -e .`)
5. Kör `pnpm test` (eller `pytest`) — verifierar att scaffold fungerar
6. Registrerar som target i `targets/repos.yaml`

### 3. Integrera med `run`-kommandot

Lägg till en optional flagga:

```bash
npx tsx src/cli.ts run <target> --brief briefs/xyz.md --hours 1 --scaffold typescript:library
```

Om `--scaffold` anges OCH target-katalogen inte finns → kör scaffold först, sedan normal körning.
Om target-katalogen redan finns → ignorera `--scaffold` (idempotent).

### 4. Tester

Skriv tester i `tests/core/scaffold.test.ts`:

1. `scaffoldProject` skapar rätt filstruktur (TypeScript)
2. `scaffoldProject` skapar rätt filstruktur (Python)
3. Genererad `package.json` har korrekta scripts
4. Genererad `tsconfig.json` har strict mode
5. Genererad smoke test passerar (`pnpm test`)
6. Scaffold är idempotent (kör inte om om katalogen finns)
7. `--scaffold` flaggan integrerar med run-kommandot

## Acceptanskriterier

- [ ] `src/core/scaffold.ts` med `scaffoldProject()` funktion
- [ ] TypeScript library-template genererar fungerande projekt
- [ ] Python library-template genererar fungerande projekt
- [ ] `scaffold` CLI-kommando registrerat
- [ ] `--scaffold` flagga i `run`-kommandot
- [ ] Scaffoldat projekt klarar `pnpm test` / `pytest` direkt
- [ ] 5+ tester i `tests/core/scaffold.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Medium.** Lägger till en ny CLI-kommandobranch och skapar filer utanför workspace.
Scaffold-funktionen måste vara idempotent och aldrig skriva över befintliga filer.

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
npm test
```

Förväntat baseline: 443 passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-02-28-greenfield-scaffold.md --hours 1
```
