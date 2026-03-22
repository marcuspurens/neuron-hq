#!/usr/bin/env python3
"""Patch historian.md to insert the new Grafens hälsokontroll step."""

import sys

TARGET = "/Users/mpmac/Documents/VS Code/neuron-hq/workspaces/20260322-1724-neuron-hq/neuron-hq-task-T6/prompts/historian.md"

NEW_STEP = """\n10. **Grafens hälsokontroll** (varje körning):
    - Läs `graph-health.md` från körningens runs-katalog (genererad som pre-step i run.ts)
    - Om status är GREEN: notera kort i körningssammanfattningen ("Grafstatus: 🟢")
    - Om status är YELLOW: notera i sammanfattningen med vilka checks som är YELLOW
    - Om status är RED: skriv en separat error-post med detaljer
    - Inkludera alltid rekommendationerna i sammanfattningens "Lärdomar"
    - Toolet `graph_health_check` finns tillgängligt om du vill köra en ny check (rapporten kan ha genererats innan agenter ändrade grafen)\n"""

with open(TARGET, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Rename old step 10 (Stop) to step 11
if '10. **Stop.**' not in content:
    print("ERROR: Could not find '10. **Stop.**'", file=sys.stderr)
    sys.exit(1)

content = content.replace('10. **Stop.**', '11. **Stop.**', 1)

# 2. Insert new step 10 just before the now-renamed step 11
# The block ends with confidence text and then blank line before 11. **Stop.**
# We want to insert NEW_STEP immediately before '11. **Stop.**'
if '11. **Stop.**' not in content:
    print("ERROR: Could not find '11. **Stop.**' after rename", file=sys.stderr)
    sys.exit(1)

content = content.replace('11. **Stop.**', NEW_STEP + '11. **Stop.**', 1)

# 3. Update Prioritetsordning: add new step reference after Skeptiker-granskning line
OLD_PRIO = '4. Skeptiker-granskning (steg 9)\n5. Metrics-analys, task scores, cross-ref'
NEW_PRIO = '4. Skeptiker-granskning (steg 9)\n5. Grafens hälsokontroll (steg 10)\n6. Metrics-analys, task scores, cross-ref'

if OLD_PRIO not in content:
    print("WARNING: Could not find prioritetsordning pattern — skipping that update")
else:
    content = content.replace(OLD_PRIO, NEW_PRIO, 1)

with open(TARGET, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done. Patch applied successfully.")
