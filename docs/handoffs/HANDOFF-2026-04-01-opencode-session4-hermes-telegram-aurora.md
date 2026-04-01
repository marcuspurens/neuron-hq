# Handoff — OpenCode Session 4 (2026-04-01)

> **Agent:** Atlas (OhMyOpenCode Master Orchestrator)
> **Commits:** uncommitted (changes in working tree — see below)
> **Tests:** 3949 green, typecheck green
> **Duration:** ~4 hours

---

## Session Summary

This session integrated Hermes Agent with Aurora via Telegram as the messaging layer. Signal was attempted but failed due to a known signal-cli protocol incompatibility with current Signal iOS. Telegram was deployed as replacement. The session also improved the Obsidian integration (chunk filtering, tags, highlight plugin).

---

## What Was Done

### 1. Baseline Fix

Three failing tests in `tests/commands/aurora-decay.test.ts` from session 3's uncommitted `aurora-decay.ts` changes. Fixed by updating test mocks to match new multi-query flow (snapshot SELECT → decay → after-values SELECT → INSERT aurora_node) and mocking `fs/promises`.

### 2. Hermes Agent Installation

- `~/.hermes/hermes-agent/` — Hermes v0.5.0 (Nous Research, Python 3.11, MIT)
- Dependencies installed: 77 packages including `mcp==1.26.0` (was missing from base install, caused `StdioServerParameters` runtime error)
- `hermes` command symlinked to `~/.local/bin/hermes`
- Installed via: `curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash`

### 3. signal-cli Attempt (FAILED)

- `signal-cli 0.14.1` + `openjdk@17` installed via Homebrew
- `qrencode` installed for QR generation
- `signal-cli link -n "HermesAgent"` generates `sgnl://linkdevice?uuid=...` URI
- Signal iOS app rejects the QR: "QR code not valid"
- Root cause: Signal changed linking protocol; signal-cli 0.14.1 QR format not accepted by current Signal iOS. Known upstream issue.
- **Decision:** Switch to Telegram for messaging layer

### 4. Telegram Gateway (DEPLOYED AND VERIFIED)

- Bot created via @BotFather: `@hermesaurora_bot`, token stored in `~/.hermes/.env`
- `python-telegram-bot==22.7` installed in Hermes venv
- `hermes gateway start` → launchd service `ai.hermes.gateway` running at login
- Gateway log confirms: `✓ telegram connected (polling mode)`
- **Marcus confirmed: chatted with Hermes via Telegram** ✅

### 5. LiteLLM Configuration

- Provider: `https://litellm.app.aurora.svt.se/v1` (SVT internal LiteLLM proxy)
- Model: `claude-sonnet-4-6`
- OPENAI_API_KEY set in `~/.hermes/.env` (format required by Hermes custom provider)
- Verified: `GET /v1/models` → HTTP 200, 20 models including `claude-sonnet-4-6`

### 6. Aurora MCP Integration

- `~/.hermes/config.yaml` mcp_servers section:
  ```yaml
  mcp_servers:
    kb:
      command: npx
      args: ['tsx', 'src/cli.ts', 'mcp-server', '--scope', 'aurora-search']
      cwd: '/Users/mpmac/Documents/VS Code/neuron-hq'
      env:
        DATABASE_URL: 'postgresql://localhost:5432/neuron'
        PATH: '/Users/mpmac/.nvm/versions/node/v20.19.5/bin:...'
      timeout: 30
      connect_timeout: 10
  ```
- `hermes mcp test kb` → `✓ Connected (8805ms)`, `✓ Tools discovered: 3`
- Tools: `aurora_search`, `aurora_ask`, `aurora_status`
- End-to-end CLI test: `hermes chat -Q -q "Använd aurora_status..."` returned 85 nodes, 74 edges ✅

### 7. Security Hardening

- `chmod 600 ~/.hermes/config.yaml ~/.hermes/.env`
- `~/.hermes/context/security.md` installed (LLM behavior rules: no secrets, approve commands, etc.)
- `TELEGRAM_ALLOWED_USERS=8426706690` (Marcus only)
- `gray-matter` npm package installed (blocked MCP server startup)

### 8. Obsidian Export: Chunk Filtering

**Problem:** Export wrote 51 files — most were `[chunk X_Y]` duplicates of parent articles.

**Fix in `src/commands/obsidian-export.ts`:**

- Added `if (node.id.includes('_chunk_')) continue;` in main write loop
- Filtered chunk IDs from edge rendering (Kopplingar section)
- Filtered chunk IDs from stale-file cleanup

Result: 51→16 nodes in Obsidian vault. Only parent articles, transcripts, facts visible.

Updated test: `excludes chunk nodes for non-video document nodes` (was `exports chunks normally...`).

### 9. Auto-Tags on Ingest

**Added `extractTags()` to `src/aurora/intake.ts`:**

Pure function, no LLM, generates tags from:

1. Domain from `sourceUrl` (e.g. `svt.se`)
2. Language from metadata
3. Platform from metadata
4. Keywords from title (≥4 chars, filtered stopwords, first 10)

Tags stored in `properties.tags` array on parent document node (not chunks).

**Updated `src/commands/obsidian-export.ts` `formatFrontmatter()`:**

```yaml
tags: [svt.se, svenska, powercell, miljardsatsar]
```

