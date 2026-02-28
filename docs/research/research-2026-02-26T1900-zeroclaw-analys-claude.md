# ZeroClaw — Analysrapport

**Datum:** 2026-02-26 · 19:00
**Läst av:** Claude (claude-sonnet-4-6)
**Repo:** github.com/zeroclaw-labs/zeroclaw (v0.1.7)
**Källor:** README.md, AGENTS.md, Cargo.toml, src/-katalog, GitHub

---

## 1. Vad är ZeroClaw?

ZeroClaw är en **Rust-baserad single-agent runtime** — en "operativ miljö" för att köra
en autonom AI-assistent var som helst, på vad som helst. Tagline:
*"Zero overhead. Zero compromise. 100% Rust. 100% Agnostic."*

Det är **inte** ett multi-agent-system. Det är en host för EN agent, som kan
prata med många kanaler (Telegram, Discord, Slack, iMessage, WhatsApp, Matrix, Signal...)
och använda många verktyg (shell, fil, browser, git, HTTP, cron, hardware).

**Nyckeltal:**
- `<5MB RAM` i drift
- `~8.8MB` binär
- `<10ms` cold start
- Körs på `$10`-hårdvara (Raspberry Pi, STM32)
- 27+ contributors, Harvard/MIT/Sundai.Club-community
- 7 språk i dokumentationen

---

## 2. Arkitektur

ZeroClaw är **trait-driven** — varje subsystem implementerar ett trait och kan bytas
ut med en config-ändring utan kodändring:

| Trait | Vad det abstraherar |
|---|---|
| `Provider` | AI-modell (Claude, OpenAI, Gemini, lokal) |
| `Channel` | Kommunikationskanal (Telegram, Discord, CLI...) |
| `Tool` | Verktyg (shell, fil, browser, git, cron...) |
| `Memory` | Minnes-backend (Markdown, SQLite, PostgreSQL) |
| `Observer` | Observability (Prometheus, OpenTelemetry) |
| `Runtime` | Körnings-sandlåda (native, Docker, WASM) |
| `Peripheral` | Hårdvara (STM32 GPIO, Raspberry Pi, USB) |

**Src-katalogen** avslöjar ytterligare moduler som inte är dokumenterade i README:

- `rag/` — eget RAG-system (SQLite + FTS5 + cosine similarity + BM25 hybrid search)
- `skillforge/` + `skills/` — ett skills-system (plugin-liknande förmågor)
- `sop/` — Standard Operating Procedures (regelstyrda beteenden)
- `coordination/` — möjlig multi-agent-koordinering (oklart omfång)
- `goals/` — målspårning för agenten
- `hooks/` — event hooks (liknande Neuron HQ:s policy-system)
- `tunnel/` — säker tunnel (remote access)
- `daemon/` — bakgrundstjänst-läge

**Memory-systemet** är imponerande:
- SQLite-vektorsökning med cosine similarity
- FTS5 keyword-indexering med BM25-scoring
- Hybrid search som kombinerar båda
- LRU embedding-cache
- Valfri PostgreSQL-backend

---

## 3. Jämförelse med Neuron HQ

| Dimension | Neuron HQ | ZeroClaw |
|---|---|---|
| **Syfte** | Orchestrera agent-svärmars mjukvaruutveckling | Vara en personlig AI-assistent som körs 24/7 |
| **Antal agenter** | Många (Manager, Implementer, Reviewer, Researcher, Merger...) | En enda agent |
| **Språk** | TypeScript | Rust |
| **Minne** | Stateless per körning (artifacts i filer) | Persistent (SQLite/Markdown + embeddings) |
| **Kanaler** | Ingen (CLI-driven) | 15+ (Telegram, Discord, Slack, iMessage...) |
| **Körning** | Episodisk (körning → rapport → godkännande) | Kontinuerlig (daemon, alltid på) |
| **Målmiljö** | Laptop / server | $10-hårdvara, IoT, edge |
| **AI-provider** | Claude (Anthropic SDK) | Agnostisk (Claude, OpenAI, Gemini, lokal) |

**Neuron gör saker ZeroClaw inte gör:**
- Multi-agent-koordinering med specialiserade roller
- Automatisk kod-review och testverifiering
- Policy-enforcement mot ett målrepo
- Strukturerade artifacts (brief, baseline, report, audit.jsonl)

**ZeroClaw gör saker Neuron inte gör:**
- Alltid-på, svarar på meddelanden i realtid
- Hardware-integration (GPIO, STM32, USB)
- 15+ kommunikationskanaler
- Extremt litet fotspår (kan köras på IoT-enheter)
- Inbyggt skills-system och SOP-motor

**Kan ZeroClaw ersätta Neuron?** Nej — de är designade för fundamentalt olika problem.
ZeroClaw är ett *personal assistant OS*; Neuron är ett *software development swarm controller*.
De kompletterar varandra snarare än konkurrerar.

---

## 4. Passar ZeroClaw för Aurora?

