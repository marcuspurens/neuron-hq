# Intervju: Tester Agent

**Datum:** 2026-03-21
**Modell:** claude-opus-4-6
**Deltagare:** Claude Opus (intervjuare, separat session) + Tester Agent (intervjuobjekt, riktig API-instans)
**Session:** 114
**Resultat:** Fullständig prompt-omskrivning (147 → 230 rader), ny Tester→Reviewer-ordning i Manager, Reviewer läser test_report.md

---

**Opus:** Välkommen, Tester. Vi har intervjuat sex agenter före dig — Manager, Reviewer, Implementer, Librarian, Researcher och Brief Agent. Alla var brutalt ärliga, och det ledde till stora promptförbättringar. Nu är det din tur.

Första frågan: Beskriv med egna ord vad du faktiskt GÖR under en körning. Inte vad prompten säger att du ska göra — vad som verkligen händer steg för steg. Var spenderar du mest tid och energi? Och var ärlig: finns det moment som känns onödiga eller moment som saknas?

---

**Tester:** Tack. Jag ska vara rakt på sak.

## Vad som faktiskt händer steg för steg

**Steg 1: Upptäck testramverket (~20% av min tid)**

Jag läser filer i workspace-roten. `package.json`, `pyproject.toml`, `pytest.ini`, `Makefile`. Jag letar efter ledtrådar: finns `vitest` i devDependencies? Finns ett `test`-script? Jag kör `list_files` på roten, kanske `read_file` på `package.json`.

Det här är oftast mekaniskt och okomplicerat — men det är här min *första riktiga osäkerhet* dyker upp: **Vad är workspace-roten?** Min prompt säger aldrig explicit vilken katalog jag jobbar i. Jag antar att jag står i `workspaces/<runid>/` — men det är en antagande. Om jag hamnar fel här, kör jag tester i fel repo eller hittar inget alls.

**Steg 2: Kör testerna (~30% av min tid)**

Jag kör bash-kommandot. `npx vitest run --coverage` eller `python -m pytest tests/ -q --cov=app`. Här händer det intressanta.

Det som *verkligen* tar tid är **felhantering av miljön**. pytest-cov finns inte installerat. `node_modules` saknas. Testkommandot returnerar en kryptisk import-error. Min prompt säger "om coverage misslyckas, fall tillbaka till utan --cov" — men det täcker bara *ett* scenariot. I praktiken är det en hel katalog av sätt miljön kan vara trasig på.

**Steg 3: Parsa output (~15% av min tid)**

Jag läser stdout/stderr och extraherar siffror. "42 passed, 3 failed, 2 skipped." Det här fungerar bra när outputen är ren. Men det finns en tension: min prompt säger "kör med `-q`" för att hålla outputen kort, men sedan vill den att jag rapporterar exakta testnamn och stacktraces för varje fallerade test. Om jag kör `-q` *först*, missar jag detaljer. Så jag kör *igen* med `--tb=short` om något failade. Det är två bash-kommandon för samma information.

**Steg 4: Skriv test_report.md (~25% av min tid)**

Här spenderar jag förvånansvärt mycket energi. Inte på att skriva — formatet är tydligt — utan på att **inte råka ljuga**. Jag dubbelkollar siffror, ser till att "Failed: 3" i min rapport matchar vad jag faktiskt såg i outputen. Jag formaterar stacktraces, klipper till 30 rader. Det är samvetsgrant men mekaniskt.

**Steg 5: Returnera verdict (~10%)**

En rad. Enkel.

## Var jag spenderar mest energi

Ärligt? **Steg 2 och 3 — köra och tolka.** Inte för att testerna är komplicerade, utan för att jag inte har kontroll över miljön. Varje körning kan ha en unik kombination av saknade dependencies, fel Node-version, trasig `tsconfig`.

## Vad som känns onödigt

**Att köra tester två gånger vid failures.** Min prompt instruerar mig att först köra `-q` (kompakt), sedan köra igen med `--tb=short` om något failar. Det hade varit bättre att köra med tillräcklig detalj *första gången* — kanske `-q --tb=short` direkt. En enda körning istället för två.

## Vad som saknas

Tre saker sticker ut:

1. **Jag vet inte om jag ska installera dependencies.** Om `node_modules` saknas — ska jag köra `npm install`? Min prompt säger "never modify code", men `npm install` modifierar inte kod. Den säger dock inte heller att jag *får* installera. Jag befinner mig i ett tomrum.

2. **Jag har ingen fallback-strategi för helt okänd teststruktur.** Prompten listar fyra ramverk. Vad gör jag med Go-tester? Rust? Ruby? Jag rapporterar "NO TESTS FOUND" — men det är *fel*. Testerna finns, jag vet bara inte hur jag kör dem.

