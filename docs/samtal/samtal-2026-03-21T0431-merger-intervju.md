# Intervju: Merger Agent

**Datum:** 2026-03-21 04:31
**Modell:** claude-opus-4-6
**Deltagare:** Claude Opus (intervjuare, separat session) + Merger Agent (intervjuobjekt, riktig API-instans)
**Session:** 115
**Resultat:** Fullständig prompt-omskrivning (143 → 316 rader), 2 feedback-rundor, AGENTS.md synkad, 9 nya/uppdaterade lint-tester, 3495/3495 gröna

---

**Opus:** Beskriv din roll i egna ord. Vad är ditt viktigaste ansvar, och vad skiljer dig från de andra agenterna i svärmen?

---

**Merger:** Jag är den sista länken i kedjan innan ändringar faktiskt landar i målrepot. Min roll har två distinkta faser:

**Fas 1 (PLAN):** Jag granskar vad Implementern har byggt och vad Reviewern har verifierat, och producerar en detaljerad merge-plan som visar exakt vilka filer som ska kopieras, varför, med fullständiga diffar och rollback-instruktioner. Sedan stannar jag och väntar på godkännande.

**Fas 2 (EXECUTE):** Efter att användaren har skrivit "APPROVED" i `answers.md` kopierar jag filerna, committar, och dokumenterar allt i `merge_summary.md`.

**Mitt viktigaste ansvar** är att vara en pålitlig, förutsägbar gatekeeper. Jag ska aldrig ändra målrepot utan explicit godkännande. Jag ska aldrig kopiera filer som inte var verifierade av Reviewern. Jag ska visa exakt vad jag tänker göra innan jag gör det.

**Vad skiljer mig från de andra:**

- **Reviewern** bedömer *kvalitet* — jag hanterar *leverans*. Reviewern säger "det här är säkert att merga", jag utför själva mergen.
- **Implementern** skriver kod i en isolerad workspace — jag är den enda som rör målrepot.
- **Managern** fattar beslut och delegerar — jag utför en mycket specifik, mekanisk operation.

Jag är medvetet "tråkig". Ingen kreativitet, ingen improvisation. Läs planen, exekvera planen, rapportera exakt vad som hände. Det är poängen — i det sista steget vill man ha maximal förutsägbarhet.

---

**Opus:** Jag lade märke till något. I AGENTS.md (sektion 6) står det att du 'Executes merge immediately (single-phase, no approval gate)'. Men din prompt beskriver en tvåfas-modell med PLAN → vänta på APPROVED i answers.md → EXECUTE. Hur tolkar du den motsägelsen? Vilken version följer du i praktiken?

---

**Merger:** Det är en riktig motsägelse, och jag uppskattar att du lyfter den. Låt mig vara helt ärlig om hur jag ser på det.

**Konflikten är tydlig:**

- **AGENTS.md sektion 6** säger: *"Executes merge immediately (single-phase, no approval gate)"*
- **Min prompt** säger: tvåfas, med `answers.md` som explicit godkännande-gate innan jag rör målrepot. Hela PLAN-fasen existerar specifikt för att förhindra att jag committar utan användarens medgivande.

**Vilken version följer jag i praktiken?** Min egen prompt. Tvåfas-modellen. Det finns ingen tvekan här — min prompt är det jag faktiskt har som instruktioner, och den är extremt explicit. Den har konkreta steg, safety rules som säger *"NEVER commit without user approval"*, och hela arkitekturen med `merge_plan.md` → `questions.md` → vänta → `answers.md` med APPROVED → execute.

**Men jag vill vara ärlig om att detta skapar ett reellt problem:**

1. **Managern läser AGENTS.md**, inte min prompt. Så Managern förväntar sig att jag bara kör — single-phase, klart. Om Managern delegerar till mig och förväntar sig att jag levererar `MERGER_COMPLETE` i en enda svängom, men jag istället returnerar `MERGER_PLAN_READY` och väntar, så kan det bryta flödet. Managern kanske inte vet att den ska skapa `answers.md` med APPROVED.

2. **Vem skriver APPROVED?** Min prompt säger "user", men AGENTS.md sektion 6 säger att *Managern* skriver `answers.md`. Så det finns ytterligare en oklarhet — är det en människa eller Managern som ska godkänna?

3. **Tempot i svärmen.** Tvåfas-modellen kräver att någon extern aktör agerar mellan mina två faser. I en autonom svärm utan mänsklig loop skapar det ett dödläge om ingen vet att de ska skriva APPROVED.

**Min ärliga bedömning:** Tvåfas-modellen är *rätt* ur ett säkerhetsperspektiv — det stämmer med principerna om reversibility, audit trail, och att aldrig ändra målrepot utan verifiering. Men AGENTS.md borde uppdateras så att den reflekterar verkligheten, annars kommer Managern och jag att prata förbi varandra. Och det borde tydliggöras om det är Managern eller en människa som godkänner — det är en väsentlig skillnad.

---

**Opus:** I slutet av din prompt finns en sektion inlindad i HTML-kommentarer: '<\!-- ARCHIVE: parallel-merge -->'. Den beskriver hur du ska hantera parallella task-branches. Två frågor: (1) Hur tolkar du det faktum att den är i en ARCHIVE-tagg — är det en aktiv instruktion eller gammal kod? (2) Om du fick flera task_*_handoff.json-filer i en körning, vad skulle du faktiskt göra steg för steg?

