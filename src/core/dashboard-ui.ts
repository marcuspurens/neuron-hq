/**
 * Live dashboard UI renderer.
 *
 * Returns a complete HTML document string for the live SSE-powered dashboard.
 * Follows the same pattern as src/commands/dashboard-template.ts — everything
 * inline (CSS + JS), no external dependencies.
 */

/** Escape HTML special characters to prevent XSS. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a complete HTML document for the live dashboard UI.
 *
 * The page uses EventSource('/events') for SSE and auto-reconnects.
 * Dark theme with control-room feel.
 */
export function renderLiveDashboard(runid: string): string {
  const safeRunid = esc(runid);
  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>NEURON HQ — ${safeRunid}</title>
<style>
${renderCSS()}
</style>
</head>
<body>
<div id="reconnect-banner" class="reconnect-banner">&Aring;teransluten &mdash; visar historik</div>
<div id="warning-banner" class="warning-banner"></div>
${renderHeaderHTML(safeRunid)}
${renderRunLibraryHTML(safeRunid)}
<div id="digest-view" class="digest-view"></div>
<div id="live-content">
${renderAgentTilesHTML()}
${renderTaskListHTML()}
${renderStoplightHTML()}
${renderEventLogHTML()}
</div>
<script>
${renderJS()}
</script>
</body>
</html>`;
}

function renderCSS(): string {
  return `*{margin:0;padding:0;box-sizing:border-box}
body{background:#0f172a;color:#e2e8f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5}
.container{max-width:1200px;margin:0 auto;padding:16px}
.header{background:#1e293b;border-bottom:2px solid #334155;padding:12px 24px;display:flex;flex-wrap:wrap;align-items:center;gap:16px;position:sticky;top:0;z-index:10}
.header h1{font-size:1.1rem;letter-spacing:1px;color:#38bdf8;flex-shrink:0}
.header .stats{display:flex;gap:16px;flex-wrap:wrap;font-size:0.9rem;color:#94a3b8}
.header .stats span{white-space:nowrap}
h2{font-size:1rem;color:#94a3b8;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px}
.section{margin-bottom:24px}
.agent-tiles{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px}
.agent-tile{background:#1e293b;border:1px solid #334155;border-radius:8px;width:250px;padding:12px;transition:border-color 0.3s}
.agent-tile.aktiv{border-color:#22c55e}
.agent-tile.kor{border-color:#eab308}
.agent-tile.klar{border-color:#334155;opacity:0.7}
.agent-tile .name{font-weight:600;font-size:0.95rem;margin-bottom:4px}
.agent-tile .status{font-size:0.8rem;margin-bottom:4px}
.agent-tile .task-info{font-size:0.75rem;color:#94a3b8;margin-bottom:4px}
.agent-tile .agent-stats{font-size:0.75rem;color:#94a3b8;margin-bottom:4px}
.agent-tile .status-line{font-size:0.75rem;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:230px;min-height:1.2em;transition:opacity 0.3s}
.agent-tile .thinking-toggle{cursor:pointer;font-size:0.75rem;color:#a78bfa;user-select:none;display:none}
.agent-tile .thinking-content{max-height:0;overflow:hidden;transition:max-height 0.3s;font-family:'Menlo','Consolas',monospace;font-size:0.7rem;color:#cbd5e1;font-style:italic;background:#1a2332;border-radius:4px;padding:0 8px;white-space:pre-wrap;word-break:break-all}
.agent-tile .thinking-content.open{max-height:200px;overflow-y:auto;padding:8px}
.reconnect-banner{position:fixed;top:0;left:0;right:0;background:#7c3aed;color:white;text-align:center;padding:8px;font-size:0.85rem;z-index:100;transition:opacity 0.5s;opacity:0;pointer-events:none}
.reconnect-banner.visible{opacity:1}
.warning-banner{position:fixed;top:0;left:0;right:0;background:#f59e0b;color:#0f172a;text-align:center;padding:12px 20px;font-size:0.9rem;font-weight:600;z-index:101;display:none;box-shadow:0 2px 8px rgba(0,0,0,0.3)}
.warning-banner.visible{display:block}
.task-list{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;margin-bottom:24px}
.task-list .task-item{padding:4px 0;font-size:0.85rem;border-bottom:1px solid #1e293b}
.stoplight-section{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;margin-bottom:24px;text-align:center;font-size:1.1rem;font-weight:600;transition:background-color 0.5s}
.event-log{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;max-height:300px;overflow-y:auto;font-family:'Menlo','Consolas',monospace;font-size:0.75rem}
.event-log .entry{padding:2px 0;border-bottom:1px solid #0f172a}
.event-log .ts{color:#64748b;margin-right:8px}
.green{color:#22c55e}.yellow{color:#eab308}.red{color:#ef4444}
.run-library{position:relative;margin-bottom:16px}
.run-selector{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px 16px;cursor:pointer;display:flex;align-items:center;gap:8px;user-select:none}
.run-selector:hover{border-color:#38bdf8}
.live-dot{width:8px;height:8px;background:#22c55e;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
.dropdown-arrow{margin-left:auto;color:#64748b;font-size:0.8rem}
.run-dropdown{position:absolute;top:100%;left:0;right:0;background:#1e293b;border:1px solid #334155;border-radius:0 0 8px 8px;max-height:400px;overflow-y:auto;z-index:20}
.run-dropdown .run-item{padding:8px 16px;cursor:pointer;display:flex;justify-content:space-between;font-size:0.85rem;border-bottom:1px solid #0f172a}
.run-dropdown .run-item:hover{background:#334155}
.run-dropdown .run-item .stoplight-badge{font-size:0.75rem}
.digest-view{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:16px;margin-bottom:24px;font-size:0.9rem;white-space:pre-wrap;display:none}
.decision-detail{background:#1a2332;border-left:3px solid #38bdf8;margin:2px 0;padding:8px 12px;font-size:0.75rem;cursor:pointer}
.decision-detail .detail-expand{display:none;margin-top:8px;padding:8px;background:#0f172a;border-radius:4px}
.decision-detail.expanded .detail-expand{display:block}
.decision-detail .detail-row{padding:2px 0;color:#94a3b8}
.decision-detail .detail-row .label{color:#38bdf8;margin-right:6px}
.decision-detail .confidence-high{color:#22c55e}
.decision-detail .confidence-medium{color:#eab308}
.decision-detail .confidence-low{color:#ef4444}
.agent-dialog{background:#1e293b;border-left:3px solid #a78bfa;margin:2px 0;padding:6px 12px;font-size:0.75rem}
.agent-dialog .dialog-from{color:#38bdf8;font-weight:600}
.agent-dialog .dialog-to{color:#a78bfa;font-weight:600}
.agent-dialog .dialog-msg{color:#cbd5e1;margin-left:8px}
.explanation-toggle{background:#334155;border:1px solid #475569;color:#e2e8f0;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:0.75rem;margin-left:auto}
.explanation-toggle:hover{background:#475569}
.explanation-toggle.simple .tech-text{display:none}
.explanation-toggle.simple .simple-text{display:inline}
.explanation-toggle.technical .simple-text{display:none}
.explanation-toggle.technical .tech-text{display:inline}
.log-filters{display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.filter-btn{background:#334155;border:1px solid #475569;color:#94a3b8;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:0.75rem}
.filter-btn:hover{background:#475569}
.filter-btn.active{background:#38bdf8;color:#0f172a;border-color:#38bdf8}
.log-entry{padding:4px 0;border-bottom:1px solid #0f172a;cursor:pointer}
.log-entry:hover{background:#1a2332}
.log-entry .expand-arrow{display:inline-block;transition:transform 0.2s;margin-right:4px;font-size:0.65rem;color:#64748b}
.log-entry.expanded .expand-arrow{transform:rotate(90deg)}
.log-detail{display:none;padding:4px 0 8px 28px;font-size:0.7rem;color:#94a3b8;background:#0f172a;border-radius:0 0 4px 4px;margin-bottom:2px}
.log-entry.expanded+.log-detail{display:block}
.log-detail .detail-row{padding:2px 0}
.log-detail .detail-row .label{color:#38bdf8;margin-right:6px}
.log-group{padding:4px 0;border-bottom:1px solid #0f172a;cursor:pointer}
.log-group:hover{background:#1a2332}
.event-log[data-filter="handlingar"] .log-entry:not([data-category="handling"]),.event-log[data-filter="handlingar"] .log-detail:not([data-category="handling"]),.event-log[data-filter="handlingar"] .log-group:not([data-category="handling"]),.event-log[data-filter="handlingar"] .decision-detail:not([data-category="handling"]),.event-log[data-filter="handlingar"] .agent-dialog:not([data-category="handling"]){display:none}
.event-log[data-filter="filer"] .log-entry:not([data-category="fil"]),.event-log[data-filter="filer"] .log-detail:not([data-category="fil"]),.event-log[data-filter="filer"] .log-group:not([data-category="fil"]),.event-log[data-filter="filer"] .decision-detail:not([data-category="fil"]),.event-log[data-filter="filer"] .agent-dialog:not([data-category="fil"]){display:none}
.event-log[data-filter="tester"] .log-entry:not([data-category="test"]),.event-log[data-filter="tester"] .log-detail:not([data-category="test"]),.event-log[data-filter="tester"] .log-group:not([data-category="test"]),.event-log[data-filter="tester"] .decision-detail:not([data-category="test"]),.event-log[data-filter="tester"] .agent-dialog:not([data-category="test"]){display:none}
.event-log[data-filter="beslut"] .log-entry:not([data-category="beslut"]),.event-log[data-filter="beslut"] .log-detail:not([data-category="beslut"]),.event-log[data-filter="beslut"] .decision-detail:not([data-category="beslut"]),.event-log[data-filter="beslut"] .agent-dialog:not([data-category="beslut"]){display:none}`;
}

function renderHeaderHTML(safeRunid: string): string {
  return `<div class="header">
<h1>NEURON HQ &mdash; K&ouml;rning ${safeRunid}</h1>
<div class="stats">
<span id="timer">\u23F1 00:00 / --:--</span>
<span id="task-count">\uD83D\uDCCB 0/0 uppgifter</span>
<span id="tokens">\uD83D\uDCCA 0 in \u00B7 0 ut</span>
<span id="cost">\uD83D\uDCB0 $0.00</span>
<span id="latency">\u26A1 \u2014 tok/s</span>
</div>
<button id="explanation-toggle" class="explanation-toggle" onclick="toggleExplanation()">F\u00F6renklat l\u00E4ge \u2713</button>
</div>
<div class="container">`;
}

function renderRunLibraryHTML(safeRunid: string): string {
  return `<div id="run-library" class="run-library">
<div id="run-selector" class="run-selector" onclick="toggleRunDropdown()">
<span class="live-dot"></span>
<span id="run-selector-text">Current (live) &mdash; ${safeRunid}</span>
<span class="dropdown-arrow">&#9660;</span>
</div>
<div id="run-dropdown" class="run-dropdown" style="display:none"></div>
</div>`;
}

function renderAgentTilesHTML(): string {
  return `<div class="section">
<h2>Agenter</h2>
<div id="agent-tiles" class="agent-tiles"></div>
</div>`;
}

function renderTaskListHTML(): string {
  return `<div class="section">
<h2>Uppgifter</h2>
<div id="task-list" class="task-list">
<div class="task-item" style="color:#64748b">V&auml;ntar p&aring; uppgifter&hellip;</div>
</div>
</div>`;
}

function renderStoplightHTML(): string {
  return `<div id="stoplight" class="stoplight-section">
STOPLIGHT: &mdash;&mdash;&mdash; (v&auml;ntar)
</div>`;
}

function renderEventLogHTML(): string {
  return `<div class="section">
<h2>H&auml;ndelselogg <span id="log-pause-hint" style="font-size:0.7rem;color:#64748b">(klicka f&ouml;r att pausa auto-scroll)</span></h2>
<div class="log-filters">
<button class="filter-btn active" onclick="setLogFilter('alla')">Alla</button>
<button class="filter-btn" onclick="setLogFilter('handlingar')">Handlingar</button>
<button class="filter-btn" onclick="setLogFilter('filer')">Filer</button>
<button class="filter-btn" onclick="setLogFilter('tester')">Tester</button>
<button class="filter-btn" onclick="setLogFilter('beslut')">Beslut</button>
</div>
<div id="event-log" class="event-log" data-filter="alla"></div>
</div>
</div>`;
}

function renderJS(): string {
  return `(function(){
var totalIn=0,totalOut=0,totalCost=0;
var agents={};
var tasks={};
var taskDescriptions={};
var taskAgents={};
var taskWaves={};
var taskStartTimes={};
var logPaused=false;
var logEl=document.getElementById('event-log');
var runDropdownOpen=false;
var showingDigest=false;
var explanationMode='simple';
var timerElapsed=0,timerTotal=0,timerRunning=false;
var lastTokenTime=0,lastTokenOut=0;
setInterval(function(){
  if(!timerRunning)return;
  timerElapsed++;
  var em=Math.floor(timerElapsed/60),es=String(Math.floor(timerElapsed%60)).padStart(2,'0');
  var tm=Math.floor(timerTotal/60),ts2=String(Math.floor(timerTotal%60)).padStart(2,'0');
  document.getElementById('timer').textContent='\u23F1 '+String(em).padStart(2,'0')+':'+es+' / '+(timerTotal>0?String(tm).padStart(2,'0')+':'+ts2:'--:--');
},1000);

function cap(n){return n?n.charAt(0).toUpperCase()+n.slice(1):'Unknown';}

document.getElementById('log-pause-hint').addEventListener('click',function(e){e.stopPropagation();logPaused=!logPaused;
document.getElementById('log-pause-hint').textContent=logPaused?'(pausad)':'(klicka for att pausa auto-scroll)';});

function setLogFilter(f){
  logEl.setAttribute('data-filter',f);
  var btns=document.querySelectorAll('.filter-btn');
  for(var i=0;i<btns.length;i++){
    btns[i].classList.toggle('active',btns[i].textContent.toLowerCase()===f||(f==='alla'&&btns[i].textContent==='Alla'));
  }
}
window.setLogFilter=setLogFilter;

function fmtK(n){return n>=1000?(n/1000).toFixed(1)+'k':String(n);}

function narrateEvent(event,data){
switch(event){
case 'run:start':return '\\uD83D\\uDE80 K\\u00F6rning startad: '+(data.target||'ok\\u00E4nt')+' ('+(data.hours||'?')+' timme)';
case 'run:end':return '\\uD83C\\uDFC1 K\\u00F6rning avslutad ('+(data.duration||'?')+'s)';
case 'agent:start':return data.taskId?'\\uD83D\\uDC77 '+cap(data.agent)+' tar uppgift '+data.taskId:'\\uD83D\\uDCCB '+cap(data.agent)+' b\\u00F6rjar arbeta';
case 'agent:end':return data.error?'\\u274C '+cap(data.agent)+' avslutad med fel: '+data.error:'\\u2705 '+cap(data.agent)+' klar';
case 'agent:thinking':return '\\uD83E\\uDDE0 '+cap(data.agent)+' resonerar...';
case 'task:status':
if(data.status==='running')return '\\uD83D\\uDD04 Uppgift '+(data.taskId||'?')+' startar';
if(data.status==='completed')return '\\u2705 Uppgift '+(data.taskId||'?')+' klar';
if(data.status==='failed')return '\\u274C Uppgift '+(data.taskId||'?')+' misslyckades';
return '\\uD83D\\uDCCC Uppgift '+(data.taskId||'?')+': '+(data.status||'pending');
case 'stoplight':
if(data.status==='GREEN')return '\\uD83D\\uDFE2 STOPLIGHT: GREEN \\u2014 k\\u00F6rningen godk\\u00E4nd';
if(data.status==='YELLOW')return '\\uD83D\\uDFE1 STOPLIGHT: YELLOW \\u2014 delvis godk\\u00E4nd';
if(data.status==='RED')return '\\uD83D\\uDD34 STOPLIGHT: RED \\u2014 underk\\u00E4nd';
return '\\uD83D\\uDEA6 STOPLIGHT: '+(data.status||'UNKNOWN');
case 'audit':
if(data.allowed===false)return '\\uD83D\\uDEAB Policy blockerade: '+(data.reason||data.policy_event||'ok\\u00E4nd');
if(data.tool&&String(data.tool).startsWith('delegate_to_'))return '\\uD83D\\uDCE4 '+cap(data.role)+'\\u2192'+cap(String(data.tool).slice(12))+': delegering';
var t=data.tool?String(data.tool):'';
var ag=cap(data.role||data.agent);
var df=data.display_files||data.files_touched||[];
var fn=df.length>0?String(df[0]).split('/').pop():'ok\\u00E4nd fil';
var dc=data.display_command||data.note||'';
if(t==='read_file')return '\\uD83D\\uDCD6 '+ag+' l\\u00E4ser '+fn;
if(t==='write_file'){var adds=data.diff_stats&&data.diff_stats.additions?data.diff_stats.additions:0;return '\\u270F\\uFE0F '+ag+' skriver '+fn+' (+'+adds+' rader)';}
if(t==='bash_exec'){var cmd=dc.length>60?dc.substring(0,57)+'...':dc;return '\\u26A1 '+ag+' k\\u00F6r: '+cmd;}
if(t==='graph_query')return '\\uD83D\\uDD0D '+ag+' s\\u00F6ker i kunskapsgrafen';
if(t==='search_memory'){var sq=data.note||'';return '\\uD83E\\uDDE0 '+ag+' s\\u00F6ker minnet: \"'+sq+'\"';}
if(t==='write_task_plan'){var tc=data.task_count||0;return '\\uD83D\\uDCCB '+ag+' skapar plan med '+tc+' uppgifter';}
if(t==='delegate_parallel_wave'){var wn=data.wave||'?';return '\\uD83C\\uDF0A '+ag+' startar Wave '+wn;}
if(t==='copy_to_target')return '\\uD83D\\uDCC1 '+ag+' kopierar fil till target-repo';
if(t==='adaptive_hints'){var w=data.warnings||0;var s=data.strengths||0;return '\\uD83D\\uDCA1 '+ag+' f\\u00E5r '+w+' varningar, '+s+' styrkor';}
if(t==='agent_message'){var msg2=data.note||'';return '\\uD83D\\uDCAC '+ag+': \"'+(msg2.length>60?msg2.substring(0,57)+'...':msg2)+'\"';}
return null;
case 'task:plan':return '\\uD83D\\uDCCB Plan skapad med '+(data.tasks?data.tasks.length:'?')+' uppgifter';
case 'warning':return '\\u26A0\\uFE0F VARNING: '+(data.message||'Ok\\u00E4nd varning');
default:return null;}}

function getCategory(event,data){
  if(event==='decision')return 'beslut';
  if(event==='agent:start'||event==='agent:end'||event==='task:status'||event==='stoplight'||event==='run:start'||event==='run:end')return 'handling';
  if(event==='audit'){
    var t=data.tool?String(data.tool):'';
    if(t==='read_file'||t==='write_file'||t==='copy_to_target')return 'fil';
    if(t==='bash_exec'){var n=data.note||data.display_command||'';if(n.indexOf('vitest')>=0||n.indexOf('test')>=0)return 'test';return 'handling';}
    if(t.startsWith('delegate_to_'))return 'handling';
    return 'handling';
  }
  return 'handling';
}

var lastReadGroup=null;

function addLogEntry(event,data,ts){
var text=narrateEvent(event,data);
if(text===null)return;

if(event==='decision' && data.decision){
  var dec=data.decision;
  var d=document.createElement('div');d.className='decision-detail';d.setAttribute('data-category','beslut');
  var confClass=dec.confidence==='high'?'confidence-high':dec.confidence==='medium'?'confidence-medium':'confidence-low';
  var confEmoji=dec.confidence==='high'?'\u2705':dec.confidence==='medium'?'\u26A0\uFE0F':'\uD83D\uDD34';
  var confLabel=dec.confidence==='high'?'S\u00E4kert beslut':dec.confidence==='medium'?'Viss os\u00E4kerhet':'Os\u00E4kert beslut';
  var techWhat=esc(dec.what||'');
  var simpleWhat=techWhat.length>60?techWhat.substring(0,60)+'\u2026':techWhat;
  d.innerHTML='<span class="ts">'+ts.substring(11,19)+'</span> '
    +confEmoji+' <span class="'+confClass+'">'
    +(explanationMode==='simple'?simpleWhat:techWhat)+'</span>'
    +'<div class="detail-expand">'
    +'<div class="detail-row"><span class="label">Varf\u00F6r:</span> '+esc(dec.why||'Ingen f\u00F6rklaring')+'</div>'
    +(dec.alternatives&&dec.alternatives.length?'<div class="detail-row"><span class="label">Alternativ:</span> '+dec.alternatives.map(function(a){return esc(a);}).join(', ')+'</div>':'')
    +'<div class="detail-row"><span class="label">Confidence:</span> <span class="'+confClass+'">'+confLabel+'</span></div>'
    +(dec.outcome?'<div class="detail-row"><span class="label">Utfall:</span> '+(dec.outcome==='success'?'\u2705 Lyckades':dec.outcome==='failure'?'\u274C Misslyckades':dec.outcome==='partial'?'\u26A0\uFE0F Delvis':'\u23F3 P\u00E5g\u00E5r')+'</div>':'')
    +(dec.thinkingSnippet?'<div class="detail-row"><span class="label">Resonemang:</span> <em>'+esc(dec.thinkingSnippet.substring(0,200))+'</em></div>':'')
    +'</div>';
  d.addEventListener('click',function(){d.classList.toggle('expanded');});
  logEl.appendChild(d);
  while(logEl.children.length>200)logEl.removeChild(logEl.firstChild);
  if(!logPaused)logEl.scrollTop=logEl.scrollHeight;
  return;
}

if(event==='audit' && data.tool && String(data.tool).startsWith('delegate_to_')){
  var target=String(data.tool).slice(12);
  var from=data.role||data.agent||'unknown';
  var d2=document.createElement('div');d2.className='agent-dialog';d2.setAttribute('data-category','handling');
  var taskNote=data.task||data.note||'delegering';
  d2.innerHTML='<span class="ts">'+ts.substring(11,19)+'</span> '
    +'\uD83D\uDCE4 <span class="dialog-from">'+esc(cap(from))+'</span>'
    +' \u2192 <span class="dialog-to">'+esc(cap(target))+'</span>: '
    +'<span class="dialog-msg">'+esc(taskNote)+'</span>';
  logEl.appendChild(d2);
  while(logEl.children.length>200)logEl.removeChild(logEl.firstChild);
  if(!logPaused)logEl.scrollTop=logEl.scrollHeight;
  return;
}

// Smart grouping for sequential file reads
if(event==='audit'&&data.tool==='read_file'){
  var readAgent=cap(data.role||data.agent);
  var readFile=data.display_files&&data.display_files.length?String(data.display_files[0]):'ok\u00E4nd';
  var readTs=new Date(ts).getTime();
  if(lastReadGroup&&lastReadGroup.agent===readAgent&&(readTs-lastReadGroup.ts)<3000){
    lastReadGroup.files.push(readFile);
    lastReadGroup.ts=readTs;
    var fnames=lastReadGroup.files.map(function(f){return f.split('/').pop();});
    var shown=fnames.slice(0,3).join(', ');
    if(fnames.length>3)shown+=', ...';
    lastReadGroup.countEl.innerHTML='<span class="ts">'+ts.substring(11,19)+'</span> <span class="expand-arrow">\\u25B6</span> \\uD83D\\uDCD6 '+esc(readAgent)+' l\\u00E4ser '+lastReadGroup.files.length+' filer ('+esc(shown)+')';
    return;
  }
  lastReadGroup={agent:readAgent,ts:readTs,files:[readFile],el:null,countEl:null};
}else{
  lastReadGroup=null;
}

// Build detail data for expandable rows
var detail=null;
if(event==='audit'&&data.tool){
  detail={};
  var t2=String(data.tool);
  var ag2=cap(data.role||data.agent);
  if(t2==='read_file'||t2==='write_file'||t2==='copy_to_target'){
    detail.fil=data.display_files&&data.display_files.length?String(data.display_files[0]):'ok\u00E4nd';
    detail.agent=ag2;
    if(data.diff_stats)detail.diff_stats='+'+(data.diff_stats.additions||0)+' / -'+(data.diff_stats.deletions||0);
  } else if(t2==='bash_exec'){
    detail.kommando=data.display_command||data.note||'';
    detail.exit_code=typeof data.exit_code==='number'?(data.exit_code===0?'0 \\u2705':String(data.exit_code)+' \\u274C'):'ok\\u00E4nd';
    detail.agent=ag2;
  } else if(t2==='graph_query'||t2==='search_memory'){
    detail.agent=ag2;
  }
}

var cat=getCategory(event,data);
var d3=document.createElement('div');d3.className='log-entry';
d3.setAttribute('data-category',cat);
d3.innerHTML='<span class="ts">'+ts.substring(11,19)+'</span> <span class="expand-arrow">\\u25B6</span> '+esc(text);
d3.addEventListener('click',function(){d3.classList.toggle('expanded');});
logEl.appendChild(d3);

if(lastReadGroup&&event==='audit'&&data.tool==='read_file'){
  lastReadGroup.el=d3;lastReadGroup.countEl=d3;
}

if(detail){
  var dd=document.createElement('div');dd.className='log-detail';
  dd.setAttribute('data-category',cat);
  var html2='';
  for(var k in detail){
    if(detail.hasOwnProperty(k)){
      html2+='<div class="detail-row"><span class="label">'+esc(k)+':</span> '+esc(String(detail[k]))+'</div>';
    }
  }
  dd.innerHTML=html2;
  logEl.appendChild(dd);
}

while(logEl.children.length>200)logEl.removeChild(logEl.firstChild);
if(!logPaused)logEl.scrollTop=logEl.scrollHeight;}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function getOrCreateTile(name){
if(agents[name])return agents[name];
var t=document.createElement('div');t.className='agent-tile aktiv';
t.innerHTML='<div class="name">'+esc(name)+'</div>'
+'<div class="status"><span class="status-dot green">\\u25CF</span> <span class="status-text">Arbetar</span></div>'
+'<div class="task-info"></div>'
+'<div class="agent-stats"><span class="agent-iter"></span> <span class="agent-tokens"></span></div>'
+'<div class="status-line"></div>'
+'<div class="thinking-toggle">\\u25B6 Thinking</div>'
+'<div class="thinking-content"></div>';
t.querySelector('.thinking-toggle').addEventListener('click',function(){
var tc=t.querySelector('.thinking-content');tc.classList.toggle('open');
this.textContent=tc.classList.contains('open')?'\\u25BC Thinking':'\\u25B6 Thinking';});
document.getElementById('agent-tiles').appendChild(t);
agents[name]={el:t};
return agents[name];}

function updateTask(taskId,status,description,agent){
tasks[taskId]=status;
if(description)taskDescriptions[taskId]=description;
if(agent)taskAgents[taskId]=agent;
renderTasks();}

function renderTasks(){
var el=document.getElementById('task-list');el.innerHTML='';
var ids=Object.keys(tasks);
if(ids.length===0){el.innerHTML='<div class="task-item" style="color:#64748b">V\u00E4ntar p\u00E5 uppgifter\u2026</div>';return;}

// Group by wave
var waves={};
var noWave=[];
for(var i=0;i<ids.length;i++){
  var w=taskWaves[ids[i]];
  if(w!==undefined){if(!waves[w])waves[w]=[];waves[w].push(ids[i]);}
  else noWave.push(ids[i]);
}

function renderTaskItem(tid){
  var s=tasks[tid];
  var icon='\u23F3';
  if(s==='completed')icon='\u2705';else if(s==='running')icon='\uD83D\uDD04';else if(s==='failed')icon='\u274C';
  var desc=taskDescriptions[tid]?(' \u2014 '+taskDescriptions[tid]):'';
  var agent=taskAgents[tid]?('\uD83D\uDC77 '+cap(taskAgents[tid])):'\u2014';
  var timeStr='';
  if(s==='running'&&taskStartTimes[tid]){
    var elapsed=Math.round((Date.now()-taskStartTimes[tid])/60000);
    timeStr=' \u00B7 '+(elapsed>0?elapsed+' min':'p\u00E5g\u00E5r');
  } else if(s==='completed'&&taskStartTimes[tid]){
    var dur=Math.round((Date.now()-taskStartTimes[tid])/60000);
    timeStr=' \u00B7 '+dur+' min';
  }
  var div=document.createElement('div');div.className='task-item';
  div.innerHTML=icon+' '+esc(tid)+esc(desc)+'    '+esc(agent)+timeStr;
  return div;
}

var waveNums=Object.keys(waves).sort(function(a,b){return Number(a)-Number(b);});
for(var wi=0;wi<waveNums.length;wi++){
  var wn=waveNums[wi];
  var sep=document.createElement('div');
  sep.className='task-item';
  sep.style.color='#38bdf8';
  sep.style.fontWeight='600';
  sep.style.borderBottom='1px solid #334155';
  sep.textContent='\u2501\u2501\u2501 Wave '+wn+' \u2501\u2501\u2501';
  el.appendChild(sep);
  for(var ti=0;ti<waves[wn].length;ti++){
    el.appendChild(renderTaskItem(waves[wn][ti]));
  }
}
if(noWave.length>0){
  if(waveNums.length>0){
    var sep2=document.createElement('div');sep2.className='task-item';sep2.style.color='#38bdf8';sep2.style.fontWeight='600';sep2.style.borderBottom='1px solid #334155';sep2.textContent='\u2501\u2501\u2501 \u00D6vriga \u2501\u2501\u2501';
    el.appendChild(sep2);
  }
  for(var ni=0;ni<noWave.length;ni++){
    el.appendChild(renderTaskItem(noWave[ni]));
  }
}}

function handleEvent(event,data,ts){
addLogEntry(event,data,ts);
if(event==='run:start'){
timerRunning=true;
document.querySelector('.header h1').innerHTML='NEURON HQ &mdash; K\\u00F6rning '+esc(data.runid||'');}
else if(event==='agent:start'){
var tile=getOrCreateTile(data.agent||'unknown');
tile.el.className='agent-tile aktiv';
var statusText='aktiv';
if(data.taskId)statusText='Arbetar med '+data.taskId;
if(data.task)statusText+=': '+data.task;
tile.el.querySelector('.status').innerHTML='<span class="green">\\u25CF</span> <span class="status-text">'+esc(statusText)+'</span>';
if(data.taskId){tile.el.querySelector('.task-info').textContent='Task: '+data.taskId;taskAgents[data.taskId]=data.agent;}
var statusText=tile.el.querySelector('.status-text');
if(data.taskId && taskDescriptions[data.taskId]){
  statusText.textContent='Arbetar med '+data.taskId+': '+taskDescriptions[data.taskId];
} else if(data.taskId){
  statusText.textContent='Arbetar med '+data.taskId;
} else {
  statusText.textContent='Arbetar \u2014 planering';
}}
else if(event==='agent:end'){
var a=agents[data.agent];if(!a)return;
a.el.className='agent-tile klar';
a.el.querySelector('.status').innerHTML='<span style="color:#64748b">\\u25CF</span> klar';
var statusText2=a.el.querySelector('.status-text');
if(statusText2) statusText2.textContent='Klar';}
else if(event==='agent:text'){
var a2=agents[data.agent];if(!a2)a2=getOrCreateTile(data.agent||'unknown');
var txt=data.text||'';
if(!a2.textBuf)a2.textBuf='';
a2.textBuf+=txt;
if(a2.textBuf.length>2000)a2.textBuf=a2.textBuf.slice(-2000);
var sentences=a2.textBuf.split(/(?<=[.!?\\n])\\s+/);
var last='';
for(var si=sentences.length-1;si>=0;si--){
  var s=sentences[si].trim();
  if(s.length>5){last=s;break;}
}
if(last){
  if(last.length>80)last=last.substring(0,77)+'...';
  var slEl=a2.el.querySelector('.status-line');
  slEl.textContent=last;
  slEl.style.opacity='0';
  setTimeout(function(){slEl.style.opacity='1';},50);
}}
else if(event==='agent:thinking'){
var at=agents[data.agent];if(!at)at=getOrCreateTile(data.agent||'unknown');
if(!at.thinkingLines)at.thinkingLines=[];
at.thinkingLines.push(data.text||'');
if(at.thinkingLines.length>30)at.thinkingLines=at.thinkingLines.slice(-30);
var tcEl=at.el.querySelector('.thinking-content');
var display=at.thinkingLines.join('\\n');
if(display.length>2000)display=display.slice(-2000);
tcEl.textContent=display;
tcEl.scrollTop=tcEl.scrollHeight;
at.el.querySelector('.thinking-toggle').style.display='block';}
else if(event==='task:plan'){
var planTasks=data.tasks||[];
for(var pi=0;pi<planTasks.length;pi++){
  if(planTasks[pi].id && planTasks[pi].description){
    taskDescriptions[planTasks[pi].id]=planTasks[pi].description;
  }
}
renderTasks();}
else if(event==='task:status'){
updateTask(data.taskId||'?',data.status||'pending',data.description,data.agent);
if(data.status==='running' && !taskStartTimes[data.taskId]){
  taskStartTimes[data.taskId]=Date.now();
}
var completed=0,total=Object.keys(tasks).length;
for(var k in tasks){if(tasks[k]==='completed')completed++;}
document.getElementById('task-count').textContent='\\uD83D\\uDCCB '+completed+'/'+total+' uppgifter';}
else if(event==='stoplight'){
var sl=document.getElementById('stoplight');
var color={'GREEN':'#22c55e','YELLOW':'#eab308','RED':'#ef4444'}[data.status]||'#334155';
sl.textContent='STOPLIGHT: '+esc(data.status||'---');
sl.style.backgroundColor=color;
sl.style.color='#0f172a';
setTimeout(function(){sl.style.backgroundColor='#1e293b';sl.style.color='#e2e8f0';},2000);}
else if(event==='warning'){
var wb=document.getElementById('warning-banner');
wb.textContent='\u26A0\uFE0F '+esc(data.message||'Varning fr\u00E5n agent');
wb.classList.add('visible');}
else if(event==='tokens'){
var at2=agents[data.agent];
if(at2){
if(!at2.tokIn)at2.tokIn=0;if(!at2.tokOut)at2.tokOut=0;
at2.tokIn+=(data.input||0);at2.tokOut+=(data.output||0);
at2.el.querySelector('.agent-tokens').textContent=fmtK(at2.tokIn)+' in \u00B7 '+fmtK(at2.tokOut)+' ut';}
totalIn+=(data.input||0);totalOut+=(data.output||0);
totalCost=(totalIn*3.0+totalOut*15.0)/1000000;
document.getElementById('tokens').textContent='\\uD83D\\uDCCA '+fmtK(totalIn)+' in \\u00B7 '+fmtK(totalOut)+' ut';
var now=Date.now();
if(lastTokenTime>0){
  var dt=(now-lastTokenTime)/1000;
  if(dt>0){
    var tokPerSec=Math.round((totalOut-lastTokenOut)/dt);
    document.getElementById('latency').textContent='\\u26A1 '+tokPerSec+' tok/s';
  }
}
lastTokenTime=now;lastTokenOut=totalOut;
document.getElementById('cost').textContent='\\uD83D\\uDCB0 $'+totalCost.toFixed(2);}
else if(event==='time'){
timerElapsed=data.elapsed||0;
timerTotal=(data.elapsed||0)+(data.remaining||0);
timerRunning=true;}
else if(event==='iteration'){
var ai=agents[data.agent];
if(ai){ai.el.querySelector('.agent-iter').textContent='Iter '+(data.current||0)+'/'+(data.max||0);}}
else if(event==='audit'){
if(data.tool==='delegate_parallel_wave'){
  var waveNum=data.wave||data.wave_index||0;
  var waveTasks=data.tasks||[];
  for(var wi=0;wi<waveTasks.length;wi++){
    if(waveTasks[wi].id)taskWaves[waveTasks[wi].id]=waveNum;
  }
}}
else if(event==='decision'){
addLogEntry(event,data,ts);}
}

function toggleRunDropdown(){
runDropdownOpen=!runDropdownOpen;
var dd=document.getElementById('run-dropdown');
dd.style.display=runDropdownOpen?'block':'none';
if(runDropdownOpen)loadRuns();}

function loadRuns(){
fetch('/runs').then(function(r){
if(!r.ok)throw new Error('HTTP '+r.status);
return r.json();
}).then(function(runs){
var dd=document.getElementById('run-dropdown');
dd.innerHTML='';
var liveItem=document.createElement('div');liveItem.className='run-item';
liveItem.innerHTML='<span><span class="live-dot" style="display:inline-block;width:6px;height:6px;margin-right:4px"></span>Current (live)</span>';
liveItem.onclick=function(){showLive();};
dd.appendChild(liveItem);
for(var i=0;i<runs.length;i++){
(function(run){
var item=document.createElement('div');item.className='run-item';
var sl={'GREEN':'\\uD83D\\uDFE2','YELLOW':'\\uD83D\\uDFE1','RED':'\\uD83D\\uDD34'}[run.stoplight]||'\\u2796';
item.innerHTML='<span>'+sl+' '+esc(run.runid)+' \\u2014 '+esc(run.briefTitle).substring(0,40)+'</span><span class="stoplight-badge">'+run.durationMin+'min | $'+run.costUsd+'</span>';
item.onclick=function(){loadDigest(run.runid,run.briefTitle);};
dd.appendChild(item);
})(runs[i]);}
}).catch(function(err){
console.error('Failed to load runs:',err);
var dd=document.getElementById('run-dropdown');
dd.innerHTML='<div class="run-item" style="color:#ef4444;flex-direction:column;align-items:flex-start">'
+'<span>\\u26A0\\uFE0F Kunde inte ladda k\\u00F6rningar</span>'
+'<button class="retry-btn" onclick="event.stopPropagation();loadRuns();" style="margin-top:6px;background:#334155;border:1px solid #475569;color:#e2e8f0;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:0.75rem">F\\u00F6rs\\u00F6k igen</button>'
+'</div>';
});}
window.loadRuns=loadRuns;

function loadDigest(runid,title){
fetch('/digest/'+runid).then(function(r){
if(!r.ok)throw new Error('not found');
return r.text();
}).then(function(md){
showingDigest=true;
var dv=document.getElementById('digest-view');
dv.style.display='block';
dv.textContent=md;
document.getElementById('live-content').style.display='none';
document.getElementById('run-selector-text').textContent=runid+' \\u2014 '+title;
document.querySelector('.live-dot').style.animation='none';
document.querySelector('.live-dot').style.background='#64748b';
runDropdownOpen=false;
document.getElementById('run-dropdown').style.display='none';
}).catch(function(){alert('Ingen digest tillg\\u00E4nglig f\\u00F6r denna k\\u00F6rning');});}

function showLive(){
showingDigest=false;
document.getElementById('digest-view').style.display='none';
document.getElementById('live-content').style.display='block';
document.getElementById('run-selector-text').textContent='Current (live)';
document.querySelector('.live-dot').style.animation='pulse 2s infinite';
document.querySelector('.live-dot').style.background='#22c55e';
runDropdownOpen=false;
document.getElementById('run-dropdown').style.display='none';}

function toggleExplanation(){
  explanationMode=explanationMode==='simple'?'technical':'simple';
  var btn=document.getElementById('explanation-toggle');
  btn.textContent=explanationMode==='simple'?'F\\u00F6renklat l\\u00E4ge \\u2713':'Tekniskt l\\u00E4ge';
}
window.toggleExplanation=toggleExplanation;

window.toggleRunDropdown=toggleRunDropdown;

var es=new EventSource('/events');
var reconnected=false;
es.onopen=function(){
if(reconnected){
var banner=document.getElementById('reconnect-banner');
banner.classList.add('visible');
setTimeout(function(){banner.classList.remove('visible');},3000);}
reconnected=true;};
es.onmessage=function(e){
try{var msg=JSON.parse(e.data);handleEvent(msg.event,msg.data,msg.timestamp||new Date().toISOString());}catch(err){console.error('SSE parse error',err);}};
es.onerror=function(){
addLogEntry('system',{message:'SSE disconnected, reconnecting...'},new Date().toISOString());};
})();`;
}
