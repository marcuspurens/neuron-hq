# Brief: Mypy hot-path fixes — route.py + readable_text.py
**Datum:** 2026-02-23
**Target:** aurora-swarm-lab
**Körning:** #9

---

## Bakgrund

Aurora-swarm-lab har 0 ruff-fel och 187 gröna tester, men kvarstående mypy-fel i två filer.
Dessa är inte kosmetiska — en av dem är en **riktig runtime-krasch**.

---

## Uppgifter

### Uppgift 1 — Fixa `app/modules/swarm/route.py` (9 mypy-fel)

**Baseline mypy-output (faktisk, kördes 2026-02-23):**
```
app/modules/swarm/route.py:87: error: Incompatible types in assignment (expression has type "str", target has type "list[str]")
app/modules/swarm/route.py:89: error: Incompatible types in assignment (expression has type "str", target has type "list[str]")
app/modules/swarm/route.py:91: error: Incompatible types in assignment (expression has type "str", target has type "list[str]")
app/modules/swarm/route.py:93: error: Incompatible types in assignment (expression has type "str", target has type "list[str]")
app/modules/swarm/route.py:95: error: Incompatible types in assignment (expression has type "str", target has type "list[str]")
app/modules/swarm/route.py:97: error: Incompatible types in assignment (expression has type "str", target has type "list[str]")
app/modules/swarm/route.py:99: error: Incompatible types in assignment (expression has type "str", target has type "list[str]")
app/modules/swarm/route.py:101: error: Incompatible types in assignment (expression has type "str", target has type "list[str]")
app/modules/swarm/route.py:132: error: No overload variant of "int" matches argument type "object"
```

Läs filen, förstå kontexten, och fixa på rätt sätt:
- Rad 87–101: Antingen är typ-annotationen fel (ändra `list[str]` → `str`) eller tilldelningen fel (wrappa i `[...]`). Läs logiken och välj rätt.
- Rad 132: `int()`-anropet får ett `object` — cast eller type-guard behövs.

### Uppgift 2 — Fixa `app/modules/scrape/readable_text.py` (2 mypy-fel + runtime-krasch)

**Baseline mypy-output:**
```
app/modules/scrape/readable_text.py:64: error: "_TextExtractor" has no attribute "unescape"
app/modules/scrape/readable_text.py:69: error: "_TextExtractor" has no attribute "unescape"
```

`self.unescape()` **togs bort från HTMLParser i Python 3.9**. Projektet kräver Python ≥ 3.10.
Det betyder att all HTML med entiteter (`&amp;`, `&#169;` etc.) **kraschar vid runtime** med `AttributeError`.

Fix:
```python
from html import unescape
# ...
# Ersätt self.unescape(...) med html.unescape(...)
```

---

## Baseline (verifierad 2026-02-23)

```
git HEAD: 99f0168
python -m pytest tests/ -x -q → 187 passed
python -m ruff check . → (inga fel)
python -m mypy app/modules/swarm/route.py --ignore-missing-imports → 9 errors (+ 1 i egress_policy.py)
python -m mypy app/modules/scrape/readable_text.py --ignore-missing-imports → 2 errors
```

---

## Acceptanskriterier

1. `python -m mypy app/modules/swarm/route.py --ignore-missing-imports` → **0 errors** i route.py
2. `python -m mypy app/modules/scrape/readable_text.py --ignore-missing-imports` → **0 errors**
3. `python -m pytest tests/ -x -q` → **187 passed** (inga regressioner)
4. `python -m ruff check .` → **inga fel**
5. Git commit med meddelandet `fix: resolve mypy errors in route.py and readable_text.py`
6. Bara `app/modules/swarm/route.py` och `app/modules/scrape/readable_text.py` ändras

---

## Begränsningar

- Ändra **bara** de två specificerade filerna
- Inga nya beroenden
- Inga stilistiska ändringar utanför de mypy-flaggade raderna
