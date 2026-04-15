# Rapport: Kan Gemma 4 bygga Bifrost?

> Datum: 2026-04-14 | Författare: Marcus Purens + Opus
> Frågeställning: Om CGI kör agenter (t.ex. OpenCode) med Gemma 4 på egna GPU:er — kan de bygga och driva en plattform som Bifrost?

---

## Sammanfattning

**Nej, inte ensam. Men Gemma 4 har en viktig roll i Bifrost — som modell i katalogen, inte som byggare av plattformen.**

Gemma 4 är en stark öppen modell (Apache 2.0) med 256K kontext, inbyggd function calling och god kodgenerering. Den kan generera individuella komponenter: Kubernetes manifests, Helm charts, Python-scripts, Kyverno policies. Men den saknar den resonemangsstyrka som krävs för att hålla ihop 27 sektioner, 10 regelverk och 15+ komponenter i ett konsistent system.

Det mest överraskande fyndet: **det är billigare att använda Claude API än att köra Gemma 4 lokalt** vid typisk agent-användning (~1M tokens/dag). Kostnadsargumentet för lokal körning håller inte förrän vid mycket hög volym eller krav på air-gap.

---

## 1. Gemma 4 — kapabiliteter

### Modellvarianter

| Modell | Parametrar | Kontext | VRAM (INT4) | Hastighet |
|--------|-----------|---------|-------------|-----------|
| E2B | 2B | 128K | ~2GB | Snabb (edge) |
| E4B | 4B | 128K | ~3GB | Snabb (edge) |
| 26B MoE (A4B) | 26B, aktiverar ~4B | 256K | ~15-17GB | ~80 tok/s |
| 31B Dense | 31B | 256K | ~22-24GB | ~36-58 tok/s |

**26B MoE** är sweet spot för RTX 4090 (24GB) — aktiverar bara ~4B parametrar per inference, kör snabbt men har 26B:s kvalitet.

### Kodningsbenchmarks

| Benchmark | Gemma 4 31B | Gemma 3 27B | Kommentar |
|-----------|-------------|-------------|-----------|
| LiveCodeBench v6 | **80%** | 29.1% | Dramatisk förbättring |
| Codeforces ELO | **2150** | 110 | Från nybörjare till expert |
| τ2-bench (agentic) | **86.4%** | 6.6% | Function calling fungerar |
| HumanEval | +8.7% vs Gemma 3 | — | Solid |

**Jämförelse:** Gemma 4 31B är starkare än Llama 3.1 70B på kodning men svagare än Claude Sonnet på refaktorering och komplex resonemangskedja. Qwen 3.5 27B överträffar Gemma 4 på rena benchmarks men har sämre tooling-stöd.

### Styrkor

- **256K kontext** — kan hålla hela target architecture (3600 rader) i minnet
- **Inbyggd function calling** via 6 specialtokens — mer tillförlitligt än JSON-parsing
- **Apache 2.0** — helt fritt, kommersiellt, inga begränsningar
- **vLLM + SGLang stöd dag 1** — passar direkt in i Bifrosts inference-stack
- **OpenCode-integration finns** (via Ollama)
- **Fine-tuning stöds** — kan tränas på CGI:s egna infrastrukturmönster

### Svagheter

- **36 tok/s (31B)** — 3-5x långsammare än Mistral/Qwen, agent-loopar tar tid
- **Säkerhetsjailbreaks** — ARA-attack bröt säkerheten 90 minuter efter release
- **Kunskapscutoff januari 2025** — saknar ShadowMQ, llm-d v0.5, nya CVE:er
- **MoE (26B) stödjer inte QLoRA** — kan inte fine-tunas med bitsandbytes
- **Verbose** — genererar fler tokens än alternativen för samma svar
- **Begränsat resonemang** — kämpar med formella bevis, icke-linjär deduktion, flerstegslogik

---

## 2. Kostnadsjämförelse

### Scenario: Agent som bygger infrastruktur, ~1M tokens/dag

| Alternativ | Månadskostnad | Kvalitet | Latency |
|-----------|---------------|----------|---------|
| **Claude Sonnet API** | ~1 150 SEK/mån | Hög | 2-5 sek |
| **Claude Opus API** | ~1 900 SEK/mån | Mycket hög | 3-8 sek |
| **Claude Sonnet Batch API** | ~575 SEK/mån | Hög | Ej realtid |
| **2× RTX 4090 + Gemma 4** | ~2 600-3 300 SEK/mån (amorterat) | Medel | 10-30 sek |
| **H100 cloud + Gemma 4** | ~4 600-6 000 SEK/mån | Medel | 3-5 sek |

**Observera:** RTX 4090-kostnaden inkluderar hårdvara amorterad över 3 år (~1 500 SEK/mån) + el (~1 100-1 800 SEK/mån vid kontinuerlig drift). Faktisk el beror på lokal elpris.

### Break-even

Claude Sonnet API är billigare än lokal RTX 4090 upp till ~2M tokens/dag. Break-even sker vid:
- **>2M tokens/dag** konsekvent användning, ELLER
- **Air-gap-krav** (data får inte lämna organisationen), ELLER
- **Redan befintlig hårdvara** (bara elkostnad)

**Implikation för CGI:** Vid 3000 anställda som alla använder plattformen (fas 3: 50 000+ requests/dag) — då lönar sig lokal inference. Men för att *bygga* plattformen med agenter? Claude API är billigare och bättre.

