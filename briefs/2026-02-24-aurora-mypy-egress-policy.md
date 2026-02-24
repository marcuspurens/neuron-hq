# Brief: mypy-fix egress_policy.py
**Datum:** 2026-02-24
**Target:** aurora-swarm-lab
**Körning:** #10

---

## Bakgrund

`app/modules/privacy/egress_policy.py` har ett mypy-fel:

```
app/modules/privacy/egress_policy.py:104: error: Name "reason_codes" already defined on line 65  [no-redef]
```

Variabeln `reason_codes` definieras tre gånger i samma funktion (rad 65, 84, 104) i olika if-grenar. Mypy tolkar detta som en omdefinition (`no-redef`). Det är samma mönster som fixades i `route.py` (körning #9) med `# type: ignore[no-redef]`.

---

## Uppgift

Lägg till `# type: ignore[no-redef]` på **rad 84** och **rad 104** i `app/modules/privacy/egress_policy.py`.

```python
# rad 84 — ändra från:
        reason_codes = ["allow.egress_policy_off"]
# till:
        reason_codes = ["allow.egress_policy_off"]  # type: ignore[no-redef]

# rad 104 — ändra från:
    reason_codes: List[str] = [mode_reason] if mode_reason else []
# till:
    reason_codes: List[str] = [mode_reason] if mode_reason else []  # type: ignore[no-redef]
```

---

## Baseline (verifierad 2026-02-24)

```
python -m pytest tests/ -x -q → 187 passed
python -m mypy app/modules/privacy/egress_policy.py --ignore-missing-imports → 1 error (no-redef)
```

---

## Acceptanskriterier

1. `python -m mypy app/modules/privacy/egress_policy.py --ignore-missing-imports` → **0 errors**
2. `python -m pytest tests/ -x -q` → **187 passed** (inga tester bryts)
3. Bara `app/modules/privacy/egress_policy.py` ändras — 2 rader modifierade
4. Git commit: `fix: suppress mypy no-redef for reason_codes in egress_policy`

---

## Begränsningar

- Rör **bara** `app/modules/privacy/egress_policy.py`
- Inga funktionella ändringar — bara type: ignore-kommentarer
- Ingen refaktorering
