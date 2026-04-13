# Modell-livscykelhantering: MLflow + Best Practice

> Sökt 2026-04-12

## MLflow
- Open source, 30M+ månatliga nedladdningar
- Stöder hela ML-livscykeln: experiment → deployment

### Kärnkomponenter
- **Experiment Tracking:** Logga parametrar, metrics, artifacts
- **Model Registry:** Central katalog, versioner, metadata, lineage
- **Deployment:** Staging → Production promovering
- **LLM Evaluation:** Specifika metrics (hallucination rate, coherence, etc.)

## Livscykelsteg

### 1. Import
- Registrera modell med metadata (källa, licens, storlek, capabilities)
- Säkerhetsscan av modellvikter
- Licensverifiering (kommersiell användning?)
- DBOM (träningsdata, proveniens)

### 2. Eval
- Standardiserad benchmark-suite (domänrelevant)
- Red-team: prompt injection, jailbreak, PII-läckage
- PII-hanteringstest
- Kostnadsuppskattning (token/s, VRAM, estimerad månadskostnad)

### 3. Stage
- KServe canary: 5% → 25% → 50% → 100%
- A/B-test: samma prompts mot gammal + ny modell
- Shadow mode: ny modell processar men svaren kastas
- Regressionskontroll per team

### 4. Prod
- Full observability (tokens, latency, cost, cache hit)
- Drift-detektion: output-kvalitet över tid
- Automatiska alerts vid degradering
- Kostnadsspårning per team

### 5. Sunset
- Deprecation notice: 30/60/90 dagar
- Automatisk fallback i gateway
- Traffic monitoring (vem använder fortfarande?)
- Arkivering av modell + metadata

## Governance-koppling per risklass
| Risklass | Import | Eval | Stage | Sunset |
|----------|--------|------|-------|--------|
| Minimal | Registrera | Bastest | Direkt | Arkivera |
| Begränsad | + Licens | + Red-team | Canary | + 30d |
| Högrisk | + DBOM + juridisk | + Full red-team + PII | Shadow + A/B + human | + 90d + audit |

## 2026 Trends
- CI/CD-pipelines som testar och deployar modeller kontinuerligt
- Drift detection med automatiska retraining triggers
- Model mesh: multipla modeller för olika uppgifter
- Experiment trackers + model registries som standard

## Källor
- [MLflow](https://mlflow.org/)
- [MLflow ML Lifecycle Guide](https://oneuptime.com/blog/post/2026-01-26-mlflow-ml-lifecycle/view)
- [Model Registry Implementation](https://oneuptime.com/blog/post/2026-01-25-model-registry/view)
- [ML Lifecycle Management](https://www.clarifai.com/blog/ml-lifecycle-management/)
