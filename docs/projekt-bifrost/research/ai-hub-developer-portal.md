# AI Hub: Developer Portal & Experience

> Sökt 2026-04-12

## Backstage (CNCF graduated)
- Open source developer portal framework (Spotify)
- Gartner: 80% av software engineering orgs har IDP:er 2026

### Kärnkomponenter
- **Software Catalog:** Alla tjänster (microservices, ML models, pipelines)
- **Software Templates:** Scaffolding med best practices
- **TechDocs:** Dokumentation bredvid tjänsterna
- **Plugin-ekosystem:** Extensible, 100+ plugins

### AI-specifika tillämpningar
- RAG-powered knowledge base för natural language frågor om interna API:er
- AI-assisted scaffolding templates
- Infrastructure automation via StackGen
- Compliance policies embedded i portalen

## Platform Engineering Trends 2026
- IDP = unified, self-service portal
- Pre-approved infrastructure, CI/CD, security guardrails, observability
- 50x deployment frequency (Stripe-exemplet)
- AI för predictive scaling, anomaly detection, automated remediation

## AI Hub — Fyra gränssnitt
| Gränssnitt | Målgrupp | Funktion |
|------------|----------|----------|
| API Gateway | Utvecklare | OpenAI-kompatibelt API, SDK, autentisering |
| AI Hub Portal (Backstage) | Alla team | Modellkatalog, onboarding, docs, kostnadsvy |
| Playground | Alla | Testa modeller utan kod |
| Admin Console | Platform team | Kvoter, GPU, policy, audit |

## Onboarding-flöde
1. Registrera → riskklassificera → provisionera (API-nyckel, kvot, namespace)
2. Dokumentation + exempelkod + playground
3. Review (högrisk = extra granskning)
4. Produktion med auto-observability

## Self-service vs guardrails
- Göra rätt enkelt, fel svårt
- Sandbox med lägre kvoter för experiment
- Kuraterad modellkatalog, inte öppen buffé
- Godkännandeprocess för finjusterade modeller

## Alternativ till Backstage
- Red Hat Developer Hub (enterprise Backstage)
- Harness IDP (AI Knowledge Agent)
- Roadie (managed Backstage)
- Port (no-code IDP)

## Källor
- [Backstage](https://backstage.io/)
- [Platform Engineering Backstage 2026](https://calmops.com/devops/platform-engineering-backstage-internal-developer-platform-2026/)
- [Internal Developer Platforms 2026](https://lucaberton.com/blog/internal-developer-platforms-2026/)
- [Red Hat Developer Hub](https://developers.redhat.com/products/rhdh)
