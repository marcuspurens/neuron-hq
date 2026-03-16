---
name: korningsoversikt
description: Hämtar en komplett översikt av senaste körningar med kostnader, statistik och dashboard-vy.
---

# Körningsöversikt

## När ska denna skill användas?

- När användaren vill se en sammanfattning av senaste agentkörningar
- När man behöver kolla kostnader och resursförbrukning för körningar
- När man vill ha en snabb statusbild av Neuron-systemet
- När användaren frågar "vad har hänt?" eller "visa senaste körningarna"

## Steg

### 1. Hämta senaste körningar

Använd `neuron_runs` för att lista de senaste körningarna. Skicka med `count`-parametern (standard 5) för att begränsa antalet.

### 2. Hämta kostnadsinformation

Använd `neuron_costs` för att hämta kostnadsdata (tokens, API-anrop, total kostnad) för de körningar som returnerades i steg 1.

### 3. Beräkna statistik

Använd `neuron_run_statistics` för att hämta aggregerad statistik — genomsnittlig körtid, framgångsfrekvens, vanligaste felmönster.

### 4. Presentera dashboard

Använd `neuron_dashboard` för att hämta den övergripande dashboard-vyn och presentera allt som en sammanhängande rapport till användaren.

## Input

- **count** (valfritt): Antal körningar att inkludera. Standard: 5. Tillåtna värden: 1–50.

## Output

En strukturerad rapport i markdown som innehåller:

- Tabell med senaste körningar (ID, target, status, tid)
- Kostnadssammanfattning (tokens in/ut, total kostnad i SEK/USD)
- Statistiksammanfattning (framgångsfrekvens, genomsnittlig tid)
- Dashboard-highlight med systemstatus

## Mönster

**Sequential Workflow** — Varje steg bygger på föregående steg i en fast sekvens. Inga loopar eller villkorliga grenar.

## MCP-servrar som används

- `neuron-runs` — `neuron_runs`, `neuron_costs`
- `neuron-analytics` — `neuron_run_statistics`, `neuron_dashboard`
