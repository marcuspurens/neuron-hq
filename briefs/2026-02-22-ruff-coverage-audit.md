# Brief: Ruff-fixar och testcoverage-analys
**Datum:** 2026-02-22
**Target:** aurora-swarm-lab
**Uppskattad tid:** 1–2 timmar

---

## Bakgrund

Körning #4 (20260222-1316) identifierade 22 ruff-fel i aurora-swarm-lab:
- 19 auto-fixbara (F401 unused imports) — kördes i körning #4
- 3 kvarstående: 1× E741 (variabelnamn), 2× F841 (oanvända variabler)

Körning #6 (20260222-2113) visade att testsviten nu har 187 tester, men vi vet inte vilka moduler som saknar täckning.

---

## Uppgifter

### Uppgift 1: Fixa kvarstående ruff-fel (3 st)

**Acceptanskriterier:**
- `ruff check .` rapporterar 0 fel (eller färre än vid baseline)
- `python -m pytest tests/ -x -q` är grön (187 tester)
- Varje fix är motiverad i `knowledge.md`

**Felen att fixa:**
1. `app/clients/whisper_client.py:183` — E741: Byt ut `l` mot `line` i list comprehension
   ```python
   # Före
   [l.strip() for l in block.splitlines() if l.strip()]
   # Efter
   [line.strip() for line in block.splitlines() if line.strip()]
   ```

2. `app/cli/main.py:308` — F841: `settings = load_settings()` är aldrig använd.
   - Undersök om `load_settings()` har sido-effekter (cache, validering)
   - Om inte: ta bort hela raden
   - Om ja: ändra till `load_settings()` utan assignment, med kommentar

3. `tests/test_intake_youtube.py:33` — F841: `manifest` är oanvänd
   - **VIKTIGT:** Ändra bara om du är säker på att det inte påverkar testet
   - Säkraste fix: `_ = intake_youtube.ingest_youtube(...)`
   - Alternativt: ta bort assignment om returvärdet verkligen ignoreras

### Uppgift 2: Lägg till `[tool.ruff]` i pyproject.toml

**Acceptanskriterier:**
- `pyproject.toml` innehåller en `[tool.ruff]` sektion
- Konfigurationen aktiverar minst E, F och I (isort) regler
- `ruff check .` fungerar utan extra flaggor

**Föreslagen konfiguration:**
```toml
[tool.ruff]
target-version = "py310"
line-length = 120

[tool.ruff.lint]
select = ["E", "F", "W", "I"]
ignore = []
```

**OBS:** Kontrollera om den nya konfigurationen triggar *nya* fel. Om ja, dokumentera i `questions.md` och lämna dem till nästa session.

### Uppgift 3: Kör testcoverage och rapportera

**Acceptanskriterier:**
- `pytest --cov=app tests/ -q --cov-report=term-missing` körs klart
- Resultatet dokumenteras i `runs/<runid>/coverage_report.md`
- Moduler med 0% täckning listas explicit

**Format för coverage_report.md:**
```markdown
# Coverage Report — aurora-swarm-lab
**Datum:** 2026-02-22
**Testsvit:** 187 tester

## Sammanfattning
Total coverage: XX%

## Moduler med låg täckning (< 50%)
| Modul | Täckning |
|-------|---------|
| app/... | X% |

## Moduler med 0% täckning
(lista)
```

---

## Verifiering (baseline)

Researcher ska köra detta vid start:
```bash
cd /Users/mpmac/Documents/VS\ Code/aurora-swarm-lab
ruff check . 2>&1 | tail -5
python -m pytest tests/ -x -q 2>&1 | tail -5
```

Förväntat vid baseline: ~3–8 ruff-fel (körning #4 fixade 14 av 22), 187 tester gröna.

---

## Vad som INTE ingår i denna körning

- mypy-fixar (för stort scope)
- `ruff format` (stor diff, dedikerad session)
- Ny funktionalitet

---

## Rollback

Alla ändringar är kosmetiska/stilistiska. Rollback: `git revert HEAD` i aurora-swarm-lab.

---

## Acceptanskriterier (sammanfattning)

- [ ] `ruff check .` — 0 fel (eller dokumenterade undantag)
- [ ] `python -m pytest tests/ -x -q` — alla 187 tester gröna
- [ ] `pyproject.toml` innehåller `[tool.ruff]` sektion
- [ ] `runs/<runid>/coverage_report.md` skapad med modulöversikt
- [ ] Inga nya ruff-fel introducerade
