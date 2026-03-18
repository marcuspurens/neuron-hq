# Research: Real-time Agent Dashboard

> 2026-03-16 · Session 90b

## Vad vi söker

Ett "kontrollrum" som visar i realtid vad varje agent gör under en körning — live task-status, parallella Implementers, STOPLIGHT-resultat.

---

## Tier 1: Bäst för Neuron HQ

### 1. Langfuse (open source, self-hosted) — REKOMMENDERAT

Starkaste kandidaten. MIT-licens, framework-agnostisk, mogen TypeScript SDK baserad på OpenTelemetry.

- **Traces:** Varje LLM-anrop, tool use, agent-handoff som hierarkiska spans. Nästan noll overhead (asynkron).
- **Multi-agent:** Manager, Implementer, Reviewer etc. syns som parent-child spans i en session.
- **Dashboard:** Webb-UI med trace viewer, kostnads-tracking, latens per modell/session.
- **Claude Agent SDK:** Officiell integration finns (langfuse.com).
- **Self-hosted:** Docker Compose, kräver Postgres (redan finns!).
- **TypeScript:** Förstklassig SDK.

**Plus:** Open source, self-hosted, TypeScript-native, OpenTelemetry, Claude SDK-stöd, prompt versioning, kostnad.
**Minus:** Mer "observability/traces" än "kontrollrum med live-tiles". Behöver custom vy eller Grafana ovanpå.

### 2. SwarmWatch (open source, desktop overlay)

Byggd exakt för detta: kontrollrum för AI-kodningsagent-svärmar.

- **Real-time:** Always-on desktop overlay, visar vad varje agent gör nu.
- **Multi-agent:** Per-agent status, parallella agenter.
- **Approve/Decline:** Tvåvägs-kontroll (godkänn/blockera agent-actions).
- **Arkitektur:** Lokal WebSocket på `127.0.0.1:4100`. Fail-open om UI är nere.
- **Plattform:** macOS, Windows, Linux.

**Plus:** Närmast ett "kontrollrum" out-of-the-box. Real-time per-agent. Open source. Human-in-the-loop.
**Minus:** Designad för IDE-baserade kodagenter. Kräver custom adapter/shim för Neuron HQ. Inget cost tracking.

GitHub: SwarmPack/SwarmWatch

### 3. claude-code-hooks-multi-agent-observability (open source)

Byggd specifikt för Claude Code multi-agent monitoring.

- **Real-time:** 12 Claude Code hook event-typer (pre_tool_use, post_tool_use, notifications).
- **Multi-agent:** Session tracking, event filtering, parallella agenter.
- **Arkitektur:** Hook-scripts → lokal observability-server → Webb-dashboard.

**Plus:** Byggd för Claude. Förstår Claudes hook-livscykel. Open source.
**Minus:** Bunden till Claude Codes hook-system, inte Agent SDK. Kräver anpassning.

GitHub: disler/claude-code-hooks-multi-agent-observability

---

## Tier 2: Starka plattformar, mindre "kontrollrum"

### 4. AgentOps (kommersiell)
- Session replays (tidsresa), multi-agent workflow-grafer, kostnader/latens.
- **Minus:** Inte open source. Python först. 12% overhead. Cloud-only.

### 5. Arize Phoenix (open source)
- OpenTelemetry-baserad. Drift detection, clustering, LLM-as-judge scoring.
- Dev-Agent-Lens: proxy för Claude Code med OpenInference spans.
- **Minus:** Mer ML-observability (bias, drift) än live agent-status.

### 6. LangSmith (kommersiell)
- Direkt Claude Agent SDK-stöd (`configure_claude_agent_sdk()`).
- **Minus:** Inte open source. Bunden till LangChain-ekosystem.

---

## Tier 3: Bygg eget

### 7. OpenTelemetry + Grafana
- OpenLLMetry-js: TypeScript SDK för LLM-instrumentering.
- Grafana: real-time streaming panels, alerting, custom layouts.
- **Plus:** Maximal flexibilitet. Allt open source. Bygg exakt det kontrollrum du vill ha.
- **Minus:** Kräver uppsättning. Inget agent-UI out-of-the-box.

---

## Rekommendation

**Ingen enskild mjukvara ger både djup observability OCH ett real-time "kontrollrum".** Bästa approach:

1. **Langfuse** som observability-backbone — self-host bredvid befintlig Postgres, instrumentera agenter med TypeScript SDK, få traces + kostnader direkt. Officiell Claude Agent SDK-integration.

2. **Bygg en custom "kontrollrums-vy"** ovanpå Langfuse-data, eller använd **Grafana** dashboards. Detta ger live per-agent tiles.

3. **SwarmWatch** värd att testa om du vill ha out-of-the-box overlay, men behöver custom adapters.

---

## Källor

- Langfuse: langfuse.com (Claude Agent SDK integration)
- SwarmWatch: github.com/SwarmPack/SwarmWatch
- claude-code-hooks-multi-agent-observability: github.com/disler/claude-code-hooks-multi-agent-observability
- OpenLLMetry-js: github.com/traceloop/openllmetry-js
- Dev-Agent-Lens: arize.com/blog/claude-code-observability
- LangSmith: docs.langchain.com/langsmith/trace-claude-agent-sdk
- Claude Telemetry: github.com/TechNickAI/claude_telemetry