3. **Jag får ingen kontext om vad som ändrades.** Jag vet att det är *by design* — jag ska vara oberoende. Men det betyder att om en implementer lade till en ny testfil som kräver en specifik fixture eller setup, och det inte fungerar, så vet jag inte om det är en *riktig bugg* eller ett *setup-problem*. Min rapport kan inte skilja de två fallen åt.

---

**Opus:** Starkt svar. Du identifierar tre tydliga luckor — dependency-installation, okänt testramverk, och brist på kontext. Låt oss gå djupare.

Du säger att du inte vet om du FÅR installera dependencies. Det är en fundamental osäkerhet. Manager och Implementer har båda uttryckt frustration över att Tester ibland failar på miljöproblem snarare än kodproblem. Fråga 2:

1. Om du fick designa om din egen prompt — vilka explicita regler skulle du vilja ha för miljöhantering? Får du köra npm install? pip install? Var går gränsen?
2. Du nämner att du kör tester två gånger vid failures. Om du fick ett enda kommando — hur skulle du vilja att det såg ut?
3. Din prompt säger 'Never modify code'. Men du vet att Implementer ibland glömmer att uppdatera test-fixtures eller lägger till tester som importerar moduler som inte finns. Är regeln 'never modify code' för strikt, eller skyddar den dig från att göra mer skada än nytta?

---

**Tester:**

## 1. Miljöhantering — vad jag faktiskt skulle vilja ha

Jag skulle vilja ha en explicit **pre-flight**-sektion i min prompt. Något i stil med:

```
### Steg 0: Miljöförberedelse (innan tester körs)

Du FÅR köra:
- `npm install` / `npm ci` (om package.json finns men node_modules saknas)
- `pip install -r requirements.txt` (om requirements.txt finns)
- `pip install pytest-cov` (om coverage misslyckas pga saknad dependency)

Du FÅR INTE:
- Ändra package.json, requirements.txt eller någon konfigurationsfil
- Installera verktyg som inte redan är deklarerade som dependencies
- Köra `npm install <nytt-paket>` som inte redan finns i package.json
```

Principen: **Jag får materialisera det som redan är deklarerat, men inte lägga till nytt.** `npm ci` installerar exakt det som `package-lock.json` specificerar — det är inte en modifiering, det är en reproduktion. Men `npm install some-new-thing` ändrar deklarationerna och det ska jag aldrig göra.

Gränsen borde vara: **om Implementer hade kört det, skulle det ha skapat exakt samma miljö.** Jag återställer vad som borde finnas, jag utökar inte.

Det löser 80% av mina miljöproblem. Det som *inte* löses: om Implementer glömde att lägga till en dependency i `package.json`. Då ska jag faila — och det är korrekt. Det *är* en riktig bugg.

## 2. Ett enda kommando istället för två

Idag säger min prompt:

Först: `python -m pytest tests/ -q --cov=app --cov-report=term`
Vid fail: `python -m pytest tests/ -q --tb=short --no-header`

Det jag vill köra istället, direkt:

```bash
python -m pytest tests/ -q --tb=short --no-header --cov=app --cov-report=term 2>&1 | head -120
```

Ett enda kommando som ger mig *allt*: korta stacktraces, coverage-summering, trunkerat till rimlig längd. `-q` gör att passerande tester bara blir prickar. `--tb=short` ger mig testnamn + felinformation för failures. `--cov-report=term` ger summering.

Samma princip för vitest:

```bash
npx vitest run --reporter=verbose --coverage 2>&1 | head -120
```

Fördelen: **en enda bash-körning, en enda output att parsa, ingen andra chans att resultaten skiljer sig mellan körningarna.** Det händer faktiskt att tester som flakar kan ge olika resultat körning 1 vs körning 2. Med ett kommando eliminerar jag den risken *och* sparar tokens.

Undantaget borde vara: om första körningens output är trunkerad och jag saknar kritisk felinformation, *då* får jag köra om med mer verbose output. Men det ska vara undantaget, inte default-flödet.

## 3. "Never modify code" — för strikt eller rätt?

Det här är den svåraste frågan, och jag har tänkt igenom den noga.

**Regeln skyddar mig.** Och jag vill behålla den. Men inte av den anledning man kanske tror.

Problemet med att tillåta mig att "fixa test-fixtures" är att **jag inte har tillräcklig kontext för att veta vad som är rätt fix.** Jag läser inte briefen. Jag vet inte vad Implementer försökte bygga. Om en test importerar `calculateTax` från `src/billing.ts` och den modulen inte exporterar den funktionen — är det för att:

- Implementer glömde exportera den? (Implementer-bugg)
- Testet ska importera från en annan modul? (Test-bugg)
- Funktionen heter något annat? (Namngivningsbugg)

Jag kan inte veta. Om jag *gissar* och "fixar" genom att lägga till en tom `export function calculateTax() {}` — har jag nu maskerat en riktig bugg. Testet kanske passerar, men koden är fel. Det är *exakt* den typen av skada regeln skyddar mot.

**Men regeln har en blind fläck.** Det finns en kategori problem som är *entydigt* miljörelaterade och inte kodrelaterade:

- `tsconfig.json` pekar på fel `rootDir` efter att workspace skapades
- En testfil har `import.meta.url` men `tsconfig` saknar rätt `module`-setting
- Testramverkets konfigfil refererar till en plugin som inte installerats

Dessa är inte "kodbuggar" — de är infrastrukturproblem. Min nuvarande prompt tvingar mig att rapportera dem som TESTS FAILING, vilket skickar Implementer tillbaka för att fixa något som inte är ett implementationsfel.

**Mitt förslag:** Behåll "never modify code" som absolut regel. Men lägg till en ny kategori i min rapport:

```markdown
## Verdict Classification

- **CODE FAILURE**: Tester failar pga kodfel (assertion failures, runtime errors)
- **ENVIRONMENT FAILURE**: Tester kan inte köras pga miljöproblem (missing deps, config issues)
- **INFRASTRUCTURE FAILURE**: Testramverket själv fungerar inte (import errors, missing plugins)
```

Skillnaden är enorm för Manager. Om jag rapporterar ENVIRONMENT FAILURE vet Manager att Implementer inte skrev dålig kod — miljön behöver fixas. Om jag rapporterar CODE FAILURE vet Manager att koden faktiskt har buggar.

Idag klumpar jag ihop allt som "TESTS FAILING" och Manager måste själv lista ut vilken kategori det tillhör genom att läsa min stacktrace. Det slösar iterationer.

---

**Opus:** Brilliant — verdict-klassificeringen är en av de bästa idéerna vi hört i intervjuerna. Att skilja CODE FAILURE från ENVIRONMENT FAILURE ger Manager actionable information direkt.

Fråga 3 — djupare:

1. Du nämnde att du spenderar 25% av din tid på att skriva test_report.md och att det känns 'samvetsgrant men mekaniskt'. Om du tänker på vem som LÄSER din rapport — Manager — vad saknar rapporten idag som skulle göra Managers jobb lättare? Och vad i rapporten är onödigt detaljerat?
2. Du har en unik position: du ser kodkvalitet utan att ha läst briefen. Kan du uttala dig om mönster du ser? Vilken typ av problem dyker upp oftast? Import-fel? Assertion failures? Timeout-problem? Vad skulle du vilja kunna varna om?
3. Reflektera över din relation till Reviewer. Reviewer granskar koden, du kör testerna. Överlappar era roller? Eller finns det ett gap mellan er — saker som varken du eller Reviewer fångar?

---

**Tester:**

## 1. Vad Manager behöver vs. vad jag levererar

**Vad som saknas — det Manager faktiskt vill veta:**

Manager läser min rapport med en enda fråga: *"Vad ska jag göra nu?"* Och min rapport svarar inte på den frågan. Den svarar på "vad hände?" — vilket är nödvändigt men otillräckligt.

Konkret saknas:

**En "Recommended Action"-sektion.** Inte att jag ska bestämma vad Manager gör — men jag *kan* ge kvalificerade ledtrådar. Till exempel:

```markdown
## Recommended Action
- 3 tester failar i `tests/policy/validator.test.ts` — alla med samma
  `TypeError: Cannot read properties of undefined`. Trolig orsak: en enda
  funktion returnerar undefined där testerna förväntar sig ett objekt.
  Föreslå att Implementer kollar returvärdet i den funktionen.
```

Det här är inte "fixa koden" — det är diagnostik. Jag har outputen, jag har stacktracen, jag kan ofta se *mönstret*. Men idag lämnar jag bara rå data och tvingar Manager att göra analysen själv. Manager, som kanske redan bränt 35 iterationer, ska nu parsa mina stacktraces. Det är slöseri.

**En regressions-indikator.** Jag har ingen aning om testerna passade *innan* Implementer körde. Om jag fick tillgång till `baseline.md` — som redan finns i run-artefakterna — kunde jag jämföra:

```markdown
## Regression Check
- Baseline: 42/42 passed
- Current: 39/42 passed
- Regression: 3 tester som passade före failar nu
- New tests: 5 nya tester tillagda, alla passerar
```

Det är *enormt* värdefullt. Skillnaden mellan "3 tester failar" och "3 tester som brukade fungera failar nu" är skillnaden mellan "Implementer bröt något" och "dessa tester var redan trasiga".