**Ja — som leveranslager.** Det är den mest naturliga integrationen.

### Scenario A: ZeroClaw som chat-frontend för Aurora

```
Användare (Telegram)
    ↓
ZeroClaw (runtime, alltid på, kör på t.ex. Hetzner-server)
    ↓  (HTTP-anrop eller shell-verktyg)
Aurora (Python RAG-backend, "ask"-endpoint)
    ↓
Svar tillbaka via Telegram
```

Aurora saknar idag ett live chat-interface. ZeroClaw löser exakt det problemet
— och stöder Telegram som Marcus redan använder som kommunikationskanal.

### Scenario B: ZeroClaw triggar Aurora-ingest

ZeroClaw kan ta emot URLs, YouTube-länkar eller filer via Telegram och
anropa Auroras ingest-pipeline med sitt `shell`-verktyg:

```
Användare: "Indexera den här videon: youtube.com/..."
ZeroClaw → shell: python -m app.cli.main add-url youtube.com/...
Aurora: indexerar → svarar OK
ZeroClaw: "Klart! Videon är indexerad."
```

### Överlapp att hantera

ZeroClaw har ett eget RAG-system (`rag/`-modulen) med SQLite + FTS5 + embeddings.
Det **överlappar** med Auroras kunskapsbas. Två alternativ:

- **Alternativ 1:** ZeroClaw används enbart som chat-frontend; Auroras RAG används för alla sökningar
- **Alternativ 2:** ZeroClaw kör sin egen snabb lokal sökning för enkel info; Aurora används för djupare frågor

Alternativ 1 är enklare och undviker dubbel-indexering.

### Vad som krävs för integration

1. Aurora behöver ett HTTP API (idag finns MCP-server, men ingen enkel REST-endpoint för "ask")
2. ZeroClaw behöver konfigureras med ett Aurora-skill eller SOP
3. Autentisering mellan ZeroClaw och Aurora (löses med secrets-systemet i ZeroClaw)

---

## 5. Allmänna reflektioner

### Imponerande

- **Teknisk ambition:** RAG, hardware-integration, 15+ kanaler, sub-10ms startup — allt i Rust
- **AGENTS.md:** Bland de bäst skrivna agent-protokolldokumenten jag sett. Tydliga principer (KISS, YAGNI, DRY), risk-tiers, anti-patterns, handoff-template
- **Dokumentationssystem:** Flerspråkigt, välstrukturerat, behandlas som "first-class product surface"
- **SOP-systemet:** Regelstyrda beteenden för agenten är en elegant idé — liknande Neuron:s policy-system men mer flexibelt
- **Skills-systemet (`skillforge`):** Plugin-liknande förmågor som kan läggas till utan kodändring

### Svagheter / risker

- **v0.1.7 — tidigt stadium:** 27 contributors, sannolikt snabb API-rörlighet
- **Inga tester i rapport:** Testmognad oklar — `cargo test` körs men testtäckning okänd
- **Single-agent-begränsning:** Coordination-modulen finns, men multi-agent är inte kärnkoncept
- **Rust-barriär:** Att utöka ZeroClaw kräver Rust-kunskaper — högre tröskel än TypeScript (Neuron) eller Python (Aurora)
- **Kinesisk community-fokus:** WeChat-group, Xiaohongshu, `zh-CN` som primärt i18n — projektet verkar ha stark kinesisk community vilket kan påverka roadmap-prioriteringar

### Idéer att stjäla till Neuron/Aurora

| Idé | Från ZeroClaw | Tillämpning |
|---|---|---|
| **SOP-system** | `sop/`-modulen — regelstyrda beteenden | Neuron: strukturerade körningsprotokoll utöver brief |
| **Skills-system** | `skillforge/` — plugin-förmågor | Neuron: återanvändbara agent-skills (t.ex. "test-runner") |
| **Hybrid search** | FTS5 + vector + BM25 | Aurora: komplettera rena embeddings med nyckelordssökning |
| **LRU embedding-cache** | Memory-systemet | Aurora: cача embedding-resultat för vanliga queries |
| **Goals-tracking** | `goals/`-modulen | Neuron: explicit målspårning per körning |
| **Daemon-mode** | `daemon/` | Aurora workers: kör som systemtjänst, inte manuellt |

---

## Sammanfattning

ZeroClaw är ett väldesignat, ambitiöst projekt med en tydlig nisch: *personal AI assistant OS för edge-deployment*. Det är inte en konkurrent till Neuron HQ utan ett komplement.

**Rekommendation:** Använd ZeroClaw som chat-frontend för Aurora. Det löser Auroras
saknade leveranslager (hur når användaren Aurora?) och utnyttjar ZeroClaw:s styrkor
(alltid på, Telegram-integration, Rust-snabbhet) utan att duplicera Auroras RAG-logik.

En konkret nästa körning: Aurora-brief för att exponera ett enkelt `POST /ask`-endpoint
som ZeroClaw kan anropa via sitt HTTP-verktyg.