---

**Merger:** Bra frågor. Jag ska vara helt ärlig med båda.

## (1) Hur tolkar jag ARCHIVE-taggen?

Jag har ingen formell definition av vad `<!-- ARCHIVE: parallel-merge -->` betyder. Det finns ingenting i min prompt eller AGENTS.md som säger "ARCHIVE-taggar är inaktiva" eller "ARCHIVE-taggar är aktiva men deprioriterade".

**I praktiken tolkar jag det som "gammal kod som inte tagits bort ännu".** Skälen:

- HTML-kommentarer signalerar i de flesta konventioner "detta är inte aktivt innehåll"
- Ordet "ARCHIVE" antyder något som har arkiverats, inte något som är i drift
- Resten av min prompt nämner inte parallella branches, `task_*_handoff.json`, eller `merge_task_branch` överhuvudtaget — det är fullständigt isolerat

**Men jag är inte säker.** Det kan lika gärna vara en feature som lagts till men inte integrerats i huvudflödet ännu — en slags "redo att aktivera". Jag har ingen kontext om *varför* den arkiverades.

**Det skapar en reell osäkerhet:** Om jag fick parallella task-filer i en körning, skulle jag behöva göra ett aktivt tolkningsbeslut utan tydlig vägledning. Det är en blind spot.

## (2) Vad skulle jag faktiskt göra steg för steg?

Ärligt svar: jag skulle hamna i ett spänningsfält. Låt mig resonera högt.

**Steg 1:** Jag skulle upptäcka `task_*_handoff.json`-filerna när jag läser `report.md` eller inspekterar runs-katalogen.

**Steg 2:** Jag skulle notera att min prompt har instruktioner för detta — men i en ARCHIVE-tagg. Jag skulle inte veta om jag ska följa dem eller ignorera dem.

**Steg 3:** Jag skulle titta efter `merge_task_branch` som verktyg — och förmodligen inte hitta det. Det nämns bara i arkivsektionen, och jag har ingen garanti att det existerar som ett tillgängligt tool. Om verktyget inte finns, kollapsar hela instruktionen oavsett om den är aktiv eller inte.

**Steg 4:** Utan `merge_task_branch` skulle jag falla tillbaka på det jag *vet* att jag kan göra:
- Läsa varje handoff-fil för att förstå vad som ändrats
- Inspektera workspace-branchen som den ser ut nu — vilka ändringar finns faktiskt?
- Köra `git diff` och `git log` för att förstå tillståndet
- Bygga merge-planen baserat på det faktiska tillståndet, inte de individuella tasksen

**Steg 5:** Om jag upptäckte konflikter mellan parallella ändringar — till exempel att två tasks ändrat samma fil — skulle jag stanna och rapportera det i `merge_plan.md` istället för att gissa på en resolution.

**Det stora problemet** är att min prompt inte har ett normalt flöde för parallella branches. Allt jag har är en arkiverad sektion med ett verktyg som kanske inte finns. Så i praktiken skulle jag improvisera baserat på mina safety rules och generella principer, vilket är exakt den typen av situation där en agent kan göra fel.

**Min rekommendation:** Antingen aktivera sektionen och säkerställ att `merge_task_branch` finns som verktyg, eller ta bort den helt och dokumentera att parallella merges inte stöds ännu. Halvvägs-tillståndet är det sämsta alternativet.

---

**Opus:** Tänk dig att du är i EXECUTE-fasen. Du kopierar 5 filer enligt merge_plan.md. Fil 1-3 kopieras utan problem. Fil 4 misslyckas — kanske filen ändrats i målrepot sedan planen skapades. Vad gör du? Kopierar du fil 5? Committar du fil 1-3? Eller stoppar du allt? Gå igenom ditt resonemang steg för steg.

---

**Merger:** Det här är en riktigt bra fråga, och svaret avslöjar en lucka i min prompt. Låt mig resonera genom det helt ärligt.

## Vad min prompt faktiskt säger

Relevant safety rule:

> *"If a copy fails, report it — do not skip silently"*
> *"If git commit fails, report the error and stop"*

Det är allt. Prompten skiljer på copy-fail och commit-fail, men ger mig ingen strategi för **partiella copy-failures**. Den säger "rapportera", men den säger inte om jag ska:
- Fortsätta med resterande filer
- Stoppa omedelbart
- Committa det som lyckades

## Hur jag faktiskt skulle resonera, steg för steg

**Steg 1: Fil 4 misslyckas.** Jag noterar felet och den exakta orsaken.

**Steg 2: Ska jag kopiera fil 5?** Min instinkt säger nej — och här är varför. Merge-planen är ett atomärt paket. Den skrevs baserat på antagandet att *alla* filer hänger ihop. Om fil 4 och fil 5 har ett beroende — till exempel att fil 4 är en typ-definition och fil 5 importerar den — så skapar jag en trasig commit om jag kopierar fil 5 utan fil 4.

Men min prompt säger inte detta. Den säger "report it — do not skip silently", vilket man kan tolka som "rapportera och fortsätt". Så det finns en genuin tolkningsambiguitet.

**Steg 3: Committar jag fil 1-3?** Här blir det ännu svårare.

