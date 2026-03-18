# Neuron HQ — Komplett Arkitektur

> Session 90 · 2026-03-16 · 143 körningar · 2371 tester · 32 MCP-tools

---

## Systemöversikt

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ANVÄNDAREN                                   │
│                                                                     │
│    CLI (terminal)              Claude Desktop (MCP-klient)          │
│    ┌──────────────┐            ┌──────────────────────────┐         │
│    │ npx tsx cli   │            │  Prompts (19 genvägar)   │         │
│    │  run / resume │            │  Skills (8 SKILL.md)     │         │
│    │  costs / jobs │            │  Tools (32 verktyg)      │         │
│    └──────┬───────┘            └────────────┬─────────────┘         │
└───────────┼─────────────────────────────────┼───────────────────────┘
            │                                 │
            │ CLI-kommando                    │ JSON-RPC (stdio)
            ▼                                 ▼
┌──────────────────────┐        ┌──────────────────────────────────┐
│   RunOrchestrator    │        │         MCP Server               │
│                      │        │                                  │
│  • Skapar workspace  │        │  10 scopes × tools + prompts     │
│  • Policy-kontroll   │        │  Notifikations-wrapper (jobb)    │
│  • Baseline-test     │        │  createMcpServer(scope?)         │
│  • Startar Manager   │        │                                  │
└──────────┬───────────┘        └──────────────┬───────────────────┘
           │                                   │
           │                                   │
           ▼                                   │
┌──────────────────────────────────────────────┼───────────────────┐
│                                              │                   │
│                    AGENTLAGER                 │                   │
│                                              ▼                   │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │                    MANAGER                               │     │
│  │            (Orkestrerare, max 50 iterationer)            │     │
│  │                                                         │     │
│  │  Adaptive Hints: beliefs → varningar/styrkor            │     │
│  │  Task Plan: atomära uppgifter → våg-exekvering          │     │
│  └───┬────┬────┬────┬────┬────┬────┬────┬────┬────────────┘     │
│      │    │    │    │    │    │    │    │    │                    │
│      ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼    ▼                    │
│  ┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐       │
│  │Imple-││Revie-││Resear││Tester││Merger││Histo-││Libra-│       │
│  │menter││wer   ││cher  ││      ││      ││rian  ││rian  │       │
│  │      ││      ││      ││      ││      ││      ││      │       │
│  │Skri- ││STOP- ││Idéer ││PASS/ ││Commi-││Minne ││Arxiv │       │
│  │ver   ││LIGHT ││Käl-  ││FAIL  ││ttar  ││Graf  ││Tekni-│       │
│  │kod   ││GREEN/││lor   ││      ││till  ││Decay ││ker   │       │
│  │      ││YELLOW││      ││      ││target││      ││      │       │
│  │[S]   ││[S]   ││[H]   ││[S]   ││[S]   ││[H]   ││[H]   │       │
│  └──┬───┘└──────┘└──────┘└──────┘└──────┘└──┬───┘└──────┘       │
│     │                                        │                    │
│     │  ┌──────────┐  ┌──────────────┐        │                    │
│     │  │Consoli-  │  │Knowledge     │        │                    │
│     │  │dator     │  │Manager       │        │                    │
│     │  │          │  │              │        │                    │
│     │  │Dedup     │  │Auto-research │        │                    │
│     │  │Merge     │  │Web-sök       │        │                    │
│     │  │noder     │  │Gap-filling   │        │                    │
│     │  │[S]       │  │Topic chain   │        │                    │
│     │  └──────────┘  └──────────────┘        │                    │
│     │                                        │                    │
│  [S] = Sonnet    [H] = Haiku                 │                    │
│                                              │                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                   DELADE VERKTYG                          │    │
│  │  bash_exec · read_file · write_file · list_files          │    │
│  │  graph_query · graph_traverse · graph_assert · ...        │    │
│  │  PolicyEnforcer (allowlist + forbidden + filscope)         │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
            │                                   │
            ▼                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│                         DATALAGER                                │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────────────────────┐     │
