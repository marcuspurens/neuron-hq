---
session: 12
datum: 2026-04-07
tags: [release-note, metadata, schema-org, litellm]
---

# Session 12 — Schema.org som metadata-standard

## Vad är nytt?

- **Schema.org istället för Dublin Core.** Vi utvärderade metadata-standarder för Aurora — det system som ska katalogisera tusentals dokument (PDF-rapporter, YouTube-videor, webbartiklar). Dublin Core (1995) har 15 generiska fält. Schema.org, som Google, Microsoft och OpenAI använder, har typsäkra varianter för varje dokumenttyp: `Report` (rapporter), `VideoObject` (videor), `Article` (artiklar). Googles npm-paket `schema-dts` ger TypeScript-autocomplete på alla fält. Vi får bättre validering, framtidssäkring, och kompatibilitet med resten av världen — utan extra arbete.

- **AuroraDocument-interface designat.** En ny datamodell som kombinerar Schema.org-bibliografisk metadata (titel, författare, datum, språk, ämne) med Aurora-specifika fält (provenance, SHA-256-hash, sidarray med `PageDigest`). Varje dokument i Aurora kommer ha en "bibliotekskort"-del (Schema.org) och en "vad pipelinen hittade"-del (Aurora).

- **LiteLLM-agentproblem diagnostiserat.** Sub-agenterna (Oracle, Librarian, Explore) kraschade hela sessionen — de route:as till Azure-modeller (`gpt-5.2`, `gpt-5-nano`) som inte stödjer en parameter (`reasoningSummary`). Huvudmodellen (Sisyphus) fungerar, men parallella agenter gör det inte. Behöver fixas i LiteLLM-konfigurationen.

## Hur använder jag det?

Inga ändringar i din workflow än — detta är arkitekturplanering. Nästa session implementerar `AuroraDocument` och fixar agent-routingen.

## Vad saknas fortfarande?

- LiteLLM agent-routing (kräver server-side config-ändring — ta bort `reasoningSummary` från `gpt-5-nano`/`gpt-5.2`, eller byt till Anthropic-modeller för sub-agents)
- Implementation av `AuroraDocument` med `schema-dts`
- Page type-klassificerare
- Granskningsverktyg för pipeline-output