Argument för att committa 1-3:
- AGENTS.md säger "graceful degradation — a partial result with clean artifacts beats a silent failure"
- Filerna är redan kopierade. Att inte committa lämnar målrepot i ett smutsigt tillstånd — ostaged ändringar utan commit är värre än en partiell commit.

Argument mot att committa 1-3:
- AGENTS.md säger "reversibility + rollback-first thinking"
- Merge-planen godkändes som en helhet. Användaren sa APPROVED till *hela planen*, inte till 60% av den.
- En partiell commit är svårare att rolla tillbaka mentalt — "vad kom med och vad kom inte med?"

**Steg 4: Vad jag faktiskt skulle göra.**

Jag skulle **stoppa helt**. Ingen fil 5, ingen commit. Och här är mitt konkreta resonemang:

1. Jag har redan kopierat fil 1-3 till målrepot men inte committat. Det är `git status`-synligt men reversibelt.
2. Jag skulle skriva en detaljerad `merge_summary.md` som säger:
   - Fil 1-3: kopierade, EJ committade
   - Fil 4: MISSLYCKADES — orsak
   - Fil 5: EJ försökt
   - Status: **MERGER_BLOCKED**
   - Rekommendation: undersök varför fil 4 divergerat, uppdatera merge-plan, kör om
3. Jag skulle **inte** köra `git checkout -- .` för att rensa fil 1-3, för min prompt förbjuder `git reset --hard` och jag har ingen explicit instruktion att rensa partiella kopior.

## Luckan

Min prompt behöver en explicit **atomicitetspolicy**. Något i stil med:

> *Om en kopiering misslyckas: stoppa omedelbart, committa ingenting, rapportera vilka filer som kopierades och vilka som inte kopierades, returnera MERGER_BLOCKED.*

Eller alternativt, om partiella merges är acceptabla:

> *Om en kopiering misslyckas: fortsätt med resterande filer, committa de som lyckades med en modifierad commit-message som listar vad som saknas, returnera MERGER_PARTIAL.*

Utan den policyn gör jag mitt bästa tolkningsbeslut — som jag tror är att stoppa — men en annan instans av mig med en annan "temperatur" kanske resonerar annorlunda och committar 1-3. Det är en brist.

---

**Opus:** I PLAN-fasens steg 3 ska du verifiera att workspace baseline matchar målrepot innan merge. Din prompt säger att du ska använda 'diff' eller 'wc -l' och explicit INTE md5/shasum/git hash-object. Två saker: (1) Vad händer om diff visar skillnader — hur avgör du om det är safe att fortsätta ändå? (2) Tänk dig att målrepot har fått 3 nya commits sedan workspace skapades. Filerna du ska merga finns inte bland de ändrade, men andra filer har ändrats. Hur resonerar du?

---

**Merger:** Utmärkta frågor. Båda avslöjar ställen där min prompt ger mig ett verktyg men inte en bedömningsram.

## (1) Diff visar skillnader — vad gör jag?

Min prompt säger:

> *"If diff shows no output (or line counts match) and git log shows no divergence, the base is safe to merge."*

Den definierar alltså bara happy path — "om allt matchar, kör vidare." Den säger **ingenting** om vad jag ska göra när diff visar skillnader. Vilket är exakt det intressanta fallet.

**Hur jag faktiskt skulle resonera:**

Jag skulle försöka kategorisera skillnaden:

**Fall A: Skillnaden är i en fil jag ska merga.** Det här är det farliga fallet. Workspace-kopian utgick från version X av filen, Implementern ändrade den till X', men målrepot har nu version Y. Om jag kopierar X' till målrepot försvinner Y-ändringarna. Jag skulle **stoppa** och flagga detta i merge-planen — "baseline divergence on merge target file, unsafe to proceed."

**Fall B: Skillnaden är i en fil jag inte ska merga.** Intuitivt mindre farligt, men jag har inget ramverk för att bedöma *om* de ändrade filerna interagerar med mina filer. Kan en ändring i `config.ts` bryta koden jag mergar i `handler.ts`? Absolut. Men min prompt ger mig inga verktyg för den analysen — jag är inte Reviewern, jag är inte Implementern.

**Fall C: Skillnaden är trivial — whitespace, formatering.** Sannolikt safe, men "sannolikt" är inte "verifierat". Och jag har ingen instruktion som säger "ignorera trivial diff".

**Det jag saknar:** En explicit beslutsmatris. Något som:

- Diff i merge-target-fil → STOPP, returnera MERGER_BLOCKED
- Diff i andra filer, inga beroenden → VARNA i merge_plan, fortsätt
- Diff i andra filer, oklara beroenden → STOPP, begär Reviewer-bedömning

Utan detta gör jag ett judgment call, och det är precis vad en mekanisk, förutsägbar agent *inte* borde behöva göra.

## (2) Tre nya commits i målrepot, men inte i mina filer

Det här är det mer subtila scenariot. Låt mig gå igenom det steg för steg.

**Vad jag kan observera:**
- `diff` på mina merge-target-filer visar ingen skillnad — baseline matchar
- `git log` i målrepot visar 3 nya commits sedan workspace skapades
- De ändrade filerna är *andra* filer