│  │   Filsystem      │    │      PostgreSQL 17 + pgvector    │     │
│  │   (alltid)       │    │      (valfritt, accelererar)     │     │
│  │                  │    │                                  │     │
│  │  memory/         │    │  kg_nodes (1024-dim embeddings)  │     │
│  │   graph.json     │    │  kg_edges                        │     │
│  │  runs/<runid>/   │    │  runs + usage + metrics          │     │
│  │   report.md      │    │  audit_entries                   │     │
│  │   audit.jsonl    │    │  task_scores                     │     │
│  │   usage.json     │    │  aurora_nodes + aurora_edges     │     │
│  │   ...11 filer    │    │                                  │     │
│  └─────────────────┘    └──────────────────────────────────┘     │
│                                                                  │
│  Skrivordning: Fil först → DB sedan (DB-fel = icke-fatalt)       │
│  Läsordning:   DB först → fil-fallback                           │
│                                                                  │
│  ┌─────────────────┐    ┌──────────────────────────────────┐     │
│  │   Ollama         │    │      Anthropic API               │     │
│  │   (lokal)        │    │      (moln)                      │     │
│  │                  │    │                                  │     │
│  │  snowflake-      │    │  Claude Sonnet / Haiku           │     │
│  │  arctic-embed    │    │  Agent SDK                       │     │
│  │  (1024 dim)      │    │  Tool use                        │     │
│  │                  │    │                                  │     │
│  │  qwen3-vl:8b    │    │                                  │     │
│  │  (bildanalys)    │    │                                  │     │
│  └─────────────────┘    └──────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
```

---

## MCP: Tre lager

```
┌─────────────────────────────────────────────────────────────┐
│  LAGER 3: SKILLS (cross-server orkestrering)                │
│                                                             │
│  8 SKILL.md-filer i .claude/skills/                         │
│  Kedjar tools från FLERA scopes                             │
│                                                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │researcha-  │ │indexera-   │ │kunskaps-   │  ...5 till   │
│  │amne        │ │och-lar     │ │cykel       │              │
│  │            │ │            │ │            │              │
│  │search →    │ │ingest →    │ │search →    │              │
│  │insights →  │ │quality →   │ │insights →  │              │
│  │library     │ │memory      │ │library →   │              │
│  │            │ │            │ │quality     │              │
│  └────────────┘ └────────────┘ └────────────┘              │
├─────────────────────────────────────────────────────────────┤
│  LAGER 2: MCP PROMPTS (genvägar inom ett scope)             │
│                                                             │
│  19 prompts med svenska namn                                │
│  Syns i Claude Desktop "+" menyn                            │
│                                                             │
│  sok-och-svara · vad-vet-vi · full-briefing · indexera-     │
│  video · speaker-review · kvalitetsrapport · dashboard ...  │
├─────────────────────────────────────────────────────────────┤
│  LAGER 1: MCP SERVRAR (32 tools i 10 scopes)               │
│                                                             │
│  Aurora (8 scopes)              Neuron (2 scopes)           │
│  ┌──────────┐ ┌──────────┐     ┌──────────┐ ┌──────────┐   │
│  │search    │ │insights  │     │runs      │ │analytics │   │
│  │3 tools   │ │3 tools   │     │3 tools   │ │4 tools   │   │
│  ├──────────┤ ├──────────┤     └──────────┘ └──────────┘   │
│  │memory    │ │ingest-   │                                  │
│  │3 tools   │ │text      │     Konsoliderade tools:         │
│  ├──────────┤ │2 tools   │     speakers   8 → 1 (actions)  │
│  │ingest-   │ ├──────────┤     jobs        4 → 1            │
│  │media     │ │library   │     memory      3 → 1            │
│  │4 tools   │ │2 tools   │     freshness   2 → 1            │
│  ├──────────┤ ├──────────┤     cross_ref   2 → 1            │
│  │media     │ │quality   │                                  │
│  │3 tools   │ │4 tools   │     Totalt: 45 → 32 tools       │
│  └──────────┘ └──────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Körningsflöde (en körning start till slut)

