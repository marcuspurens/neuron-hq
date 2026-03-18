# RT-1c: Thinking-extraktion + Reconnect State

## Bakgrund

RT-1a (EventBus) och RT-1b (dashboard) ger oss live-insyn i agenternas *actions* och *reasoning*. Men det saknas två saker:

1. **Thinking** — det djupaste lagret av insyn: modellens interna resonemang innan den börjar skriva. Vissa modeller exponerar redan detta (Claude extended thinking, OpenAI o1/o3 reasoning tokens, DeepSeek chain-of-thought). Neuron HQ ska automatiskt visa det när det finns.

2. **Reconnect state** — om du öppnar dashboarden mitt i en körning, eller om webbläsaren tappar anslutningen, ska du se vad som hänt hittills — inte en tom sida.

## Förutsättningar

RT-1a och RT-1b måste vara implementerade och mergade.

## Mål

### Thinking
- När en modell exponerar internt resonemang → visa det i dashboarden per agent
- Modell-agnostiskt: samma `agent:thinking`-event oavsett provider
- Om modellen inte exponerar thinking → inget visas, noll overhead

### Reconnect
- Vid ny anslutning: skicka state-snapshot med allt som hänt hittills
- Dashboarden ritar upp hela körningens historik innan live-events börjar strömma

## Arkitektur

### Thinking-extraktion

Ny fil: `src/core/thinking-extractor.ts`

```typescript
/**
 * Extraherar thinking/reasoning från modell-response.
 * Normaliserar alla providers till { text: string }.
 * Returnerar null om modellen inte exponerade thinking.
 */
export function extractThinking(
  response: unknown,
  provider: 'anthropic' | 'openai' | 'deepseek' | 'ollama' | 'unknown'
): { text: string } | null;
```

**Provider-specifik detektion:**

| Provider | Var thinking finns | Hur vi detekterar |
|----------|-------------------|-------------------|
| **Claude** (Anthropic) | `content_block` med `type: 'thinking'` i SDK stream events | Kolla `content.type === 'thinking'` i response blocks |
| **OpenAI o1/o3** | `reasoning_tokens` eller `reasoning` fält i completion | Kolla `response.choices[0].message.reasoning` |
| **DeepSeek** | `<think>...</think>` taggar i output | Regex-match på `<think>` |
| **Lokala modeller (Ollama)** | `<thinking>...</thinking>` taggar i text-stream | Regex-match på `<thinking>` |
| **Okänd** | Försök alla regex-mönster | Fallback-chain |

**Integration i agent-loopen:**
```typescript
// I manager.ts (och andra agenter), efter stream.finalMessage():
const thinking = extractThinking(response, 'anthropic');
if (thinking) {
  eventBus.safeEmit('agent:thinking', { runid, agent: 'manager', text: thinking.text });
}
```

**Viktigt:** Implementera bara Claude-extraktorn fullständigt i denna körning. OpenAI, DeepSeek och Ollama: definiera interfacet men returnera `null` med en `// TODO: implement when provider is used`-kommentar. Vi bygger inte extraktorer för providers vi inte använder ännu.

### Reconnect State

Använder `eventBus.history` (den cirkulära buffern från RT-1a) för att skicka state-snapshot vid ny SSE-anslutning.

**Ändringar i `dashboard-server.ts`:**

```typescript
// Vid ny SSE-anslutning:
// 1. Skicka alla events från eventBus.history som initial state
for (const event of eventBus.history) {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}
// 2. Sedan: streama live-events som vanligt
```

**Ändringar i `dashboard-ui.ts`:**
- UI:n behandlar replay-events identiskt med live-events
- Ingen speciell "replay"-logik behövs — samma event-handlers bygger upp state
- Valfritt: visa en subtil indikator "Återansluten — visar historik" som försvinner efter 3 sekunder

### UI för thinking

Ändringar i `dashboard-ui.ts`:

```
┌─────────────────────────┐
│ MANAGER  ● aktiv        │
│                         │
│ ▼ Resonemang            │  ← agent:text (alltid synligt)
│ "T1 och T2 oberoende —  │
│  kör parallellt"        │
│                         │
│ ▶ Thinking              │  ← agent:thinking (kollapsat, klicka för att öppna)
│                         │  ← visas BARA om thinking-data finns
└─────────────────────────┘
```

- "Resonemang" (agent:text) — öppet som default, scrollar live
- "Thinking" (agent:thinking) — stängt som default, klicka för att öppna
- Thinking-panelen har ljusare bakgrund och kursiv text (visuellt distinkt)
- Om ingen thinking-data → knappen "Thinking" visas inte alls

## Krav

### Måste ha (acceptance criteria)
- [ ] `thinking-extractor.ts` — `extractThinking()` med typed interface
- [ ] Claude-extraktor: detekterar `thinking`-blocks i Anthropic SDK response
- [ ] OpenAI/DeepSeek/Ollama: interface definierat, returnerar `null` med TODO-kommentar
- [ ] `agent:thinking`-event emitteras i agent-loopen när thinking detekteras
- [ ] Reconnect: state-snapshot skickas vid ny SSE-anslutning (alla events från `eventBus.history`)
- [ ] Dashboard: thinking-panel per agent (kollapsat, visas bara om data finns)
- [ ] Dashboard: reconnect visar fullständig historik
- [ ] Alla befintliga tester fortsätter passera
- [ ] Minst 8 nya tester:
  - `extractThinking()` med Claude thinking-block → extraherar text
  - `extractThinking()` med vanlig Claude response → null
  - `extractThinking()` med okänd provider → null
  - SSE reconnect skickar history
  - Dashboard renderar thinking-panel
  - Dashboard döljer thinking-panel om data saknas

### Bra att ha (stretch goals)
- [ ] DeepSeek `<think>`-extraktor (om Neuron HQ börjar använda DeepSeek)
- [ ] Ollama `<thinking>`-extraktor (för lokala modeller)
- [ ] Thinking-token-räknare i dashboarden (hur mycket "tänk-tid" per agent)

## Tekniska beslut

- **Interface-first** — alla providers definieras i TypeScript, bara Claude implementeras nu
- **Ingen ny dependency** — regex + type-checking
- **History replay via SSE** — inga extra endpoints, bara skicka buffrad data före live-stream
- **Kollapsat som default** — thinking kan vara väldigt verbose, ska inte överväldiga

## Riskanalys

| Risk | Sannolikhet | Hantering |
|------|-------------|-----------|
| Claude SDK ändrar thinking-format | Låg | Defensiv parsing, fallback till null |
| Thinking-data mycket stor (tusentals tokens) | Medel | Trunkera till senaste 2000 tecken per agent i UI |
| History-replay överväldgar vid lång körning | Låg | Max 200 events i buffern (redan begränsat i RT-1a) |

## Dependencies

Inga nya.

## Uppskattad omfattning

- ~80 rader: `thinking-extractor.ts` (interface + Claude-implementering + stubs)
- ~20 rader: Integration i agent-loop (emit thinking)
- ~30 rader: Ändringar i `dashboard-server.ts` (history replay)
- ~60 rader: Ändringar i `dashboard-ui.ts` (thinking-panel + reconnect-indikator)
- ~80 rader: Tester
- **Totalt: ~270 rader**