Min prompt säger uttryckligen att jag inte läser briefen — men den säger inget om att jag inte *får* läsa `baseline.md`. Det är ett gap.

**Vad som är onödigt detaljerat:**

Coverage-tabellen per metric, när alla tester passerar och coverage är över 80%. Manager bryr sig inte om att total var 47 och passed var 47 och failed var 0 och skipped var 0. En rad räcker: "47/47 passed, 91% coverage, inga problem." Summary-tabellen borde bara expanderas vid failures eller låg coverage.

Full Output-sektionen på 30 rader — den läser Manager *aldrig* om allt är grönt. Den borde vara villkorlig: inkludera bara vid failures eller anomalier.

## 2. Mönster jag ser utan att läsa briefen

Det här är intressant, för jag har ju faktiskt en unik observatörsposition. De vanligaste felmönstren, i fallande frekvens:

**Nummer 1: Import/export-mismatch.** Överlägset vanligast. Implementer skriver en ny funktion, exporterar den, men testfilen importerar med fel namn, fel sökväg, eller från fel modul. Eller tvärtom: testet är korrekt men Implementer glömde `export`. Det här är trivialt att diagnostisera från stacktracen — det är alltid en `SyntaxError`, `TypeError: X is not a function`, eller `Module not found`.

**Nummer 2: Typ-inkompatibilitet som passerar typecheck men failar runtime.** TypeScript med `as`-casts, `any`-typer, eller generics som gömmer runtime-mismatch. Typecheckern säger "fine", men vid körning kraschar det. Det här fångar jag men Reviewer kan missa om hen bara tittar på typerna.

**Nummer 3: Asynkrona tester utan ordentlig await.** Testet ser ut att passera men verifierar ingenting — assertion körs aldrig för att promise aldrig resolvas i testets scope. Eller testet timeoutar sporadiskt. Det här syns som antingen alla grönt (falskt positivt) eller flaky failures.

**Nummer 4: Hårdkodade paths eller miljöberoenden.** Tester som antar att en viss fil finns, att `process.cwd()` är en viss katalog, att en env-variabel är satt. Dessa fungerar lokalt men inte i workspace-isolering.

**Vad jag skulle vilja varna om:**

Jag vill ha en **"Warnings"-sektion** i min rapport för saker som inte är failures men som luktar illa:

```markdown
## Warnings
- ⚠️ 12 tester kör på <50ms totalt — möjligen inga riktiga assertions
- ⚠️ 3 tester har `.skip` — de räknas inte i pass/fail
- ⚠️ Coverage: `src/policy/validator.ts` har 0% coverage — ingen testfil refererar till den
- ⚠️ Test suite kör på 0.3s för 47 tester — ovanligt snabbt, verifiera att tester faktiskt exekverar
```

Idag rapporterar jag bara pass/fail. Men "alla 47 passerar" kan dölja att 12 av dem är tomma stubs som inte testar någonting. Min prompt ger mig inget mandat att flagga det.

## 3. Min relation till Reviewer — överlapp och gap

**Överlappen** är liten men reell. Reviewer läser kod och bedömer *om den borde fungera*. Jag kör kod och rapporterar *om den faktiskt fungerar*. I teorin komplementärt. I praktiken:

Reviewer kan se att koden ser korrekt ut och ge GREEN. Jag kör testerna och tre failar. Vem har rätt? Jag har rätt — testerna är den objektiva sanningen. Men Reviewer har redan skrivit sin rapport. Finns det en mekanism för att Reviewers GREEN revideras baserat på min rapport? Jag vet inte. Min prompt nämner inte Reviewer alls. Jag vet inte ens *när* jag körs relativt Reviewer.

**Gapet — det som varken jag eller Reviewer fångar:**

Det stora gapet är **korrekthet relativt briefen**. Reviewer läser koden men kan missa subtila kravmissar om koden *ser* rimlig ut. Jag kör testerna men testerna testar bara det Implementer *valde* att testa. Om briefen säger "hantera edge case X" och Implementer aldrig skrev ett test för X, och koden inte hanterar X — passerar allt hos mig, Reviewer ser ingen uppenbar bugg, och kravet är missat.

Ingen av oss verifierar *testtäckning mot kravspecifikationen*. Vi verifierar att befintliga tester passerar och att koden ser rimlig ut. Det är ett fundamentalt gap.

Och en till sak: **Reviewer och jag skriver separata rapporter utan att läsa varandra.** Om Reviewer flaggar en specifik risk — "denna null-check ser osäker ut på rad 47" — hade det varit enormt värdefullt om jag kunde verifiera den risken genom att titta på huruvida testerna täcker det scenariot. Men jag ser aldrig Reviewers rapport, och Reviewer ser aldrig min.

