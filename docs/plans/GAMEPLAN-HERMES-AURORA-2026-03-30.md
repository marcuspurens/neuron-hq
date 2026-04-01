# Gameplan: Hermes Agent + Aurora Integration

**Datum:** 2026-03-30
**Status:** Draft — inväntar Marcus beslut
**Analyserad av:** Metis (pre-planning), Sisyphus (arkitektur)
**LLM-provider:** LiteLLM
**Messaging:** Signal (E2E-krypterat)
**Säkerhetspolicy:** Zero-trust

---

## Grundidé

**Hermes = sensor och interface. Aurora = kunskapsmotor.**

Hermes Agent (Nous Research, Python, MIT) sitter på 5 messaging-plattformar och samlar data hela dagen. Aurora (Neuron HQ, TypeScript) har en rik kunskapsgraf med grafnavigering, bayesian confidence, decay och konsolidering. MCP kopplar ihop dem — ingen fork, ingen middleware, rent protokoll.

```
Hermes (Python)                      Aurora (TypeScript)
┌──────────────────────┐             ┌──────────────────────┐
│  Signal (E2E) ←─────── primary     │  Knowledge graph     │
│  CLI                  │             │  pgvector + PPR      │
│                       │             │  Bayesian confidence │
│  LiteLLM (router)    │──── MCP ──→│  Decay + freshness   │
│                       │  (stdio)   │  Cross-ref + dedup   │
│                       │←─── MCP ───│  Contradictions      │
│  Cron scheduler       │             │  Morning briefing    │
│  SKILL.md (lokalt)    │             │  44 MCP tools        │
└──────────────────────┘             └──────────────────────┘
         │                                     │
         └──── localhost only ─────────────────┘
               Inga portar öppna mot internet
```

---

## Faser

### Fas 0 — Förutsättningar + Säkerhetsgrund (ingen kod)

**Mål:** Installera, konfigurera och härda båda systemen.

**0a — Installation:**

| Steg                       | Kommando                                                                                                 | Förväntat resultat             |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Installera Hermes          | `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh \| bash` | `hermes` kommando tillgängligt |
| Konfigurera Hermes         | `hermes setup` → välj LiteLLM                                                                            | Kan chatta i CLI               |
| Installera signal-cli      | `brew install signal-cli`                                                                                | signal-cli i PATH              |
| Installera Java 17+        | `brew install openjdk@17` (om ej finns)                                                                  | `java -version` ≥ 17           |
| Länka Signal-konto         | `signal-cli link -n "HermesAgent"` → scanna QR i Signal-appen                                            | Linked device i Signal         |
| Starta signal-cli daemon   | `signal-cli --account +46XXXXXXXXX daemon --http 127.0.0.1:8080`                                         | HTTP-endpoint på localhost     |
| Konfigurera Hermes gateway | `hermes gateway setup` → välj Signal                                                                     | Kan chatta via Signal          |
| Verifiera Aurora MCP       | `npx tsx src/cli.ts mcp-server --scope aurora-search`                                                    | JSON-RPC-svar på stdin         |

**0b — Säkerhetshärdning (zero-trust):**

| Åtgärd                     | Var                                                                                                | Varför                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Signal DM-only + allowlist | `SIGNAL_ALLOWED_USERS=+46XXXXXXXXX` i `~/.hermes/.env`                                             | Bara Marcus kan prata med boten     |
| Grupper avstängda          | `SIGNAL_GROUP_ALLOWED_USERS` ej satt (default: ignorera grupper)                                   | Ingen lateral access                |
| Command approval           | `security.auto_approve_commands: false` i `~/.hermes/config.yaml`                                  | Hermes frågar innan shell-kommandon |
| Config-fil låst            | `chmod 600 ~/.hermes/config.yaml ~/.hermes/.env`                                                   | DATABASE_URL inte läsbar för andra  |
| PostgreSQL socket-auth     | `DATABASE_URL=postgresql:///neuron` i MCP env (Unix socket, inget lösenord)                        | Inget lösenord i config             |
| Aurora scope-begränsning   | Max 2-3 scopes i Hermes MCP config, ALDRIG `--scope all`                                           | Minimera exponerad yta              |
| Hermes context-file        | `~/.hermes/context/security.md`: "Never store API keys, passwords, or secrets in memory or Aurora" | LLM-beteendestyrning                |
| signal-cli data skyddad    | `chmod 700 ~/.local/share/signal-cli/`                                                             | Session-credentials = lösenord      |

**0c — Säkerhetsarkitektur:**

