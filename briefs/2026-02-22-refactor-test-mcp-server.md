# Brief: Refaktorera test_mcp_server.py med conftest.py-fixtures

**Datum:** 2026-02-22
**Target:** aurora-swarm-lab
**Prioritet:** Hög

---

## Bakgrund

Körning #5 (2026-02-22) skapade `tests/conftest.py` med 4 delade fixtures:

| Fixture | Ersätter |
|---------|---------|
| `db` | `POSTGRES_DSN` + `init_db()` (3 rader) |
| `artifact_root` | `ARTIFACT_ROOT` (2 rader) |
| `ingest_allowlist` | `AURORA_INGEST_PATH_ALLOWLIST` (2 rader) |
| `memory_enabled` | `MEMORY_ENABLED` + `RETRIEVAL_FEEDBACK_ENABLED` (2 rader) |

Körning #5 refaktorerade 3 filer (`test_queue.py`, `test_ingest_auto.py`, `test_retrieval_feedback.py`) — men den största filen lämnades orört.

---

## Uppgift

Refaktorera `tests/test_mcp_server.py` (813 rader, 34 tester) att använda conftest.py-fixtures.

### Varför prioritera denna fil

- **28 av 34 tester** upprepar `POSTGRES_DSN`/`init_db()`-mönstret
- Minst **84 rader boilerplate** kan elimineras
- Filen är 813 rader — tydligast reduceringseffekt i hela testsviten
- Conftest.py täcker exakt de mönster som används här

---

## Acceptanskriterier

1. **Alla 34 tester i `test_mcp_server.py` är gröna** efter refaktorering
2. **Hela testsviten (187 tester) är grön** — ingen regression
3. **28 tester** som använde `POSTGRES_DSN`/`init_db()`-mönstret **använder nu `db`-fixture** istället
4. **`from app.queue.db import init_db` är borttaget** från `test_mcp_server.py` (täcks av conftest)
5. **Minst 50 rader** har tagits bort netto (jämfört med original)
6. Tester som behöver `ARTIFACT_ROOT` använder `artifact_root`-fixture
7. Tester som behöver `AURORA_INGEST_PATH_ALLOWLIST` använder `ingest_allowlist`-fixture

---

## Begränsningar

- **Ändra BARA `tests/test_mcp_server.py`** — inga andra filer (conftest.py är redan klar)
- **Ändra inte testlogiken** — bara setup/boilerplate
- **Tester med extra env-variabler** (utöver det conftest täcker) behåller sina `monkeypatch.setenv()`-anrop för den extra variabeln

---

## Tekniska detaljer

### Befintlig conftest.py (att INTE ändra)

```python
# tests/conftest.py
@pytest.fixture
def db(tmp_path, monkeypatch):
    db_path = tmp_path / "queue.db"
    monkeypatch.setenv("POSTGRES_DSN", f"sqlite://{db_path}")
    init_db()
    yield db_path

@pytest.fixture
def artifact_root(tmp_path, monkeypatch):
    root = tmp_path / "artifacts"
    monkeypatch.setenv("ARTIFACT_ROOT", str(root))
    yield root

@pytest.fixture
def ingest_allowlist(tmp_path, monkeypatch):
    monkeypatch.setenv("AURORA_INGEST_PATH_ALLOWLIST", str(tmp_path))
    yield tmp_path

@pytest.fixture
def memory_enabled(monkeypatch):
    monkeypatch.setenv("MEMORY_ENABLED", "1")
    monkeypatch.setenv("RETRIEVAL_FEEDBACK_ENABLED", "1")
```

### Förväntad refaktorering (exempel)

**Före:**
```python
def test_mcp_tools_list(tmp_path, monkeypatch):
    db_path = tmp_path / "queue.db"
    monkeypatch.setenv("POSTGRES_DSN", f"sqlite://{db_path}")
    init_db()
    # ... test logic
```

**Efter:**
```python
def test_mcp_tools_list(db):
    # ... test logic
```

---

## Verifiering

Researcher bör kartlägga:
1. Vilka av de 34 testerna behöver enbart `db`?
2. Vilka behöver `db` + `artifact_root`?
3. Vilka behöver `db` + `ingest_allowlist`?
4. Har något test extra `monkeypatch.setenv()` utöver conftest-mönstren?

Kör baseline-tester **innan** ändringar: `python -m pytest tests/test_mcp_server.py -x -q`
Kör **efter** ändringar: `python -m pytest tests/ -x -q`

---

## Rollor

- **Researcher:** Kartlägg alla 34 tester, klassificera vilka fixtures varje test behöver
- **Implementer:** Refaktorera `tests/test_mcp_server.py` — ersätt boilerplate med fixtures
- **Tester:** Kör `python -m pytest tests/ -x -q` och verifierar alla 187 tester gröna
- **Reviewer:** Verifiera med `git diff` + baseline-jämförelse (git stash-teknik från körning #5)
- **Merger:** Commit + merge till aurora-swarm-lab main
- **Historian:** Dokumentera i memory/runs.md
