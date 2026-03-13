import type { RunBelief, RunBeliefAudit } from '../core/run-statistics.js';

// RunSummary is not exported from run-statistics.ts, define locally
interface RunSummary {
  strongest: RunBelief[];
  weakest: RunBelief[];
  trending_up: RunBelief[];
  trending_down: RunBelief[];
}

export interface DashboardData {
  beliefs: RunBelief[];
  summary: RunSummary;
  historyMap: Record<string, RunBeliefAudit[]>;
}

const CHART_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
];

/** Escape HTML special characters to prevent XSS in rendered content. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format a confidence value as a percentage string like "72.5%". */
function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/** Return the CSS color for a confidence value. */
function confColor(c: number): string {
  if (c >= 0.7) return '#22c55e';
  if (c >= 0.4) return '#eab308';
  return '#ef4444';
}

/** Render the 4 summary cards or a "no data" message. */
function renderCards(beliefs: RunBelief[]): string {
  if (beliefs.length === 0) {
    return `<div class="no-data">No data available</div>`;
  }
  const avg = beliefs.reduce((s, b) => s + b.confidence, 0) / beliefs.length;
  const totalRuns = Math.max(...beliefs.map(b => b.total_runs), 0);
  const weak = beliefs.filter(b => b.confidence < 0.5).length;
  return `<div class="cards">
  <div class="card"><div class="card-value">${beliefs.length}</div><div class="card-label">Total Dimensions</div></div>
  <div class="card"><div class="card-value">${pct(avg)}</div><div class="card-label">Average Confidence</div></div>
  <div class="card"><div class="card-value">${totalRuns}</div><div class="card-label">Total Runs</div></div>
  <div class="card"><div class="card-value">${weak}</div><div class="card-label">Weak Dimensions</div></div>
</div>`;
}

/** Render the filterable belief table with inline filter script. */
function renderTable(beliefs: RunBelief[]): string {
  if (beliefs.length === 0) return '';
  const rows = beliefs
    .map(
      (b) =>
        `<tr>
  <td>${esc(b.dimension)}</td>
  <td style="color:${confColor(b.confidence)}">${b.confidence.toFixed(4)}</td>
  <td>${b.total_runs}</td>
  <td>${b.successes}</td>
  <td>${esc(b.last_updated)}</td>
</tr>`,
    )
    .join('\n');

  return `<div class="section">
<h2>Belief Table</h2>
<input type="text" id="belief-filter" placeholder="Filter dimensions..." />
<table id="belief-table">
<thead><tr><th>Dimension</th><th>Confidence</th><th>Runs</th><th>Successes</th><th>Last Updated</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<script>
document.getElementById('belief-filter').addEventListener('keyup', function() {
  var filter = this.value.toLowerCase();
  var rows = document.querySelectorAll('#belief-table tbody tr');
  for (var i = 0; i < rows.length; i++) {
    var dim = rows[i].cells[0].textContent.toLowerCase();
    rows[i].style.display = dim.indexOf(filter) !== -1 ? '' : 'none';
  }
});
</script>
</div>`;
}

/** Render the Chart.js confidence history chart or a fallback message. */
function renderChart(historyMap: Record<string, RunBeliefAudit[]>): string {
  const dims = Object.keys(historyMap);
  if (dims.length === 0) {
    return `<div class="section"><h2>Confidence History</h2><div class="no-data">No history data</div></div>`;
  }

  const datasets = dims.map((dim, i) => {
    const entries = [...historyMap[dim]].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const color = CHART_COLORS[i % CHART_COLORS.length];
    return {
      label: dim,
      data: entries.map((e) => ({ x: e.timestamp, y: e.new_confidence })),
      borderColor: color,
      backgroundColor: color,
      fill: false,
      tension: 0.3,
    };
  });

  return `<div class="section">
<h2>Confidence History</h2>
<canvas id="confidence-chart"></canvas>
<script>
new Chart(document.getElementById('confidence-chart'), {
  type: 'line',
  data: { datasets: ${JSON.stringify(datasets)} },
  options: {
    responsive: true,
    scales: {
      x: { type: 'category', ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      y: { min: 0, max: 1, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
    },
    plugins: { legend: { labels: { color: '#e2e8f0' } } }
  }
});
</script>
</div>`;
}

/** Render the trends section from the summary. */
function renderTrends(summary: RunSummary): string {
  const section = (emoji: string, title: string, items: RunBelief[], limit?: number): string => {
    const list = limit ? items.slice(0, limit) : items;
    const rows = list.length === 0
      ? '<li class="no-data">None</li>'
      : list.map((b) => `<li>${esc(b.dimension)} <span style="color:${confColor(b.confidence)}">${b.confidence.toFixed(4)}</span></li>`).join('\n');
    return `<div class="trend-col"><h3>${emoji} ${title}</h3><ul>${rows}</ul></div>`;
  };

  return `<div class="section">
<h2>Trends</h2>
<div class="trends">
${section('\u{1F3C6}', 'Strongest', summary.strongest, 5)}
${section('\u26A0\uFE0F', 'Weakest', summary.weakest, 5)}
${section('\u{1F4C8}', 'Trending Up', summary.trending_up)}
${section('\u{1F4C9}', 'Trending Down', summary.trending_down)}
</div>
</div>`;
}

/**
 * Render a complete HTML statistics dashboard from the given data.
 * Pure function — no I/O, returns a self-contained HTML string.
 */
export function renderDashboard(data: DashboardData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Neuron HQ \u2014 Statistics Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;padding:2rem}
h1{text-align:center;margin-bottom:1.5rem;font-size:1.8rem}
h2{margin-bottom:1rem;font-size:1.3rem;border-bottom:1px solid #334155;padding-bottom:.4rem}
h3{margin-bottom:.5rem}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}
.card{background:#1e293b;border-radius:8px;padding:1.5rem;text-align:center}
.card-value{font-size:2rem;font-weight:700;color:#38bdf8}
.card-label{font-size:.85rem;color:#94a3b8;margin-top:.3rem}
.section{background:#1e293b;border-radius:8px;padding:1.5rem;margin-bottom:1.5rem}
#belief-filter{width:100%;padding:.5rem .75rem;margin-bottom:1rem;border:1px solid #334155;border-radius:6px;background:#0f172a;color:#e2e8f0;font-size:.95rem}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:.5rem .75rem;border-bottom:1px solid #334155}
th{color:#94a3b8;font-size:.8rem;text-transform:uppercase}
.trends{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem}
.trend-col ul{list-style:none;padding:0}
.trend-col li{padding:.25rem 0;font-size:.9rem}
.no-data{color:#94a3b8;font-style:italic;padding:1rem;text-align:center}
canvas{max-height:400px}
</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
<h1>Neuron HQ \u2014 Statistics Dashboard</h1>
${renderCards(data.beliefs)}
${renderTable(data.beliefs)}
${renderChart(data.historyMap)}
${renderTrends(data.summary)}
</body>
</html>`;
}
