# Brief: Skapa tests/conftest.py med delade fixtures

**Datum:** 2026-02-22
**Target:** aurora-swarm-lab

## Bakgrund

aurora-swarm-lab har 54 testfiler och 187 testfunktioner men saknar `conftest.py`.
Nästan varje testfil upprepar samma boilerplate för att sätta upp databasen:

```python
db_path = tmp_path / "queue.db"
monkeypatch.setenv("POSTGRES_DSN", f"sqlite://{db_path}")
init_db()
```

Utan delade fixtures tvingas varje ny test upprepa detta manuellt. Det gör testerna
svårare att skriva och underhålla. En `conftest.py` i `tests/`-roten löser det.

## Uppgifter

### 1. Kartlägg befintliga mönster (Researcher)

Läs igenom testfilerna och identifiera:

- Vilka boilerplate-mönster upprepas i de flesta testfiler?
  (tips: sök efter `monkeypatch.setenv`, `init_db`, `tmp_path`, `MagicMock`)
- Vilka externa beroenden mockas konsekvent?
  (Ollama, Snowflake, Whisper — hur mockas de idag?)
- Finns det redan några `@pytest.fixture`-definitioner i enskilda testfiler
  som borde lyftas till conftest?

Dokumentera fynden i `knowledge.md` och `ideas.md`.

### 2. Skapa tests/conftest.py (Implementer)

Skapa `tests/conftest.py` med fixtures baserade på Researchers kartläggning.

**Obligatoriska fixtures:**

```python
@pytest.fixture
def db(tmp_path, monkeypatch):
    """Initierad SQLite-databas för tester. Ersätter POSTGRES_DSN."""
    db_path = tmp_path / "queue.db"
    monkeypatch.setenv("POSTGRES_DSN", f"sqlite://{db_path}")
    init_db()
    yield db_path
```

**Lägg till ytterligare fixtures** om Researcher identifierar tydliga mönster
(t.ex. Ollama-mock, Snowflake-mock, Settings-objekt). Skapa bara fixtures för
mönster som förekommer i **minst 3 testfiler**.

**Regler för conftest:**
- Använd `tmp_path` (inbyggd pytest-fixture) — skapa aldrig temporära kataloger manuellt
- Varje fixture ska ha en docstring som förklarar vad den gör
- Importera bara det som faktiskt behövs — inga "kanske behövs"-importer

### 3. Uppdatera minst 3 testfiler (Implementer)

Välj 3 testfiler som drar störst nytta av conftest och refaktorera dem
att använda de nya fixtures. **Rör inte de övriga 51 filerna.**

Prioritet: välj testfiler med mest boilerplate (flest `monkeypatch.setenv`-rader).

### 4. Verifiera (Tester)

Kör hela testsviten och verifiera att alla tester fortfarande passerar:

```bash
python -m pytest tests/ -x -q
```

Rapportera antal passerade/misslyckade tester i `test_report.md`.

## Acceptanskriterier

- [ ] `tests/conftest.py` skapades med minst 1 fixture (`db` eller motsvarande)
- [ ] Minst 3 testfiler är uppdaterade att använda fixtures från conftest
- [ ] `python -m pytest tests/ -x -q` — alla tester passerar (samma antal som baseline)
- [ ] Ingen testfil importerar längre boilerplate som nu täcks av conftest
- [ ] Varje fixture i conftest har en docstring

## Scope-begränsning

- Skapa **bara** `tests/conftest.py` — inga nya testfiler
- Refaktorera **max 5 testfiler** (välj de mest representativa)
- Ändra **inga** fixtures som redan fungerar — lägg bara till
- Rör **inte** produktionskod (`app/`)
- Rör **inte** konfigurationsfiler (`pyproject.toml`, `requirements.txt`)
- Lägg **inte** till `pytest.ini`-inställningar eller markers — det är scope creep

## Speciell instruktion till Reviewer

Verifiera följande med `grep` eller `ls`:

1. Filen `tests/conftest.py` existerar (`ls tests/conftest.py`)
2. Den innehåller minst ett `@pytest.fixture` (`grep -n "@pytest.fixture" tests/conftest.py`)
3. Minst 3 testfiler refererar till fixtures från conftest
   (`grep -rn "def test_.*db\b\|def test_.*settings\b" tests/ | head -10`)
4. Testerna är gröna (`python -m pytest tests/ -x -q --tb=no`)

**Blockera** om conftest introducerade ett importfel som får testsamlingen att krascha.
**Godkänn med varning** om färre än 3 testfiler uppdaterades (men conftest finns).

## Risknivå

LOW — vi lägger till en ny fil och refaktorerar ett fåtal testfiler.
Produktionskod rörs inte. Rollback: `git revert HEAD` tar bort conftest
och återställer de refaktorerade testfilerna.