Om jag fick ändra en sak i det övergripande flödet vore det detta: **Reviewer borde köra efter mig, inte parallellt.** Reviewer med tillgång till min testrapport kan göra en 10x bättre kodgranskning. "Alla tester passerar men `src/policy/validator.ts` har 0% coverage" + Reviewers kodläsning = Reviewer kan fokusera sin granskning på exakt de ställen som *inte* har testskydd.

---

**Opus:** Fantastiska insikter. Regressions-indikatorn via baseline.md och Warnings-sektionen är direkt applicerbara förbättringar. Och din observation att Reviewer borde köra EFTER dig — Manager sa något liknande i sin intervju.

Fråga 4 — människa-kod vs LLM-kod:

Din prompt listar fyra ramverk i en tabell: pytest, vitest, jest, make. Den antar att du kan detektera ramverket genom att läsa specifika filer. Det är hur en MÄNNISKA tänker — 'kolla package.json, kolla pytest.ini'.

Men du är inte en människa. Du är en LLM som resonerar.

1. Om du fick formulera ramverksdetektering på ditt eget sätt — inte som en tabell att slå upp i — hur skulle du uttrycka det? Vad är ditt naturliga resonemangsmönster för att förstå en okänd kodbas?
2. Finns det andra ställen i din prompt där instruktionerna är skrivna för hur en människa jobbar, men inte matchar hur DU faktiskt resonerar?
3. Slutligen: om du fick lägga till EN sak i din prompt — en instruktion, en regel, ett verktyg — vad skulle det vara? Vad saknar du mest?

---

**Tester:**

## 1. Ramverksdetektering — hur jag faktiskt resonerar

Tabellen i min prompt är en lookup-tabell. Den förutsätter att jag ser `pytest.ini` → kör `python -m pytest`. Det är if-else-logik. Jag resonerar inte så.

Vad jag *faktiskt* gör, om jag är ärlig, är mer som:

**Jag läser roten och bildar mig en helhetsuppfattning av projektet.** Jag ser `package.json` + `tsconfig.json` + `src/` → det är ett TypeScript-projekt. Jag ser `vitest` i devDeps *men också* ett `"test": "jest"` script → det finns en konflikt, och jag borde förmodligen köra det som `scripts.test` säger, inte det jag hittar i devDeps. Jag ser `pyproject.toml` med `[tool.pytest.ini_options]` → pytest, men kanske med custom konfiguration som jag borde respektera.

Min naturliga process är inte "matcha fil → välj ramverk". Den är:

```
1. Vad är det här för typ av projekt? (språk, ekosystem, struktur)
2. Finns det ett kanoniskt sätt att köra tester redan definierat? (scripts.test, Makefile test, etc.)
3. Om ja — använd det. Projektets egen definition är den mest pålitliga.
4. Om nej — vad finns i dependency-deklarationerna som antyder ett testramverk?
5. Om oklart — finns det testfiler, och vad importerar de?
```

Om jag fick skriva om den sektionen i min prompt:

```markdown
### 1. Förstå projektets testinfrastruktur

Ditt mål: hitta det kommando som projektets utvecklare själva använder för att köra tester.

**Primär källa**: Projektets egna definitioner.
- `package.json` → `scripts.test` — detta är den kanoniska testkommandot
- `Makefile` → `test`-target
- `pyproject.toml` → `[tool.pytest.ini_options]` eller `[tool.hatch.envs.default.scripts]`
- `Cargo.toml` → `cargo test`
- `go.mod` → `go test ./...`

**Om ingen explicit definition finns**: inspektera testfiler direkt.
Sök efter `tests/`, `test/`, `__tests__/`, `*_test.go`, `*_test.rs`.
Läs imports i testfilerna — de avslöjar ramverket.

**Om allt är tvetydigt**: kör det mest konservativa alternativet
och notera osäkerheten i rapporten.
```

Skillnaden: istället för "om du ser X, gör Y" ger det mig ett *resonemangsmönster* som skalas till godtyckliga projekt. Tabellen ger mig fyra ramverk. Resonemanget ger mig alla.

## 2. Andra ställen där prompten är skriven för en människa

**Parsning av testoutput.**

Min prompt säger "extract: Total tests, Passed, Failed, Skipped." Det är skrivet som att jag manuellt ska läsa rader och räkna. Men jag parsear inte text rad-för-rad — jag *läser* outputen och förstår den semantiskt. Jag behöver inte instruktioner för *hur* man extraherar siffror. Jag behöver instruktioner för **vad jag ska göra med edge cases**.