Obsidian recognizes this format as clickable/searchable tags.

### 10. Obsidian Highlight Plugin

Created community plugin at `/Users/mpmac/Documents/Neuron Lab/.obsidian/plugins/aurora-highlight/`:

- `manifest.json` — plugin metadata
- `main.js` — plugin code (no bundler needed for Obsidian community plugins)

Usage:

1. Activate in Obsidian → Settings → Community plugins → Aurora Highlight → Enable
2. Select text in any document
3. Cmd+P → "Spara markerad text till Aurora" OR click bookmark ribbon icon
4. Optional tags dialog appears
5. Calls `aurora:remember` CLI with selected text, tags, source file
6. Notice: "✅ Sparat till Aurora!"

---

## Current State

```
hermes_version:    0.5.0
telegram_gateway:  running (launchd ai.hermes.gateway)
telegram_bot:      @hermesaurora_bot
hermes_mcp_tools:  3 (aurora_search, aurora_ask, aurora_status)
aurora_nodes:      85
tests:             3949/3949 green
typecheck:         clean
```

---

## What Was NOT Done

- **Signal linking** — protocol mismatch, deferred indefinitely. signal-cli + Java remain installed but unused.
- **Fas 2 (Minnesbro)** — adding `aurora-memory` scope to Hermes MCP. Config change only, 5 min.
- **Fas 3 (Morgonbriefing)** — cron job for 08:00 briefing via Telegram.
- **Fas 5 (MCP-tool for aurora:decay)** — the only Neuron HQ code change from the gameplan.
- **Tags for existing nodes** — `extractTags()` only runs on new ingests. Existing 85 nodes unchanged.
- **Obsidian plugin tested by Marcus** — plugin installed but Marcus had not tested it at handoff time.

---

## Next Session Actions

Priority order:

1. **Verify Obsidian plugin works** — Marcus tests highlight → Aurora flow
2. **Test URL ingest via Telegram** — send URL to @hermesaurora_bot, verify it lands in Aurora + Obsidian
3. **Fas 2: Add aurora-memory scope** — edit `~/.hermes/config.yaml`, add `aurora-search,aurora-memory` to args
4. **Fas 3: Morning briefing cron** — configure Hermes cron for 08:00
5. **Fas 5: aurora_decay MCP tool** — new file `src/mcp/tools/aurora-decay.ts`, register in scopes.ts
6. **Commit current changes** — `src/commands/obsidian-export.ts`, `src/aurora/intake.ts`, test files

---

## Gameplan Reference

Full gameplan: `docs/plans/GAMEPLAN-HERMES-AURORA-2026-03-30.md`

Status:

- Fas 0: ✅ Complete (Hermes installed, configured, hardened — Signal replaced by Telegram)
- Fas 1: ✅ Complete (Hermes ↔ Aurora MCP working, Marcus chatting via Telegram)
- Fas 2: ⬜ Pending (5 min config change)
- Fas 3: ⬜ Pending (cron setup)
- Fas 4: ⬜ Pending (conversation learning, opt-in)
- Fas 5: ⬜ Pending (MCP tool for decay — only code change in Neuron HQ)
- Fas 6: ⬜ Pending (proactive notifications via cron)

---

## External Config (NOT in repo)

These files were changed outside the Neuron HQ repo — not tracked by git:

| File                                                                    | Change                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `~/.hermes/config.yaml`                                                 | LiteLLM provider, model claude-sonnet-4-6, Aurora MCP server kb                      |
| `~/.hermes/.env`                                                        | OPENAI_API_KEY, TELEGRAM_BOT_TOKEN=8685428077:..., TELEGRAM_ALLOWED_USERS=8426706690 |
| `~/.hermes/context/security.md`                                         | LLM behavior rules                                                                   |
| `~/Library/LaunchAgents/ai.hermes.gateway.plist`                        | Launchd service for Telegram gateway                                                 |
| `~/.hermes/hermes-agent/venv/`                                          | Python venv with mcp==1.26.0, python-telegram-bot==22.7                              |
| `/Users/mpmac/Documents/Neuron Lab/.obsidian/plugins/aurora-highlight/` | Obsidian plugin                                                                      |
| `/Users/mpmac/Documents/Neuron Lab/.obsidian/community-plugins.json`    | Plugin registered                                                                    |

---

## Uncommitted Changes in Repo

```
src/commands/aurora-decay.ts           (session 3 artifact — large uncommitted changes)
src/commands/obsidian-export.ts        (chunk filter + tags, this session)
src/aurora/intake.ts                   (extractTags, this session)
tests/commands/aurora-decay.test.ts    (fixed 3 tests, this session)
tests/commands/obsidian-export.test.ts (updated chunk test + subagent style reformatting)
docs/dagbocker/DAGBOK-LLM.md           (this update)
docs/plans/GAMEPLAN-HERMES-AURORA-2026-03-30.md (new, this session)
docs/plans/hermes-security-context.md  (new, this session)
docs/plans/hermes-setup.sh             (new, this session)
docs/handoffs/HANDOFF-2026-04-01-...   (this file)
```

Recommend committing in two separate commits:

1. `feat: add auto-tags to aurora ingest + fix obsidian-export chunk filter`
2. `docs: hermes-telegram gameplan, session 4 handoff, dagbok update`