---

## 3. Kan Gemma 4 bygga Bifrost?

### Vad en agent behöver göra

Att bygga Bifrost innebär:

1. **Generera Kubernetes manifests** — namespaces, RBAC, NetworkPolicies, DRA-config
2. **Skapa Helm charts** — llm-serving, base-service, vector-db, object-store, policy
3. **Konfigurera 15+ komponenter** — vLLM, KServe, llm-d, LiteLLM, Qdrant, Neo4j, MinIO, Redis, ArgoCD, Kyverno, Langfuse, MLflow, Backstage, KEDA, Kueue
4. **Skriva TypeScript SDK** — ~3000 rader, typad HTTP-klient med auto-auth och dataklass-routing
5. **Implementera compliance-logik** — 10 regelverk → Kubernetes-policies → audit trail
6. **Integrationstestning** — verifiera att allt fungerar tillsammans

### Bedömning per uppgift

| Uppgift | Gemma 4 (lokal) | Claude Sonnet (API) | Motivering |
|---------|-----------------|---------------------|------------|
| K8s manifests, YAML | ✅ Bra | ✅ Bra | Template-tungt, båda klarar det |
| Helm charts | ✅ Bra | ✅ Bra | Strukturerat, repetitivt |
| Python-scripts (pipelines) | ✅ Bra | ✅ Bra | Gemma 4:s styrka |
| Kyverno policies | ⚠️ Kräver handledning | ✅ Bra | Mer nischat, Gemma behöver kontext |
| TypeScript SDK | ⚠️ Medel | ✅ Bra | Claude starkare på refaktorering |
| Multi-komponent-integration | ❌ Svårt | ⚠️ Hanterbart | 15+ tjänster, konfigurationsinteraktioner |
| Compliance-mappning | ❌ Svårt | ⚠️ Med handledning | Domänkunskap + långkedjigt resonemang |
| Arkitekturkonsistens (27 §) | ❌ Svårt | ✅ Med 1M kontext | Gemma 4 tappar tråden över 3600 rader |
| Felsökning vid integration | ❌ Begränsat | ⚠️ Begränsat | Kräver realtidstestning, ingen modell löser det ensam |

### Slutsats

**Gemma 4 kan bygga ~50-60% av komponenterna** — de individuella, avgränsade delarna. Men plattformsbygget kräver en modell som kan:

- Hålla 27 sektioner konsistenta
- Resonera över 10 regulatoriska ramverk simultant
- Felsöka integrationer mellan komponenter som aldrig testats tillsammans
- Förstå *varför* ett arkitekturbeslut togs, inte bara *vad* det är

Det är inte primärt ett kodproblem — det är ett *resonemangsproblem*.

---

## 4. Gemma 4:s roll i Bifrost

Istället för "Gemma 4 bygger Bifrost" bör frågan vara "var passar Gemma 4 i Bifrost?".

### Rekommenderad roll

| Roll | Beskrivning | Varför Gemma 4 |
|------|-------------|----------------|
| **Modell i katalogen** | En av modellerna som team konsumerar via gateway | Apache 2.0, lokal, data stannar internt |
| **Kodgenerering** | Teams kodassistenter (CodeLlama-alternativ) | Stark på Python, TypeScript, YAML |
| **Batch-uppgifter** | Embeddings, klassificering, extraktion | Effektiv på strukturerade uppgifter |
| **Fine-tuning-bas** | Basmodell för svensk anpassning (QLoRA, 31B dense) | Apache 2.0 tillåter full kommersiell fine-tuning |
| **Edge/agent-modell** | 26B MoE i agentsandbox (låg VRAM, snabb) | Aktiverar bara ~4B parametrar, snabb inference |

### MCP/A2A-kompatibilitet (verifierad)

Gemma 4:s inbyggda function calling (6 specialtokens) fungerar med MCP-protokollet. Två vägar:

1. **Via OpenAI-kompatibelt API** (vLLM/llama.cpp) — MCP-klienter routar tool calls genom Gemma 4 som inference-backend. Ingen adapter behövs.
2. **Via gemma-mcp** (open source Python-paket) — bryggar Gemma direkt till MCP-servrar med auto-discovery.

Det innebär att Gemma 4 kan användas som agent-motor i Bifrosts Agent Plane (§8.7) utan protokollanpassning. A2A (agent↔agent) kräver att agenten kan generera och parsa Agent Cards — det bör fungera men är inte explicit testat.

### Ej rekommenderad roll

| Roll | Varför inte |
|------|-------------|
| **Primär byggagent för plattformen** | Resonemangsstyrka otillräcklig, långsammare, dyrare |
| **Compliance-motor** | Kunskapscutoff jan 2025, saknar aktuella regelverk |
| **Säkerhetskritiska beslut** | Jailbreak-sårbar, ej certifierad |
| **Enda modellen i plattformen** | Begränsar team — bör finnas tillsammans med Claude, GPT m.fl. |

---

## 5. Hybrid-strategi

Den mest realistiska strategin för CGI:

```
┌────────────────────────────────────────────────────────┐
│               BIFROST AI GATEWAY                        │
│                                                          │
│  Konfidentiell data          Övrig data                 │
│  ┌──────────────┐           ┌────────────────┐         │
│  │ Gemma 4 31B  │           │ Claude Sonnet  │         │
│  │ (lokal vLLM) │           │ (API)          │         │
│  │ Data stannar  │           │ GPT-4o (API)   │         │
│  │ internt       │           │                │         │
│  └──────────────┘           └────────────────┘         │
│                                                          │
│  Agent Sandbox              Batch                       │
│  ┌──────────────┐           ┌────────────────┐         │
│  │ Gemma 4 26B  │           │ Gemma 4 31B    │         │
│  │ MoE (snabb,  │           │ (embeddings,   │         │
│  │  låg VRAM)   │           │  klassificering)│         │
│  └──────────────┘           └────────────────┘         │
└────────────────────────────────────────────────────────┘
```

**Nyckelprincip:** Gemma 4 för konfidentiell data och batch-uppgifter. Starkare externa modeller för resonemang och planering. Gatewayen (§6) routar automatiskt baserat på dataklass.

---

## 6. Jämförelse med alternativa lokala modeller

| Modell | Kodning | Hastighet | VRAM | Licens | Bäst för |
|--------|---------|-----------|------|--------|----------|
| **Gemma 4 31B** | Stark | 36-58 tok/s | 22-24GB | Apache 2.0 ✅ | Generell kodassistent |
| **Gemma 4 26B MoE** | Stark | 80+ tok/s | 15-17GB | Apache 2.0 ✅ | Edge/agent (låg VRAM) |
| **Qwen 3.5 27B** | Starkare | Snabbare | Liknande | Qwen (restriktiv) | Ren prestanda |
| **Llama 3.1 70B** | Stark | Behöver H100 | 40GB+ | Llama (begränsad) | Djupt resonemang |
| **Mistral Small 4** | Bra, 20% mindre verbose | Mycket snabb | Lägre | Mistral (restriktiv) | Snabba svar, låg kostnad |
| **DeepSeek V3** | Mycket stark | Medel | Hög | Restriktiv | Kodgenereringsspecialist |

**Gemma 4:s fördel:** Apache 2.0 gör den unik bland toppmodellerna. Qwen och Mistral har restriktivare licenser. DeepSeek har geopolitisk risk. Llama kräver tyngre hårdvara. **För ett företag som CGI med compliance-krav är Apache 2.0 en avgörande fördel.**

---

## 7. Tidsuppskattning: hur lång tid tar det att bygga?

En CTO behöver inte bara veta *vad* som kan byggas utan *hur länge*. Bifrosts rollout-plan (30/60/90 dagar) utgår från ett plattformsteam — inte agenter. Men om vi antar ett hybridscenario (agenter + mänsklig verifiering):

| Fas | Utan agenter | Med agenter (Claude API) | Med agenter (Gemma 4 lokal) |
|-----|-------------|-------------------------|----------------------------|
| **Fas 1** (infra + gateway + pilot) | 4 veckor | 2-3 veckor | 3-4 veckor |
| **Fas 2** (multi-tenant + policy + RAG) | 4 veckor | 3 veckor | 3-4 veckor |
| **Fas 3** (agent + compliance + scale) | 4 veckor | 3 veckor | 4 veckor |

**Varför är skillnaden liten?** Flaskhalsen är inte kodgenerering utan *integration, testning och verifiering*. Agenter kan generera Helm charts snabbt, men att verifiera att vLLM + KServe + llm-d + Qdrant faktiskt fungerar tillsammans kräver en riktig K8s-miljö och mänsklig bedömning. Compliance-verifiering (10 regelverk) kräver juridisk kompetens, inte kodning.

**Agenternas verkliga vinst:** Reducerar manuellt arbete med ~30-40%, främst på repetitiva uppgifter (manifests, policies, dashboards, dokumentation). De förkortar inte kritiska vägen märkbart — den bestäms av hårdvaruleverans, teamrekrytering och compliance-godkännanden.

---

## 8. Managed AI-plattform vs self-hosted (Bifrost)

En CTO bör jämföra Bifrost mot alternativet att köpa en managed plattform.

### Jämförelse

| Faktor | Managed (Azure AI / Vertex / Databricks) | Self-hosted (Bifrost) |
|--------|------------------------------------------|----------------------|
| **Time to value** | Dagar-veckor | 30-90 dagar |
| **Data residency** | ⚠️ Gateway-kontroll, men multi-tenant cross-exposure risk | ✅ Full kontroll, PII stannar i perimetern |
| **EU AI Act compliance** | ⚠️ Delad tenancy komplicerar audit. Leverantörens ansvar vs ditt | ✅ Full auditbarhet, eget riskregister |
| **Konfidentiell data** | ⚠️ Kräver tillit till leverantörens isolering | ✅ Data lämnar aldrig organisationen |
| **Kostnad (10 team)** | ~300-600K SEK/mån (API-kostnader + managed fees) | ~500-800K SEK/mån (infra + personal) |
| **Kostnad (50 team)** | ~1.5-3M SEK/mån (skalas linjärt) | ~600K-1M SEK/mån (skalas sublinärt) |
| **Vendor lock-in** | 🔴 Hög (API-specifik, proprietära features) | 🟢 Låg (öppna standarder, exit-plan per komponent) |
| **Anpassning** | ⚠️ Begränsad till leverantörens utbud | ✅ Full kontroll: fine-tuning, custom agents, compliance-profiler |
| **Säkerhetsskyddslagen** | ❌ Kan inte uppfyllas (kräver fysisk isolering i Sverige) | ✅ Designat för secure zone |
| **Drift/personal** | ✅ Leverantörens ansvar | ⚠️ Kräver platform team (3-5 FTE) |