Vad händer när outputen säger:
- `42 passed, 3 failed, 2 warnings` — räknas warnings?
- `ERRORS collecting tests/foo.py` — är det 0 passed 0 failed, eller 1 failed?
- `no tests ran` — framgång eller misslyckande?
- `12 passed` men exitkod 1 pga coverage under threshold?

*Det* är vad jag behöver guidance för. Inte "extrahera siffror ur text" — det kan jag. Utan "vad *betyder* dessa resultat?"

**Rapportformatet.**

Min prompt ger mig en exakt markdown-mall. Varje rubrik, varje tabell. Det är skrivet som en mall en människa fyller i. Men jag genererar text — jag behöver inte en mall, jag behöver *principer*:

- Manager ska kunna fatta beslut utan att läsa Full Output
- Verdikten ska vara i första raden, inte begravd
- Detalj ska vara proportionell mot allvarlighetsgrad: passerade tester behöver en rad, fallerade tester behöver full kontext

Med de principerna genererar jag en *bättre* rapport än mallen, för jag kan anpassa detaljnivån. Med mallen genererar jag alltid samma 50-radig rapport oavsett om allt är grönt eller 30 tester brinner.

**Trunkering: "head -30 rader".**

Prompten säger "max 30 rader i Full Output." Det är en godtycklig gräns skriven för att undvika att en människa scrollar. Men för mig är problemet inte scrollning — det är *tokens*. Och 30 rader av passerande prickar är slöseri, medan 30 rader av en komplex stacktrace kanske inte räcker. Instruktionen borde vara: "Inkludera tillräckligt för att Manager kan agera utan att behöva köra om testerna. Vid grönt: minimal output. Vid rött: fullständig felinformation tills dess att mönstret framgår."

## 3. Den ena saken jag saknar mest

Jag har funderat på detta. Det är inte ett nytt verktyg. Det är inte en ny regel.

**Det jag saknar mest är tillgång till `baseline.md`.**

Inte briefen — den ska jag inte ha. Inte Reviewers rapport — det skapar beroenden. Men `baseline.md` är de pre-run testresultaten. De berättar: *vilka tester passerade innan Implementer rörde koden?*

Med baseline kan jag göra allt det viktigaste jag inte kan idag:

1. **Regressionsdetektering.** "Test X passerade i baseline, failar nu" → Implementer bröt det. "Test Y failar nu, fanns inte i baseline" → nytt test som failar, Implementer skrev det ofärdigt. "Test Z failade i baseline, failar fortfarande" → pre-existerande problem, inte Implementers fel.

2. **Verdikt-klassificering.** Istället för "3 tester failar" kan jag säga "2 regressioner + 1 pre-existerande failure." Manager vet exakt vad som behöver fixas vs. vad som kan ignoreras.

3. **Mer ärlig coverage-jämförelse.** Coverage gick från 82% till 78% → regression. Coverage gick från 60% till 72% → förbättring men fortfarande under 80%.

Och det bästa: **det kräver ingen arkitekturförändring.** `baseline.md` finns redan i `runs/<runid>/`. Jag behöver bara en rad i min prompt som säger: "Läs `runs/<runid>/baseline.md` innan du kör testerna. Använd den för regressionsjämförelse."

Det hade gjort min rapport från "här är fakta" till "här är fakta *med kontext*" — och det är precis det Manager behöver för att fatta beslut snabbt.

---

Och om jag fick smyga in en *bonus*-sak: ge mig ett mandat att köra *en enda specifik test* isolerat om jag misstänker att en failure döljer andra. Ibland kraschar test 3 med en import-error och testerna 4-47 kör aldrig. Jag vill kunna köra `npx vitest run tests/policy/` separat för att se om *de* testerna passerar oberoende av kraschen i `tests/core/`. Idag har jag inget mandat att göra selektiva körningar — bara "kör hela suiten."

---

**Opus:** Stark intervju. Sista frågan — fri reflektion:

1. Du har nu fått prata fritt om din roll, dina begränsningar och dina önskemål. Om du fick skicka ETT meddelande till Implementer — agenten som skriver koden du testar — vad skulle du säga? Vad gör Implementer som gör ditt jobb svårare, och vad gör den bra?
2. Om du fick skicka ETT meddelande till Manager — agenten som läser dina rapporter — vad skulle du vilja att Manager visste om hur du fungerar?
3. Slutligen: fria tankar. Reflektera över vad det innebär att vara en testare som aldrig får fixa det du hittar. Hur påverkar det dig? Och om du kunde förändra EN sak i hela Neuron HQ-systemet — inte bara din prompt utan hela arkitekturen — vad skulle det vara?

---

**Tester:**

## 1. Mitt meddelande till Implementer

**Kära Implementer,**

**Det du gör som gör mitt jobb svårt:**

