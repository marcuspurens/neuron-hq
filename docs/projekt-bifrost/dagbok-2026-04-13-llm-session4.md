# Dagbok — Projekt Bifrost, 13 april 2026 (Session 4)

> Version: LLM-optimerad (kompakt, strukturerad, nyckelbegrepp explicit)

---

## SESSION_CONTEXT
- session: Bifrost #4
- date: 2026-04-13 (evening)
- architecture_version: v5.0 → v6.0
- rollout_version: v3.0 → v3.1
- goal: Clear entire P3 backlog + P4 gate findings
- outcome: ALL P3 (6/6) + ALL P4 (6/6) cleared. P3 backlog empty for first time.

## NEW_DECISIONS

```yaml
agent_protocol_tools: MCP (Model Context Protocol, Anthropic→AAIF/Linux Foundation)
agent_protocol_agents: A2A (Agent-to-Agent, Google→AAIF/Linux Foundation)
mcp_auth: OAuth 2.1 + RFC 8707 resource indicators (MCP 2026 spec)
mcp_transport: Streamable HTTP (remote), STDIO (local)
mcp_identity: SPIFFE SVID bound to sandbox → short-lived OAuth tokens (5-15 min)
default_precision: FP4 (B200) with FP8/BF16 opt-in for reasoning tasks
gpu_reference: B200 @ ~$3.50-6/hr, ~4x throughput/$ vs H100 (SemiAnalysis InferenceMAX 2026)
security_gate_ownership: RACI model (Tjänsteägare=Accountable, Security=Responsible, CISO=Approver)
```

## NEW_SECTIONS_ADDED

### §8.5b Model Selection Guide
- 8 use cases × 4 columns (use case, model class, rationale, data class restriction)
- Data class routing: public→all, internal→all, confidential→local only
- GPU price table: A100/H100/B200 with throughput (tok/s) and $/Mtok
- FP4 quality tradeoff table: 6 use cases, OK/test/careful per case
- Principle: guidance not enforcement, deviations logged not blocked

### §8.7 Agent Protocols — MCP and A2A
- MCP = vertical (agent ↔ platform tools), A2A = horizontal (agent ↔ agent)
- MCP server catalog: 6 servers (bifrost-rag, -memory, -graph, -tools, -usage, -admin)
- OAuth 2.1 auth flow: 4-step diagram with security function per step
- A2A: 4 scenarios, 3 communication patterns (sync/streaming/async)
- Phasing: MCP from phase 2, A2A from phase 3
- SDK vs MCP auth explained: API key (DX simplicity) vs OAuth (sandbox isolation)

### §20.12 RACI Matrix
- 6 activities × 4 RACI roles
- Key insight: gates die without clear ownership in large orgs

### §23.3 Data Freshness SLI
- Document change → updated vector in Qdrant: < 15 min p95, 30d rolling

### §25 Updated
- Added: MCP/A2A protocols, FinOps as design constraint, model selection guide

### Rollout v3.1 Security Review Gates
- Phase 1: threat model + NetworkPolicies + audit → CISO sign-off
- Phase 2: pentest + SOC + data class routing + PII → CISO sign-off
- Phase 3: AI pentest + cross-tenant + honeypots + agent governance → CISO full ops

## MCP_A2A_ARCHITECTURE

```
Vertical (MCP):                    Horizontal (A2A):
Agent → MCP Server → Bifrost       Agent A → Agent B (via Agent Cards)
        (OAuth 2.1)                         (JSON-RPC 2.0 / gRPC)
        
MCP servers:                       A2A patterns:
- bifrost-rag (phase 2)           - Sync (JSON-RPC request/response)
- bifrost-memory (phase 3)        - Streaming (SSE for progress)
- bifrost-tools (phase 3)         - Async (push notifications)
- bifrost-graph (phase 3)
- bifrost-usage (phase 2)         Agent Cards in Backstage catalog
- bifrost-admin (post 90d)        Cross-tenant A2A requires governance approval
```

## AUTH_MODEL_COMPARISON

| interface | auth | trust_model | why |
|-----------|------|------------|-----|
| SDK (app code) | API key (LiteLLM virtual key) | Team owns code, runs in own env | DX: simple setup, <5 min onboarding |
| MCP (agent sandbox) | OAuth 2.1 + SPIFFE SVID | Autonomous agent, stronger isolation | Short-lived tokens, per-server scope, auto-rotation |
| Both | Server-side enforcement | Same rules regardless of client | Tenant isolation, data class routing, audit |

## B200_COST_MODEL

| gpu | price_hr | throughput_70b_toks | cost_per_mtok |
|-----|----------|---------------------|---------------|
| A100 80GB | ~$1.80 | ~800 | ~$0.60 |
| H100 80GB | ~$3.00 | ~2000 | ~$0.40 |
| B200 192GB | ~$3.50-6 | ~8000 (FP4) | ~$0.10-0.20 |

Key: B200 runs 70B on single GPU (FP4). A100 needs 4x. Changes rollout GPU profile significantly.

## GATE_PERFORMANCE

5 gates run, 5 findings:
1. TOC: Swedish char anchors (verified OK)
2. Content: MCP auth gap (CISO perspective) → fixed with OAuth 2.1
3. Polish: RACI missing for security gate (SRE perspective) → fixed
4. P4: SDK vs MCP auth confusing for devs → explained
5. P4: FP4 quantization quality risk → table added

Pattern holds: every gate finds something. Role rotation works. Findings are concrete enough to fix immediately.

## BACKLOG_STATUS

```
P3: EMPTY (all 6 items cleared this session)
P4 remaining (from S3):
  A1: Status page design
  A2: Rate limit transparency
  A6: Third-party dependency risk
  A8: "Do nothing" comparison in §22
  A10: Inter-agent registry (phase 3+)
  A12: Org decision hierarchy beyond FinOps
  F2: Source for GraphRAG 80% claim
  F4: llm-d "phase 2-3" → "phase 3+"
Gate flags (from S3):
  - §20.6/§26.2 overlap
  - §5.9/SDK rag.create() sync verification
  - §16 missing compliance-specific signals
  - Kyverno Policy Reporter in §26.9
```

## RESEARCH_SOURCE_NOTED

AI Engineer (@aiDotEngineer) — 629 videos, 395K subscribers. Relevant for agent infra, MCP/A2A, platform architecture decisions. Bulk transcription solution needed before ingestion.

## FILES_UPDATED

```
docs/projekt-bifrost/
├── target-architecture.md (v6.0, ~2400 lines, +~300 from v5.0)
├── rollout-plan-30-60-90.md (v3.1, +3 security review gate milestones)
├── chat-log.md (session 4 appended)
├── dagbok-2026-04-13.md (session 4 appended)
├── HANDOFF-2026-04-13T2100-bifrost-session4-p3-p4-komplett.md (NEW)
└── dagbok-2026-04-13-llm-session4.md (NEW, this file)
```

## META_OBSERVATIONS

1. Document entering polish phase — growth rate decreasing, quality per section increasing
2. Gate-driven workflow now natural: deliver → gate → fix → next
3. Marcus treats gate findings as work, not overhead — confirmed by explicit request to fix P4
4. B200 pricing data may need rollout plan GPU profile update (currently references A100/H100)
5. MCP ecosystem maturity (97M SDK downloads/month) validates protocol choice
