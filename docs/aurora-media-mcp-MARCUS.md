# Aurora Media MCP — Så här styr du transkribering

Aurora kan transkribera ljud och video med WhisperX. Du kan styra kvalitet, hastighet och domänanpassning genom hur du formulerar din prompt.

## Grundläggande användning

Bara säg vad du vill — Aurora väljer bästa inställningar automatiskt:

> "Transkribera den här filen: /path/to/audio.wav"

> "Indexera den här YouTube-videon: https://youtube.com/watch?v=..."

## Styra språk

Aurora auto-detekterar språk, men du kan vara explicit:

> "Transkribera på svenska: /path/to/audio.wav"

Svenska triggar automatiskt en specialtränad svensk modell (KBLab/kb-whisper-large) som är betydligt bättre på svenska än standardmodellen.

> "Transcribe in English: /path/to/audio.wav"

## Styra kvalitet vs hastighet

Standard är **maximal kvalitet** (float32, beam_size 5). Om du vill ha snabb draft:

> "Gör en snabb draft-transkribering av den här filen"

LLM:en sätter då automatiskt `int8` och `beam_size=1` — ca 3-5x snabbare men lägre kvalitet.

> "Transkribera med högsta möjliga kvalitet, beam size 10"

Explicit hög beam_size ger marginallt bättre resultat på svårt material.

## Domänspecifika termer

Det här är den mest kraftfulla styrningen. Om ditt material handlar om specifika ämnen, tala om det:

> "Transkribera den här filen. Det handlar om AUTOSAR och immobilizer-system. Termer som förekommer: ECU, ImobMgr, CAN bus, SecOC."

> "Transkribera intervjun med Marcus Purens och Helena Lindqvist."

> "Transkribera podden. Ämnet är Kubernetes — termer: kubectl, etcd, pod, deployment, ingress."

Aurora skickar dessa termer som `initial_prompt` till Whisper, vilket dramatiskt förbättrar stavningen av tekniska termer och egennamn.

### Före och efter — varför initial_prompt spelar roll

Whisper hör ljud och gissar stavning. Utan ledtrådar gissar den fel på allt den inte hört förut.

**Exempel 1: Fordonssäkerhet**

Talaren säger: *"ImobMgr skickar ett SecOC-skyddat meddelande till ECM via CAN-bussen"*

| | Resultat |
|---|---|
| **Utan initial_prompt** | "Imob manager skickar ett seco-skyddat meddelande till ECM via can-bussen" |
| **Med** `initial_prompt="ImobMgr, SecOC, ECM, CAN"` | "ImobMgr skickar ett SecOC-skyddat meddelande till ECM via CAN-bussen" |

**Exempel 2: Svenska egennamn**

Talaren säger: *"Marcus Purens presenterar Neuron HQ:s arkitektur för Helena Lindqvist"*

| | Resultat |
|---|---|
| **Utan initial_prompt** | "Marcus Perens presenterar neuron HQs arkitektur för Helena Lindkvist" |
| **Med** `initial_prompt="Marcus Purens, Neuron HQ, Helena Lindqvist"` | "Marcus Purens presenterar Neuron HQ:s arkitektur för Helena Lindqvist" |

**Exempel 3: Kubernetes-podd**

Talaren säger: *"kubectl apply skapar en deployment med tre replicas i etcd"*

| | Resultat |
|---|---|
| **Utan initial_prompt** | "kubectl apply skapar en deployment med tre replicas i et cetera" |
| **Med** `initial_prompt="kubectl, deployment, replicas, etcd"` | "kubectl apply skapar en deployment med tre replicas i etcd" |

**Exempel 4: Juridiska standarder**

Talaren säger: *"UNECE Regulation 155 kräver att alla fordon har cybersecurity management system enligt ISO/SAE 21434"*

| | Resultat |
|---|---|
| **Utan initial_prompt** | "UNISA regulation 155 kräver att alla fordon har cyber security management system enligt ISO SE 21434" |
| **Med** `initial_prompt="UNECE, Regulation 155, ISO/SAE 21434, cybersecurity"` | "UNECE Regulation 155 kräver att alla fordon har cybersecurity management system enligt ISO/SAE 21434" |

### Tumregel

Samla ihop **egennamn, förkortningar och tekniska termer** som du vet förekommer i inspelningen. Stoppa in dem som en kommaseparerad lista. Whisper använder dem som "stavningsguide" — den hör fortfarande samma ljud, men väljer rätt bokstavering.

### Varning: Bara termer som faktiskt förekommer

Inkludera **bara termer du vet sägs i inspelningen**. Om du skriver "Marcus Purens" i prompten men ingen nämner det namnet kan Whisper fabricera det — den "vill" använda termerna den fått och kan hallucinera dem in i transkriptionen. Hellre en term för lite än en för mycket.

## Talaridentifiering

Om det är flera talare:

> "Transkribera och identifiera talarna. Det är 3 personer."

> "Transkribera den här intervjun och ta reda på vem som säger vad."

## Brusig inspelning

> "Den här inspelningen har mycket bakgrundsbrus. Rensa ljudet och transkribera sedan."

Aurora kör DeepFilterNet-brusreducering före transkriberingen.

## Komplett pipeline-exempel

> "Ladda ner den här YouTube-videon, rensa ljudet, transkribera på svenska med bästa kvalitet. Det handlar om fordonssäkerhet — termer som förekommer: ISO 26262, ASIL, HARA, FMEA, hazard analysis."

Det triggar hela kedjan: nedladdning → brusreducering → transkribering med domänanpassning.

## Parametrar i detalj

Om du vill vara helt explicit kan du nämna parametrarna direkt:

| Vad du säger | Vad som händer |
|---|---|
| "compute type float32" | Maximal precision (standard) |
| "compute type int8" | Snabb men lägre kvalitet |
| "beam size 10" | Grundligare sökning, långsammare |
| "beam size 1" | Snabbast möjliga, greedy decoding |
| "initial prompt: Marcus, Helena, AUTOSAR" | Guidar stavning av dessa termer |
| "language sv" | Tvingar svenska + svensk modell |
| "skip alignment" | Snabbare, men inga ordnivå-timestamps |

## Vanliga frågor

**Varför tar det lång tid?**
float32 + beam_size 5 + alignment ger bästa kvalitet men tar tid. En 60-minuters inspelning kan ta 15-30 minuter. Vill du ha snabb feedback, be om "snabb draft" först.

**Varför stavar den fel på namn?**
Whisper gissar stavning. Ge den ledtrådar via domäntermer: "Det handlar om Marcus Purens och Neuron HQ."

**Kan jag byta modell?**
Ja: "Använd modellen openai/whisper-large-v3". Men standardmodellen (large-v3-turbo) är nästan alltid bäst.