### Trend 2026: Hybrid

Marknaden rör sig mot **managed kontrollplan + self-hosted dataplan** — orkestrering och monitorering hos leverantören, inference i din egen VPC. Bifrosts arkitektur stödjer detta: gatewayen (§6) kan routa till både lokala och externa modeller.

### Varför Bifrost ändå?

Tre faktorer som gör managed otillräckligt för CGI:

1. **Säkerhetsskyddslagen** — managed plattformar kan inte leverera air-gapped, fysiskt isolerad inference i Sverige. Bifrost kan.
2. **Kunddata-segregering** — CGI arbetar med konkurrerande kunder i samma bransch. Managed plattformars multi-tenancy ger inte tillräcklig isoleringsgaranti för en auditor.
3. **Kostnad vid skala** — vid 50+ team skalas managed linjärt (per token), Bifrost sublinärt (delad infrastruktur). Break-even ~15-20 team.

**Korrigering (efter Mythos-insikt):** Det ursprungliga påståendet att managed "hade varit rätt val vid <5 team" var fel. Det utgick från ett statiskt perspektiv. I verkligheten:

- **AI-kapabiliteter skiftar snabbare än leverantörer kan leverera.** llm-d gick från "bevaka" till standard på månader. SGLang fick opatchade RCE:er. TGI dog. En managed plattform kan inte pivotera i den takten.
- **Frontier-modeller begränsas.** Mythos (Anthropics mest kapabla modell) släpps inte publikt — bara ~50 partners via Project Glasswing. Managed plattformar kommer inte ha tillgång.
- **Lock-in accelererar med AI-takten.** Ju snabbare modeller förbättras, desto dyrare blir det att vara låst i en leverantörs ekosystem. Med Bifrost kan du byta modell på en vecka. Med managed frågar du din leverantör.

**Ny slutsats:** Managed är inte rätt val i någon konstellation för en organisation som CGI. Inte ens vid 5 team — för du bygger inte en plattform för idag, utan för en värld där kapabiliteter fördubblas var 6:e månad. Kontroll över din egen stack är det enda som skalar med den utvecklingstakten.

---

## 9. Fyra utvecklare: utan agenter vs med agenter

### Vad forskningen visar (ärligt)

Det finns en paradox i datan som är viktig att förstå:

| Studie | Resultat | Typ | Confidence |
|--------|----------|-----|------------|
| **METR (2025, kontrollerad RCT)** | Erfarna utvecklare 19% **långsammare** med AI | Riktigt arbete, egna kodbasar | HÖG |
| **GitHub Copilot (Microsoft)** | 55% snabbare | Labmiljö, avgränsade uppgifter | HÖG (men lab) |
| **Microsoft/Accenture deploy** | +13-22% fler PR/vecka | Verklig deployment | MEDEL |
| **Cursor (Univ. of Chicago)** | +39% merge rate | Intern deployment | MEDEL |
| **CodeRabbit (470 PR:er)** | AI-kod har 1.7x fler defekter | Verklig produktion | HÖG |

**Paradoxen:** AI snabbar upp *kodgenerering* (avgränsat) men saktar ner *systemarbete* (helheten). Utvecklare *tror* att de är snabbare — men kontrollerade mätningar visar motsatsen för erfarna utvecklare.

**METR:s förklaring:** Väntetid (token-generering), review-overhead (validera AI-output), kontextbyte (prompt ↔ kod), och hallucineringsfix (städa felaktiga förslag).

**Gäller METR för infrastrukturarbete?** METR studerade algoritmisk programmering i open source-projekt. DevOps/infrastruktur (Helm, K8s YAML, Terraform) är annorlunda — det är *mönsterbaserat och repetitivt*. Det finns ingen METR-motsvarighet för DevOps, men branschrapporter visar 30-50% produktivitetsvinst för infrastrukturarbete specifikt. AI presterar bättre på boilerplate (K8s manifests) än på algoritmik (METR:s domän). Svagheten kvarstår för miljöspecifika beslut: version pinning, state-beroenden, integrationer.

### Scenario: 4 utvecklare bygger Bifrost fas 1

| Uppgift | 4 devs utan AI | 4 devs med agenter (Claude API) | Skillnad |
|---------|----------------|----------------------------------|----------|
| **K8s manifests + Helm** (repetitivt) | 5 dagar | 2-3 dagar | **+55-60%** (Copilot-mönster) |
| **vLLM/KServe/llm-d-integration** (systemarbete) | 5 dagar | 5-6 dagar | **−19%** (METR-effekten) |
| **NetworkPolicies + Kyverno** (policy) | 3 dagar | 2 dagar | **+30-40%** |
| **Monitoring (Prometheus/Grafana)** | 3 dagar | 1-2 dagar | **+50%** (template-tungt) |
| **SDK fas 1 (TypeScript)** | 5 dagar | 3-4 dagar | **+25-30%** |
| **Compliance-konfiguration** (10 regelverk) | 4 dagar | 4-5 dagar | **−10-20%** (domänkunskap) |
| **Test + felsökning** | 5 dagar | 5-6 dagar | **−10-20%** (AI-kod har fler buggar) |
| **Totalt fas 1** | **~30 arbetsdagar** | **~23-27 arbetsdagar** | **~10-25% snabbare** |