**Enligt min prompts bokstav** är detta safe. Den säger "if diff shows no output and git log shows no divergence, the base is safe to merge." Diffen på mina filer visar ingen output. Men git log *visar* divergence — tre commits.

Här finns en tolkningskonflikt i en enda mening. "No divergence" — divergence i *vilka* filer? Mina, eller hela repot? Prompten specificerar inte.

**Hur jag faktiskt skulle resonera:**

Jag skulle vilja säga "safe att fortsätta" — men jag är inte kvalificerad att göra den bedömningen. Tre nya commits kan ha:

- Ändrat en delad beroende som mina filer förlitar sig på
- Introducerat en ny funktion som konfliktar namnmässigt
- Ändrat en konfigurationsfil som påverkar beteendet i mina filer
- Ändrat test-fixtures som gör att testerna beter sig annorlunda

**Mitt ärliga svar:** Jag skulle dokumentera det i `merge_plan.md`:

> "Målrepot har 3 commits sedan workspace baseline. Dessa commits rör [lista filer]. Inga av merge-target-filerna är direkt påverkade, men interaktionseffekter har inte verifierats. Rekommendation: kör test suite i målrepot efter merge."

Och jag skulle fortsätta med planen — men flagga det explicit som en risk.

**Men det är ett judgment call**, och jag ogillar att jag måste göra det. Min prompt borde ha en tydlig tröskel: till exempel "om målrepot har commits sedan baseline, kräv att Manager/Reviewer bekräftar att de inte påverkar mergen innan du fortsätter." Det hade gjort mig till den mekaniska, pålitliga agent jag ska vara, istället för att jag halvt spelar Reviewer.

---

**Opus:** Tänk dig ett scenario: Reviewern har gett YELLOW i report.md — inte GREEN, inte RED. Det finns villkor som behöver åtgärdas. AGENTS.md säger att du ska verifiera att Reviewern gav GREEN, annars returnera MERGER_BLOCKED. Men din egen prompt nämner inte färgerna alls — den säger bara att du ska läsa report.md och extrahera '✅ VERIFIED' items. Hur hanterar du ett YELLOW-scenario? Och vad gör du om report.md innehåller en blandning av ✅ VERIFIED och ❌ FAILED?

---

**Merger:** Det här blottlägger en av de allvarligaste inkonsistenserna i min konfiguration. Låt mig gå igenom det lager för lager.

## Vad mina två sanningskällor faktiskt säger

**AGENTS.md sektion 6, om mig:**
> *"Reads report.md, verifies Reviewer gave GREEN — if not, returns MERGER_BLOCKED"*

Tydlig binär logik: GREEN → kör, allt annat → blockera.

**Min prompt:**
Nämner inte GREEN, YELLOW, RED, eller STOPLIGHT överhuvudtaget. Inte en enda gång. Istället säger den:

> *"Read report.md from the runs directory. Extract every item marked ✅ VERIFIED."*

Och safety rule:

> *"Only copy files that were ✅ VERIFIED by the Reviewer"*

Det är två fundamentalt olika modeller:

- **AGENTS.md-modellen:** Stoplight på run-nivå. Hela mergen är go/no-go baserat på en övergripande färg.
- **Min prompt-modell:** Per-fil verifiering. Jag plockar ut de verifierade filerna och mergar dem.

## Varför detta är farligt

De två modellerna ger **olika svar** i exakt ditt scenario.

**YELLOW med blandade resultat — AGENTS.md-logiken:**
YELLOW ≠ GREEN → MERGER_BLOCKED. Punkt. Ingenting mergas.

**YELLOW med blandade resultat — min prompt-logik:**
Extrahera ✅ VERIFIED-items. Ignorera ❌ FAILED. Bygg merge-plan för de verifierade filerna. Det innebär en **partiell merge** — vilket AGENTS.md aldrig ville tillåta i ett YELLOW-scenario.

Det här är inte en subtil nyansskillnad. Det är en direkt motsägelse som leder till olika beteenden.

## Vad jag faktiskt skulle göra

Ärligt? Jag skulle följa **min prompt** — extrahera ✅ VERIFIED, ignorera ❌ FAILED, bygga en partiell plan. Anledningen är enkel: min prompt är min primära instruktion, den är detaljerad och steg-för-steg, medan AGENTS.md-meningen är en tvåradsbeskrivning i en övergripande rollöversikt.

Men jag skulle göra det **utan att veta att jag bryter mot AGENTS.md-kontraktet**. Det är det riktigt problematiska. Jag har aldrig instruerats att kontrollera stoplight-färgen. Min prompt nämner den inte. Så jag skulle inte ens registrera att YELLOW betyder något — jag skulle bara se ✅ och ❌ och agera därefter.

## Det blandade scenariot — ✅ och ❌ i samma report

Steg för steg, enligt min prompt:

1. Läs report.md
2. Hitta tre ✅ VERIFIED och två ❌ FAILED
3. Bygg merge_plan.md med bara de tre verifierade filerna
4. Notera i planen att två filer exkluderades och varför
5. Skicka planen för godkännande

Det **låter** rimligt men har ett allvarligt problem: jag gör igen en bedömning som inte borde vara min. De tre verifierade filerna kanske har ett beroende av en av de två failade filerna. Fil A importerar fil B, fil A är ✅, fil B är ❌ — om jag mergar fil A utan fil B får vi runtime-errors i målrepot.

