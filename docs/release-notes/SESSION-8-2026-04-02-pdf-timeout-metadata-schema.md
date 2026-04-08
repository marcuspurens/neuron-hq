---
session: 8
datum: 2026-04-02
tags: [release-note, pdf, timeout, metadata, säkerhet]
---

# Session 8 — PDF timeout-skydd + Metadata-schema

Session 8 handlade om robusthet och planering. Den hybrid PDF-pipeline som byggdes i session 7 var kraftfull men saknade en kritisk egenskap: vad händer om den fastnar? En sida med ett komplext diagram kan ta lång tid att analysera, och om processen aldrig avslutas blockeras hela systemet. Det täpper den här sessionen igen. Dessutom lades grunden för provenance-spårning.

## Vad är nytt?

- **PDF-pipelinen kan inte längre hänga i all evighet.** En PDF med komplexa tabeller eller korrupta sidor kan fånga vision-modellen i en loop. Utan skydd innebär det att hela Aurora-indexeringen fryser. Nu finns tre separata lager av timeout-skydd som backar upp varandra: (1) Varje enskild sida får max 120 sekunder för sin vision-analys. Om qwen3-vl (den lokala bildanalyserande AI-modellen) inte svarat på 2 minuter avbryts den med ett `AbortSignal.timeout`, och sidan sparas med den text som hittills extraherats. (2) Hela PDF-jobbet stoppas med ett SIGKILL-signal (ett hårt processdödande kommando som operativsystemet alltid lyder) om det pågår i mer än 30 minuter. Det täcker scenariot där timeout-signalen på sida-nivå av någon anledning inte fungerar. (3) Om systemet stängs av mitt i ett jobb och startar om, detekterar jobbkön vid nästa körning att ett jobb är "levande" men att processidentifikatorn (PID) inte längre existerar i systemet. Det jobbet markeras automatiskt som återupptagbart och körs om.

- **Hermes-konfiguration versionshanteras i git.** Hermes lagrar sina interna minnen, säkerhetsregler och konfigurationsfiler i mappen `~/.hermes/` på din Mac. Från och med nu är den mappen ett git-repo. Det betyder att varje gång något ändras (t.ex. att ett nytt säkerhetspolicy läggs till, eller att Hermes "lär sig" något nytt) skapas en versionshistorik. Känsliga filer (API-nycklar, tokens) undantas automatiskt via `.gitignore` och sparas aldrig i historiken.

- **Metadata-schema för kunskapsartefakter analyserat.** För att förbereda session 9:s provenance-lager gjordes en systematisk jämförelse av fyra erkända standarder för att beskriva digital kunskap: EBUCore (ett europeiskt radio/TV-format för mediametadata), Schema.org (det globala standardformatet som Google och andra sökmotorer använder), A-MEM (NeurIPS 2025, minnessystem för AI-agenter) och HippoRAGs kunskapsgrafmodell. Rekommendationen: Aurora ska använda Schema.org som bas, lägga till ett provenance-lager som spårar vilken agent, metod och modell som skapade varje nod, och adoptera A-MEMs attribut för minnesutveckling. Konkret plan för 5 arbetspaket skrevs inför session 9.

## Hur använder jag det?

Timeout-skyddet är automatiskt och syns inte under normal drift. Om en PDF-sida tar mer än 2 minuter ser du en notering i loggen, men Aurora fortsätter med nästa sida utan att hänga.

**Visa Hermes konfigurationshistorik:**

```bash
cd ~/.hermes && git log --oneline
```

## Vad saknas fortfarande?

- Provenance-lagret är planerat och analyserat men inte implementerat. Det levereras i sin helhet i session 9.
- Hybrid PDF-pipelinen är fortfarande inte verifierad end-to-end med en riktig komplex PDF. Det återstår.