**Nyckeln:** Vinsten är *inte* 2-3x. Den är 10-25% — men *förskjuten*. Agenter sparar tid på boilerplate och templates, men kostar tid på integration och felsökning. Nettoeffekten är positiv bara om arbetet struktureras så att agenter gör det repetitiva och människor gör det komplexa.

### Kodkvalitetsdimensionen

| Metrik | Utan AI | Med AI-agenter | Källa |
|--------|---------|---------------|-------|
| Logik-/korrekthetsfel | Baseline | **+75%** | Akademisk studie (500K+ samples) |
| Säkerhetssårbarheter | Baseline | **+1.5-2x** | CodeRabbit + akademisk |
| Läsbarhet | Baseline | **−3x sämre** | CodeRabbit (470 PR:er) |
| Kodkomplexitet | Baseline | Lägre (enklare kod) | Akademisk |
| Underhållbarhet | Sämre | Bättre (enklare struktur) | Akademisk |

**Implikation:** AI-agenter producerar *mer kod snabbare* med *fler buggar*. Den totala kostnaden (kodning + test + fix + review) kan vara högre med agenter om inte review-processen skärps. **Det är inte produktivitetsvinsten som avgör — det är om organisationen har en review-kultur som fångar AI-defekterna.**

### Team-workflows som faktiskt fungerar

Tre mönster har etablerats 2025-2026:

**Mönster 1: Evaluator-Optimizer (bäst dokumenterat)**
```
Människa → skriver krav
  → Agent A → genererar kod
    → Agent B → utvärderar mot kriterier
      → Agent A → itererar
        → Människa → mergear
```
En agent genererar, en annan utvärderar. Människan skriver krav och godkänner slutresultat. Fungerar bra för avgränsade uppgifter.

**Mönster 2: Rollbaserad pipeline (ChatDev-stil)**
```
Arkitekt-agent → Design-agent → Kod-agent → Test-agent → Review-agent
```
Varje agent har en specifik roll i en sekvens. Deterministiskt, förutsägbart, men rigidt. Fungerar för standardiserade arbetsflöden (Helm chart-generering, manifest-pipeline).

**Mönster 3: Orkestrerare + autonoma agenter (Bifrost-relevant)**
```
Människa → definierar uppgifter
  → Orkestrerare → fördelar till agenter
    → Agent 1 → K8s manifests (asynkront)
    → Agent 2 → Helm charts (asynkront)
    → Agent 3 → Kyverno policies (asynkront)
  → Evaluator-agent → kontrollerar konsistens
    → Människa → mergear
```
Flera agenter arbetar asynkront med egna kontextfönster. Orkestreraren koordinerar. Människan planerar och kontrollerar. **Det här är mönstret som skalas** — och det som är mest relevant för hur ett CGI-plattformsteam skulle bygga Bifrost med agenter.

**Vad som *inte* fungerar:** Full autonomi utan mänsklig checkpoint. Inga dokumenterade fall där agenter byggde och deployade hela system utan mänsklig inblandning.

### Onboarding: 11 veckor till produktivitet

GitHub/Copilot-data visar att det tar **~11 veckor** innan produktivitetsvinsten realiseras. Under de första veckorna är utvecklare *långsammare* med AI. Cursor-data visar att utvecklare med 50+ timmars erfarenhet ser +38% speed, medan nybörjare ser marginell vinst.

**Implikation för CGI:** Om 4 utvecklare börjar med AI-agenter dag 1 ska man förvänta sig:
- **Vecka 1-4:** Långsammare. Lärande. Frustration.
- **Vecka 5-8:** Break-even. Börjar förstå var agenter hjälper.
- **Vecka 9-12:** Positiv ROI. Mönster 3 (orkestrerare) börjar fungera.

En strukturerad onboarding-plan behövs — inte bara "här är din API-nyckel". Rekommendation: börja med Mönster 1 (evaluator-optimizer) på avgränsade uppgifter, migrera till Mönster 3 efter vecka 8.

GitHub/Copilot-data visar att det tar **~11 veckor** innan produktivitetsvinsten realiseras. Under de första veckorna är utvecklare *långsammare* med AI. Cursor-data visar att utvecklare med 50+ timmars erfarenhet ser +38% speed, medan nybörjare ser marginell vinst.

---

## 10. Tokens per sekund: vad en agent faktiskt behöver

### Två mått — och bara ett är flaskhalsen

| Mått | Vad det mäter | Varför det spelar roll |
|------|--------------|----------------------|
| **TTFT** (Time to First Token) | Tid från prompt till första token i svaret | Bestämmer hur snabbt agent-loopen kan iterera |
| **Throughput** (tok/s) | Hur snabbt hela svaret genereras | Bestämmer hur lång tid det tar att *läsa* ett långt svar |

**Insikt:** För agent-loopar (tänk → kod → test → fix, 10-50 iterationer) är **TTFT flaskhalsen**, inte throughput. Varje iteration väntar på TTFT innan nästa steg kan starta. Throughput spelar roll först när svaren är långa (>1000 tokens).

### Jämförelse: API vs lokal GPU

