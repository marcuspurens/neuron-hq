# Brief — Brief Agent som riktig chatt

**Datum:** 2026-02-24
**Target:** neuron-hq
**Estimerad risk:** MEDIUM
**Estimerad storlek:** 100–150 rader ändrad kod

---

## Bakgrund

Brief Agent (byggd i körning #29) är idag ett formulär — den ställer frågor rad för rad
och skickar allt till Claude i slutet. Användaren kan inte ställa frågor mitt i flödet,
t.ex. "Vad tycker du om acceptanskriterier?" — agenten svarar inte, den väntar bara på nästa rad.

Det är ett fundamentalt designproblem. Brief Agent ska vara en samarbetspartner, inte ett formulär.

---

## Mål

Bygg om Brief Agent till en **riktig chattloop** där varje användarinput processas av Claude
i realtid och Claude kan svara, ställa följdfrågor, föreslå saker — precis som en kollega.

Flödet:
1. Claude hälsar och frågar om målet
2. Användaren svarar — eller frågar något ("vad tycker du?")
3. Claude svarar direkt med streaming output
4. Konversationen fortsätter tills Claude bedömer att brifen är komplett
5. Claude genererar och sparar brief-filen, visar sökvägen

---

## Acceptanskriterier

1. `npx tsx src/cli.ts brief neuron-hq` startar en chattloop där Claude svarar på varje input
2. Om användaren skriver "Vad tycker du om acceptanskriterier?" svarar Claude med konkreta förslag
3. Claude streamer sina svar i realtid (inte en lång paus följt av all text)
4. Claude läser faktisk filstruktur (`ls src/core/`, `ls src/core/agents/`) innan den nämner filer
5. Claude genererar och sparar brief till `briefs/<YYYY-MM-DD>-<slug>.md` när konversationen är klar
6. Claude skriver ut sökvägen till den sparade filen: `✅ Brief created: briefs/...`
7. `npm test` → alla tester passerar (≥313)
8. `npx tsc --noEmit` → 0 errors

---

## Berörda filer

**Ändrade filer:**
- `src/core/agents/brief-agent.ts` — ersätt formulär-logiken med en chattloop (Anthropic SDK streaming)
- `prompts/brief-agent.md` — uppdatera prompt för konversationsformat

**Oförändrade filer:**
- `src/cli.ts` — kommandot `brief <target>` behålls som det är
- Alla testfiler — befintliga tester ska fortsätta passa

---

## Tekniska krav

### Chattloop
```typescript
// Huvudflöde i brief-agent.ts
const messages: MessageParam[] = [systemPrompt];

while (true) {
  const userInput = await readline(); // läs en rad från terminalen
  messages.push({ role: 'user', content: userInput });

  const response = await streamMessage(messages); // Anthropic SDK streaming
  process.stdout.write(response); // skriv ut Claude's svar i realtid

  messages.push({ role: 'assistant', content: response });

  if (briefIsComplete(response)) {
    saveBrief(response);
    break;
  }
}
```

### Brief-komplett-signal
Claude signalerar att brifen är klar genom att inkludera `✅ Brief created:` i sitt svar
när den sparar filen — samma som idag.

### System prompt
Brief Agent-prompten (`prompts/brief-agent.md`) instruerar Claude att:
- Leda konversationen mot en komplett brief
- Svara på användarens frågor när de uppstår
- Alltid köra `ls` innan den nämner filnamn
- Spara filen och avsluta när alla brief-komponenter är täckta

### Inga nya dependencies
Använd befintlig Anthropic SDK + Node.js readline — inga nya paket.

---

## Commit-meddelande

```
feat: redesign BriefAgent as interactive chat loop with streaming responses
```
