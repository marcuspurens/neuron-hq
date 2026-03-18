# Architecture Documentation

Arkitekturens utveckling över tid. Datumstämplade versioner — nyast överst.

## Aktuella dokument (2026-03-16, Session 90)

| Dokument | Målgrupp | Beskrivning |
|----------|----------|-------------|
| [technical-reference](2026-03-16-technical-reference.md) | LLMs, seniora utvecklare | Fullständig teknisk referens med interfaces, schemas, tool matrix |
| [explained](2026-03-16-explained.md) | Icke-utvecklare | Samma system förklarat med liknelser och exempel |
| [complete](2026-03-16-architecture-complete.md) | Alla | Kompakt översikt med ASCII-diagram |

## Historik

| Datum | Session | Dokument | Vad som var nytt |
|-------|---------|----------|-----------------|
| 2026-02-27 | 50 | [memory-system](2026-02-27-memory-system.md) | Minnesarkitektur detaljerad |
| 2026-03-03 | 62 | [architecture-v1](2026-03-03-architecture-v1.md) | Första systemöversikten — 8 agenter, filbaserat |
| 2026-03-16 | 90 | [complete](2026-03-16-architecture-complete.md) | 11 agenter, 10 MCP-scopes, 3 lager, Bayesian beliefs |
| 2026-03-16 | 90 | [technical-reference](2026-03-16-technical-reference.md) | Forskningspapper-nivå, alla interfaces |
| 2026-03-16 | 90 | [explained](2026-03-16-explained.md) | Icke-utvecklar-version med liknelser |

## Milstolpar i arkitekturen

- **S50** (feb 27): Minnesarkitektur — kunskapsgraf, decay, semantic dedup
- **S62** (mar 3): Första arkitekturdokumentet — 8 agenter, filbaserat minne, policy
- **S90** (mar 16): Komplett arkitektur — 11 agenter, PostgreSQL+pgvector, MCP 3-lager, Bayesian beliefs, 2371 tester