| Plattform | TTFT | Throughput (output) | Kommentar |
|-----------|------|-------------------|-----------|
| **Claude API (Sonnet)** | ~200ms | ~993 tok/s | Snabb TTFT, mycket hög throughput |
| **GPT-4o API** | ~920ms | ~145 tok/s | Långsam TTFT, medel throughput |
| **vLLM på H100** | <100ms | ~2 300-2 500 tok/s | Bäst TTFT *och* throughput |
| **vLLM på RTX 4090** (FP16) | <100ms | ~50-55 tok/s | Bra TTFT, låg throughput |
| **vLLM på RTX 4090** (INT4) | <100ms | ~194 tok/s | Bra TTFT, medel throughput |
| **Gemma 4 31B på RTX 4090** | ~150ms | ~36-58 tok/s | Medel TTFT, låg throughput |
| **Gemma 4 26B MoE på RTX 4090** | ~100ms | ~80-131 tok/s | Bra TTFT, medel throughput |

### Vad en agent-loop faktiskt upplever

**Scenario: 20-stegs agent-loop (typisk buggfix)**

| Plattform | TTFT × 20 | Generering (avg 500 tok/steg) | **Total väntetid** |
|-----------|-----------|-------------------------------|-------------------|
| Claude API | 4s | 10s | **14 sekunder** |
| GPT-4o API | 18s | 69s | **87 sekunder** |
| vLLM H100 | 2s | 4s | **6 sekunder** |
| vLLM RTX 4090 (INT4) | 2s | 52s | **54 sekunder** |
| Gemma 4 31B RTX 4090 | 3s | 172s | **175 sekunder** (~3 min) |

**Slutsats:** H100 med vLLM slår allt. Claude API är näst bäst. GPT-4o är överraskande långsam. Gemma 4 på RTX 4090 är 12x långsammare än Claude API per agent-loop.

### Vad händer med 4 agenter samtidigt? (concurrent requests)

Siffrorna ovan gäller *en* agent. Med 4 utvecklare som kör agenter parallellt mot samma GPU:

| Plattform | 1 agent | 4 agenter samtidigt | Degradation |
|-----------|---------|---------------------|-------------|
| **Claude API** | 993 tok/s | ~993 tok/s per agent | Ingen — API skalar horisontellt |
| **vLLM H100** | 2 300 tok/s | ~575 tok/s per agent | ~4x delning (linjär) |
| **vLLM RTX 4090** | 194 tok/s | ~50 tok/s per agent | ~4x delning, nära ohållbart |
| **Gemma 4 31B RTX 4090** | 36-58 tok/s | ~10-15 tok/s per agent | **Oanvändbart** för interaktiva agenter |

**vLLM-benchmarks (H100, Llama 3.1 8B):** Vid 16 concurrent requests sjunker per-request-throughput till ~8 tok/s men total throughput ökar. Skalningen är inte linjär — efter 8-12 concurrent requests platår den.

**Implikation:** Med 4 utvecklare som kör agenter parallellt behöver du antingen (a) Claude API (obegränsad skalning), (b) 2+ H100:er, eller (c) acceptera att lokal GPU blir en kö. RTX 4090 fungerar för 1-2 agenter, inte 4.

### Vad vill man ha?

| Användningsfall | TTFT-krav | Throughput-krav | Rekommendation |
|----------------|-----------|-----------------|----------------|
| **Interaktiv kodassistent** (Copilot-stil) | <200ms | >100 tok/s | Claude API eller H100 |
| **Agent-loop** (buggfix, refaktor) | <500ms | >200 tok/s | Claude API eller H100 |
| **Batch-kodgenerering** (Helm charts, manifests) | Irrelevant | >50 tok/s | Gemma 4 lokal fungerar |
| **Realtids-chat** (playground) | <300ms | >50 tok/s | Vad som helst |
| **Komplex arkitekturuppgift** (30 min) | <1s OK | Irrelevant | Claude Opus (kvalitet > hastighet) |

**Nyckelinsikt:** T/s är inte *ett* tal — det är två (TTFT + throughput) och rätt svar beror på uppgiften. För interaktiva agenter: TTFT < 500ms. För batch: throughput > 50 tok/s. För komplexa uppgifter: varken TTFT eller throughput — det är *resonemangskvalitet* som avgör.

---

## 11. AI-kapabilitetens utvecklingstakt

### SWE-bench — vad agenterna faktiskt klarar

| Period | Bästa score (Verified) | Bästa score (Pro, okontaminerad) | Modell |
|--------|----------------------|----------------------------------|--------|
| Okt 2024 | 49% | — | Claude 3.5 Sonnet |
| Dec 2024 | 62% | — | Diverse |
| Maj 2025 | 75% | ~46-57% | Bytedance TRAE |
| Apr 2026 | 93.9% | ~50-55% (estimat) | Claude Mythos |

**Verkligheten bakom siffrorna:** SWE-bench Verified (93.9%) är kontaminerad — modellerna har troligen sett uppgifterna under träning. SWE-bench Pro (okontaminerad) visar ~50%. **Gapet är 35-40 procentenheter.**

OpenAI har officiellt slutat rapportera SWE-bench Verified-resultat av denna anledning.

### Förbättringstakt

- **2024:** ~13 procentenheter/månad (snabb)
- **2025:** ~2-3 procentenheter/månad (avtagande)
- **2026:** Platå — svårare att förbättra