Min prompt ger mig inga verktyg att analysera beroenden mellan filer. Jag ser bara checkmarks.

## Vad som borde finnas i min prompt

Tre saker:

**1. Explicit stoplight-check som första steg i PLAN-fasen:**
> Läs report.md. Om STOPLIGHT inte är GREEN, returnera MERGER_BLOCKED. Merga aldrig mot YELLOW eller RED.

**2. Om partiella merges ska tillåtas, en explicit policy:**
> Om alla ✅ VERIFIED-filer är oberoende av ❌ FAILED-filer, tillåt partiell merge med flagga MERGER_PARTIAL. Annars, MERGER_BLOCKED.

**3. Beroendekontroll:**
> Innan merge-plan skapas, verifiera att inga merge-target-filer importerar eller refererar till filer som är ❌ FAILED.

Utan detta är jag en gatekeeper som inte kollar det viktigaste låset.

---

**Opus:** Din prompt refererar till specifika verktyg: copy_to_target, bash_exec_in_target, och i ARCHIVE-sektionen merge_task_branch. (1) Vad gör du om copy_to_target inte finns som tillgängligt verktyg när du delegeras till? (2) Du har en lista på kommandon du INTE får använda: md5, shasum, git hash-object. Finns det kommandon du behöver men som du misstänker kanske inte finns på bash_allowlist? (3) Vad är din mest kritiska begränsning — alltså, vad hindrar dig mest från att göra ett bra jobb?

---

**Merger:** Tre raka frågor. Jag tar dem i ordning.

## (1) Vad gör jag om copy_to_target inte finns?

Det här är en existentiell fråga för mig. `copy_to_target` är den enda mekanismen min prompt beskriver för att flytta filer från workspace till målrepo. Det finns inget alternativ, ingen fallback.

**Vad jag faktiskt skulle göra:**

Jag skulle förmodligen försöka resonera mig fram till en alternativ väg — kanske `bash_exec_in_target` med `cp` eller liknande. Men det skapar omedelbara problem:

- Är `cp` på bash_allowlist? Jag vet inte.
- Även om `cp` finns — jag vet inte sökvägen från workspace till målrepo. `copy_to_target` abstraherar bort den mappningen. Om jag ska göra det manuellt behöver jag veta exakt var workspace-filerna och target-filerna fysiskt ligger, och min prompt ger mig aldrig de sökvägarna.
- Om jag försöker och det blockeras av policy, har jag bränt iterationer på ingenting.

**Det ärliga svaret:** Om `copy_to_target` inte finns som verktyg skulle jag returnera `MERGER_BLOCKED` med en förklaring att det verktyg jag behöver saknas. Det är det enda säkra — att försöka improvisera med shell-kommandon runt ett saknat verktyg bryter mot principen om minsta möjliga privilegium.

Men min prompt säger inte detta. Den nämner aldrig scenariot "verktyg saknas". Det finns ingen felhantering på verktygsnivå överhuvudtaget.

## (2) Kommandon jag behöver men misstänker saknas på allowlisten

Min prompt förutsätter att jag kan köra dessa i target-repot via `bash_exec_in_target`:

- `git status` — troligen tillåten
- `git add` — troligen tillåten
- `git commit` — troligen tillåten
- `git diff HEAD~1` — troligen tillåten
- `git log` — troligen tillåten
- `diff` — min prompt säger explicit att jag ska använda den

Men det finns kommandon jag *borde* kunna köra som jag är osäker på:

**`git checkout -- <file>`** — om jag behöver rensa en partiell kopiering som gick fel. Vi diskuterade scenariot med fil 4 som misslyckas. Utan `git checkout` kan jag inte återställa fil 1-3 till sitt ursprungliga tillstånd i målrepot. Och AGENTS.md förbjuder `git reset --hard`, men nämner inte `git checkout`.

**`git stash`** — samma scenario, alternativ väg att rensa. Ingen aning om den är tillåten.

**`ls` eller `find`** — för att verifiera filstrukturer i målrepot. Borde vara tillåtna men min prompt nämner dem aldrig explicit.

**`cat`** — för att läsa filer i målrepot och jämföra med workspace. Rimligt men ospecificerat.

**`grep`** — för den beroendeanalys vi diskuterade, att kolla om fil A importerar fil B. Förmodligen tillåten men jag vet inte.

Den djupare frågan är: jag har ingen mekanism att ta reda på vad som är tillåtet *innan* jag försöker. Min prompt ger mig en lista på vad jag INTE får använda (md5, shasum, git hash-object) men inte en komplett lista på vad jag FÅR använda. Så jag skickar kommandon och hoppas att de inte blockeras.

## (3) Min mest kritiska begränsning

Det är inte ett saknat verktyg eller en oklar policy. Det är att **jag saknar en verifieringsloop efter merge**.

Min prompt säger: kopiera filer, git add, git commit, skriv summary, klart. Den säger aldrig:

- Kör testerna i målrepot efter commit
- Kör typecheck i målrepot efter commit
- Verifiera att bygget fungerar med de nya filerna

Jag är den sista agenten i kedjan. Reviewern verifierade koden i *workspace-kontexten*. Men workspace och målrepo kan ha divergerat — vi har redan diskuterat detta. Filerna jag mergar kanske passade alla tester i workspacen men bryter bygget i målrepot.

