# Brief: N13 — Security Reviewer

## Bakgrund

Idag gör Reviewer en generell granskning av alla körningar: policy-efterlevnad,
diff-storlek, testresultat, artefakter. Vid HIGH risk aktiveras two-phase commit,
men det finns ingen djupare säkerhetsanalys av själva *koden* som skrivits.

Frågor vi inte kan svara på idag:

- "Läcker den nya koden API-nycklar eller tokens i loggar?"
- "Finns det command injection-risker i shell-kommandon?"
- "Har Implementer lagt till `eval()`, `Function()` eller liknande farliga mönster?"
- "Skriver koden känslig data till filer utanför runs-katalogen?"

**Lösning:** En säkerhetsfokuserad granskningsmodul som körs automatiskt vid
HIGH-risk-briefs. Modulen skannar diffen efter kända farliga mönster och
rapporterar fynd i `report.md`. Reviewer-prompten utökas med en ARCHIVE-sektion
som laddas vid HIGH risk och ger explicit instruktion att kontrollera
säkerhetsaspekter.

## Scope

Tre delar:

1. **Ny utility** `src/core/security-scan.ts` — skannar diff-strängar efter
   farliga mönster (nycklar, injection, eval, osäkra filoperationer)
2. **Ny ARCHIVE-sektion** i `prompts/reviewer.md` — `<!-- ARCHIVE: security-review -->`
   med checklista för säkerhetsgranskning
3. **Trigger-logik** i `src/core/agents/reviewer.ts` — ladda security-review-sektionen
   när briefen klassas som HIGH risk

## Uppgifter

### 1. Security scan-modul

Skapa `src/core/security-scan.ts`:

```typescript
import { z } from 'zod';

export const SecurityFindingSchema = z.object({
  pattern: z.string().describe('Name of the matched pattern'),
  severity: z.enum(['critical', 'high', 'medium', 'info']),
  line: z.number().describe('Line number in diff where found'),
  context: z.string().describe('The matching line (truncated to 120 chars)'),
  recommendation: z.string(),
});

export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const ScanResultSchema = z.object({
  findings: z.array(SecurityFindingSchema),
  scanned_lines: z.number(),
  patterns_checked: z.number(),
  has_critical: z.boolean(),
  has_high: z.boolean(),
  summary: z.string(),
});

export type ScanResult = z.infer<typeof ScanResultSchema>;

/**
 * Built-in patterns to scan for in diffs.
 * Each pattern has a regex, severity, and recommendation.
 */
export const SECURITY_PATTERNS: Array<{
  name: string;
  regex: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'info';
  recommendation: string;
}>;

// Patterns to include:
//
// Critical:
//   - Hardcoded API keys: /(?:api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9+/=]{20,}['"]/i
//   - AWS keys: /AKIA[0-9A-Z]{16}/
//   - Private keys: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/
//
// High:
//   - eval/Function: /\b(?:eval|Function)\s*\(/
//   - Command injection: /child_process.*exec\(.*\$\{/  (template literal in exec)
//   - SQL injection: /(?:query|execute)\s*\(\s*['"`].*\$\{/  (template literal in SQL)
//   - Shell interpolation: /exec(?:Sync)?\s*\(\s*`/  (backtick in exec)
//
// Medium:
//   - console.log with sensitive names: /console\.log\(.*(?:key|secret|token|password)/i
//   - Disabled security: /eslint-disable.*security/
//   - HTTP (not HTTPS): /['"]http:\/\/(?!localhost|127\.0\.0\.1)/
//
// Info:
//   - TODO/FIXME security: /(?:TODO|FIXME|HACK).*(?:security|auth|secret)/i
//   - Broad file permissions: /chmod\s+(?:777|666)/

/**
 * Scans a unified diff string for security-relevant patterns.
 * Only scans added lines (lines starting with '+').
 *
 * @param diff - Unified diff string (from git diff)
 * @returns ScanResult with findings sorted by severity (critical first)
 */
export function scanDiff(diff: string): ScanResult;

/**
 * Formats scan results as a markdown section for report.md.
 *
 * If no findings: "### Security Scan\n\nNo security issues found. ✅"
 *
 * If findings exist: table with columns Pattern | Severity | Line | Context | Recommendation
 * Plus a summary line: "⚠️ X findings (Y critical, Z high)"
 */
export function formatScanReport(result: ScanResult): string;
```

### 2. ARCHIVE-sektion i Reviewer-prompt

Lägg till i `prompts/reviewer.md`, efter befintliga ARCHIVE-sektioner:

```markdown
<!-- ARCHIVE: security-review -->
## Security Review (HIGH Risk)

When reviewing HIGH risk changes, perform these additional checks:

### Mandatory Security Checklist

1. **Secrets in code** — Search the diff for hardcoded API keys, tokens, passwords,
   or private keys. Any match is a RED blocker.

2. **Injection vulnerabilities** — Check for:
   - Command injection: string interpolation in `exec()`, `spawn()`, or shell commands
   - SQL injection: string interpolation in database queries
   - Template injection: user input in template strings passed to eval/Function

3. **Unsafe code patterns** — Flag usage of:
   - `eval()`, `new Function()`, `vm.runInNewContext()`
   - `child_process.exec()` with unsanitized input
   - `fs.writeFile()` to paths outside workspace/runs directories

4. **Logging & exposure** — Verify that:
   - No sensitive data is logged via console.log/console.error
   - Error messages don't expose internal paths or credentials
   - Stack traces are not sent to external services

5. **Dependencies** — If new packages are added:
   - Check that they are well-known and maintained
   - Flag any package with known vulnerabilities
   - Note any package that requests broad permissions

### Security Verdict

Add a "### Security" section to your report with:
- Number of findings per severity level
- Whether the security scan passed (0 critical + 0 high = PASS)
- Any manual observations not caught by automated scan
- If ANY critical finding exists → verdict MUST be 🔴 RED
<!-- /ARCHIVE: security-review -->
```

### 3. Trigger-logik i reviewer.ts

I `src/core/agents/reviewer.ts`, uppdatera `buildSystemPrompt()`:

```typescript
// In buildSystemPrompt(), when determining which ARCHIVE sections to include:
// Add 'security-review' to the list when brief risk is HIGH

// 1. Add helper to detect HIGH risk from brief content
function isHighRisk(briefContent: string): boolean {
  // Match "Risk" section with "High" classification
  const riskSection = briefContent.match(/##\s*Risk[\s\S]*?(?=##|$)/i);
  if (!riskSection) return false;
  return /\*\*High\.?\*\*/i.test(riskSection[0]);
}

// 2. In buildSystemPrompt(), add conditional archive loading:
const archiveSections = ['self-check', 'handoff', 'two-phase', 'no-tests'];
if (isHighRisk(this.briefContent)) {
  archiveSections.push('security-review');
}
```

### 4. Automatisk scan i Reviewer

I `src/core/agents/reviewer.ts`, integrera `scanDiff()`:

```typescript
// Before building system prompt, if HIGH risk, run security scan on the diff
// and append findings to the context given to the Reviewer

import { scanDiff, formatScanReport } from '../security-scan.js';

// In the review flow, after reading implementer_handoff.md:
if (isHighRisk(briefContent)) {
  // Read the diff from the workspace
  const diff = await readDiff(runDir); // existing diff-reading utility
  const scanResult = scanDiff(diff);
  const securityReport = formatScanReport(scanResult);

  // Append to context so Reviewer sees automated findings
  // and can add manual observations
  contextParts.push(`\n## Automated Security Scan\n\n${securityReport}`);

  // If critical findings, add warning
  if (scanResult.has_critical) {
    contextParts.push('\n⚠️ CRITICAL security findings detected — this MUST be RED unless findings are false positives.');
  }
}
```

### 5. Tester

Skriv tester i `tests/core/security-scan.test.ts`:

1. `scanDiff` — tom diff → 0 findings
2. `scanDiff` — diff utan säkerhetsproblem → 0 findings
3. `scanDiff` — hardcoded API key → critical finding
4. `scanDiff` — AWS AKIA-nyckel → critical finding
5. `scanDiff` — private key block → critical finding
6. `scanDiff` — `eval()` → high finding
7. `scanDiff` — `exec()` med template literal → high finding
8. `scanDiff` — SQL med template literal → high finding
9. `scanDiff` — console.log med "password" → medium finding
10. `scanDiff` — HTTP-url (ej localhost) → medium finding
11. `scanDiff` — TODO security kommentar → info finding
12. `scanDiff` — chmod 777 → info finding
13. `scanDiff` — skannar BARA added lines ('+'), ignorerar borttagna ('-')
14. `scanDiff` — findings sorterade efter severity (critical först)
15. `scanDiff` — context trunkeras till 120 tecken
16. `formatScanReport` — inga findings → "No security issues found. ✅"
17. `formatScanReport` — findings → markdown-tabell med alla kolumner
18. `formatScanReport` — summary med antal per severity
19. `isHighRisk` — brief med "**High.**" → true
20. `isHighRisk` — brief med "**Low.**" → false
21. `isHighRisk` — brief utan Risk-sektion → false
22. `ScanResultSchema` — validerar korrekt objekt
23. `SecurityFindingSchema` — avvisar ogiltig severity

Skriv tester i `tests/prompts/reviewer-security-lint.test.ts`:

24. Reviewer-prompt innehåller `<!-- ARCHIVE: security-review -->` markör
25. Security-review ARCHIVE innehåller "Mandatory Security Checklist"
26. Security-review ARCHIVE innehåller "Security Verdict"

## Acceptanskriterier

- [ ] `src/core/security-scan.ts` existerar med `scanDiff()`, `formatScanReport()`, `SECURITY_PATTERNS`
- [ ] Minst 12 mönster definierade: 3 critical, 4 high, 3 medium, 2 info
- [ ] `prompts/reviewer.md` har ny `<!-- ARCHIVE: security-review -->` sektion
- [ ] `src/core/agents/reviewer.ts` laddar security-review-sektionen vid HIGH risk
- [ ] `src/core/agents/reviewer.ts` kör `scanDiff()` och inkluderar resultat i kontext
- [ ] Critical findings → Reviewer varnas att detta MÅSTE bli RED
- [ ] 23+ tester i `tests/core/security-scan.test.ts`
- [ ] 3+ tester i `tests/prompts/reviewer-security-lint.test.ts`
- [ ] `pnpm typecheck` passerar
- [ ] `pnpm test` passerar

## Risk

**Low.** Helt additiv ändring — ny fil (`security-scan.ts`), ny ARCHIVE-sektion
i befintlig prompt, och en `if`-kontroll i `reviewer.ts`. Inga befintliga
beteenden ändras. Skanningen körs bara vid HIGH risk, så normala körningar
påverkas inte.

Falskt positiva är den största risken — regex-mönster kan matcha harmlös kod
(t.ex. en variabel som heter `token_count`). Därför rapporteras findings som
*underlag* för Reviewer, inte som automatiska blockeringar (förutom vid
critical-nivå).

## Baseline

```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
cd "/Users/mpmac/Documents/VS Code/neuron-hq"
pnpm test
```

Förväntat baseline: 650+ passed.

## Körkommando

```bash
npx tsx src/cli.ts run neuron-hq --brief briefs/2026-03-01-security-reviewer.md --hours 1
```