```
Internet
    │
    ▼
Signal Protocol (E2E-krypterat)
    │
    ▼
signal-cli daemon (127.0.0.1:8080 — BARA localhost)
    │
    ▼
Hermes Gateway (Python-process)
    │  ├── SIGNAL_ALLOWED_USERS: bara Marcus
    │  ├── auto_approve_commands: false
    │  └── MEMORY.md: inga secrets
    │
    ▼ MCP stdio (lokal pipe, aldrig nätverk)
    │
Aurora MCP Server (Node.js-process)
    │  ├── Scope-begränsad (2-3 scopes)
    │  └── forbidden_patterns.txt aktiv
    │
    ▼ Unix socket
    │
PostgreSQL (localhost:5432, ej exponerad)
```

**Inget i kedjan exponeras mot internet utom Signal-protokollet (E2E-krypterat).**

**Acceptanskriterium:**

```bash
# Aurora MCP smoke test
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | \
  npx tsx src/cli.ts mcp-server --scope aurora-search
# → Returnerar JSON med 3 tools: aurora_search, aurora_ask, aurora_status

# Signal smoke test
curl http://127.0.0.1:8080/api/v1/check
# → {"versions":{"signal-cli":...}}
```

**Effort:** ~1-2 timmar manuellt arbete
**Kod-ändringar i Neuron HQ:** Inga

---

### Fas 1 — MVP: Fråga Aurora via Signal (1 session)

**Mål:** Marcus ställer en fråga på Signal → Hermes frågar Aurora → svar med källor.

**Enda ändring — Hermes config:**

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  kb: # kort namn → tools blir mcp_kb_aurora_ask
    command: 'npx'
    args: ['tsx', 'src/cli.ts', 'mcp-server', '--scope', 'aurora-search']
    cwd: '/Users/mpmac/Documents/VS Code/neuron-hq'
    env:
      DATABASE_URL: 'postgresql://localhost:5432/neuron'
      PATH: '/Users/mpmac/.nvm/versions/node/v20.19.5/bin:/opt/homebrew/opt/postgresql@17/bin:/usr/local/bin:/usr/bin:/bin'
    timeout: 30000
    connect_timeout: 10000
```

**Acceptanskriterium:**

1. Skicka till Hermes via Signal: "Vad vet du om Powercell?"
2. Hermes anropar `mcp_kb_aurora_ask`
3. Svar returneras med källhänvisningar från Aurora-grafen

**Effort:** 1 session
**Kod-ändringar i Neuron HQ:** Inga

---

### Fas 2 — Minnesbro: Spara kunskap via Signal (1 session)

**Mål:** Marcus berättar något på Signal → Hermes sparar i Aurora med dedup + motsägelsedetektering.

**Ändring — lägg till aurora-memory scope i Hermes config:**

```yaml
mcp_servers:
  kb:
    # ... som ovan, men byt scope:
    args: ['tsx', 'src/cli.ts', 'mcp-server', '--scope', 'aurora-search,aurora-memory']
```

**OBS:** Scope-kombination kräver verifiering — kontrollera att Aurora MCP-servern stödjer kommaseparerade scopes, annars behövs en ny `--scope` som inkluderar båda.

**Minnesregel att dokumentera:**
| Minnestyp | Var det sparas | Varför |
|-----------|---------------|--------|
| Operativa anteckningar ("Min API-nyckel för X är...") | Hermes MEMORY.md | Kortlivat, agentspecifikt |
| Kunskap ("Sverige har 10M invånare") | Aurora via `aurora_memory` | Långlivat, grafkopplat, bayesian confidence |
| Preferenser ("Jag föredrar svenska") | Aurora via `aurora_memory(type=preference)` | Persistent, scope=personal |

**Acceptanskriterium:**

1. Skicka: "Kom ihåg att Marcus föredrar TypeScript framför Python"
2. Hermes anropar `mcp_kb_aurora_memory` med action=remember
3. `aurora:recall "Marcus programmeringsspråk"` returnerar faktumet

**Effort:** 1 session
**Kod-ändringar i Neuron HQ:** Troligen inga (beror på scope-kombination)

---

### Fas 3 — Morgonbriefing via Signal (1 session)

**Mål:** Kl 08:00 varje dag levereras Aurora morning briefing till Marcus via Signal.

**Ändring 1 — lägg till aurora-insights scope:**

```yaml
mcp_servers:
  kb:
    args:
      ['tsx', 'src/cli.ts', 'mcp-server', '--scope', 'aurora-search,aurora-memory,aurora-insights']