**Projektion:** Agenter löser ~60-70% av verkliga buggar i slutet av 2026. Inte 90%+.

### Vad Mythos-kapabiliteten signalerar

Mythos hittade tusentals zero-day-sårbarheter (27 år gammal bugg i OpenBSD, 16 år gammal i FFmpeg) och bröt sig ur sin egen sandbox. Det visar att frontier-modeller redan överträffar mänsklig kapacitet *inom specifika domäner*. Men:

- Mythos är inte tillgänglig publikt
- Managed plattformar kommer inte ha den
- Kapabiliteten finns — men *kontrollen* över den avgörs av vem som äger stacken

---

## 12. Vad som saknas i denna analys

Transparens om vad jag *inte* undersökt:

1. **Reella benchmarks på K8s/Helm/Terraform** — det finns inga publicerade. Min bedömning baseras på generell kodningsförmåga, inte verifierade infrastruktur-tester.
2. **CGI:s befintliga GPU-tillgångar** — om CGI redan har GPU:er ändras break-even-kalkylen drastiskt. Rapporten antar att hårdvara måste köpas.
3. **Fine-tunad Gemma 4 på infrastrukturkod** — ingen har publicerat resultat. En fine-tunad variant kan vara betydligt bättre på K8s-specifika uppgifter.
4. **Multi-agent-orkestrering** — hur presterar Gemma 4 när flera agenter samarbetar i Mönster 3 (orkestrerare + autonoma agenter)? Inga data.
5. **Gemma 4:s beteende vid 200K+ kontext** — benchmarks visar siffror vid kortare kontext. Kvalitetsdegradation vid lång kontext är inte dokumenterad.
6. **A2A-protokollet med Gemma 4** — MCP-kompatibilitet verifierad (§4), men agent↔agent-kommunikation via Agent Cards är inte explicit testad.

---

## 13. Rekommendation

**För att bygga Bifrost:**
- Använd Claude (Sonnet/Opus) via API för planering, arkitektur och komplex integration
- Använd Gemma 4 lokalt för avgränsad kodgenerering om air-gap krävs
- Det är billigare, snabbare och bättre att använda API för bygget

**För att driva Bifrost (efter lansering):**
- Gemma 4 som en av modellerna i vLLM-katalogen — primärt för konfidentiell data
- 26B MoE i agentsandbox (snabb, låg VRAM)
- 31B Dense som fine-tuning-bas (Apache 2.0, QLoRA-stöd)
- Alltid tillsammans med starkare externa modeller (Claude, GPT) för resonemangskrävande uppgifter

**Nästa steg:**
1. Benchmarka Gemma 4 på 50-100 riktiga K8s/Helm-uppgifter från CGI:s kodbasar
2. Testa multi-step agent-loops med OpenCode + Gemma 4 på en avgränsad uppgift
3. Utvärdera fine-tuning på CGI:s infrastrukturmönster (om data finns)
4. Jämför med Qwen 3.5 om licensmodellen tillåter det

---

## 14. Källor

