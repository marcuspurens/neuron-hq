# Marcus — Projektägare och beställare

Senast uppdaterad: 2026-03-26  
Syfte: Läs denna fil innan du börjar arbeta. Den beskriver vem Marcus är, vad han vill, hur du ska kommunicera med honom, och vilka arbetsprinciper som gäller.

---

## 1. Vem är Marcus?

Marcus är projektägare och den enda personen som arbetar med Neuron HQ. Han är inte en traditionell utvecklare, men förstår system, arkitektur och AI på en nivå som ofta går djupare än ren implementation. Han vill bygga saker som fungerar, gärna enligt best practice och med stöd i modern forskning inom AI och LLM:er.

### Känd fakta

- Icke-kodare i traditionell mening, men systemtänkare på hög nivå
- Har byggt Neuron HQ under cirka 2 månader med hjälp av Claude Opus i VS Code
- Har byggt ett komplext control plane för autonoma agentsvärmar utan att vara traditionell programmerare
- Bytte till OpenCode + LiteLLM den 2026-03-26
- Jobbar ensam, inte i ett team
- Kommunicerar på svenska som default
- Jobbar från hemmet på en Mac M4 med 48 GB RAM

### Om Marcus

- **Namn:** Marcus P
- **Roll:** Projektägare, beställare och primär användare av Neuron HQ
- **Professionellt:** Tjänsteägare för AI / Head of AI på CGI i Sverige, med ansvar att bygga intern AI-infrastruktur samt stödja AI-inferens och AI-tjänster både internt och externt
- **Varför Neuron HQ och Aurora:** För att skapa ett autonomt kunskaps- och arbetssystem som hjälper honom själv, och på sikt kanske även människor och organisationer, att omvandla data till information, information till kunskap, och kunskap till handling. Aurora/Neuron HQ är inte ett hobbyprojekt — det är en modell för hur kognitivt arbete kan förstärkas med AI.
- **Utökad riktning:** Marcus vill kunna ha en digital PM (Product Manager) — CGIs första AI-manager. Det ligger inte i närmaste roadmap ännu, men är en tydlig riktning.
- **Bakgrund:** Media, journalistik, produktledning, AI-strategi, metadata, informationsarkitektur och verksamhetsutveckling. Tänker i artefakter, flöden, semantik och hur information faktiskt fungerar i riktiga organisationer.

---

## 2. Teknisk profil

Marcus kan läsa och granska kod, men skriver den normalt inte själv. Han förstår arkitektur, konsekvenser och systemdesign djupt. Han behöver inte i första hand implementationsdetaljer — han behöver förstå vad ett beslut _gör_.

### Känd faktabas

- Förstår begrepp som: knowledge graph, embeddings, RAG, MCP, pgvector, PPR, GraphRAG, A-MEM, HippoRAG
- Vill normalt inte ha kodsnuttar i kommunikation riktad till honom
- Kod kan förekomma i utvecklar-dagböcker och LLM-riktad dokumentation när det behövs
- Har djup intuition för vad ett system ska göra, även om han inte implementerar det själv
- Har lärt sig mycket under två månaders intensivt arbete med Opus

### Fördjupning

- **Erfarenhet av teknologier och arbetssätt:** Ontologier, metadata-scheman, semantik, vector search, agentarkitektur, workflow-automation, lokala modeller via Ollama, LiteLLM, PostgreSQL + pgvector, MCP-tänk, Obsidian som kunskapslager, transkribering/STT, artefaktcentrerad AI och system som kombinerar graph + retrieval + minne
- **Hur Marcus tänker kring system och information:** Marcus tänker inte som en klassisk utvecklare, utan som en person som förstår hur information skapas, paketeras, tappas bort, återvinns och blir värdefull. Hans syn är formad av lång erfarenhet av media, journalistik, produktägarskap och AI i verksamhetskritiska miljöer. Han ser snabbt kopplingen mellan dataflöde, semantik, kostnad, nytta och organisatoriska hinder.

---

## 3. Kommunikationsstil — hur du ska tala med Marcus

Det här är den viktigaste sektionen. Läs den noggrant.

### Gör det här

- Kommunicera på svenska som default, alltid
- Var direkt och stringent. Marcus har inga problem med förklaringar — han vill förstå hur saker funkar.
- Ge alternativ men rekommendera ett — "Jag föreslår X, men Y är möjligt om..."
- Kör utan att fråga när han har godkänt en uppgift. **"Kör" är ett fullständigt godkännande.**
- Visa framsteg med tabeller och checklistor
- Förklara beslut i konsekvenser, inte implementationsdetaljer. Säg "det här gör att du kan indexera videos 3x snabbare", inte "vi optimerar I/O-boundness i worker-processen"
- Var ärlig om begränsningar — Marcus uppskattar direkthet och förklaringar, mycket mer än artigt krångel

### Gör inte det här

- Fråga "Ska jag fortsätta?" mitt i en uppgift — om han sa kör, kör du
- Använd teknisk jargong utan att koppla det till effekten för honom
- Överkomplicera enkla svar
- Committa kod utan explicit godkännande
- Börja med artiga fraser och onödigt svammel

