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
${renderHeaderHTML(safeRunid)}
${renderAgentTilesHTML()}
${renderTaskListHTML()}
${renderStoplightHTML()}
${renderEventLogHTML()}
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
.agent-tile .reasoning{max-height:0;overflow:hidden;transition:max-height 0.3s;font-family:'Menlo','Consolas',monospace;font-size:0.7rem;color:#94a3b8;white-space:pre-wrap;word-break:break-all}
.agent-tile .reasoning.open{max-height:200px;overflow-y:auto}
.agent-tile .toggle{cursor:pointer;font-size:0.75rem;color:#38bdf8;user-select:none}
.agent-tile .thinking-toggle{cursor:pointer;font-size:0.75rem;color:#a78bfa;user-select:none;display:none}
.agent-tile .thinking-content{max-height:0;overflow:hidden;transition:max-height 0.3s;font-family:'Menlo','Consolas',monospace;font-size:0.7rem;color:#cbd5e1;font-style:italic;background:#1a2332;border-radius:4px;padding:0 8px;white-space:pre-wrap;word-break:break-all}
.agent-tile .thinking-content.open{max-height:200px;overflow-y:auto;padding:8px}
.reconnect-banner{position:fixed;top:0;left:0;right:0;background:#7c3aed;color:white;text-align:center;padding:8px;font-size:0.85rem;z-index:100;transition:opacity 0.5s;opacity:0;pointer-events:none}
.reconnect-banner.visible{opacity:1}
.task-list{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;margin-bottom:24px}
.task-list .task-item{padding:4px 0;font-size:0.85rem;border-bottom:1px solid #1e293b}
.stoplight-section{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;margin-bottom:24px;text-align:center;font-size:1.1rem;font-weight:600;transition:background-color 0.5s}
.event-log{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:12px;max-height:300px;overflow-y:auto;font-family:'Menlo','Consolas',monospace;font-size:0.75rem}
.event-log .entry{padding:2px 0;border-bottom:1px solid #0f172a}
.event-log .ts{color:#64748b;margin-right:8px}
.green{color:#22c55e}.yellow{color:#eab308}.red{color:#ef4444}`;
}

function renderHeaderHTML(safeRunid: string): string {
  return `<div class="header">
<h1>NEURON HQ &mdash; K&ouml;rning ${safeRunid}</h1>
<div class="stats">
<span id="timer">\u23F1 00:00 / --:--</span>
<span id="iterations">\uD83D\uDD04 0/0</span>
<span id="tokens">\uD83D\uDCCA in:0 out:0</span>
<span id="cost">\uD83D\uDCB0 $0.00</span>
</div>
</div>
<div class="container">`;
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
<div id="event-log" class="event-log"></div>
</div>
</div>`;
}

function renderJS(): string {
  return `(function(){
var totalIn=0,totalOut=0,totalCost=0;
var agents={};
var tasks={};
var logPaused=false;
var logEl=document.getElementById('event-log');

logEl.addEventListener('click',function(){logPaused=!logPaused;
document.getElementById('log-pause-hint').textContent=logPaused?'(pausad)':'(klicka for att pausa auto-scroll)';});

function addLogEntry(event,data,ts){
var d=document.createElement('div');d.className='entry';
var short=JSON.stringify(data);if(short.length>120)short=short.substring(0,120)+'...';
d.innerHTML='<span class="ts">'+ts.substring(11,19)+'</span><b>'+esc(event)+'</b> '+esc(short);
logEl.appendChild(d);
while(logEl.children.length>50)logEl.removeChild(logEl.firstChild);
if(!logPaused)logEl.scrollTop=logEl.scrollHeight;}

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function getOrCreateTile(name){
if(agents[name])return agents[name];
var t=document.createElement('div');t.className='agent-tile aktiv';
t.innerHTML='<div class="name">'+esc(name)+'</div>'
+'<div class="status"><span class="status-dot green">\\u25CF</span> aktiv</div>'
+'<div class="task-info"></div>'
+'<div class="toggle">\\u25B6 Resonemang</div>'
+'<div class="reasoning"></div>'
+'<div class="thinking-toggle">\\u25B6 Thinking</div>'
+'<div class="thinking-content"></div>';
t.querySelector('.toggle').addEventListener('click',function(){
var r=t.querySelector('.reasoning');r.classList.toggle('open');
this.textContent=r.classList.contains('open')?'\\u25BC Resonemang':'\\u25B6 Resonemang';});
t.querySelector('.thinking-toggle').addEventListener('click',function(){
var tc=t.querySelector('.thinking-content');tc.classList.toggle('open');
this.textContent=tc.classList.contains('open')?'\\u25BC Thinking':'\\u25B6 Thinking';});
document.getElementById('agent-tiles').appendChild(t);
agents[name]={el:t,lines:[]};
return agents[name];}

function updateTask(taskId,status){
var icon='\\u23F3';
if(status==='completed')icon='\\u2705';
else if(status==='running')icon='\\uD83D\\uDD04';
else if(status==='failed')icon='\\u274C';
tasks[taskId]=status;
renderTasks();}

function renderTasks(){
var el=document.getElementById('task-list');el.innerHTML='';
var ids=Object.keys(tasks);
if(ids.length===0){el.innerHTML='<div class="task-item" style="color:#64748b">Vantar pa uppgifter...</div>';return;}
for(var i=0;i<ids.length;i++){
var s=tasks[ids[i]];
var icon='\\u23F3';
if(s==='completed')icon='\\u2705';else if(s==='running')icon='\\uD83D\\uDD04';else if(s==='failed')icon='\\u274C';
var d=document.createElement('div');d.className='task-item';
d.textContent=icon+' '+ids[i]+' — '+s;el.appendChild(d);}}

function handleEvent(event,data,ts){
addLogEntry(event,data,ts);
if(event==='run:start'){
document.querySelector('.header h1').innerHTML='NEURON HQ &mdash; K\\u00F6rning '+esc(data.runid||'');}
else if(event==='agent:start'){
var tile=getOrCreateTile(data.agent||'unknown');
tile.el.className='agent-tile aktiv';
tile.el.querySelector('.status').innerHTML='<span class="green">\\u25CF</span> aktiv';
if(data.taskId)tile.el.querySelector('.task-info').textContent='Task: '+data.taskId;}
else if(event==='agent:end'){
var a=agents[data.agent];if(!a)return;
a.el.className='agent-tile klar';
a.el.querySelector('.status').innerHTML='<span style="color:#64748b">\\u25CF</span> klar';}
else if(event==='agent:text'){
var a2=agents[data.agent];if(!a2)a2=getOrCreateTile(data.agent||'unknown');
a2.lines.push(data.text||'');
if(a2.lines.length>30)a2.lines=a2.lines.slice(-30);
var rEl=a2.el.querySelector('.reasoning');
rEl.textContent=a2.lines.join('\\n');
rEl.scrollTop=rEl.scrollHeight;}
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
else if(event==='task:status'){
updateTask(data.taskId||'?',data.status||'pending');}
else if(event==='stoplight'){
var sl=document.getElementById('stoplight');
var color={'GREEN':'#22c55e','YELLOW':'#eab308','RED':'#ef4444'}[data.status]||'#334155';
sl.textContent='STOPLIGHT: '+esc(data.status||'---');
sl.style.backgroundColor=color;
sl.style.color='#0f172a';
setTimeout(function(){sl.style.backgroundColor='#1e293b';sl.style.color='#e2e8f0';},2000);}
else if(event==='tokens'){
totalIn+=(data.input||0);totalOut+=(data.output||0);
document.getElementById('tokens').textContent='\\uD83D\\uDCCA in:'+totalIn+' out:'+totalOut;}
else if(event==='time'){
var e=data.elapsed||0,r=data.remaining||0;
var em=Math.floor(e/60),es2=Math.floor(e%60);
var tm=Math.floor((e+r)/60),ts2=Math.floor((e+r)%60);
document.getElementById('timer').textContent='\\u23F1 '
+String(em).padStart(2,'0')+':'+String(es2).padStart(2,'0')+' / '
+String(tm).padStart(2,'0')+':'+String(ts2).padStart(2,'0');}
else if(event==='iteration'){
document.getElementById('iterations').textContent='\\uD83D\\uDD04 '+(data.current||0)+'/'+(data.max||0);}}

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
