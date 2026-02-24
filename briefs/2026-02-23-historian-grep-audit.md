# Brief: Historian grep_audit-verktyg
**Datum:** 2026-02-23
**Target:** neuron-hq
**Körning:** #13
**Estimerad tid:** 1 timme

---

## Bakgrund

Historian-agenten kan i dag läsa `audit.jsonl` med `read_file` — men det läser hela filen.
Ett `audit.jsonl` kan ha hundratals rader och orsakar onödig kontext-förbrukning och risk för trunkering.

Det vanligaste behovet är enkelt: *"Körde Librarian? Hur många `write_to_techniques`-anrop gjordes?"*
Det kräver inte hela filen — bara filtrerade rader.

**Lösning:** Lägg till ett `grep_audit(query)`-verktyg i Historian som läser `audit.jsonl` och
returnerar bara rader som matchar sökfrasen (case-insensitiv). Analogt med det befintliga
`search_memory`-verktyget men för audit-loggen.

**Baseline (2026-02-23):**
```
npm test               → 184/184 gröna (19 testfiler)
npx tsc --noEmit       → 0 errors
errors.md öppna ⚠️     → 0
```

**Hälsokontroll:** Swärmen ska verifiera dessa tre värden INNAN den börjar jobba.
Om något avviker (fler/färre tester, TypeScript-fel, öppna ⚠️) — stoppa och rapportera
det i `questions.md` istället för att fortsätta.

---

## Uppgift 1 — Implementer: grep_audit-verktyg i historian.ts

### 1a. Lägg till verktyget i `defineTools()` i `src/core/agents/historian.ts`

Lägg till efter `update_error_status`-verktyget:

```typescript
{
  name: 'grep_audit',
  description:
    'Search audit.jsonl for entries matching a keyword. More efficient than read_file ' +
    'when you only need to verify that a specific agent ran or a specific tool was called. ' +
    'Returns matching JSON lines formatted one per line, truncated to 3000 chars.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Keyword to search for (case-insensitive). E.g. agent role "librarian", ' +
          'tool name "write_to_techniques", or any other term.',
      },
    },
    required: ['query'],
  },
},
```

### 1b. Implementera `executeGrepAudit` i `HistorianAgent`-klassen

Lägg till metoden efter `executeUpdateErrorStatus`:

```typescript
private async executeGrepAudit(input: { query: string }): Promise<string> {
  const { query } = input;
  const filePath = path.join(this.ctx.runDir, 'audit.jsonl');

  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    return `(audit.jsonl not found in ${this.ctx.runDir})`;
  }

  await this.ctx.audit.log({
    ts: new Date().toISOString(),
    role: 'historian',
    tool: 'grep_audit',
    allowed: true,
    note: `Searching audit.jsonl for: ${query}`,
  });

  const lowerQuery = query.toLowerCase();
  const matchingLines = raw
    .split('\n')
    .filter((line) => line.trim() && line.toLowerCase().includes(lowerQuery));

  if (matchingLines.length === 0) {
    return `No entries in audit.jsonl match "${query}".`;
  }

  const result = `Found ${matchingLines.length} matching entries:\n\n` + matchingLines.join('\n');

  // Truncate to avoid context overflow
  const MAX_CHARS = 3000;
  if (result.length > MAX_CHARS) {
    return result.slice(0, MAX_CHARS) + `\n\n[... truncated, ${result.length - MAX_CHARS} chars dropped ...]`;
  }
  return result;
}
```

### 1c. Koppla verktyget i `executeTools` switch-satsen

Lägg till direkt efter `case 'update_error_status'`:

```typescript
case 'grep_audit':
  result = await this.executeGrepAudit(block.input as { query: string });
  break;
```

---

## Uppgift 2 — Implementer: Uppdatera `prompts/historian.md`

I avsnittet **Tools** (sist i filen), lägg till en rad efter `update_error_status`:

```markdown
- **grep_audit**: Search audit.jsonl for entries matching a keyword. Use this instead of read_file when you only need to verify that an agent ran or that a specific tool was called. Example: `grep_audit(query="librarian")` to count Librarian tool calls.
```

Uppdatera även avsnittet **What You Do → punkt 1** — byt ut:
```
   - `audit.jsonl` — **ground truth**: every tool call made during the run. Read this to verify what actually happened...
```
till:
```
   - `audit.jsonl` — **ground truth**: every tool call made during the run. Use `grep_audit` to search it efficiently rather than `read_file` (which reads the whole file). Example: `grep_audit(query="librarian")`.
```

---

## Uppgift 3 — Tester

### 3a. Lägg till tester i `tests/agents/historian.test.ts`