```

**Ändring 2 — Hermes cron job:**

```
# Via Hermes CLI eller config
Cron: "0 8 * * *"  (varje dag kl 08:00)
Prompt: "Kör aurora_morning_briefing och skicka resultatet till mig."
Delivery: Signal (SIGNAL_HOME_CHANNEL=+46XXXXXXXXX)
```

**Utmaning:** `aurora_morning_briefing` skriver en Obsidian-fil OCH returnerar en sammanfattning via MCP. Sammanfattningen bör räcka för Signal. Om fullständig briefing krävs behöver vi antingen:

- (a) Acceptera sammanfattningen (enklast), eller
- (b) Skapa en ny MCP-tool som returnerar hela markdown-filen

**Acceptanskriterium:**

1. Cron triggar kl 08:00
2. Marcus får briefing-sammanfattning på Signal
3. Full briefing finns i Obsidian vault

**Effort:** 1 session
**Kod-ändringar i Neuron HQ:** Troligen inga

---

### Fas 4 — Konversationslärande (1 session)

**Mål:** Hermes extraherar fakta från konversationer och matar Aurora.

**Approach:** Hermes-skill som anropas manuellt eller via cron.

```
# Hermes skill: aurora-learn
Trigger: Manuellt (/aurora-learn) eller cron (dagligen kl 23:00)
Action: Serialisera senaste konversationerna → aurora_learn_conversation
```

**Utmaningar:**

- `aurora_learn_conversation` förväntar `{messages: [{role, content}]}` — Hermes-konversationer innehåller tool calls, system messages etc. som måste filtreras
- Risk: automatisk learning av ALLA konversationer skapar brus. Bör vara opt-in.

**Acceptanskriterium:**

1. Marcus säger "/aurora-learn" efter en konversation
2. Hermes serialiserar konversationen och anropar `aurora_learn_conversation`
3. Extraherade fakta finns som Aurora-noder

**Effort:** 1 session
**Kod-ändringar i Neuron HQ:** Inga (tool finns redan)

---

### Fas 5 — Automatiserat underhåll (1-2 sessioner)

**Mål:** Decay, freshness-kontroll och kunskapsluckor körs automatiskt.

**Blockerare:** `aurora:decay` finns bara som CLI-kommando, inte som MCP-tool.

**Ny kod i Neuron HQ:**

1. `src/mcp/tools/aurora-decay.ts` — ny MCP-tool
2. Registrera i `src/mcp/scopes.ts` under `aurora-quality`
3. Uppdatera `src/mcp/tool-catalog.ts`
4. Tester i `tests/mcp/tools/aurora-decay.test.ts`

**Hermes cron jobs:**

```
# Decay — varje natt kl 03:00
Cron: "0 3 * * *"
Prompt: "Kör aurora_decay med dry_run=false och rapportera resultatet."

