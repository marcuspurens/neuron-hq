# Third-party Dependency Risk — Qdrant, Neo4j, LiteLLM

> Datum: 2026-04-13 | Källa: Websökning + review (session 6)

## Qdrant — RISK: LÅG-MEDEL

- **Licens:** Apache 2.0 (ingen förändring 2025-2026)
- **Finansiering:** Series A $28M (Unusual Ventures, Spark Capital)
- **Risk:** VC-relicensiering möjlig (Elastic/Redis-mönstret)
- **Alternativ:** Weaviate (Apache 2.0), pgvector (PostgreSQL)

## Neo4j — RISK: HÖG

- **Licens:** Community GPL v3 + Commons Clause. Enterprise: kommersiell (ej open source sedan v3.5)
- **Rättstvist:** PureThink dömdes $597K för att ha tagit bort Commons Clause (2024). Pågående överklagande
- **Risk:** Licenslåsning. Cypher = proprietärt frågespråk
- **Alternativ:** Apache AGE (PostgreSQL-extension, Apache 2.0), FalkorDB, Kuzu (MIT)

## LiteLLM — RISK: HÖG

- **Licens:** MIT (ingen licensrisk)
- **Incident:** Supply chain-attack mars 2026 (se separat fil)
- **Övrigt:** 800+ öppna issues, PostgreSQL-loggning degraderar vid 1M+ poster, OOM i K8s (sept 2025)
- **Alternativ:** Portkey, Kong AI Gateway, Cloudflare AI Gateway

## Källor

- [Neo4j Open Core FAQ](https://neo4j.com/open-core-and-neo4j/)
- [Neo4j AGPL Issues — GitHub #11821](https://github.com/neo4j/neo4j/issues/11821)
- [Neo4j License — DB News analysis](https://db-news.com/navigating-the-neo4j-licensing-maze-a-deep-dive-into-agpl-enterprise-and-open-source-implications)
- [LiteLLM Review 2026 — TrueFoundry](https://www.truefoundry.com/blog/a-detailed-litellm-review-features-pricing-pros-and-cons-2026)
- [LiteLLM Production Issues — DEV](https://dev.to/debmckinney/youre-probably-going-to-hit-these-litellm-issues-in-production-59bg)
- [AI Gateway Guide 2026 — TrueFoundry](https://www.truefoundry.com/blog/a-definitive-guide-to-ai-gateways-in-2026-competitive-landscape-comparison)