Lägg till ett nytt `describe`-block efter `describe('update_error_status', ...)`:

```typescript
describe('grep_audit', () => {
  it('returns matching lines from audit.jsonl', async () => {
    const auditContent = [
      JSON.stringify({ ts: '2026-02-23T10:00:00Z', role: 'librarian', tool: 'write_to_techniques', allowed: true }),
      JSON.stringify({ ts: '2026-02-23T10:00:01Z', role: 'historian', tool: 'run', allowed: true }),
      JSON.stringify({ ts: '2026-02-23T10:00:02Z', role: 'librarian', tool: 'write_to_techniques', allowed: true }),
    ].join('\n');

    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'audit.jsonl'), auditContent);

    const result = await (agent as any).executeGrepAudit({ query: 'librarian' });
    expect(result).toContain('Found 2 matching entries');
    expect(result).toContain('write_to_techniques');
  });

  it('returns no-match message when query has no hits', async () => {
    const auditContent = JSON.stringify({ ts: '2026-02-23T10:00:00Z', role: 'manager', tool: 'run', allowed: true });
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'audit.jsonl'), auditContent);

    const result = await (agent as any).executeGrepAudit({ query: 'librarian' });
    expect(result).toContain('No entries');
    expect(result).toContain('librarian');
  });

  it('returns not-found message when audit.jsonl is missing', async () => {
    const result = await (agent as any).executeGrepAudit({ query: 'anything' });
    expect(result).toContain('not found');
  });

  it('is case-insensitive', async () => {
    const auditContent = JSON.stringify({ ts: '2026-02-23T10:00:00Z', role: 'Librarian', tool: 'Run', allowed: true });
    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'audit.jsonl'), auditContent);

    const result = await (agent as any).executeGrepAudit({ query: 'librarian' });
    expect(result).toContain('Found 1 matching entries');
  });

  it('truncates output when result exceeds 3000 chars', async () => {
    // 30 lines × ~120 chars = ~3600 chars → should truncate
    const lines = Array.from({ length: 30 }, (_, i) =>
      JSON.stringify({ ts: '2026-02-23T10:00:00Z', role: 'librarian', tool: 'write_to_techniques', index: i, padding: 'x'.repeat(80) })
    ).join('\n');

    await fs.mkdir(runDir, { recursive: true });
    await fs.writeFile(path.join(runDir, 'audit.jsonl'), lines);

    const result = await (agent as any).executeGrepAudit({ query: 'librarian' });
    expect(result).toContain('truncated');
  });
});
```

Verifiera att `grep_audit` också syns i `defineTools()`-testet (rad 76–84). Lägg till:
```typescript
expect(names).toContain('grep_audit');
```

---

## Uppgift 4 — Verifiering

```bash
npm test
npx tsc --noEmit
```

Förväntad utdata:
- `npm test` → **184+ tester** (minst 5 nya tester för grep_audit, troligen 189+)
- `npx tsc --noEmit` → **0 errors**

---

## Uppgift 5 — Reviewer: STOPLIGHT-rapport

Acceptanskriterier:
1. ✅ `src/core/agents/historian.ts` har `grep_audit`-verktyg i `defineTools()`
2. ✅ `src/core/agents/historian.ts` har `executeGrepAudit`-metod
3. ✅ `executeTools` switch-satsen hanterar `'grep_audit'`-case
4. ✅ `prompts/historian.md` Tools-sektion nämner `grep_audit`
5. ✅ `prompts/historian.md` punkt 1 instruerar att använda `grep_audit` istf `read_file` för audit.jsonl
6. ✅ `tests/agents/historian.test.ts` har minst 5 nya tester för `grep_audit`
7. ✅ `defineTools()`-testet verifierar att `grep_audit` finns
8. ✅ `npm test` → alla tester gröna (184+)
9. ✅ `npx tsc --noEmit` → 0 errors
10. ✅ Git commit med korrekta filer

---

## Uppgift 6 — Merger: Applicera commit

Merger applicerar committen från workspace till neuron-hq main.

---

## Noteringar

- `grep_audit` söker BARA i `this.ctx.runDir/audit.jsonl` (nuvarande körningens audit-logg)
- Trunkering vid 3000 tecken — analogt med `search_memory` (2000 tecken i agent-utils.ts)
- Tester: `runDir` finns redan i beforeEach-setup — skriv audit.jsonl dit med `fs.writeFile`
- Auto-trigger: körning #13 triggar INTE Librarian (nästa trigger vid 14 entries i runs.md → körning #15)
- Historian behöver INTE läsa audit.jsonl för varje körning — `grep_audit` är ett _on-demand_-verktyg när Historian behöver verifiera något specifikt
