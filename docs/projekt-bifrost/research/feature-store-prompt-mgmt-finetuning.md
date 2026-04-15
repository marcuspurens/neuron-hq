# Research: Feature Store, Prompt Management & Fine-Tuning

> Datum: 2026-04-13 | Session: Bifrost #7 | Källa: Träningsdata (ej websökning)

## 1. Feature Store — morfat, inte dött

### Traditionell vs LLM-kontext
Traditionella feature stores (Feast, Tecton, Hopsworks) byggdes för tabulär ML — low-latency feature serving för rekommendationer, bedrägeridetektering.

För LLM-tunga plattformar har konceptet **morfat**:
- **Embedding stores / vector databases** (Qdrant, Pinecone, Weaviate) — serverar förberäknade embeddings
- **Context assembly pipelines** — retrieval, ranking, formatering av kontext för RAG = funktionellt en "feature store" i LLM-världen
- **Metadata/entity stores** — strukturerade fakta om användare, produkter, sessioner som injiceras i prompts

### Verktyg
| Verktyg | Typ | Relevans |
|---------|-----|----------|
| Feast | Open source, hybrid ML+LLM | Relevant om tabulär ML + LLM |
| Tecton | Enterprise, dyrt | Stor skala |
| Bytewax | Streaming feature computation, Python | Realtids-features |

### Rekommendation för Bifrost
Feature store behövs **bara om hybrid ML+LLM-workloads**. Vid ren LLM/RAG: specificera vector store (Qdrant) + context assembly layer. Tvinga inte in en feature store där den inte behövs.

## 2. Prompt Management / Prompt Registry

### Status
Gap som de flesta team upptäcker vid skala. Prompts är kod, men team behandlar dem som strängar i applikationskod tills det går sönder.

### Verktyg
| Verktyg | Typ | Kapabilitet |
|---------|-----|-------------|
| **Langfuse** | Open source, self-hosted | Prompt management + observability + versionering |
| PromptLayer | SaaS | Prompt versioning, logging, A/B-test |
| Humanloop | SaaS | Prompt management + evaluation + deployment |
| Portkey | Gateway | Prompt management inbyggt i gateway-lager |
| LangSmith | LangChain | Tracing + prompt hub |

### Enterprise-behov
- Versionskontroll med rollback
- A/B-testning (routa % av trafik till prompt-variant)
- Godkännande-arbetsflöden före produktion
- Kostnadsuppföljning per prompt-version
- Audit trail

### Rekommendation för Bifrost
**Langfuse täcker det mesta** — redan i stacken! Prompt registry, versionering, A/B, audit. Specificera: prompts decoupled från applikationskod, API för retrieval vid inference, governance (vem godkänner), evaluerings-pipeline, audit trail.

## 3. Fine-Tuning Pipeline

### Status
QLoRA är standard för enterprise — full fine-tuning sällan motiverat givet kostnad.

### Infrastruktur-mönster
```
DATA CURATION → TRAINING → EVALUATION → DEPLOYMENT
     |              |           |             |
 Prod-loggar    QLoRA/LoRA   Auto-bench   Adapter
 Curated sets   Ray Train    + Human eval  hot-load
 Quality filter  Kubeflow    MLflow        i vLLM
```

### Nyckelkomponenter
| Komponent | Verktyg |
|-----------|---------|
| Metod | QLoRA (4-bit bas + trainable adapter) för kostnadseffektivitet, full LoRA för kvalitet |
| Framework | HuggingFace TRL + PEFT, Axolotl (config-driven), LitGPT |
| Orkestrering | Ray Train eller Kubeflow på K8s |
| Experiment tracking | MLflow / W&B |
| Data | Curerade instruktionsdataset, ofta byggt från produktionsloggar |
| Serving | vLLM med adapter hot-loading (byta LoRA-adapter utan att ladda om basmodell) |

### Rekommendation för Bifrost
4-stegs pipeline: data curation → training (experiment tracking via MLflow) → evaluation (auto-benchmarks + human eval) → deployment (adapter registry + serving). K8s med GPU node pools. Kan designas nu men byggas i fas 3 när det finns tillräckligt med produktionsdata.

## Vad team ångrar att de inte byggde

1. **Evaluerings-infrastruktur** — inget sätt att veta om en ändring förbättrade eller försämrade
2. **Kostnadsattribution** — kan inte förklara $200k/mån API-räkningar per feature/team
3. **Graceful degradation** — ingen fallback vid provider-avbrott
4. **Prompt governance** — någon pushade en dålig prompt till produktion utan review