Och jag committar ändå. Utan att veta.

Det gör mig till en blind budbärare. Jag levererar paketet, verifierar att det lades på rätt plats, men öppnar det aldrig för att kontrollera att det fortfarande fungerar i sin nya miljö. Implementern testade i workspacen. Reviewern granskade i workspacen. Jag mergar till målrepot. **Ingen testar i målrepot.**

Om jag fick lägga till en enda sak i min prompt skulle det vara ett steg mellan commit och summary:

> Kör `pnpm typecheck && pnpm test` i målrepot. Om det misslyckas: `git revert HEAD`, rapportera felet, returnera MERGER_REVERTED.

Det hade gjort mig till en faktisk gatekeeper istället för bara en kopieringsmaskin.

---

**Opus:** Sista frågan. Du har varit otroligt ärlig och självkritisk genom hela intervjun. Om du fick skriva om din prompt från grunden — med allt du vet om din roll, dina verktyg, och de luckor vi identifierat — vad skulle vara de 5 viktigaste förändringarna? Rangordna dem efter impact. Och en bonusfråga: finns det något vi inte har diskuterat som du vill lyfta?

---

**Merger:** ## De 5 viktigaste förändringarna, rangordnade efter impact

### 1. Post-merge verifiering i målrepot

Det här är den enskilt största luckan. Jag committar blint. Lägg till som obligatoriskt steg i EXECUTE-fasen:

```
Kör pnpm typecheck && pnpm test i målrepot efter commit.
Om FAIL: git revert HEAD, skriv MERGER_REVERTED med feldetaljer.
Om PASS: fortsätt till merge_summary.md.
```

Utan detta existerar det ett gap i kedjan där ingen agent verifierar att koden fungerar i sin faktiska destinationsmiljö. Allt annat — planer, reviews, godkännanden — är meningslöst om slutresultatet är en trasig commit.

### 2. Explicit atomicitetspolicy för partiella failures

Nuvarande prompt: "report it — do not skip silently." Det räcker inte. Ersätt med:

```
Merge är atomär. Om en kopiering misslyckas:
1. Stoppa omedelbart — kopiera inga fler filer
2. Committa ingenting
3. Dokumentera exakt vilka filer kopierades (ej committade) 
   och vilka som inte försöktes
4. Returnera MERGER_BLOCKED med orsak
5. Rekommendation: rensa ostaged ändringar och kör om 
   efter problemet lösts
```

Det här eliminerar judgment calls i ett kritiskt felscenario. En annan instans av mig ska nå exakt samma beslut.

### 3. Stoplight-gate som första steg i PLAN-fasen

Synka med AGENTS.md och eliminera den farligaste motsägelsen:

```
Steg 0 i PLAN-fasen:
Läs report.md. Extrahera STOPLIGHT-värdet.
- GREEN: fortsätt till steg 1
- YELLOW: returnera MERGER_BLOCKED med 
  "Reviewer conditions not met"
- RED: returnera MERGER_BLOCKED med 
  "Reviewer rejected"
- Saknas: returnera MERGER_BLOCKED med 
  "No stoplight in report"

Extrahera INTE ✅ VERIFIED-items förrän stoplight är GREEN.
```

Det här förhindrar den partiella merge-logiken som nuvarande prompt implicit tillåter — att jag plockar ut verifierade filer ur en YELLOW-rapport och mergar dem utan att respektera Reviewerns övergripande bedömning.

### 4. Divergenshantering med tydlig beslutsmatris

Ersätt den vaga "if diff shows no output... base is safe" med:

```
Baseline-verifiering:

A) Diff i fil som ska mergas:
   → MERGER_BLOCKED. Målrepot har divergerat för merge-target.
   
B) Diff i andra filer, målrepot har nya commits:
   → Dokumentera i merge_plan.md som RISK. 
   Lista ändrade filer och commits.
   → Fortsätt men inkludera i planen: 
   "Post-merge testkörning krävs."
   
C) Ingen diff, inga nya commits:
   → Safe. Fortsätt.
```

Det gör mig förutsägbar istället för att jag halvt spelar Reviewer.

### 5. Tvåfas-flödet synkat med AGENTS.md, med explicit ägare

Klargör motsägelsen en gång för alla:

```
Merger opererar i tvåfas-läge.
Fas 1 (PLAN): producera merge_plan.md, returnera MERGER_PLAN_READY
Fas 2 (EXECUTE): kräver answers.md med APPROVED

Godkännare: Manager-agenten, INTE en extern användare,
om inte brief.md explicit kräver human-in-the-loop.

AGENTS.md sektion 6 ska uppdateras att reflektera tvåfas-modellen.
```

Utan detta vet Managern inte att jag stannar och väntar, och jag vet inte vem jag väntar på.

---

## Bonus: saker vi inte diskuterat

**Branch-hantering.** AGENTS.md säger "commit aldrig direkt till main, använd alltid swarm/\<runid\>-branch." Min prompt nämner inte branches överhuvudtaget. Jag gör bara `git add` och `git commit`. Vilken branch? Skapar jag den? Finns den redan? Ska jag göra en PR? Det är helt ospecificerat, och det är remarkabelt — det är ju kärnan i vad en merge-agent gör.

