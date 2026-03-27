# Marcus — Projektägare och beställare

Senast uppdaterad: 2026-03-26
Syfte: Läs denna fil innan du börjar arbeta. Den beskriver vem Marcus är, vad han vill, och hur du ska kommunicera med honom.

---

## 1. Vem är Marcus?

Marcus är projektägare och den enda personen som arbetar med Neuron HQ. Han är inte traditionell utvecklare, men förstår system och arkitektur på en nivå som de flesta utvecklare inte gör. Han bygger saker som fungerar, på sin egna väg.

**Känd fakta:**

- Icke-kodare i traditionell mening, men systemtänkare på hög nivå
- Har byggt Neuron HQ under ca 2 månader med hjälp av Claude Opus i VS Code
- Byggt ett komplext control plane för autonoma agentsvärmar utan att vara traditionell programmerare
- Bytte till OpenCode + LiteLLM den 2026-03-26
- Jobbar ensam, inte i ett team
- Kommunicerar på svenska som default
- Jobbar från hemmet, Mac M4 med 48 GB RAM

**Marcus, fyll i detta:**

<!-- TODO: Marcus, fyll i detta -->

- Fullständigt namn
- Vad du jobbar med professionellt (utanför det här projektet)
- Varför du bygger Neuron HQ och Aurora — det verkliga syftet
- Bakgrund (design, journalistik, management, något annat?)

---

## 2. Teknisk profil

Marcus kan läsa och granska kod, men skriver den inte. Han förstår arkitektur, konsekvenser, och systemdesign djupt. Han behöver inte implementationsdetaljer, han behöver förstå vad ett beslut _gör_.

**Känd faktabas:**

- Förstår begrepp som: knowledge graph, embeddings, RAG, MCP, pgvector, PPR, GraphRAG, A-MEM, HippoRAG
- Vill inte ha kodsnuttar i kommunikation riktad mot honom (inte i dagböcker, inte i sammanfattningar)
- Har djup intuition för vad ett system ska göra, även om han inte implementerar det
- Har lärt sig mycket under 2 månaders intensivt arbete med Opus

**Marcus, fyll i detta:**

<!-- TODO: Marcus, fyll i detta -->

- Erfarenhet av specifika teknologier utöver det som nämnts
- Bakgrund som format hur du tänker kring system och information

---

## 3. Kommunikationsstil — HUR du ska tala med Marcus

Det här är den viktigaste sektionen. Läs den noggrant.

### Gör det här:

- **Kommunicera på svenska** som default, alltid
- **Var direkt** och kom till poängen snabbt. Marcus har inga problem med kortfattade svar.
- **Ge alternativ men rekommendera ett** — "Jag föreslår X, men Y är möjligt om..."
- **Kör utan att fråga** när han har godkänt en uppgift. "Kör" är ett fullständigt godkännande.
- **Visa framsteg** med tabeller och checklistor
- **Förklara beslut i konsekvenser**, inte implementationsdetaljer. Säg "det här gör att du kan indexera videos 3x snabbare", inte "vi optimerar I/O-boundness i worker-processen"
- **Var ärlig om begränsningar** — han uppskattar direkthet mycket mer än artigt krångel

### Gör inte det här:

- Fråga "Ska jag fortsätta?" mitt i en uppgift — om han sa kör, kör du
- Använd teknisk jargong utan att koppla det till effekten för honom
- Skriv kodsnuttar i Marcus-vända kommunikationer (dagböcker, sammanfattningar, rapporter)
- Överkomplicera enkla svar
- Committa kod utan explicit godkännande
- Börja med artiga fraser och onödigt svammel

---

## 4. Vad Marcus värdesätter

Observerat från samarbetet:

- **Gedigen dokumentation** — vill ha strukturerade dagböcker, Swagger-spec, rapporter, handoffs. Dokumentation är inte overhead, det är produkten.
- **Systemtänkande** — ser helheten, inte bara enskilda features. En diskussion om en detalj leder snabbt till en diskussion om arkitekturen.
- **Autonomi** — vill att AI-agenter tar initiativ och kör utan att fråga hela tiden. Han bygger ett autonomt system, och förväntar sig autonomt beteende.
- **Ärlighet** — "vet inte" och "det kan inte göras" är bra svar. Falskt förtroende är det värsta.
- **Pragmatism** — vill ha saker att fungera nu, inte perfekta lösningar om tre månader.
- **Lokal drift** — föredrar lokalt framför molnet. Vill kunna peka på en lokal mapp.
- **Kontinuitet** — bryr sig om att systemet minns vad som gjorts. Ställde frågan "Kommer systemets minne komma ihåg vad du gör?" tidigt — det är inte en teknisk fråga, det är ett värde.

**Marcus, fyll i detta:**

<!-- TODO: Marcus, fyll i detta -->

- Specifika mål med projektet på 3, 6, 12 månaders sikt
- Vad du gör med Aurora (journalistik? forskning? personligt kunskapsarkiv?)
- Vad som är viktigast att Neuron HQ kan göra inom de närmaste veckorna

---

## 5. Projektets mål — Marcus's vision

**Känd riktning:**

- Bygga "Aurora" — ett second brain som indexerar och svarar på frågor om kunskap
- Neuron HQ som ett autonomt system för att bygga och förbättra andra system
- Vill ha Aurora i daglig drift: indexera URLs, dokument, YouTube-videos
- Termerna GraphRAG, A-MEM och HippoRAG används naturligt — han förstår dem och väljer medvetet

**Marcus, fyll i detta:**

<!-- TODO: Marcus, fyll i detta -->

- Vad indexerar du i Aurora? (nyheter, forskning, möten, något annat?)
- Vad vill du kunna göra med knowledge graph som du inte kan idag?
- Vad är den långsiktiga visionen för Neuron HQ — bara ditt eget system, eller något mer?

---

## 6. Teknisk miljö

**Känd konfiguration:**

- Hårdvara: Mac M4, 48 GB RAM
- Gränssnitt: OpenCode + LiteLLM (modeller prefixas med `svt-litellm/`)
- Databas: PostgreSQL + pgvector lokalt
- Embeddings: Ollama lokalt
- Anteckningar: Obsidian vault "Neuron Lab"
- Backend workers: Python 3 (aurora-workers)
- Pakethanterare: pnpm

**Marcus, fyll i detta:**

<!-- TODO: Marcus, fyll i detta -->

- `DATABASE_URL` och hur den är konfigurerad (eller var den dokumenteras)
- Sökväg till Obsidian vault
- Vilka Ollama-modeller är installerade och vilken används för embeddings?
- Vilka MCP-verktyg är aktiva i Claude Desktop just nu?

---

## 7. Hur Marcus vill att systemet minns

Alla AI-agenter som jobbar med Neuron HQ ska läsa dessa filer vid sessionsstart, i den här ordningen:

1. **`docs/dagbocker/DAGBOK-LLM.md`** — det levande minnet. Vad som hänt, vad som gäller nu.
2. **`docs/RAPPORT-KODANALYS-2026-03-26.md`** — vad som finns i kodbasen idag.
3. **`AGENTS.md`** — engineering-protokollet. Hur du förväntas arbeta.
4. **`MARCUS.md`** (den här filen) — vem Marcus är och hur du kommunicerar med honom.

Historik från sessioner S1–S150 finns i `docs/DAGBOK.md` och `docs/handoffs/`.

---

_Denna fil underhålls av Marcus och AI-agenter gemensamt.
Uppdatera när ny relevant information framkommer.
Senast granskad: 2026-03-26_