# Freshness-check — varje måndag kl 09:00
Cron: "0 9 * * 1"
Prompt: "Kör aurora_freshness och rapportera stale-noder till mig."
```

**Acceptanskriterium:**

1. `pnpm typecheck && pnpm test` grönt med nya filer
2. MCP-server med `--scope aurora-quality` listar `aurora_decay`
3. Cron-jobbets decay-körning skapar loggfil + Aurora-nod (som vi byggde tidigare)

**Effort:** 1-2 sessioner
**Kod-ändringar i Neuron HQ:** Ja — ny MCP-tool + tester

---

### Fas 6 — Proaktiva notifikationer (1 session)

**Mål:** Aurora upptäcker luckor/motsägelser → Marcus notifieras via Signal.

**Utmaning:** Aurora har ingen push-mekanism. Lösning: Hermes pollar via cron.

```
# Luckor + kvalitet — varje onsdag kl 10:00
Cron: "0 10 * * 3"
Prompt: "Kör aurora_gaps och aurora_suggest_research. Om det finns intressanta luckor, sammanfatta och skicka till mig."
```

**Acceptanskriterium:**

1. Cron triggar
2. Om luckor finns → Marcus får sammanfattning på Signal
3. Om inga luckor → inget meddelande (tyst)

**Effort:** 1 session
**Kod-ändringar i Neuron HQ:** Inga

---

## Risker och mitigeringar

| Risk                                                                      | Allvar | Mitigation                                        |
| ------------------------------------------------------------------------- | ------ | ------------------------------------------------- |
| **aurora_decay saknas som MCP-tool**                                      | Hög    | Bygg i Fas 5 innan automatisering                 |
| **Tool-prefix verbositet** (`mcp_aurora_aurora_ask`)                      | Medel  | Använd kort servernamn `kb` → `mcp_kb_aurora_ask` |
| **Flera Node.js-processer** om alla scopes registreras                    | Hög    | Max 1-2 MCP-servrar, kombinera scopes             |
| **DB-anslutning blockerad** av Hermes env-isolering                       | Hög    | Explicit `DATABASE_URL` + `PATH` i config         |
| **Hermes LLM väljer fel Aurora-tool**                                     | Medel  | Begränsa till 2-3 scopes (~8-10 tools)            |
| **Konversationslearning skapar brus**                                     | Medel  | Opt-in, inte automatisk                           |
| **Inget push från Aurora → Hermes**                                       | Låg    | Polling via cron (acceptabelt)                    |
| **Två minnessystem skapar förvirring**                                    | Medel  | Dokumentera minnesregel (se Fas 2)                |
| **Process-livscykel mismatch** (gateway=long-running, MCP=per-connection) | Medel  | Övervaka minnesanvändning, testa stabilitet       |

---

## GRÄNSER — Vad vi INTE gör

- **Ingen fork** av Hermes — vi konfigurerar, inte modifierar
- **Ingen custom middleware** — ren MCP stdio
- **Ingen automatisk ingest** av alla konversationer — opt-in
- **Ingen synkronisering** av Hermes MEMORY.md ↔ Aurora — separata domäner
- **Ingen Hermes-specifik kod** i Neuron HQ — alla ändringar generella
- **Inget voice memo → Aurora pipeline** i tidiga faser

---

## Beslutspunkter — Marcus svar

| Fråga               | Svar                                                        |
| ------------------- | ----------------------------------------------------------- |
| LLM-provider        | LiteLLM (router)                                            |
| Messaging-plattform | **Signal** (E2E-krypterat) — Marcus har det på iPhone       |
| Minnesregel         | ✅ Godkänd — Hermes MEMORY.md = operativt, Aurora = kunskap |
| Säkerhetspolicy     | Zero-trust                                                  |
| Briefing-format     | TBD — sammanfattning via Signal troligen tillräckligt       |

## Kvarstående fråga

1. **Briefing-format:** Räcker sammanfattning på Signal, eller vill du ha fullständig markdown?

---

## Tidsestimat

| Fas        | Effort             | Beroende  | Ändrar Neuron HQ?          |
| ---------- | ------------------ | --------- | -------------------------- |
| 0          | ~1 timme           | —         | Nej                        |
| 1          | 1 session          | Fas 0     | Nej                        |
| 2          | 1 session          | Fas 1     | Kanske (scope-kombination) |
| 3          | 1 session          | Fas 2     | Nej                        |
| 4          | 1 session          | Fas 2     | Nej                        |
| 5          | 1-2 sessioner      | Fas 1     | Ja (ny MCP-tool)           |
| 6          | 1 session          | Fas 3 + 5 | Nej                        |
| **Totalt** | **~7-8 sessioner** |           | **1 commit i Neuron HQ**   |

Fas 1-4 kräver noll kodändringar i Neuron HQ. Fas 5 är enda committen.
Faserna kan köras parallellt: 3+4 kan byggas samtidigt efter Fas 2.

---

---

## Säkerhetssammanfattning

| Lager                  | Skydd                                  | Hot som mitigeras                |
| ---------------------- | -------------------------------------- | -------------------------------- |
| **Transport**          | Signal E2E-kryptering                  | Avlyssning, MITM                 |
| **Åtkomst**            | `SIGNAL_ALLOWED_USERS` (bara Marcus)   | Obehörig tillgång till boten     |
| **Grupper**            | Avstängt (default)                     | Lateral access via grupp-invite  |
| **Shell-exekvering**   | `auto_approve_commands: false`         | LLM-initierade farliga kommandon |
| **Config-filer**       | `chmod 600`                            | Credential-läckage               |
| **DB-anslutning**      | Unix socket (inget lösenord i config)  | Credential i klartext            |
| **MCP-scope**          | Max 2-3 scopes, aldrig `--scope all`   | Överexponering av Aurora-tools   |
| **Aurora policy**      | `forbidden_patterns.txt` aktiv         | Secrets i kunskapsgrafen         |
| **LLM-beteende**       | Context-fil: "Never store secrets"     | Hallucinated memory-writes       |
| **signal-cli data**    | `chmod 700 ~/.local/share/signal-cli/` | Session-hijacking                |
| **Nätverksexponering** | Allt på localhost, inga portar öppna   | Extern åtkomst                   |

**Principer:**

- Deny-by-default på alla lager
- Ingen komponent exponerad mot internet (utom Signal-protokollet som är E2E)
- Explicit allowlist istället för blocklist
- Secrets aldrig i config om det går att undvika (Unix socket > lösenord)

---

_Genererad 2026-03-30. Uppdaterad med Signal + zero-trust-härdning._