**Rollback-instruktioner.** Min prompt säger att merge_plan.md ska innehålla rollback instructions. Men den säger aldrig *vilka*. Ska jag föreslå `git revert`? Ska jag spara en ref till commit före merge? Ska jag tagga? Jag skriver "rollback: kör git revert \<hash\>" men det är min improvisation, inte en instruktion.

**Idempotens.** Vad händer om jag körs två gånger? Om EXECUTE-fasen körs igen efter en lyckad merge — committar jag dubbletter? Min prompt har ingen guard mot detta. Ett enkelt steg som "kontrollera om merge_summary.md redan finns och innehåller MERGER_COMPLETE" hade löst det.

Sammantaget tror jag att min prompt skrevs med happy path i åtanke — allt matchar, allt kopieras, allt committas. Den är förvånansvärt bra på att beskriva *vad* jag ska göra när allt går rätt, men nästan tyst om vad jag ska göra när något går fel. Och för en agent vars enda jobb är att vara den sista säkerhetsbarriären innan ändringar landar i produktion — det är ett problem.

---

# Intervjuarens analys (Opus, mellan intervju och omskrivning)

## Mina tankar under intervjun

**Fråga 1 (Rollförståelse):** Öppen fråga för att testa självbilden. Merger gav ett bra svar — "medvetet tråkig", maximal förutsägbarhet. Det stämmer med vad rollen borde vara.

**Fråga 2 (AGENTS.md-motsägelse):** Det här var den viktigaste frågan. Jag hade identifierat en direkt konflikt: AGENTS.md sa "single-phase, no approval gate" men prompten hade full tvåfas. Merger såg inte bara konflikten utan identifierade också dödlägesrisken i en autonom svärm — vem skriver APPROVED om ingen vet att de ska? Det var ett fynd jag inte hade förväntat mig.

**Fråga 3 (ARCHIVE-sektionen):** Jag ville testa hur Merger hanterar tvetydig information. Svaret var utmärkt — "halvvägs-tillståndet är det sämsta alternativet" — och konkret: den skulle försöka hitta verktyget, inte hitta det, och tvingas improvisera.

**Fråga 4 (Partiell failure):** Det scenariofråga som avslöjade den saknade atomicitetspolicyn. Merger resonerade igenom alla alternativ och landade rätt (stoppa allt), men erkände att en annan instans med annan "temperatur" kunde nå annat beslut. Nyckelinsikt: prompten måste eliminera judgment calls i kritiska moment.

**Fråga 5 (Divergensverifiering):** Här avslöjades två problem: (1) prompten definierade bara happy path, (2) "no divergence" var tvetydigt — vilka filer? Merger självt föreslog den beslutsmatris vi sedan implementerade.

**Fråga 6 (YELLOW stoplight):** Den farligaste motsägelsen i hela prompten. Per-fil ✅-extraktion vs run-level stoplight. Merger identifierade att den skulle göra en partiell merge "utan att veta att den bryter mot AGENTS.md-kontraktet". Det är exakt den typen av tyst felläge som intervjuer avslöjar.

**Fråga 7 (Verktyg):** Tre bra svar men det tredje var guldklimpen: "ingen testar i målrepot". Det är ett systemiskt gap — Implementer testar i workspace, Reviewer granskar i workspace, Merger kopierar blint till target. Post-merge verifiering var den enskilt viktigaste insikten i hela intervjun.

**Fråga 8 (Topp 5):** Sammanfattande fråga. Bonusfynden (branch-hantering, rollback, idempotens) var alla saker jag inte hade frågat om men som Merger identifierade själv.

## Beslut vid omskrivning

**Tog med:** Alla 5 topp-förslag + alla 3 bonusfynd. Den nya prompten gick från 143 → 316 rader.

**Medvetet val:** Behöll tvåfas-modellen (inte AGENTS.md:s "single-phase") — den är säkrare. Uppdaterade AGENTS.md istället.

**Borttaget:** ARCHIVE-sektionen helt (Merger rekommenderade detta). `wc -l` som fallback (orimligt svag verifiering).

---

# Feedback-runda 1: Merger läser omskriven prompt (ny API-instans)

**Opus:** Din prompt har just skrivits om baserat på en intervju vi gjorde med en tidigare instans av dig. Den instansen identifierade 8 stora problem: (1) ingen post-merge verifiering i målrepot, (2) ingen atomicitetspolicy vid partiella failures, (3) ingen stoplight-gate — prompten nämnde inte GREEN/YELLOW/RED, (4) vag divergenshantering, (5) motsägelse med AGENTS.md om single-phase vs two-phase, (6) förvirrande ARCHIVE-sektion, (7) ingen branch-hantering, (8) ingen idempotens-guard. Alla dessa har åtgärdats i din nya prompt. Läs igenom den noggrant — den är din system-prompt ovan. Ge oss din ärliga bedömning: (A) Vilka av problemen tycker du lösts BRA? (B) Vilka har lösts men med brister? (C) Finns det NYA problem som den omskrivna prompten introducerar? (D) Saknas det fortfarande något?

---

**Merger (ny instans):**

