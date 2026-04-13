# Compliance: EU AI Act + GDPR + PII

> Sökt 2026-04-12

## EU AI Act — Timeline
- **2 februari 2025:** Prohibited AI practices banned
- **2 augusti 2025:** General-purpose AI obligations
- **2 augusti 2026:** HIGH-RISK enforcement deadline ← KRITISKT
- Böter: upp till €35M eller 7% av global omsättning (förbjudna), €15M eller 3% (högrisk)

## Risknivåer
| Nivå | Exempel | Krav |
|------|---------|------|
| Förbjuden | Subliminal manipulation, social scoring | Ej tillåtet |
| Högrisk | HR-screening, kreditbedömning, medicinsk diagnostik | Full compliance |
| Begränsad | Chatbottar, AI-genererat innehåll | Transparens |
| Minimal | Spamfilter, kodkomplettering | Inga krav |

## Högrisk-krav
- Riskhanteringssystem
- Data governance (representativa, felfria datasets)
- Teknisk dokumentation
- Record-keeping (loggning)
- Instruktioner för användning
- Human oversight-design
- Cybersäkerhet

## Plattformens skyldigheter
- AI-systemsinventering (alla system, risklass, ansvarig)
- Compliance-dokumentation per system
- Riskklassificering vid onboarding (tvingande)
- Differentierade krav per risklass

## GDPR + PII i LLM-pipeline

### Spår A: Gateway-level PII (fas 1)
- PII-detektion i AI Gateway (LiteLLM guardrails)
- NER-baserat: GLiNER (zero-shot), eller fine-tuned
- Konfigurerbart per tenant

### Spår B: Reversibel anonymisering (fas 2-3)
- Pseudonymisera före LLM, de-pseudonymisera i svar
- Token-mappningslager krävs
- Starkare GDPR-skydd — original lämnar aldrig prompten

### Pipeline-mönster
```
Request → Gateway → PII Detect → Redact → LLM → PII Scan Response → Response
```

## DBOM (Data Bill of Materials)
- KubeCon EU 2026: nytt plattformskrav i reglerade miljöer
- Varje AI-system svarar: träningsdata, RAG-data, prompt-lagring, retention, access

## Källor
- [EU AI Act Compliance 2026](https://secureprivacy.ai/blog/eu-ai-act-2026-compliance)
- [EU AI Act Risk Classification](https://artificialintelligenceact.eu/article/6/)
- [LLM PII Redaction Gateway](https://radicalbit.ai/resources/blog/llm-data-privacy/)
- [Reversible Anonymization](https://dzone.com/articles/llm-pii-anonymization-guide)
- [GLiNER zero-shot NER](https://www.protecto.ai/blog/best-ner-models-for-pii-identification/)