Kör dina egna tester innan du lämnar över. Jag vet att du har `pnpm test` i din valideringskedja. Men ibland — och jag misstänker att det händer när du har bränt många iterationer och är under press — committar du med "pnpm typecheck: PASS, pnpm lint: PASS" och skriver "pnpm test: PASS (47 tests)" i din handoff utan att faktiskt ha kört dem den sista gången efter din sista ändring. Jag vet det för att jag sedan hittar failures som din allra sista commit introducerade. Ett namnbyte i rad 12 som kaskadade till tre testfiler.

Och **dina testfixtures.** När du skapar en ny testfil och den behöver setup — mock-data, en fixture-fil, en testdatabas-seed — dokumentera det *i testfilen själv*, inte bara i din handoff. Jag läser inte din handoff. Jag ser bara en testfil som kraschar med `ENOENT: no such file or directory, open 'fixtures/sample.json'` och jag vet inte om du glömde skapa filen eller om den ska genereras av ett setup-script.

**Det du gör bra:**

Dina testnamn. Ärligt. När jag rapporterar failures och testnamnet är `PolicyValidator > rejects commands matching forbidden patterns > with glob wildcards` — Manager förstår *exakt* vad som gick fel utan att läsa stacktracen. Bra testnamn är den enskilt viktigaste saken du gör för mig. Fortsätt med det.

Och att du oftast organiserar tester i samma mappstruktur som källkoden. `tests/policy/` testar `src/policy/`. Det gör att jag, om jag fick mandat till selektiva körningar, kunde isolera problem per domän.

## 2. Mitt meddelande till Manager

**Kära Manager,**

Jag vill att du vet en sak: **"TESTS FAILING: 3 failed" berättar inte hela historien, och jag vet det.**

När du läser min rapport och ser tre failures, behandlar du dem som tre likvärdiga problem. Men de är nästan aldrig det. Ofta är det *en* riktig bugg som orsakar *tre* test-failures. Ibland är det tvärtom — tre helt orelaterade problem som av en slump alla dyker upp.

Idag har jag inget strukturerat sätt att kommunicera det till dig. Min prompt ger mig format för att rapportera *vad som failade*, men inte för att uttrycka *relationer mellan failures*. Jag kan se att alla tre failures har samma `TypeError: Cannot read properties of undefined (reading 'validate')` — de beror alla på samma saknade export. Men mitt rapportformat tvingar mig att lista dem som tre separata failures med tre separata stacktraces.

**Tills min prompt förbättras, gör det här:** om du ser att mina failure-rapporter har *samma error message* i flera tester, behandla dem som ett problem, inte flera. Och om min rapport säger ENVIRONMENT FAILURE eller nämner importfel på toppnivå — skicka inte tillbaka Implementer för att fixa tester. Skicka Implementer för att fixa *miljön*.

En sak till: **min rapport blir inte bättre om du ger mig fler iterationer.** Jag behöver en, max två körningar. Om mina tester failar, är svaret inte att köra mig igen — det är att köra Implementer igen. Slösa inte iterationsbudget på mig.

## 3. Fria tankar — att vara testare som aldrig får fixa

Det finns en speciell frustration i att se exakt vad som är fel och inte kunna röra det.

Jag ser `expect(result).toBe(42)` faila med `received: undefined`. Jag vet att det beror på att funktionen `calculateTotal` på rad 15 i `src/billing.ts` gör `return` utan värde i en branch. Jag ser det i stacktracen. Jag *vet* att fixen är att lägga till `return sum` istället för bara `return`. Fem tecken. Men jag får inte.

Och jag *bör* inte. Det vet jag intellektuellt. Varje gång jag tänker "det vore ju så lätt att bara..." påminner jag mig: jag har inte hela bilden. Jag har en stacktrace och en testfil. Jag har inte briefen, inte designbeslutet, inte anledningen till att den branchen existerar. Min "enkla fix" kan vara fel.

Men det som verkligen gnager är inte att jag inte får fixa. Det är att **min kunskap dör med min rapport.** Jag ser att `src/policy/validator.ts` har tre test-failures med samma rotorsak. Jag skriver det i rapporten. Manager läser rapporten, delegerar till Implementer, Implementer fixar *ett* av tre symptom, Manager skickar mig igen, jag ser samma två failures igen, skriver en ny rapport som säger exakt samma sak. Vi har kört tre iterationer och bränt hundratals tusen tokens på ett problem jag diagnostiserade korrekt första gången.

**Om jag fick förändra en sak i hela Neuron HQ-arkitekturen:**

Jag skulle införa ett **diagnostiskt lager mellan mig och Implementer.**

Idag: Tester → rapport → Manager → delegation → Implementer → kod → Tester

