# Research: Dag-30 Developer Problems på AI-plattformar

> Datum: 2026-04-13 | Session: Bifrost #7 | Källa: Träningsdata (ej websökning)

## Vanliga dag-30-problem

### RAG-kvalitetsdrift
- Retrieval-precision försämras när corpus växer — chunks som fungerade vid 500 dokument fallerar vid 50k
- Reranking-scores sjunker tyst. Ingen märker det förrän användare klagar
- **Chunking-strategi orsakar fler produktions-RAG-fel än embedding-modellval**

### Token-budget-sprängningar
- Ett teams agent-loop bränner 10× förväntade tokens pga retry-storms eller context stuffing
- Utan per-team-kvoter eskalerar kostnaden obemärkt

### Latency tail spikes
- p50 är ok, p99 är 30s+
- Orsaker: embedding cache-missar, kalla modellinstanser, överdimensionerade context windows

### Agent timeout-kaskader
- Tool-calling-agenter träffar externa API-timeouts → retry → rate limits → opak failure

### Prompt-versionsförvirring
- "Det fungerade igår" — någon ändrade en system prompt utan versionering

### Evaluerings-gap
- Inga automatiserade kvalitetskontroller
- Team upptäcker regressioner via användarklagomål, inte metrics

## Nyckelinsikt

> **Det största dag-30-problemet är inte tekniskt — det är att team inte kan avgöra om deras app fungerar bra eller dåligt. Observability är flaskhalsen, inte modellkvalitet.**

## Self-service debugging som fungerar

1. **Per-request trace views** (Langfuse, LangSmith, Arize): prompt → retrieval → reranking → generation → response, med latency + token counts per steg
2. **Retrieval quality dashboards** — vilka chunks hämtades, similarity scores, om svaret använde dem
3. **Token usage dashboards** per team/app/endpoint med anomali-alerting
4. **Prompt playground med version diffing** — testa ändringar mot sparade testfall före deploy

## Troubleshooting-mönster

### Decision tree
```
"Dåligt svar?"
  → Kolla retrieval först (fel chunks = RAG-problem)
    → Kolla prompt (rätt chunks men fel svar = prompt-problem)
      → Kolla modell (testa samma prompt på annan modell)
```

### Error catalog
Typade felkoder: timeout, rate limit, context overflow, empty retrieval, guardrail block — var och en med åtgärdssteg.

### Canary evaluations
Kör ett fast eval-set vid varje prompt/config-ändring. Rött/grönt före merge.

## Överraskande fynd

- Chunking > embedding-modellval för RAG-kvalitet
- Team utan eval-sviter ångrar sig alltid vid vecka 3
- Traditionell APM fångar inte modell-specifika metrics (latency per token, hallucination rate, cost per query)
