# Dagbok för seniora utvecklare

**Vad är det här?**
Teknisk logg över arkitekturbeslut, filförändringar, körresultat och designmönster. En ingångspunkt för alla som vill förstå _vad_ som ändrades och _varför_ — utan omvägar.

**Vem skriver?** Aktiv agent (Atlas/Claude) under sessioner. Marcus vid manuella commits.

**Format:** Datumrubrik + tabell för händelser + fritext för beslut som behöver kontext.

**Historik:** Sessioner S1–S150 + körningar #1–#183 finns i `docs/DAGBOK.md` (pre-2026-03-26). Session-level detaljer finns i `docs/handoffs/`. Arkitekturbeslut i `docs/adr/`.

---

## Kodbasstatistik (baseline 2026-03-26)

| Metrik            | Värde                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tester            | 3949 (Vitest)                                                                                                                                                 |
| Agenter           | 13 (Manager, Implementer, Reviewer, Researcher, Librarian, Historian, Tester, Consolidator, Knowledge Manager, Merger, Observer, Brief Reviewer, Code Anchor) |
| Körningar         | 183 totalt (varav ~120 GREEN)                                                                                                                                 |
| Aurora idénoder   | 924                                                                                                                                                           |
| Roadmap Fas 3     | 26/32 tasks done                                                                                                                                              |
| TypeScript strict | noUncheckedIndexedAccess + strictNullChecks + NodeNext                                                                                                        |

---

## Hur man skriver

- Svenska med engelska tekniska termer (standard dev-kultur)
- Filreferenser med sökväg: `src/core/agents/manager.ts:45`
- Körresultat med AC-count, testräkning, kostnad
- Taggar: SESSION, KÖRNING, BESLUT, BRIEF, FIX, REFACTOR, TEST, BUILD, PROBLEM

---

## 2026-03-26

### Tooling-migration: VS Code + Claude Opus → OpenCode + LiteLLM

**Vad ändrades:**

- Primärt gränssnitt: VS Code (Cursor-fork) → OpenCode
- Model routing: direkt Anthropic API → LiteLLM proxy (multi-model)
- Aktiv modell idag: `claude-opus-4-6` via `svt-litellm/` prefix
- Orkestrator: Claude Opus (informell) → Atlas (OhMyOpenCode Master Orchestrator)

**Vad ändrades INTE:**

- Kodbasen (ingen prod-kod ändrad idag)
- Test suite (3949 tester intakta)
- Policy-filer (`policy/bash_allowlist.txt`, `policy/forbidden_patterns.txt`)
- Aurora-integrationen (MCP server, pgvector, Obsidian)

**Varför bytet?**
LiteLLM ger model-agnostisk routing — samma prompt-infrastruktur kan använda Opus, Sonnet, Haiku, eller open-source-modeller utan att ändra agentkoden. Atlas-orkestratorn ger strukturerad multi-task-planering som Opus-i-VS Code inte hade formellt.

| Tid    | Typ     | Vad hände                                                                        |
| ------ | ------- | -------------------------------------------------------------------------------- |
| ~09:00 | BESLUT  | LiteLLM proxy aktiv. Model prefix: `svt-litellm/`                                |
| ~09:15 | SESSION | Första Atlas-sessionen. Plan: skapa tre dagböcker i `docs/dagbocker/`            |
| ~09:30 | FIX     | `docs/dagbocker/` skapad. DAGBOK-MARCUS.md, DAGBOK-DEV.md, DAGBOK-LLM.md skrivna |

### Roadmap-kontext

Vi är på **Fas 2 (Intelligens)** i ROADMAP.md. Fas 1 (Daglig nytta) är komplett sedan 2026-03-19.

Nästa kritiska milstolpe: Aurora-integration. Neuron har aldrig körts mot Aurora som target-repo. Körningarna `A1`–`A6` i ROADMAP-AURORA.md täcker detta.

Prioriterade briefs som väntar:

- `3.6` (KRITISK — identifierad i S144)
- `3.7`, `3.8`
- Aurora-serien `A1`–`A2` (obligatoriska)

### Aktiva risker

- **Code Anchor output-trunkering** (HÖG risk, identifierad S149). Brief finns: `briefs/2026-03-25-code-anchor-hardening.md`. Inte körts ännu.
- **Aurora MCP version mismatch** (MCP 1.25 vs 1.26). Identifierat S145. Åtgärd oklar.
- **Brief 3.2a** räddades manuellt från workspace (S138) — bör verifieras att merge-artefakter är kompletta.

---
