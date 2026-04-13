# A-MEM & Agent Memory Frameworks — 2026

> Datum: 2026-04-13 | Källa: Review Pass 1 (session 6)

## A-MEM

- **Paper:** "A-MEM: Agentic Memory for LLM Agents" (NeurIPS 2025, arXiv:2502.12110)
- **Metod:** Zettelkasten-inspirerad dynamisk minnesstruktur
- **Status:** Research-grade med referensimplementation. Inte ett produktionsramverk
- **Bifrost:** Använder A-MEM som *inspiration* för 3-lagers-arkitektur (working/episodic/semantic)

## Produktionsalternativ

| Ramverk | Licens | Typ | Styrka |
|---------|--------|-----|--------|
| **Mem0** | MIT | Managed + self-hosted | Persistent memory for agents, production-ready API |
| **Zep** | Apache 2.0 | Self-hosted | Long-term agent memory med knowledge graph |
| **LangGraph Checkpoints** | MIT | Inbyggt i LangGraph | State persistence, enkel men begränsad |

## Rekommendation

Utvärdera Mem0 och Zep i fas 3 om Bifrost-implementationen inte möter skalkraven.

## Källor

- [A-MEM paper — arXiv:2502.12110](https://arxiv.org/abs/2502.12110)
- [Best AI Agent Memory Frameworks 2026](https://machinelearningmastery.com/the-6-best-ai-agent-memory-frameworks-you-should-try-in-2026/)
