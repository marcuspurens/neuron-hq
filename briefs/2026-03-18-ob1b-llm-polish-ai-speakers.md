# OB-1b: LLM-korrekturläsning & AI-gissning av talare

## Förutsättning

OB-1a måste vara klar — segmentdata sparas och tidslinjen fungerar.

## Mål

### Del A: LLM-korrekturläsning av transkript

Whisper producerar ofta stavfel, felaktiga namn och hackig text. En LLM korrekturläser mening för mening med kontext.

**Pipeline:**
1. Ta rå whisper-segment (med tidsstämplar) från transkript-nodens `rawSegments`
2. Gruppera i batchar om 5-10 meningar (minskar API-anrop)
3. För varje batch: skicka [kontext: videotitel, kanal] + [föregående mening] + [batch] + [nästa mening] till LLM
4. LLM returnerar korrigerade versioner
5. Spara korrigerad text som `correctedText` på transkript-noden (rå text bevaras som `rawText`)

**Vad LLM:en fixar:**
- Stavning av namn (t.ex. "dario amodai" → "Dario Amodei")
- Tekniska termer (t.ex. "claude code" → "Claude Code")
- Meningsstruktur och skiljetecken
- Repetitioner och filler words ("you know, you know" → "you know")
- Kontext-baserade gissningar (videotitel + kanal ger ledtrådar)

**Modellval:**
- Default: lokal modell via Ollama (gratis, snabbt)
- Flagga `--polish-model claude` för högre kvalitet (kostnad)
- Flagga `--no-polish` för att skippa steget helt

**Ny fil:** `src/aurora/transcript-polish.ts`
**Nytt CLI-kommando:** `npx tsx src/cli.ts aurora:polish <nodeId>`

### Del B: AI-gissning av talare

Vid export (eller som separat kommando), använd LLM för att gissa vilka talarna är baserat på:
- Videotitel (t.ex. "Anthropic CEO Explains" → en talare är troligen Dario Amodei)
- Kanalnamn (om tillgängligt via yt-dlp metadata)
- Innehållet i transkriptet (t.ex. "we at Anthropic" → sannolikt Anthropic-anställd)
- Talarmönster (intervjuare ställer frågor, gäst svarar)

**Output:** Föreslå namn + konfidenspoäng i frontmatter:
```yaml
speakers:
  SPEAKER_00:
    name: "Dario Amodei"
    confidence: 80
    role: "Gäst / CEO Anthropic"
    reason: "Videotitel nämner 'Anthropic CEO', talaren refererar till 'we at Anthropic'"
  SPEAKER_01:
    name: ""
    confidence: 0
    role: "Intervjuare"
    reason: "Ställer frågor, nämns ej vid namn"
```

**Nytt CLI-kommando:** `npx tsx src/cli.ts aurora:identify-speakers <nodeId>`

### Del C: Integrera i ingest-pipeline

Lägg till polish + speaker-gissning som valfria steg i `aurora:ingest-video`:
- `--polish` (default: true om Ollama är igång)
- `--identify-speakers` (default: true om Ollama är igång)
- `--no-polish` och `--no-identify-speakers` för att skippa

## Tester

- LLM-korrektur fixar kända stavfel i testdata
- Batch-gruppering (5-10 meningar per batch)
- Kontext skickas med (videotitel, föregående/nästa)
- rawText bevaras oförändrad
- correctedText sparas korrekt
- AI-gissning producerar namn + konfidenspoäng
- Fallback om Ollama/LLM inte är tillgänglig (skippa steget)

## Nya filer

- `src/aurora/transcript-polish.ts`
- `src/aurora/speaker-guesser.ts`

## Agentinställningar

- Manager: max 120 iterationer
- Implementer: max 50 iterationer
- Reviewer: max 20 iterationer