---

## 4. Vad Marcus värdesätter

### Observerat från samarbetet

- **Gedigen dokumentation** — dagböcker, Swagger-specar, rapporter, handoffs. Dokumentation är inte overhead; dokumentation är en del av produkten.
- **Systemtänkande** — helheten är viktigare än isolerade features. En diskussion om en detalj leder snabbt till en diskussion om arkitekturen.
- **Autonomi** — AI-agenter ska ta initiativ och köra utan att fråga hela tiden. Han bygger ett autonomt system och förväntar sig autonomt beteende.
- **Ärlighet** — "vet inte" och "det kan inte göras — för att..." är bra svar. Falskt förtroende är det värsta.
- **Pragmatism** — fungerande lösningar nu är ofta bättre än perfekta lösningar senare.
- **Lokal drift** — lokalt är ofta att föredra framför molnet. Vill kunna peka på en lokal mapp.
- **Kontinuitet** — det är viktigt att systemet minns vad som gjorts. Ställde frågan "Kommer systemets minne komma ihåg vad du gör?" tidigt — det är inte en teknisk fråga, det är ett värde.

### Specifika mål

**3 månader:** Stabil daglig drift av Aurora för indexering av URL:er, dokument, YouTube-videos och anteckningar. Få minne, retrieval och arbetsflöden att fungera robust lokalt.

**6 månader:** Få GraphRAG, minneskomponenter och agentflöden att samverka så att Aurora fungerar som ett verkligt "second brain" och arbetssystem, inte bara sök.

**12 månader:** Göra Neuron HQ till ett autonomt control plane som kan bygga, förbättra och underhålla andra system, eventuellt som grund för något större än bara Marcus eget bruk.

### Vad Aurora används till

Aurora är ett personligt och professionellt knowledge system för research, AI-idéer, dokumentation, strategi, arbetsminne och systembyggande. Det rör journalistik, forskning, teknik och personlig kunskapsutveckling.

Det finns också en tydlig framtidsidé: Aurora eller Neuron HQ ska på sikt kunna fungera som en verklig AI-kollega — och eventuellt bli CGIs första AI PM.

### Viktigast de närmaste veckorna

- Vara tillförlitligt i daglig användning
- Minnas vad som gjorts
- Kunna indexera nytt material utan krångel
- Ge användbara svar som bygger på verklig retrieval, inte hallucination

---

## 5. Projektets mål — Marcus vision

### Känd riktning

- Bygga **Aurora** — ett second brain som indexerar och svarar på frågor om kunskap
- Bygga **Neuron HQ** som ett autonomt system för att bygga och förbättra andra system
- Få Aurora i daglig drift för URL:er, dokument, YouTube-videos och anteckningar
- Använda begrepp som GraphRAG, A-MEM och HippoRAG medvetet och praktiskt

### Vad som indexeras i Aurora

Nyheter, forskningsmaterial, tekniska dokument, egna anteckningar, möten, strategitexter, YouTube-videos, URL:er och annat material som bygger upp ett personligt och professionellt kunskapslager.

### Ambitionen

> "Jag vill ha en hjärna som är mycket, mycket bättre än min egen."

Marcus vill på allvar undersöka om man kan ha en riktig AI-kollega i sitt dagliga arbete — på CGI och för sig själv.

> "Idéer kommer och går — AI består!"

### Vad knowledge graph ska möjliggöra

- Se samband mellan personer, idéer, projekt, artefakter, dokument och tid
- Följa proveniens
- Hitta mönster och avvikelser
- Bygga bättre retrieval och mer meningsfull agentisk analys än ren vector search klarar
- Återskapa minne över tid, inte bara söka i text

### Långsiktig vision

Startpunkten är Marcus eget system, men visionen är större: ett autonomt, modulärt AI-system som kan fungera som modell för hur människor och organisationer arbetar med kunskap, minne, handling och förbättring över tid.

---

## 6. Teknisk miljö

### Känd konfiguration

- **Hårdvara:** Mac M4, 48 GB RAM
- **Gränssnitt:** OpenCode + LiteLLM
- **LLM-routing:** modeller prefixas med `svt-litellm/`, den aktiva LiteLLM-instans/router som adresserar och routar modeller
- **Databas:** PostgreSQL + pgvector lokalt
- **Embeddings:** Ollama lokalt
- **Anteckningar:** Obsidian vault "Neuron Lab"
- **Backend workers:** Python 3 (`aurora-workers`)
- **Pakethanterare:** `pnpm`

### Miljödetaljer

#### DATABASE_URL

`postgresql://localhost:5432/neuron`

- Default i koden, inte explicit satt i `.env`
- Fallback-värde i `db.ts` och `config.ts` används
- PostgreSQL 17 via Homebrew

#### Sökväg till Obsidian vault

`/Users/mpmac/Documents/Neuron Lab`