```
Användaren: npx tsx src/cli.ts run neuron-hq --brief briefs/xyz.md --hours 1
     │
     ▼
┌─ RunOrchestrator ──────────────────────────────────────────────┐
│  1. Skapa runid (20260316-0246-neuron-hq)                      │
│  2. Kopiera target → workspaces/<runid>/                       │
│  3. Skapa runs/<runid>/ med artifacts                          │
│  4. Kör baseline-test → baseline.md                            │
│  5. Starta Manager                                             │
└────────────────────────────┬───────────────────────────────────┘
                             │
     ┌───────────────────────▼───────────────────────────────┐
     │                    MANAGER-LOOP                        │
     │              (max 50 iterationer)                      │
     │                                                       │
     │  Iteration 1: Researcher → ideas.md, sources.md       │
     │  Iteration 2: Implementer(er) → kod (parallell!)      │
     │      ┌──────────┬──────────┬──────────┐               │
     │      │ Task A   │ Task B   │ Task C   │  ← Våg 1     │
     │      │ worktree │ worktree │ worktree │               │
     │      └──────────┴──────────┴──────────┘               │
     │  Iteration 3: Tester → PASS/FAIL                      │
     │  Iteration 4: Reviewer → report.md (STOPLIGHT)        │
     │      │                                                │
     │      ├─ RED?   → Implementer fixar → Tester → loop   │
     │      ├─ YELLOW? → Manager beslutar                    │
     │      └─ GREEN? → Merger → Historian → KLAR            │
     │                                                       │
     └───────────────────────────────────────────────────────┘
                             │
                             ▼
     ┌──────────────────────────────────────────────────────┐
     │                   RESULTAT                            │
     │                                                      │
     │  runs/<runid>/report.md    ← STOPLIGHT + instruktion │
     │  runs/<runid>/questions.md ← blockers (max 3)        │
     │  runs/<runid>/ideas.md     ← forskningsidéer         │
     │  runs/<runid>/usage.json   ← token-kostnad           │
     │  + 7 andra artifacts                                 │
     │                                                      │
     │  Om GREEN: kod committat till target-repo             │
     └──────────────────────────────────────────────────────┘
```

---

## 11 Agenter — roller och modeller

| # | Agent | Modell | Roll | Input | Output |
|---|-------|--------|------|-------|--------|
| 1 | **Manager** | Sonnet | Orkestrerare | Brief + beliefs | Task plan, delegering |
| 2 | **Implementer** | Sonnet | Kodskrivare | Atomär uppgift | Kod + handoff |
| 3 | **Reviewer** | Sonnet | Kvalitetsgrind | Alla ändringar | STOPLIGHT-rapport |
| 4 | **Researcher** | Haiku | Utforskare | Brief + kodbas | Idéer + källor |
| 5 | **Tester** | Sonnet | Testgrind | Workspace | PASS / FAIL |
| 6 | **Merger** | Sonnet | Integrerare | GREEN-rapport | Commit i target |
| 7 | **Historian** | Haiku | Minnesskrivare | Körningsdata | Graf-noder, decay |
| 8 | **Librarian** | Haiku | Forskare | Kunskapsluckor | Tekniker, arxiv |
| 9 | **Consolidator** | Sonnet | Grafunderhåll | Duplikat-noder | Merge-rapport |
| 10 | **Brief Agent** | Sonnet | Brief-skapare | Interaktiv dialog | briefs/*.md |
| 11 | **Knowledge Manager** | Varierande | Autonom forskning | Luckor + web | Kunskap, artiklar |

---

## Kunskapsgraf

```
┌─────────────────────────────────────────────────────┐
│               KUNSKAPSGRAF                           │
│                                                     │
│  5 nodtyper:                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ pattern  │ │ error    │ │technique │            │
│  │ (lösning)│ │ (problem)│ │(forskning│            │
│  └─────┬────┘ └────┬─────┘ └────┬─────┘            │
│        │ solves     │ causes     │ related_to       │
│        └────────────┘            │                  │
│  ┌──────────┐ ┌──────────┐      │                  │
│  │  run     │ │  agent   │──────┘                  │
│  │(körning) │ │(obs.)    │  used_by                │
│  └──────────┘ └──────────┘                          │
│                                                     │
│  Confidence decay: 0.9× per cykel                   │
│  Semantic dedup: ≥0.9 → blockera, ≥0.8 → varna     │
│  Bayesiskt: beliefs → Manager-hints                 │
│  122 noder · 77 kanter · 1024-dim embeddings        │
└─────────────────────────────────────────────────────┘
```

---

## Teknisk stack

| Lager | Teknologi |
|-------|-----------|
| Språk | TypeScript (strict, NodeNext) |
| Runtime | Node.js 20 |
| Pakethanterare | pnpm |
| AI | Anthropic SDK (Claude Sonnet + Haiku) |
| MCP | @modelcontextprotocol/sdk (stdio) |
| Databas | PostgreSQL 17 + pgvector |
| Embeddings | Ollama + snowflake-arctic-embed (1024 dim) |
| Vision | Ollama + qwen3-vl:8b |
| Validering | Zod |
| Test | Vitest (2371 tester) |
| CLI | Commander.js |

---

## Siffror i korthet

- **11** agenter (3 exekverare, 8 specialister)
- **10** MCP-scopes (8 Aurora, 2 Neuron)
- **32** MCP-tools (konsoliderat från 45)
- **19** MCP-prompts (svenska)
- **8** Skills (cross-server)
- **143** körningar genomförda
- **2371** tester
- **16** databasmigrationer
- **122** kunskapsnoder med embeddings
