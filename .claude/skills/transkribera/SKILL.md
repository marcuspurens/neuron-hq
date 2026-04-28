---
name: transkribera
description: Tvåstegs-transkriberingspipeline som ger markant bättre kvalitet genom att först skapa ett snabbt utkast, extrahera egennamn och facktermer med LLM, och sedan köra en slutgiltig transkribering där Whisper vet hur termerna stavas.
---

# Transkribera med tvåstegs-pipeline

## När ska denna skill användas?

- När användaren vill transkribera en video eller ljudfil med hög kvalitet
- När innehållet har domänspecifika termer, egennamn eller förkortningar som Whisper troligen stavar fel
- När användaren ber om "bästa möjliga transkribering" utan att själv ange `initial_prompt`
- När det handlar om intervjuer, föreläsningar eller tekniska samtal med okända namn

**Använd INTE denna skill när:**
- Användaren uttryckligen ber om snabb/enkel transkribering (kör då `transcribe_audio` direkt)
- Användaren redan anger `initial_prompt` med korrekta termer (då räcker ett enda transkriberings-steg)
- Filen är mycket kort (< 1 minut) — overhead av tvåstegsprocessen lönar sig inte

## Bakgrund

Whisper stavas namn och facktermer efter ljudet — "Marcus Purens" blir "Marcus Perens", "SecOC" blir "seco", "etcd" blir "et cetera". Parametern `initial_prompt` löser detta genom att ge Whisper en lista med korrekta stavningar som bias i decodern.

Problemet: användaren vet sällan alla termer i förväg. Tvåstegspipelinen löser detta automatiskt:

1. **Snabbt utkast** — Whisper gör sitt bästa utan hjälp (int8, beam=1)
2. **Entitetsextraktion** — en lokal LLM (Gemma 4 via Ollama) plockar ut alla egennamn och facktermer ur utkastet
3. **Slutgiltig transkribering** — Whisper kör igen med entiteterna som `initial_prompt`, nu med full kvalitet (float32, beam=5)

## Steg

### 1. Förbered ljudfil

Om användaren anger en URL (YouTube, podcast, etc.): använd `extract_video` för att ladda ner ljudspåret.

```
extract_video(url="https://...")
→ result.metadata.audio_path
```

Om användaren anger en lokal fil: använd sökvägen direkt.

**Valfritt — brusig ljudkälla:** Om användaren nämner att ljudet är brusigt, eller om det är en inspelning med bakgrundsljud, kör `denoise_audio` först:
```
denoise_audio(audio_path="...")
→ result.metadata.output_path
```
Använd den rensade filen i efterföljande steg.

### 2. Snabb utkast-transkribering

Kör `transcribe_audio` med snabbinställningar för att generera ett utkast:

```
transcribe_audio(
  audio_path="...",
  compute_type="int8",
  beam_size=1,
  language="sv"        ← sätt om språket är känt, annars utelämna
)
→ draft = result.text
```

Informera användaren: *"Skapar snabbt utkast för att identifiera namn och termer..."*

### 3. Extrahera entiteter

Skicka utkastet till `extract_entities` som kör en lokal LLM för att plocka ut egennamn, organisationer, tekniska termer och förkortningar:

```
extract_entities(text=draft)
→ entities = result.text    (färdig initial_prompt-sträng, ≤224 tecken)
→ result.metadata.entities  (fullständig lista för visning)
```

**Viktigt:**
- Använd `result.text` — den är redan formaterad och trunkerad till 224 tecken (Whispers gräns för decoder-prefix). Trunkera INTE själv.
- Kontrollera `result.ok === true` innan du fortsätter. Vid fel (t.ex. Ollama otillgänglig), informera användaren och hoppa till steg 4 utan `initial_prompt`.
- Timeout: detta steg tar typiskt 30–90 sekunder. Vid väldigt långa transkript (60+ minuter) kan det ta upp till 2 minuter.

### 4. Användarkontroll (valfritt men rekommenderat)

Presentera de extraherade entiteterna för användaren:

> **Hittade följande termer i utkastet:**
> Marcus Purens, SecOC, AUTOSAR, ImobMgr, CAN bus, UNECE, ...
>
> Vill du lägga till, ta bort eller korrigera några termer innan slutgiltig transkribering?

Om användaren korrigerar:
- Bygg en ny kommaseparerad sträng av bekräftade + korrigerade termer
- Se till att strängen inte överstiger 224 tecken — prioritera de viktigaste termerna först
- Använd den korrigerade strängen som `initial_prompt` i nästa steg

Om användaren säger att det ser bra ut, eller inte vill granska: använd `result.text` direkt.

### 5. Slutgiltig transkribering med hög kvalitet

Kör `transcribe_audio` igen, nu med full kvalitet och entiteterna som `initial_prompt`:

```
transcribe_audio(
  audio_path="...",
  initial_prompt=entities_text,
  compute_type="float32",
  beam_size=5,
  language="sv"        ← samma språk som steg 2
)
→ final = result.text
→ result.metadata.segments  (tidsstämplade segment)
```

Informera användaren: *"Kör slutgiltig transkribering med korrekta stavningar..."*

### 6. Diarisering (om multi-talare)

Om användaren nämner att det finns flera talare, eller om det är en intervju/panel:

```
diarize_audio(
  audio_path="...",
  num_speakers=N      ← om användaren anger antal, annars utelämna
)
→ result.metadata.speakers  (lista med talarsegment)
```

### 7. Presentera resultat

Visa den slutgiltiga transkriberingen. Om diarisering gjordes, visa talartaggar vid segmentbyten.

Nämn skillnaden om relevant: *"Tack vare entitetsextraktionen stavades [term] korrekt istället för [felstavning från utkastet]."*

## Input

- **källa** (obligatoriskt): URL eller lokal sökväg till video-/ljudfil
- **språk** (valfritt): BCP-47-kod, t.ex. `sv`, `en`. Om `sv` anges används KBLab/kb-whisper-large automatiskt.
- **antal_talare** (valfritt): Antal talare för diarisering. Utelämna för autodetektering.
- **denoise** (valfritt): Kör brusreducering först. Standard: nej.

## Output

- Slutgiltig transkribering med korrekt stavade egennamn och facktermer
- Tidsstämplade segment (ord-nivå om `align=true`, vilket är standard)
- Talarsegment (om diarisering valdes)
- Lista med extraherade entiteter som användes som `initial_prompt`

## Kvalitetsjämförelse

| Aspekt | Enstegs (standard) | Tvåstegs (denna skill) |
|---|---|---|
| Egennamn | Fonetisk gissning | Korrekt stavning |
| Facktermer | Ofta felstavade | Igenkända via LLM |
| Tidsåtgång | 1x | ~2.3x (int8 snabbpass + LLM + float32 kvalitetspass) |
| Bäst för | Korta, generella inspelningar | Domänspecifikt innehåll, intervjuer, tekniska samtal |

## Kända begränsningar

- **Ollama måste vara igång** för entitetsextraktion (steg 3). Om Ollama är nere misslyckas steget — falla tillbaka till enstegs-transkribering utan `initial_prompt`.
- **224 teckens gräns** för `initial_prompt` — vid innehåll med väldigt många unika termer kan bara de viktigaste få plats. `extract_entities` hanterar trunkering automatiskt (klipper på kommategn).
- **Hallucinationsrisk**: `initial_prompt` biasar Whispers decoder. Termer som inte faktiskt sägs i ljudet kan "hallucinereras" in. Eftersom entiteterna extraheras ur ett riktigt utkast (inte påhittade) är risken låg, men inte noll.
- **PYANNOTE_TOKEN** krävs för diarisering (steg 6). Utan token hoppar steget över diarisering.

## Mönster

**Sequential Pipeline med valfritt användarsteg** — Fast stegordning (utkast → entiteter → kvalitets-transkribering) med ett valfritt interaktivt steg (4) där användaren kan granska och korrigera entiteter innan slutkörning.

## MCP-servrar som används

- `aurora-media` — `transcribe_audio`, `diarize_audio`, `denoise_audio`, `extract_video`, `extract_entities`
