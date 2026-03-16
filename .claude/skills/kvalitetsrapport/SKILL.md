---
name: kvalitetsrapport
description: Generera en kvalitetsrapport för kunskapsbasen genom
  att kontrollera källors färskhet, korsreferensintegritet och
  confidence-historik. Identifiera problem och föreslå åtgärder.
---

# Kvalitetsrapport

## När ska denna skill användas?
- Användaren vill veta hur det står till med kunskapsbasens kvalitet
- Användaren misstänker att källor är föråldrade
- Användaren vill identifiera svaga eller opålitliga kunskapsnoder
- Regelbunden kvalitetskontroll (t.ex. veckovis)

## Steg

### 1. Kontrollera källors färskhet
Använd `aurora_freshness` med action `report` (och valfritt topic-filter). Resultatet visar vilka källor som är aktuella, vilka som börjar bli gamla och vilka som behöver uppdateras.

### 2. Kontrollera korsreferensintegritet
Använd `aurora_cross_ref` med action `integrity` för att identifiera brutna kopplingar, saknade referenser och inkonsistenser mellan kunskapsnoder.

### 3. Granska confidence-historik för svaga noder
Baserat på resultaten från steg 1 och 2, identifiera noder med låg confidence eller negativ trend. Använd `aurora_confidence_history` för dessa noder för att se hur deras pålitlighet har utvecklats över tid.

### 4. Iterera vid problem
Om steg 1–3 avslöjar problem:
- **Föråldrade källor:** Föreslå vilka URL:er som bör indexeras om (via `aurora_ingest_url`)
- **Brutna korsreferenser:** Lista vilka kopplingar som behöver repareras
- **Sjunkande confidence:** Identifiera orsaken — saknas nyare källor? Motsäger sig källorna?
- Presentera en prioriterad åtgärdslista

### 5. Sammanställ rapport
Presentera en samlad kvalitetsrapport med:
- Övergripande hälsostatus (🟢 / 🟡 / 🔴)
- Antal kontrollerade noder och källor
- Identifierade problem per kategori
- Prioriterad åtgärdslista

## Input
- **topic** (valfritt): Begränsa rapporten till ett specifikt ämnesområde. Om utelämnat granskas hela kunskapsbasen.

## Output
En strukturerad kvalitetsrapport med:
- Hälsostatus per kategori (färskhet, integritet, confidence)
- Lista över identifierade problem
- Prioriterade åtgärdsförslag
- Trend jämfört med tidigare (om historik finns)

## Mönster
- **Iterative Refinement** — kontrollera, identifiera problem, föreslå åtgärder, upprepa vid behov

## MCP-servrar som används
- `aurora-quality` — källfärskhet, korsreferensintegritet och confidence-historik
