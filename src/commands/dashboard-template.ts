import type { DashboardData, RunSummary, ModelBreakdown, TokenUsage, KnowledgeStats, Contradiction } from './dashboard-data.js';
import type { RunBelief, RunBeliefAudit } from '../core/run-statistics.js';

// Re-export for backwards compatibility (tests import DashboardData from here)
export type { DashboardData };

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

/** Return the CSS color for a status string. */
function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s === 'GREEN') return '#22c55e';
  if (s === 'YELLOW') return '#eab308';
  if (s === 'RED') return '#ef4444';
  return '#94a3b8';
}

/** Format a USD cost value with $ and 2 decimals. */
function fmtCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

/** Format a large number with locale separators. */
function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
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

/** Render the filterable belief table with inline filter script and decay indicators. */
function renderTable(beliefs: RunBelief[], rawBeliefs?: RunBelief[]): string {
  if (beliefs.length === 0) return '';

  const rawMap = new Map<string, number>();
  if (rawBeliefs) {
    for (const rb of rawBeliefs) {
      rawMap.set(rb.dimension, rb.confidence);
    }
  }

  const rows = beliefs
    .map(
      (b) => {
        const raw = rawMap.get(b.dimension);
        const decayIndicator = raw !== undefined && raw !== b.confidence ? ' \u2193' : '';
        return `<tr>
  <td>${esc(b.dimension)}</td>
  <td style="color:${confColor(b.confidence)}">${b.confidence.toFixed(4)}${decayIndicator}</td>
  <td>${b.total_runs}</td>
  <td>${b.successes}</td>
  <td>${esc(b.last_updated)}</td>
</tr>`;
      },
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

/** Render contradictions section showing belief pairs with significant gaps. */
function renderContradictions(contradictions: Contradiction[]): string {
  if (!contradictions || contradictions.length === 0) {
    return '';
  }

  const rows = contradictions
    .map((c) => `<tr>
  <td>${esc(c.dimension1)}</td>
  <td style="color:${confColor(c.confidence1)}">${c.confidence1.toFixed(4)}</td>
  <td>${esc(c.dimension2)}</td>
  <td style="color:${confColor(c.confidence2)}">${c.confidence2.toFixed(4)}</td>
  <td>${c.gap.toFixed(4)}</td>
</tr>`)
    .join('\n');

  return `<div class="section">
<h2>\u26A1 Contradictions</h2>
<table>
<thead><tr><th>Dimension 1</th><th>Confidence</th><th>Dimension 2</th><th>Confidence</th><th>Gap</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`;
}

/** Render run overview: second row of cards + recent runs table. */
function renderRunOverview(data: DashboardData): string {
  const overview = data.runOverview;
  const tokenUsage = data.tokenUsage;
  const kStats = data.knowledgeStats;

  if (!overview || !tokenUsage || !kStats) {
    return '';
  }

  const greenPct = overview.totalRuns > 0
    ? `${(overview.greenCount / overview.totalRuns * 100).toFixed(1)}%`
    : 'N/A';
  const knowledgeNodes = kStats.neuronNodes + kStats.auroraNodes;

  const cards = `<div class="cards">
  <div class="card"><div class="card-value">${overview.totalRuns}</div><div class="card-label">Total Runs</div></div>
  <div class="card"><div class="card-value">${greenPct}</div><div class="card-label">GREEN %</div></div>
  <div class="card"><div class="card-value">${fmtCost(tokenUsage.totalCostUsd)}</div><div class="card-label">Total Cost</div></div>
  <div class="card"><div class="card-value">${knowledgeNodes}</div><div class="card-label">Knowledge Nodes</div></div>
</div>`;

  if (overview.recentRuns.length === 0) {
    return `${cards}
<div class="section">
<h2>Recent Runs</h2>
<div class="no-data">No run data available</div>
</div>`;
  }

  const rows = overview.recentRuns
    .map((run) => {
      const dateStr = run.date.length >= 10 ? run.date.substring(0, 10) : run.date;
      return `<tr>
  <td>${esc(dateStr)}</td>
  <td>${esc(run.runid)}</td>
  <td>${esc(run.target)}</td>
  <td><span class="status-badge" style="background:${statusColor(run.status)};color:#0f172a">${esc(run.status)}</span></td>
  <td>${esc(run.model)}</td>
  <td>${fmtNum(run.inputTokens)}</td>
  <td>${fmtNum(run.outputTokens)}</td>
  <td>${fmtCost(run.costUsd)}</td>
</tr>`;
    })
    .join('\n');

  return `${cards}
<div class="section">
<h2>Recent Runs</h2>
<table>
<thead><tr><th>Date</th><th>Run ID</th><th>Target</th><th>Status</th><th>Model</th><th>Tokens In</th><th>Tokens Out</th><th>Cost</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</div>`;
}

/** Render model breakdown table and cost bar chart. */
function renderModelBreakdown(models: ModelBreakdown[]): string {
  if (!models || models.length === 0) {
    return `<div class="section">
<h2>Model Breakdown</h2>
<div class="no-data">No model data available</div>
</div>`;
  }

  const rows = models
    .map(
      (m) => `<tr>
  <td>${esc(m.label)}</td>
  <td>${m.runs}</td>
  <td>${fmtNum(m.totalInputTokens)}</td>
  <td>${fmtNum(m.totalOutputTokens)}</td>
  <td>${fmtCost(m.totalCostUsd)}</td>
  <td>${fmtCost(m.avgCostPerRun)}</td>
</tr>`,
    )
    .join('\n');

  return `<div class="section">
<h2>Model Breakdown</h2>
<table>
<thead><tr><th>Model</th><th>Runs</th><th>Input Tokens</th><th>Output Tokens</th><th>Total Cost</th><th>Avg Cost/Run</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<canvas id="model-cost-chart"></canvas>
<script>
new Chart(document.getElementById('model-cost-chart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(models.map(m => m.label))},
    datasets: [{
      label: 'Total Cost (USD)',
      data: ${JSON.stringify(models.map(m => m.totalCostUsd))},
      backgroundColor: '#3b82f6'
    }]
  },
  options: {
    responsive: true,
    scales: {
      x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
      y: { ticks: { color: '#94a3b8', callback: function(v) { return '$' + v.toFixed(2); } }, grid: { color: '#334155' } }
    },
    plugins: { legend: { labels: { color: '#e2e8f0' } } }
  }
});
</script>
</div>`;
}

/** Render agent token usage doughnut chart and table. */
function renderAgentTokens(tokenUsage: TokenUsage): string {
  if (!tokenUsage || Object.keys(tokenUsage.byAgent).length === 0) {
    return `<div class="section">
<h2>Agent Token Usage</h2>
<div class="no-data">No agent data available</div>
</div>`;
  }

  const byAgent = tokenUsage.byAgent;
  const agents = Object.keys(byAgent);
  const agentTokens = agents.map(a => byAgent[a].input + byAgent[a].output);
  const grandTotal = agentTokens.reduce((s, t) => s + t, 0);
  const agentColors = CHART_COLORS.slice(0, agents.length);

  const rows = agents
    .map((agent, i) => {
      const entry = byAgent[agent];
      const total = agentTokens[i];
      const share = grandTotal > 0 ? (total / grandTotal * 100).toFixed(1) : '0.0';
      return `<tr>
  <td>${esc(agent)}</td>
  <td>${fmtNum(entry.input)}</td>
  <td>${fmtNum(entry.output)}</td>
  <td>${fmtCost(entry.cost)}</td>
  <td>${share}%</td>
</tr>`;
    })
    .join('\n');

  const totalCost = agents.reduce((s, a) => s + byAgent[a].cost, 0);
  const totalInput = agents.reduce((s, a) => s + byAgent[a].input, 0);
  const totalOutput = agents.reduce((s, a) => s + byAgent[a].output, 0);

  return `<div class="section">
<h2>Agent Token Usage</h2>
<canvas id="agent-token-chart"></canvas>
<script>
new Chart(document.getElementById('agent-token-chart'), {
  type: 'doughnut',
  data: {
    labels: ${JSON.stringify(agents)},
    datasets: [{ data: ${JSON.stringify(agentTokens)}, backgroundColor: ${JSON.stringify(agentColors)} }]
  },
  options: {
    responsive: true,
    plugins: { legend: { labels: { color: '#e2e8f0' } } }
  }
});
</script>
<table>
<thead><tr><th>Agent</th><th>Input Tokens</th><th>Output Tokens</th><th>Cost (USD)</th><th>Share (%)</th></tr></thead>
<tbody>
${rows}
<tr style="font-weight:700;border-top:2px solid #334155">
  <td>Total</td>
  <td>${fmtNum(totalInput)}</td>
  <td>${fmtNum(totalOutput)}</td>
  <td>${fmtCost(totalCost)}</td>
  <td>100.0%</td>
</tr>
</tbody>
</table>
</div>`;
}

/** Render knowledge graph statistics cards. */
function renderKnowledgeStats(stats: KnowledgeStats): string {
  if (!stats) return '';

  return `<div class="section">
<h2>Knowledge Graph</h2>
<div class="cards">
  <div class="card"><div class="card-value">${stats.neuronNodes}</div><div class="card-label">Neuron Nodes</div></div>
  <div class="card"><div class="card-value">${stats.auroraNodes}</div><div class="card-label">Aurora Nodes</div></div>
  <div class="card"><div class="card-value">${stats.neuronEdges}</div><div class="card-label">Neuron Edges</div></div>
  <div class="card"><div class="card-value">${stats.auroraEdges}</div><div class="card-label">Aurora Edges</div></div>
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
.status-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.8rem;font-weight:600}
.cards-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:2rem}
</style>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
<h1>Neuron HQ \u2014 Statistics Dashboard</h1>
${renderCards(data.beliefs)}
${renderRunOverview(data)}
${renderTable(data.beliefs, data.rawBeliefs)}
${renderChart(data.historyMap)}
${renderTrends(data.summary)}
${renderContradictions(data.contradictions)}
${renderModelBreakdown(data.modelBreakdown)}
${renderAgentTokens(data.tokenUsage)}
${renderKnowledgeStats(data.knowledgeStats)}
</body>
</html>`;
}