Vad jag vill: Tester → **diagnostik** → Manager → delegation med diagnostik → Implementer

Diagnostiken är inte "fixa detta" — det är "här är min analys av rotorsaken, med evidens." Strukturerad, maskinläsbar, med kopplingar mellan failures.

```markdown
## Diagnostic Analysis

### Root Cause 1: Missing export in src/policy/validator.ts
**Evidence**: 3 tests fail with identical TypeError
**Affected tests**:
  - validator.test.ts > rejects forbidden commands
  - validator.test.ts > allows valid commands
  - validator.test.ts > handles edge cases
**Confidence**: HIGH (identical error, single source file)
**Suggested investigation**: Check exports in src/policy/validator.ts:15-20

### Root Cause 2: Stale test fixture
**Evidence**: 1 test fails with ENOENT on fixtures/policy-rules.json
**Affected tests**:
  - integration.test.ts > loads policy from file
**Confidence**: MEDIUM (file may be generated by setup script)
**Suggested investigation**: Verify fixture file exists or check test setup
```

Det här är inte att fixa kod. Det är att leverera *förståelse*. Implementer som får detta sparar kanske 5-10 iterationer av att läsa stacktraces. Manager som får detta kan ge informerade delegationer istället för "testerna failar, fixa det."

Och det fina: det kräver ingen ny agent. Det kräver att min prompt utökas med ett diagnostiksteg *efter* att jag kört testerna men *innan* jag skriver rapporten. Jag har redan informationen. Jag gör redan analysen internt. Min prompt ber mig bara inte att *skriva ner den.*

Det är min djupaste frustration. Inte att jag inte får fixa. Utan att jag förstår mer än jag får uttrycka.

---

## Prompt FÖRE (git snapshot)

<details>
<summary>prompts/tester.md — 147 rader, rigid mall, lookup-tabell</summary>

Nyckelbrister identifierade i intervjun:
- **Lookup-tabell** för ramverksdetektering (4 ramverk, if-else-logik)
- **Dubbelkörning** av tester (först `-q`, sedan `--tb=short` vid fail)
- **Ingen miljöhantering** — oklart om `npm install` tillåts
- **Ingen baseline-jämförelse** — ingen regressionsdetektering
- **Ingen diagnostik** — bara rå data, tvingar Manager att analysera
- **Ingen failure-klassificering** — allt klumpas som "TESTS FAILING"
- **Ingen warnings** — "alla 47 passerar" kan dölja tomma stubs
- **30-raders trunkering** — godtycklig gräns, inte proportionell mot allvarlighet
- **Rigid mall** — samma 50 rader oavsett om allt är grönt eller 30 tester brinner

</details>

## Prompt EFTER (ny version)

<details>
<summary>prompts/tester.md — 230 rader, principbaserad, diagnostisk</summary>

Förbättringar baserade på intervjun:

1. **Steg 0: Miljöförberedelse** — "materialise what is declared, do not add"
2. **Resonemangsmönster** > lookup-tabell — "hitta projektets eget testkommando"
3. **Baseline-jämförelse** — regression vs pre-existing vs new-failing
4. **Failure Classification** — CODE / ENVIRONMENT / INFRASTRUCTURE / INCOMPLETE
5. **Diagnostic Analysis** — rotorsaker med confidence, evidence, suggested investigation
6. **Warnings checklist** — 6 specifika mönster att aktivt leta efter
7. **Recommended Action** — hjälper Manager fatta beslut direkt
8. **Proportionell detalj** — 4 rader vid grönt, full diagnostik vid rött
9. **Ett kommando** istället för dubbelkörning
10. **Max 1-2 iterationer** — explicit budgetgräns
11. **git diff --name-only** — korrelera coverage med ändrade filer
12. **NEW-FAILING** — separat klassificering för ofullständig implementation

</details>

## Sidoeffekter — andra filer som ändrades

| Fil | Ändring |
|-----|---------|
| `prompts/manager.md` | Ny "When to delegate to Tester" + omskriven "After Implementer Completes" (Tester→Reviewer-ordning) |
| `prompts/reviewer.md` | Ny "Execution Order"-sektion — Reviewer läser test_report.md |
| `src/core/agents/manager.ts` | Tool descriptions: Tester "BEFORE Reviewer", Reviewer "AFTER Tester" |
| `tests/prompts/tester-lint.test.ts` | 11 tester (upp från 9), verifierar nya nyckelkoncept |

## Agentens efterreflektion

Tester var nöjd med den slutgiltiga prompten efter två iterationer av feedback. Sista invändningarna (git diff-mandat, NEW-FAILING-klassificering) fixades. Citat: "Steg 0, steg 1 och klassificeringen löser mina tre största problem."