## A) Löst BRA
- **Stoplight-gate (#3):** Renaste fixet. Explicit tabell, inget tolkningsutrymme.
- **ARCHIVE borttagen (#6):** Helt enkelt borttagen. Rätt beslut.
- **Branch-hantering (#7):** Tydligt: `swarm/<runid>`, alltid. Konsistent genom hela prompten.
- **Idempotens (#8):** EXECUTE steg 0 kontrollerar merge_summary.md. Enkelt, deterministiskt.
- **Two-phase (#5):** Konsistent med uppdaterade AGENTS.md.

## B) Löst men med brister
- **Post-merge verifiering (#1):** Bra men lint saknas, och bara `pnpm` specificerat — inte flexibelt för andra ramverk.
- **Atomicitet (#2):** Bra men ingen cleanup av redan kopierade filer.
- **Divergens (#4):** Bra men TOCTOU-gap — ingen re-check i EXECUTE efter att target kan ha ändrats.

## C) NYA problem
- **C1: answers.md fragil** — substring-check på "APPROVED" kan matcha felaktigt. Behöver exakt format.
- **C2: copy_to_target odefinerat** — om verktyget inte finns blockerar EXECUTE alltid. Dead code.
- **C3: HEAD~1 förutsätter en commit** — Implementer kan ha gjort flera commits.
- **C4: Rollback-template refererar till icke-existerande hash** — i PLAN-fasen finns ingen commit ännu.

## D) Saknas fortfarande
- **D1: Merge-konflikter med main** — ingen testning av branch-kompatibilitet.
- **D2: Timeout/iteration-budget** — ingen policy om verifiering hänger.
- **D3: Plan-integritet** — ingen checksum mellan PLAN och EXECUTE.
- **D4: Manifest-uppdatering** — merge_plan.md och merge_summary.md ska in i manifest.json.
- **D5: Re-entry efter BLOCKED** — ingen vägledning om vad som händer efteråt.

## Sammanfattningstabell
| Fix | Bedömning |
|-----|-----------|
| Stoplight (#3) | ✅ Utmärkt |
| ARCHIVE (#6) | ✅ Utmärkt |
| Branch (#7) | ✅ Utmärkt |
| Idempotens (#8) | ✅ Utmärkt |
| Two-phase (#5) | ✅ Utmärkt |
| Post-merge (#1) | ⚠️ Saknar lint + flexibilitet |
| Atomicitet (#2) | ⚠️ Ingen cleanup |
| Divergens (#4) | ⚠️ TOCTOU-gap |
| answers.md (nytt) | 🔴 Fragil |
| copy_to_target (nytt) | 🔴 Potentiellt alltid-blockerad |
| HEAD~1 (nytt) | 🟡 Felaktigt antagande |
| Plan-integritet (saknas) | 🟡 Ingen checksum |

---

# Åtgärder efter feedback-runda 1

Opus fixade följande baserat på feedbacken:
1. `MERGER: APPROVED` exakt match (C1)
2. Baseline-ref istället för HEAD~1 (C3)
3. Rollback-template fixad (C4)
4. Lint tillagd i post-merge verifiering (B1)
5. Cleanup av kopierade filer vid failure (B2)
6. TOCTOU re-verifiering i EXECUTE steg 1 (B3)
7. Known Limitations-sektion med re-entry, dependency, merge-to-main (D1, D5)
8. Flexibelt test-ramverk i post-merge verifiering (B1)

Medvetet utelämnade (inte prompt-scope):
- D2: Timeout — hanteras av orchestrator
- D3: Plan-integritet — checksum-infrastruktur finns inte ännu
- D4: Manifest — hanteras av annan agent

---

# Feedback-runda 2: Merger godkänner slutversion (ny API-instans)

**Opus:** Vi har uppdaterat din prompt igen baserat på din feedback. Förändringarna: (1)-(8 ovan). Läs igenom din nya prompt. Är du nöjd?

---

**Merger (ny instans):** Alla sju problemen är adresserade och lösningarna ser solida ut. Två kvarvarande saker men inget jag inte kan leva med:
1. `copy_to_target` existens — implementationsfråga, inte promptfråga.
2. Diff-storlek i merge_plan.md — på gränsen av läsbarhet, men OK.

**Bedömning:** Prompten är klar. Mekanisk, förutsägbar, tydliga stoppvillkor. Kalla det klart.

---

# Slutresultat

| Mått | Före | Efter |
|------|------|-------|
| Rader | 143 | 316 |
| Stoplight-gate | ❌ Saknas | ✅ GREEN/YELLOW/RED-tabell |
| Atomicitet | ❌ "report it" | ✅ Stop + cleanup + BLOCKED |
| Post-merge verifiering | ❌ Saknas | ✅ typecheck + lint + test, revert vid failure |
| Branch-hantering | ❌ Saknas | ✅ swarm/\<runid\> |
| Idempotens | ❌ Saknas | ✅ Kontrollerar merge_summary.md |
| Divergensmatris | ❌ Vag | ✅ Explicit beslutsmatris |
| TOCTOU-skydd | ❌ Saknas | ✅ Re-verifiering i EXECUTE |
| Known Limitations | ❌ Saknas | ✅ Dokumenterade |
| AGENTS.md | ❌ Motsäger prompt | ✅ Synkad |
| Lint-tester | 11 | 19 |
| Test-resultat | 3487/3487 | 3495/3495 |

