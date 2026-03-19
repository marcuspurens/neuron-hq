# CR-1: Fullständig code review av Neuron HQ

## Bakgrund

Neuron HQ har växt snabbt genom 97 sessioner till ~35 700 rader TypeScript (184 filer) + ~830 rader Python (12 filer). Koden har skrivits inkrementellt av agenter och behöver en systematisk genomgång för kvalitet, säkerhet och modularitet.

## Mål

Genomför en code review av hela `src/`-katalogen och `aurora-workers/`. Identifiera problem, föreslå förbättringar och skapa en prioriterad åtgärdslista. **Ändra INGEN kod** — detta är en ren granskningsuppgift.

## Granskningsområden

### 1. Säkerhet (kritiskt)

- Hemliga nycklar som kan läcka (API-nycklar, tokens i loggar/artifacts)
- Command injection-risker (stränginterpolation i shell-kommandon)
- Path traversal (valideras filvägar korrekt?)
- SQL injection (parametriserade queries eller rå strängar?)
- Input-validering vid systemgränser (user input, externa API:er)
- Kontrollera att `policy/bash_allowlist.txt` och `policy/forbidden_patterns.txt` efterlevs

### 2. Kodkvalitet

- **Duplicerad logik** — samma mönster på flera ställen som bör vara en delad modul
- **Otypade gränssnitt** — `any`, `as unknown as`, onödiga type assertions
- **Felhantering** — tomma catch-block, sväljer fel tyst, saknar kontext i errors
- **Oanvänd kod** — döda importer, oanvända funktioner, commented-out code
- **Stora filer** — filer >300 rader som bör delas upp
- **Inkonsekvent namngivning** — blandade konventioner, oklara namn

### 3. Arkitektur & modularitet

- Moduler med för många ansvarsområden (bör delas upp)
- Cirkulära beroenden mellan moduler
- Hårdkodade värden som bör vara konfigurerbara
- Saknad abstraktion (t.ex. duplicerade API-klienter, konfigurationsläsning)

### 4. Testbarhet

- Kod som är svår att testa (tighta kopplingar, globalt state)
- Moduler utan tester som borde ha det
- Tester som testar implementation istället för beteende

### 5. Prestanda

- Onödiga blockerande operationer (sync I/O i async-kontext)
- N+1-queries mot databasen
- Stora datamängder som laddas i minnet utan streaming
- Saknade timeouts på externa anrop

### 6. Beroenden & supply chain

- Oanvända npm-paket i `package.json` (bloat)
- Föråldrade beroenden med kända CVE:er (`pnpm audit`)
- Pinnade vs lösa versioner

### 7. Resurshantering & cleanup

- Stängs databasanslutningar korrekt vid fel?
- Avslutas child processes (Python workers, Ollama) vid crash/avbrott?
- Finns graceful shutdown-logik? Vad händer vid Ctrl+C mitt i en körning?
- Hanteras temporära filer (cleanup efter sig)?
- API-felhantering: retry-logik, rate limiting, exponential backoff vid Anthropic API-anrop?

### 8. Concurrency & race conditions

- Parallella agenter som skriver till samma filer/DB-rader
- Race conditions i audit.jsonl (append-only men utan lås?)
- Ollama auto-start: vad händer om två processer kallar `ensureOllama()` samtidigt?

### 9. Databasschema & queries

- Saknas index på vanliga sökvägar?
- Migreringsordning — kan de köras idempotent?
- Transaktioner runt multi-steg-operationer

### 10. Loggning & observerbarhet

- Blandas `console.log` / `console.error` / strukturerad loggning?
- Finns det tillräckligt med kontext i loggar för att felsöka en misslyckad körning?
- Loggas känslig data (tokens, API-svar)?

### 11. Konfigurationshantering

- Hur många env-variabler finns? Dokumenterade?
- Defaults — vad händer om en env-var saknas? Kraschar det eller tyst fallback?
- Spridda `process.env`-läsningar vs centraliserad config

### 12. Idempotens & återhämtning

- Kan en körning säkert startas om efter avbrott?
- Lämnar misslyckade körningar kvar halvfärdigt state?

## Struktur — granska i denna ordning

| # | Katalog | Filer | Fokus |
|---|---------|-------|-------|
| 1 | `src/core/` (exkl. `agents/`) | ~20 filer | Säkerhet, policy-enforcement, db-access, config |
| 2 | `src/aurora/` | ~25 filer | Ingest-pipeline, graph, embedding, vision |
| 3 | `src/core/agents/` | ~10 filer | Agent-loopar, tool-dispatch, sandboxning |
| 4 | `src/mcp/` | ~20 filer | MCP-tools, input-validering |
| 5 | `src/commands/` + `src/cli.ts` | ~15 filer | CLI-kommandon, argument-parsning, entry points |
| 6 | `aurora-workers/` | 12 filer | Python-workers, extern process-hantering |

## Output — rapport i `runs/<runid>/report.md`

Rapporten ska innehålla:

### Sammanfattning
- Totalt antal findings per allvarlighetsgrad
- Övergripande bedömning (1-5 stjärnor)

### Findings per kategori

Varje finding ska ha:
```markdown
#### [SEVERITY] Kort beskrivning
- **Fil:** `src/path/to/file.ts:123`
- **Kategori:** Säkerhet / Kodkvalitet / Arkitektur / Testbarhet / Prestanda / Beroenden / Resurshantering / Concurrency / Databas / Loggning / Konfiguration / Idempotens
- **Beskrivning:** Vad problemet är
- **Rekommendation:** Konkret förslag på åtgärd
- **Effort:** S/M/L
```

Allvarlighetsgrader:
- **CRITICAL** — Säkerhetshål eller dataförlust-risk, fixa omedelbart
- **HIGH** — Buggar eller allvarliga kvalitetsproblem
- **MEDIUM** — Förbättringar som påverkar underhållbarhet
- **LOW** — Stilistiska förbättringar, nice-to-have

### Prioriterad åtgärdslista
Topp-10 findings rangordnade efter risk × effort.

### Positiva observationer
Saker som är bra och bör bevaras (minst 5).

## Avgränsningar

- Granska INTE `tests/` — bara produktionskod
- Granska INTE `docs/`, `briefs/`, `prompts/` — bara kod
- Granska INTE `node_modules/` eller genererade filer
- **Ändra INGEN kod** — enbart granskning och rapport
- Inga git-commits

## Verifiering

Rapporten ska finnas i `runs/<runid>/report.md` och innehålla alla sektioner ovan.

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| Alla 6 kataloggrupper granskade | Rapport listar findings från alla |
| Minst 30 findings totalt | Räkna i rapporten |
| Varje finding har fil, kategori, severity, rekommendation | Manuell kontroll |
| Topp-10 åtgärdslista finns | Manuell kontroll |
| Positiva observationer (≥5) | Manuell kontroll |
| Ingen kod ändrad | `git diff` ska vara tomt efter körning |

## Risk

**Ingen.** Ren läsning — ingen kod ändras.

## Agentinställningar

- Manager: max 230 iterationer (stor kodbas, 184 filer, 12 granskningsområden)
- Implementer: max 150 iterationer per modul (mycket läsning, fler kategorier)
- Researcher: max 70 iterationer (djupanalys av beroenden, concurrency, config)
- Reviewer: max 60 iterationer (fler findings att verifiera)
- Historian: max 50 iterationer (stor rapport att dokumentera)
- Librarian: max 50 iterationer (många findings att katalogisera)