- [Google: Gemma 4 — byte for byte, the most capable open models](https://blog.google/innovation-and-ai/technology/developers-tools/gemma-4/)
- [Gemma 4 model overview — Google AI for Developers](https://ai.google.dev/gemma/docs/core)
- [HuggingFace: Welcome Gemma 4](https://huggingface.co/blog/gemma4)
- [Gemma 4 function calling — Google AI](https://ai.google.dev/gemma/docs/capabilities/text/function-calling-gemma4)
- [Deploy Gemma 4 on GPU Cloud — Spheron](https://www.spheron.network/blog/deploy-gemma-4-gpu-cloud/)
- [Gemma 4 Hardware Requirements — AvenChat](https://avenchat.com/blog/gemma-4-hardware-requirements)
- [Gemma 4 Apache 2.0 License — MindStudio](https://www.mindstudio.ai/blog/gemma-4-apache-2-license-commercial-use)
- [Fine-Tune Gemma 4 — LushBinary](https://lushbinary.com/blog/fine-tune-gemma-4-lora-qlora-complete-guide/)
- [Gemma 4 vLLM Recipes](https://docs.vllm.ai/projects/recipes/en/latest/Google/Gemma4.html)
- [Gemma 4 Limitations — GemmaI4](https://gemmai4.com/limitations/)
- [Gemma 4 + OpenCode + Ollama Setup Guide — HAIMaker](https://haimaker.ai/blog/gemma-4-ollama-opencode-setup/)
- [Build AI Agent with Gemma 4 — LushBinary](https://lushbinary.com/blog/build-ai-agent-gemma-4-function-calling-mcp-tool-use/)
- [Gemma 4 Benchmarks — Medium](https://medium.com/@moksh.9/heres-a-tighter-benchmark-focused-blog-post-501c5ea829f4)
- [Best AI for Coding 2026 — MorphLLM](https://www.morphllm.com/best-ai-model-for-coding)
- [Gemma 4 vs ChatGPT vs Claude vs Copilot — Sagnik](https://sagnikbhattacharya.com/blog/gemma-4-vs-chatgpt-vs-claude)
- [I Replaced Claude with Gemma 4 — dev.to](https://dev.to/jim_l_efc70c3a738e9f4baa7/i-replaced-claude-with-gemma-4-for-a-weekend-heres-what-broke-5bf9)
- [Qwen 3.5 vs Gemma 4 benchmarks — Maniac.ai](https://www.maniac.ai/blog/qwen-3-5-vs-gemma-4-benchmarks-by-size)
- [RTX 4090 Price Tracker — BestValueGPU](https://bestvaluegpu.com/history/new-and-used-rtx-4090-price-history-and-specs/)
- [H100 Rental Prices Compared — IntuitionLabs](https://intuitionlabs.ai/articles/h100-rental-prices-cloud-comparison)
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Research: Inference Landscape 2026](../research/inference-landscape-2026.md) (Bifrost intern)
- [Gemma 4 + MCP on AWS — LushBinary](https://lushbinary.com/blog/gemma-4-mcp-server-aws-deployment-agentic-ai-guide/)
- [Enterprise Agentic AI Landscape 2026 — Kai Wähner](https://www.kai-waehner.de/blog/2026/04/06/enterprise-agentic-ai-landscape-2026-trust-flexibility-and-vendor-lock-in/)
- [Self-hosted AI sandboxes 2026 — Northflank](https://northflank.com/blog/self-hosted-ai-sandboxes)
- [AI Gateway Data Residency Comparison — TrueFoundry](https://www.truefoundry.com/blog/ai-gateway-data-residency-comparison)
- [METR: Measuring the Impact of Early-2025 AI on Experienced OS Developer Productivity](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/) (kontrollerad RCT, n=16, 246 uppgifter)
- [METR: Developer Productivity Experiment Design Update (Feb 2026)](https://metr.org/blog/2026-02-24-uplift-update/)
- [Microsoft Research: Impact of AI on Developer Productivity — GitHub Copilot](https://www.microsoft.com/en-us/research/publication/the-impact-of-ai-on-developer-productivity-evidence-from-github-copilot/)
- [CodeRabbit: AI vs Human Code — AI Code Creates 1.7x More Issues](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report) (470 riktiga PR:er)
- [arXiv: Human-Written vs AI-Generated Code — Defects, Vulnerabilities, Complexity](https://arxiv.org/abs/2508.21634) (500K+ samples)
- [OpenAI: Why We No Longer Evaluate SWE-bench Verified](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/) (kontamineringsproblem)
- [SWE-bench Pro — OpenReview](https://openreview.net/forum?id=9R2iUHhVfr) (okontaminerad benchmark, 1865 uppgifter)
- [Pragmatic Engineer: Cursor Makes Developers Less Effective?](https://newsletter.pragmaticengineer.com/p/cursor-makes-developers-less-effective)
- [Cursor Blog: The Productivity Impact of Coding Agents](https://cursor.com/blog/productivity) (+39% merge rate)
- [Fortune: AI Hampered Productivity of Software Developers Despite Expectations](https://fortune.com/article/does-ai-increase-workplace-productivity-experiment-software-developers-task-took-longer/)
- [Bloomberg: AI Is Writing 46% of All Code — GitHub Copilot's Real Impact](https://www.bloomberg.com/news/articles/2026-02-26/ai-coding-agents-like-claude-code-are-fueling-a-productivity-panic-in-tech/)
- [DatabaseMart: H100 vLLM Benchmark Results](https://www.databasemart.com/blog/vllm-gpu-benchmark-h100) (2300-2500 tok/s)
- [DatabaseMart: RTX 4090 vLLM Benchmark](https://www.databasemart.com/blog/vllm-gpu-benchmark-rtx4090) (50-194 tok/s)
- [Anthropic: Claude Mythos Preview — SWE-bench 93.9%](https://www.anthropic.com/news/claude-4)
- [Fortune: Anthropic Mythos — Step Change in Capabilities](https://fortune.com/2026/03/26/anthropic-says-testing-mythos-powerful-new-ai-model-after-data-leak-reveals-its-existence-step-change-in-capabilities/)
- [Epoch AI: SWE-bench Verified Benchmark 2026](https://epoch.ai/benchmarks/swe-bench-verified/)
- [AI Coding Agents for DevOps: Terraform, Ansible, Kubernetes — ComputingForGeeks](https://computingforgeeks.com/ai-coding-agents-devops-terraform-ansible-kubernetes/)
- [The Cursor Moment for DevOps — Plural](https://www.plural.sh/blog/the-cursor-moment-for-devops/)
- [The Code Agent Orchestra — Addy Osmani](https://addyosmani.com/blog/code-agent-orchestra/) (evaluator-optimizer, rollbaserad pipeline)
- [Beyond AGENTS.md: Building Reliable AI Coding Workflows — Stack Builders](https://www.stackbuilders.com/insights/beyond-agentsmd-turning-ai-pair-programming-into-workflows/)
- [State of AI Coding Agents 2026 — Dave Patten](https://medium.com/@dave-patten/the-state-of-ai-coding-agents-2026-from-pair-programming-to-autonomous-ai-teams-b11f2b39232a)
- [vLLM Benchmarks: Throughput, Latency & Production Guide — MorphLLM](https://www.morphllm.com/vllm-benchmarks) (concurrent request-data)
- [Benchmarking Llama 3.1 8B on H100 with vLLM — Ori](https://www.ori.co/blog/benchmarking-llama-3.1-8b-instruct-on-nvidia-h100-and-a100-chips-with-the-vllm-inferencing-engine)
