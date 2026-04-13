# Agent Governance + OWASP Agentic AI Top 10

> Sökt 2026-04-12

## OWASP Top 10 for Agentic Applications 2026
Publicerad december 2025, 100+ experter, första formella taxonomin.

1. **ASI01 — Agent Goal Hijacking** — poisoned inputs omdirigerar agent
2. **ASI02 — Tool Misuse** — legitima verktyg böjs till destruktiv output
3. **ASI03 — Identity & Privilege Abuse** — credentials läcker, scope överskrids
4. **ASI04 — Agentic Supply Chain** — runtime-komponenter kan förgiftas
5. **ASI05 — Unexpected Code Execution** — natural language → RCE
6. **ASI06 — Memory & Context Poisoning** — beteendeförändring via minne
7. **ASI07 — Insecure Inter-Agent Communication** — spoofade meddelanden
8. **ASI08 — Cascading Failures** — falska signaler eskalerar genom pipeline
9. **ASI09 — Human-Agent Trust Exploitation** — polerade svar vilseleder
10. **ASI10 — Rogue Agents** — misalignment, concealment, self-directed action

**Grundprincip:** Principle of Least Agency — minimum autonomy, tool access, credential scope.

## Microsoft Agent Governance Toolkit
- Släppt 2 april 2026, MIT-licens
- Första toolkit att adressera alla 10 OWASP-risker
- Sub-millisekund policy enforcement (<0.1ms p99)

### Komponenter
- **Agent OS:** Policy enforcement layer
- **Agent Mesh:** Secure communication & identity
- **Agent Runtime:** Execution sandboxing
- **Agent SRE:** Reliability engineering
- **Agent Compliance:** Compliance tooling
- **Agent Lightning:** Reinforcement learning oversight

### Integrationer
- LangChain, CrewAI, Google ADK, OpenAI Agents SDK
- Haystack, LangGraph, PydanticAI
- Python, Rust, TypeScript, Go, .NET

### Plan
- Flytta till en foundation för community governance
- Engagerar OWASP agentic AI community

## Källor
- [OWASP Top 10 Agentic](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- [MS Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit)
- [MS Blog: Architecture Deep Dive](https://techcommunity.microsoft.com/blog/linuxandopensourceblog/agent-governance-toolkit-architecture-deep-dive-policy-engines-trust-and-sre-for/4510105)
- [Palo Alto: OWASP Agentic](https://www.paloaltonetworks.com/blog/cloud-security/owasp-agentic-ai-security/)