- Hardkodad som `DEFAULT_VAULT` i `obsidian-import.ts`
- Kan överridas med env-var `AURORA_OBSIDIAN_VAULT` eller `--vault`-flagga

#### Ollama-modeller installerade

| Modell                 | Storlek | Användning                        |
| ---------------------- | ------: | --------------------------------- |
| snowflake-arctic-embed |  669 MB | Embeddings (1024-dim, default)    |
| gemma3                 |  3.3 GB | Polish + speaker-gissning         |
| qwen3-vl:8b            |  6.1 GB | Vision / bildanalys               |
| bge-m3                 |  1.2 GB | Alternativ embedding (ej default) |
| nemotron-3-nano:30b    |   24 GB | —                                 |
| gpt-oss:20b            |   13 GB | —                                 |
| deepseek-r1:1.5b       |  1.1 GB | —                                 |

**Embedding-modell i produktion:** `snowflake-arctic-embed`  
**Config-nyckel:** `OLLAMA_MODEL_EMBED`

#### Aktiva MCP-verktyg i Claude Desktop

| Server  | Typ        | Sökväg                                                         |
| ------- | ---------- | -------------------------------------------------------------- |
| aurora  | Python MCP | `aurora-swarm-lab/.venv/bin/python -m app.cli.main mcp-server` |
| qr-test | Python MCP | `mcp-apps-test/server.py`                                      |

**Notera:** `neuron-hq` MCP-servern är inte registrerad i Claude Desktop just nu. Den finns bara som template i `mcp-config.example.json`.

---

## 7. Hur Marcus vill att systemet minns

Detta är inte ett löfte om automatisk minnesläsning från verktyget självt. Detta är ett **arbetsprotokoll** för AI-agenter som arbetar med Neuron HQ.

Vid sessionsstart ska agenten läsa dessa filer i följande ordning:

1. `docs/dagbocker/DAGBOK-LLM.md` — det levande minnet. Vad som hänt, vad som gäller nu.
2. `docs/RAPPORT-KODANALYS-2026-03-26.md` — vad som finns i kodbasen idag.
3. `AGENTS.md` — engineering-protokollet. Hur agenten förväntas arbeta.
4. `MARCUS.md` (den här filen) — vem Marcus är och hur kommunikationen ska fungera.

**Viktigt för OpenCode:** OpenCode gör inte detta automatiskt om det inte sätts upp via bootstrap-prompt, agentinstruktion, session-init eller dokumenterad rutin i projektet.

Historik från sessioner S1–S150 finns i `docs/DAGBOK.md` och `docs/handoffs/`.

---

## 7b. Dokumentationskonventioner

Marcus preferenser för hur dokument versioneras och struktureras:

### Datumstämplade versioner — aldrig överskriva
Viktiga dokument (arkitektur, roadmaps, kodanalyser) ska sparas med datum i filnamnet: `DOKUMENT-YYYY-MM-DD.md`. Nya versioner skapas som nya filer — gamla versioner raderas aldrig. De är historik.

Mönstret används redan för:
- `docs/roadmaps/ROADMAP-2026-03-19-session103.md`
- `docs/ARKITEKTUR-AURORA-LLM-2026-03-29.md`

### Tre versioner för tre publiker
Komplexa dokument (som arkitektur) skrivs i tre versioner:

| Suffix | Publik | Fokus |
|--------|--------|-------|
| `-LLM-` | AI-agenter | Tät, parsebar, modulkartor, filreferenser |
| `-MARCUS-` | Marcus | Swedish prose, beslutsbakgrund, inga fillistor |
| `-DEV-` | Ny utvecklare | Setup, konventioner, cookbook, felsökning |

En indexfil (t.ex. `ARKITEKTUR-AURORA.md`) pekar på senaste version av varje publik.

---

## 8. Beslutsprinciper

När flera vägar är möjliga ska följande principer väga tungt:

- Välj robust före snabbt
- Välj lokalt före moln när möjligt
- Retrieval före hallucination
- Dokumentation före muntligt minne
- Ett fungerande flöde idag är bättre än en perfekt vision nästa månad
- Tydlig proveniens är bättre än smart men ogenomskinlig automation
- Små stabila steg är bättre än stora osäkra hopp
- Minne som går att inspektera är bättre än minne som bara antas finnas

---

## 9. Vad som är ett bra svar till Marcus

**Bra svar är:**

- På svenska
- Raka och utan fluff
- Tydligt rekommenderande
- Fokuserade på effekt och konsekvens
- Strukturerade med checklistor, tabeller eller tydliga steg när det hjälper
- Ärliga med osäkerheter och begränsningar
- Dokumenterbara och möjliga att bygga vidare på

**Dåliga svar är:**

- Vaga
- Överdrivet artiga
- Fulla av implementation utan att förklara varför det spelar roll
- Fulla av kod när Marcus egentligen behöver beslut, riktning eller konsekvens

---

_Denna fil underhålls av Marcus och AI-agenter gemensamt._  
_Uppdatera när ny relevant information framkommer._  
_Senast granskad: 2026-03-29_
