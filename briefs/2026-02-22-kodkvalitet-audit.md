# Brief: Kodkvalitetsaudit + Git-status

**Datum:** 2026-02-22
**Target:** aurora-swarm-lab

## Bakgrund

aurora-swarm-lab är ett Python-projekt som vuxit organiskt under många sessioner.
Ingen systematisk lint eller typkontroll har gjorts. Vi vet inte hur koden håller
måttet. Vi vill också veta om det finns uncommitted changes som borde committas.

## Uppgifter

### 1. Audit (Researcher)

Kör följande kommandon i workspace-roten och dokumentera resultaten:

- `ruff check .` — lista alla lint-fel (antal + vilka filer)
- `mypy . --ignore-missing-imports` — lista typfel (informationell, se nedan)
- `git status` — finns uncommitted changes?
- `git log --oneline -5` — vilka är de senaste commitsen?

Dokumentera fynden i `ideas.md` och `knowledge.md`.

### 2. Fixa lint-fel (Implementer)

Om `ruff check .` rapporterar fel:

1. Kör `ruff check --fix .` för att auto-fixa det som går automatiskt
2. Kör `ruff check .` igen — verifiera att det är rent (eller lista kvarstående fel)
3. Kör `python -m pytest tests/ -x -q` — verifiera att testerna fortfarande är gröna
4. Om kvarstående ruff-fel inte kan auto-fixas: dokumentera dem i `questions.md`, fixa INTE manuellt

Fixa **inte** mypy-fel — de kräver mänskligt beslut.

### 3. Committa om nödvändigt

Om Implementer körde `ruff --fix` och testerna är gröna:
- Skapa en commit: `git commit -m "style: auto-fix ruff lint errors"`

Om `git status` visar pre-existerande uncommitted changes i workspace:
- Rapportera dem i `questions.md` — committa dem **inte** utan godkännande

## Acceptanskriterier

- [ ] `ruff check .` har körts och resultatet rapporteras (antal fel eller "clean")
- [ ] `mypy . --ignore-missing-imports` har körts och resultatet rapporteras
- [ ] Testtäckning rapporteras i `test_report.md` (via Tester-agenten)
- [ ] Git-status rapporteras (uncommitted changes eller "working tree clean")
- [ ] Om ruff-fel auto-fixades: testerna är fortfarande gröna och en commit skapades

## Scope-begränsning

- Fixa **bara** auto-fixbara ruff-fel (`ruff --fix`)
- Rör **inte** mypy-fel
- Rör **inte** testfiler
- Rör **inte** konfigurationsfiler (pyproject.toml, requirements.txt etc.)
- Inga nya features eller refaktorering

## Speciell instruktion till Reviewer

**mypy är informationell den här körningen — blockera INTE på mypy-fel.**
aurora-swarm-lab har aldrig körts med mypy och kan ha pre-existerande typfel
i kod som inte rördes. Rapportera antalet mypy-fel men låt det inte stoppa körningen.

ruff däremot är blockerande: om `ruff check .` fortfarande rapporterar fel efter
att Implementer kört `ruff --fix` → flagga i rapporten.

## Risknivå

LOW — statisk analys och kosmetiska lint-fixar. Inga logikändringar.
Rollback: `git revert HEAD` om lint-fixarna bröt något oväntat.
