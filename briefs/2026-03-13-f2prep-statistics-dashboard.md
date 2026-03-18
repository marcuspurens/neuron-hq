# F2-prep: Statistik-dashboard (HTML)

## Bakgrund

Neuron HQ har sedan F1 (session 80) ett Bayesiskt statistiksystem som spårar körningsprestanda per dimension (agent, brief-typ, target, modell). Data nås idag via:

- **CLI:** `npx tsx src/cli.ts statistics` — textutskrift i terminalen
- **MCP:** `neuron_run_statistics` — JSON-svar

Men det saknas en visuell översikt. Inför F2 (adaptiv Manager) behövs ett dashboard som gör det enkelt att se trender och identifiera svaga dimensioner — både för användaren och som underlag för Managerns framtida beslut.

### Tillgängliga data (från `src/core/run-statistics.ts`)

| Funktion | Returnerar |
|----------|-----------|
| `getBeliefs(filter?)` | Alla beliefs: dimension, confidence, total_runs, successes |
| `getBeliefHistory(dimension)` | Audit-trail: old/new confidence, success, weight, evidence per körning |
| `getSummary()` | Strongest/weakest/trending_up/trending_down (topp 5 vardera) |

## Uppgifter

### 1. Ny CLI-kommando: `npx tsx src/cli.ts dashboard`

Genererar en statisk HTML-fil (`runs/dashboard.html`) och öppnar den i webbläsaren.

**Registrera i `src/cli.ts`:**

```typescript
program
  .command('dashboard')
  .description('Generate statistics dashboard (HTML)')
  .option('--no-open', 'Do not open in browser')
  .action(dashboardCommand);
```

### 2. Skapa `src/commands/dashboard.ts`

Huvudlogik:

```typescript
export async function dashboardCommand(options: { open?: boolean }): Promise<void> {
  // 1. Hämta data
  const beliefs = await getBeliefs();
  const summary = await getSummary();
  // Hämta history för top 10 dimensioner
  const historyMap: Record<string, RunBeliefAudit[]> = {};
  for (const b of beliefs.slice(0, 10)) {
    historyMap[b.dimension] = await getBeliefHistory(b.dimension, 50);
  }
  // 2. Generera HTML
  const html = renderDashboard({ beliefs, summary, historyMap });
  // 3. Skriv till runs/dashboard.html
  await fs.writeFile(outPath, html);
  // 4. Öppna i browser (om --no-open inte satt)
  if (options.open !== false) {
    exec(`open "${outPath}"`);  // macOS
  }
}
```

### 3. Skapa `src/commands/dashboard-template.ts`

En ren funktion som tar data och returnerar en HTML-sträng. Ingen I/O.

**Sektioner i dashboarden:**

#### A. Sammanfattningskort (överst)
4 kort i en rad:
- Totalt antal dimensioner
- Genomsnittlig confidence
- Antal körningar (max av total_runs)
- Antal dimensioner med confidence < 0.5

#### B. Confidence-tabell
Sorterad tabell med alla beliefs:
- Dimension, Confidence (med färg: grön ≥0.7, gul ≥0.4, röd <0.4), Körningar, Lyckade, Senast uppdaterad
- Filtrerbar via sökfält (JavaScript, client-side)

#### C. Confidence-historik (linjediagram)
- Chart.js via CDN (`https://cdn.jsdelivr.net/npm/chart.js`)
- Visar confidence över tid för top 10 dimensioner
- En linje per dimension
- X-axel: tidpunkt, Y-axel: confidence (0–1)

#### D. Trender (summary)
Fyra listor baserade på `getSummary()`:
- 🏆 Starkast (topp 5)
- ⚠️ Svagast (topp 5)
- 📈 Uppåttrend
- 📉 Nedåttrend

### 4. Nytt MCP-tool: `neuron_dashboard`

Registrera i `src/mcp/tools/dashboard.ts`:

```typescript
server.tool(
  'neuron_dashboard',
  'Generate and return the Neuron statistics dashboard as HTML',
  {},
  async () => {
    const html = renderDashboard(await collectDashboardData());
    return { content: [{ type: 'text', text: html }] };
  },
);
```

Registrera i `src/mcp/server.ts`.

### 5. Tester

**`tests/commands/dashboard-template.test.ts`:**
- `renderDashboard()` med tom data → valid HTML med "no data"-meddelanden
- `renderDashboard()` med exempeldata → innehåller dimensionsnamn, confidence-värden
- Filtreringsfält finns i HTML
- Chart.js `<script>` finns i HTML
- Sammanfattningskort visar rätt siffror

**`tests/commands/dashboard.test.ts`:**
- Kommandot skriver fil till rätt path
- `--no-open` hoppar över browser

**`tests/mcp/tools/dashboard.test.ts`:**
- MCP-tool returnerar HTML-sträng

## Avgränsningar

- **Statisk HTML** — ingen server, ingen live-uppdatering. Genereras vid körning av kommandot.
- **Chart.js via CDN** — kräver internet för diagram. Tabeller fungerar offline.
- **Ingen autentisering** — lokal fil, ingen exponering.
- **Ingen ny databas-tabell** — använder enbart befintliga queries.
- **Inga ändringar i run-statistics.ts** — använd befintliga exporterade funktioner.

## Verifiering

```bash
pnpm typecheck
pnpm test
```

## Acceptanskriterier

| Krav | Verifiering |
|------|-------------|
| `dashboard-template.ts` renderar valid HTML med data | Tester |
| `dashboard` CLI-kommando registrerat | `npx tsx src/cli.ts dashboard --help` |
| `neuron_dashboard` MCP-tool registrerat | Grep i server.ts |
| Chart.js linjediagram för confidence-historik | HTML innehåller Chart.js-kod |
| Filtrerbar belief-tabell | HTML innehåller sökfält + JS |
| Sammanfattningskort med 4 KPIer | Tester |
| ≥10 nya tester | `pnpm test` |
| Alla befintliga 1798 tester gröna | `pnpm test` |
| Typecheck grönt | `pnpm typecheck` |

## Risk

**Låg.** Rent additiv — nya filer, inga ändringar i befintlig kod. Dashboard läser bara data, skriver inget.

**Rollback:** Ta bort de nya filerna + registreringsraden i cli.ts och server.ts.
