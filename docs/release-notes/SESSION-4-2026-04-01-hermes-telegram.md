---
session: 4
datum: 2026-04-01
tags: [release-note, hermes, telegram, obsidian, plugin]
---

# Session 4 — Hermes kopplad via Telegram + Obsidian-plugin

Session 4 var den session där Aurora fick ett ansikte utåt: för första gången kunde Marcus ställa en fråga i sin telefon och få ett svar från sin egen kunskapsbas. Det krävde ett byte av kommunikationskanal, en hel del säkerhetskonfiguration, och ett nytt plugin i Obsidian.

## Vad är nytt?

- **Aurora svarar nu i Telegram.** Hermes Agent (v0.5.0) är installerad på datorn och körs som en bakgrundstjänst (via launchd, Macs inbyggda systemprocesshanterare) som startar automatiskt vid omstart. Boten heter @hermesaurora_bot. När du skriver en fråga i Telegram skickas den via LiteLLM (en intern proxy som hanterar kommunikationen med AI-modellen `claude-sonnet-4-6`) till Aurora MCP (ett protokoll som låter Hermes använda Aurora-verktyg). Aurora söker i kunskapsbasen och formulerar ett svar. Tre verktyg är tillgängliga: söka i grafen, ställa en öppen fråga, och se statusen på grafen. Marcus bekräftade att chatten fungerade live under sessionen.

- **Signal förkastades på grund av ett protokollproblem.** Signal-cli (ett kommandoradsverktyg för Signal) testades som kommunikationskanal, men QR-koden för att länka enheten accepterades inte av den nuvarande iOS-appen. Orsaken är en protokoll-inkompatibilitet: Signal har gjort ändringar i sin länkningsprocess som signal-cli ännu inte implementerat. Telegram valdes som ersättning eftersom dess API är stabilt och väldokumenterat.

- **Säkerhetshärdning.** Hermes konfigurerades med strikta regler: filrättigheter satta till 600 (bara du kan läsa/skriva), en vitlista med tillåtna användar-IDs (bara Marcus kan skicka kommandon), och beteenderegler som hindrar AI-modellen från att utföra farliga operationer. Det förhindrar att en utomstående person råkar hitta boten och börjar fråga den om saker.

- **Obsidian visar nu bara det som är läsvärt.** Tidigare exporterades alla interna "chunk"-noder till Obsidian, vilket skapade massor av fragment-filer. Nu filtreras de bort: från 51 exporterade filer ned till 16 rena dokumentfiler. Dessutom genereras taggar automatiskt när du indexerar något nytt. Systemet analyserar titeln och innehållet och lägger till taggar för domän (t.ex. "AI"), språk (t.ex. "sv"), plattform och nyckelord.

- **Obsidian-plugin för att markera och spara text.** Du kan nu markera valfri text i en Obsidian-anteckning, trycka Cmd+P och välja "Spara markerad text till Aurora". Texten sparas direkt som ett faktum i Aurora-grafen. Det gör det möjligt att bygga kunskapsbasen direkt från dina läsanteckningar utan att lämna Obsidian.

## Hur använder jag det?

**Chatta med Aurora:**

1. Öppna Telegram och sök på @hermesaurora_bot
2. Skriv en fråga, t.ex. "Vad vet jag om transformer-arkitekturer?"
3. Boten söker i Aurora och svarar med en sammanfattning

**Spara markerad text till Aurora:**

1. Öppna en anteckning i Obsidian
2. Markera den text du vill spara
3. Tryck Cmd+P och välj "Spara markerad text till Aurora"

## Vad saknas fortfarande?

- Morgonbriefing via cron är inte konfigurerad. Hermes skickar inga automatiska meddelanden ännu. Det implementeras i session 7.
- Aurora-memory-scope (möjligheten att fråga Hermes om just Auroras eget minne om sig självt) kräver en liten konfigurationsändring som inte prioriterades den här sessionen.
