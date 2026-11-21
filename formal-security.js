/* Atto assurance dashboard. Static snapshot: no GitHub token, no remote reads,
 * no automatic promotion of claimed receipts into independently audited proof.
 */
(function () {
  'use strict';
  var SEED = window.ATTO_ASSURANCE_SEED;
  if (!SEED) { document.getElementById('view').textContent = 'Missing assurance data.'; return; }
  var SNAPSHOT_KEY = 'atto.assurance.snapshot.v1';
  var TASK_KEY = 'atto.assurance.tasks.v1';
  var titles = {
    overview:['Formal methods & security','A shared map of threats, invariants, bounded proofs, adversarial tests, CI provenance, and real guest-conformance gaps.'],
    registry:['Repository & PR registry','Source heads, claimed Git trees, threat mappings and merge-readiness gates without implied execution.'],
    invariants:['Threats & invariants','Safety and liveness obligations mapped to adversarial models, tests, and implementations.'],
    evidence:['Execution evidence','Exact-head workflow readbacks, runner-admission classification and independently unproven guest claims.'],
    queue:['Prioritized hardening queues','A local triage worklist for formalization gaps, compiler-backed tests and merge blockers.'],
    templates:['Reusable formal specifications','Starter contracts for models, properties, mutation tests and real five-backend guest conformance.']
  };
  var f = { search:'',repo:'',backend:'',pr:'',invariant:'',evidence:'',severity:'',status:'' };
  var data = loadSnapshot();
  var taskState = loadTasks();
  var queueTab = 'All';
  var view = /^#(overview|registry|invariants|evidence|queue|templates)$/.test(location.hash) ? location.hash.slice(1) : 'overview';
  var el = function (id) { return document.getElementById(id); };
  var e = function (s) { return String(s === null || s === undefined ? 'Unknown' : s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); };
  var short = function (s,n) { return s ? String(s).slice(0,n||9)+'…' : 'Not verified'; };
  var uniq = function (a) { return Array.from(new Set(a.filter(Boolean))).sort(); };
  var first = function (v) { return String(v||'').toLowerCase(); };
  var contains = function (text,q) { return first(text).indexOf(first(q)) !== -1; };
  var prUrl = function (p) { return 'https://github.com/'+encodeURI(p.repo)+'/pull/'+Number(p.number); };
  var runUrl = function (p) { return p.workflow && p.workflow.run ? 'https://github.com/'+encodeURI(p.repo)+'/actions/runs/'+Number(p.workflow.run) : ''; };
  var byPr = function (id) { return data.prs.find(function(p){return p.id===id;}); };
  var byInv = function (id) { return data.invariants.find(function(v){return v.id===id;}); };
  var taskStatus = function (t) { return taskState[t.id] || t.status || 'Open'; };
  var nameFor = function (id) { var v=byInv(id); return v ? v.name : id; };
  function isSha(s) { return typeof s==='string' && /^[0-9a-f]{40}$/.test(s); }
  function validRepo(s) { return typeof s==='string' && /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(s); }
  function loadSnapshot() {
    try {
      var cached = localStorage.getItem(SNAPSHOT_KEY);
      if (cached) { var parsed = JSON.parse(cached); validate(parsed); return parsed; }
    } catch (err) { console.warn('Ignoring invalid local snapshot',err); }
    return SEED;
  }
  function loadTasks() {
    try { var x = JSON.parse(localStorage.getItem(TASK_KEY)||'{}'); return x && typeof x==='object' && !Array.isArray(x) ? x : {}; }
    catch (err) { return {}; }
  }
  function validate(d) {
    if (!d || d.schemaVersion!==1 || typeof d.capturedAt!=='string' ||
        !Array.isArray(d.prs) || !Array.isArray(d.invariants) ||
        !Array.isArray(d.tasks) || !Array.isArray(d.templates) ||
        d.prs.length>1000 || d.invariants.length>300 || d.tasks.length>1500 || d.templates.length>100)
      throw new Error('Unsupported assurance snapshot schema or record limits');
    ['prs','invariants','tasks','templates'].forEach(function(k){
      var ids=new Set();
      d[k].forEach(function(x){
        if(!x || typeof x!=='object' || typeof x.id!=='string' || !/^[a-zA-Z0-9-]{1,64}$/.test(x.id) || ids.has(x.id))
          throw new Error('Invalid or duplicate '+k+' ID');
        ids.add(x.id);
      });
    });
    d.prs.forEach(function(p){
      if(!validRepo(p.repo) || !Number.isSafeInteger(p.number) || p.number<1 ||
        !isSha(p.head) || (p.tree!==null && p.tree!==undefined && !isSha(p.tree)) ||
        !Array.isArray(p.invariants) || p.invariants.length>50 ||
        !['Draft','Open','Closed','Merged'].includes(p.state) ||
        !['SOURCE_ONLY','HOST_ONLY','BOUNDED_MODEL'].includes(p.evidence))
        throw new Error('Invalid PR record: full head SHA and evidence class required');
      if(p.workflow) {
        var s=p.workflow.steps;
        if(s!==null && s!==undefined && s!=='UNKNOWN' && !(Number.isSafeInteger(s) && s>=0) &&
          !(Array.isArray(s) && s.length<=200)) throw new Error('Invalid job step declaration');
      }
    });
    if(d.modelReport){
      var model=d.modelReport;
      if(model.classification!=='BOUNDED_DESIGN_MODEL_ONLY' ||
         !Array.isArray(model.results) || model.results.length>100 ||
         model.results.some(function(r){return !r || typeof r!=='object' ||
           typeof r.model!=='string' || r.model.length>100 || typeof r.scope!=='string' ||
           (r.counterexample && (!Array.isArray(r.counterexample) || r.counterexample.length>60))}))
        throw new Error('Invalid bounded model report');
    }
    d.invariants.forEach(function(x){if(typeof x.name!=='string' || typeof x.id!=='string')throw new Error('Invalid invariant');});
    d.tasks.forEach(function(t){if(!byRef(d.prs,t.prId) || !byRef(d.invariants,t.invariant))throw new Error('Task references missing PR or invariant');});
    d.templates.forEach(function(t){if(!byRef(d.invariants,t.invariant))throw new Error('Template invariant missing');});
  }
  function byRef(items,id){return items.some(function(x){return x.id===id;});}
  function stepClassification(w) {
    if(!w) return 'NOT_INSPECTED';
    if(w.steps===null || w.steps===0 || (Array.isArray(w.steps) && w.steps.length===0))
      return 'RUNNER_NOT_ADMITTED';
    var known=['STEPS_EXECUTED','STEP_RECORDS_NOT_EXECUTED','STEP_COUNT_CLAIMED','RUNNER_NOT_ADMITTED','NOT_INSPECTED'];
    if(known.indexOf(w.stepClassification)>=0)return w.stepClassification;
    if(Array.isArray(w.steps)){
      return w.steps.some(function(x){return x&&typeof x.started_at==='string' &&
        !isNaN(Date.parse(x.started_at)) &&
        (x.status==='completed'||x.status==='in_progress') && x.conclusion!=='skipped';})?
        'STEPS_EXECUTED':'STEP_RECORDS_NOT_EXECUTED';
    }
    if(Number.isInteger(w.steps)&&w.steps>0)return 'STEP_COUNT_CLAIMED';
    return 'NOT_INSPECTED';
  }
  function stepCount(w) {
    if(!w) return 'Not inspected';
    if(w.steps===null)return 'null';
    if(Array.isArray(w.steps))return '['+w.steps.length+' records]';
    return w.steps===undefined ? 'Unknown' : String(w.steps);
  }
  function stepLabel(p) {
    var v=stepClassification(p.workflow);
    if(v==='RUNNER_NOT_ADMITTED')return 'Runner not admitted';
    if(v==='STEPS_EXECUTED')return data.imported?'Claimed started steps · not authenticated':'Started steps reported · scope unknown';
    if(v==='STEP_RECORDS_NOT_EXECUTED')return 'Step records · none executed';
    if(v==='STEP_COUNT_CLAIMED')return 'Claimed count · unaudited';
    return 'Not inspected';
  }
  function stepBadge(p) {
    var v=stepClassification(p.workflow);
    return badge(stepLabel(p),v==='RUNNER_NOT_ADMITTED'?'red':v==='STEPS_EXECUTED'?'amber':'gray');
  }
  function badge(s,type){return '<span class="badge '+e(type||'gray')+'">'+e(s)+'</span>';}
  function mergeGate(p) {
    if(p.state==='Merged') return data.imported ? 'Imported merge claim · not verified' : 'Merged · guest parity not implied';
    if(p.state==='Closed') return 'Closed · no merge proof';
    if(p.state==='Draft') return 'HOLD · draft / review / evidence';
    return 'HOLD · independent gates unverified';
  }
  function searchCorpus(p){
    return [p.id,p.repo,p.number,p.title,p.backend,p.severity,p.head,p.tree,p.threat,p.formal,p.properties,p.mutation,p.next,p.state,p.evidence,p.invariants.join(' ')].join(' ');
  }
  function prMatches(p,opt) {
    opt=opt||{};
    if(f.repo && p.repo!==f.repo)return false;
    if(f.backend && p.backend!==f.backend)return false;
    if(f.pr && p.id!==f.pr)return false;
    if(f.invariant && p.invariants.indexOf(f.invariant)<0)return false;
    if(f.evidence && p.evidence!==f.evidence &&
       !(f.evidence==='RUNNER_NOT_ADMITTED' && stepClassification(p.workflow)==='RUNNER_NOT_ADMITTED') &&
       !(f.evidence==='STEPS_EXECUTED' && stepClassification(p.workflow)==='STEPS_EXECUTED') &&
       !(f.evidence==='NOT_INSPECTED' && stepClassification(p.workflow)==='NOT_INSPECTED'))return false;
    if(f.severity && p.severity!==f.severity)return false;
    if(!opt.ignoreStatus && f.status && p.state!==f.status)return false;
    if(f.search && !contains(searchCorpus(p),f.search))return false;
    return true;
  }
  function visiblePrs(opt){return data.prs.filter(function(p){return prMatches(p,opt);});}
  function invMatches(inv){
    if(f.invariant && inv.id!==f.invariant)return false;
    if(f.severity && inv.severity!==f.severity)return false;
    if(f.search && !contains([inv.id,inv.name,inv.domain,inv.threat,inv.spec,inv.property,inv.mutation,inv.tests].join(' '),f.search) &&
       !data.prs.some(function(p){return p.invariants.indexOf(inv.id)>=0 && contains(searchCorpus(p),f.search);}))return false;
    if(f.repo||f.backend||f.pr||f.evidence||f.status){
      return data.prs.some(function(p){return p.invariants.indexOf(inv.id)>=0 && prMatches(p);});
    }
    return true;
  }
  function taskMatches(t) {
    var p=byPr(t.prId);
    if(!p)return false;
    if(f.repo && p.repo!==f.repo)return false;
    if(f.backend && p.backend!==f.backend)return false;
    if(f.pr && t.prId!==f.pr)return false;
    if(f.invariant && t.invariant!==f.invariant)return false;
    if(f.evidence && !prMatches(p,{ignoreStatus:true}))return false;
    if(f.severity && t.severity!==f.severity)return false;
    if(f.status && f.status!==taskStatus(t))return false;
    if(f.search && !contains([t.id,t.title,t.accept,t.kind,t.priority,t.invariant,p.repo,p.title].join(' '),f.search))return false;
    if(queueTab!=='All' && t.kind!==queueTab)return false;
    return true;
  }
  function visibleTasks(){return data.tasks.filter(taskMatches).sort(function(a,b){return a.priority.localeCompare(b.priority) || a.id.localeCompare(b.id);});}
  function visibleInvs(){return data.invariants.filter(invMatches);}
  function visibleTemplates(){
    return data.templates.filter(function(t){
      if(f.invariant && t.invariant!==f.invariant)return false;
      if(f.severity && byInv(t.invariant) && byInv(t.invariant).severity!==f.severity)return false;
      if(f.search && !contains([t.name,t.assumptions,t.safety,t.liveness,t.model,t.properties,t.mutants,t.guest].join(' '),f.search))return false;
      if(f.repo||f.backend||f.pr||f.evidence||f.status) {
        return data.prs.some(function(p){return p.invariants.indexOf(t.invariant)>=0 && prMatches(p);});
      }
      return true;
    });
  }
  function opts(values,all,selected){
    return '<option value="">'+e(all)+'</option>'+values.map(function(v){
      var val=typeof v==='string'?v:v.value, label=typeof v==='string'?v:v.label;
      return '<option value="'+e(val)+'"'+(selected===val?' selected':'')+'>'+e(label)+'</option>';
    }).join('');
  }
  function setupFilters(){
    el('fRepo').innerHTML=opts(uniq(data.prs.map(function(p){return p.repo;})),'All repositories',f.repo);
    el('fBackend').innerHTML=opts(uniq(data.prs.map(function(p){return p.backend;})),'All backends',f.backend);
    el('fPr').innerHTML=opts(data.prs.map(function(p){return {value:p.id,label:p.repo.split('/')[1]+' #'+p.number};}),'All PRs',f.pr);
    el('fInvariant').innerHTML=opts(data.invariants.map(function(v){return {value:v.id,label:v.id+' · '+v.name};}),'All invariants',f.invariant);
    el('fEvidence').innerHTML=opts([
      {value:'SOURCE_ONLY',label:'Source / authored'},
      {value:'BOUNDED_MODEL',label:'Bounded model (reported)'},
      {value:'HOST_ONLY',label:'Host-only'},
      {value:'RUNNER_NOT_ADMITTED',label:'Runner not admitted'},
      {value:'STEPS_EXECUTED',label:'Steps executed'},
      {value:'NOT_INSPECTED',label:'Job not inspected'}
    ],'All evidence classes',f.evidence);
    el('fSeverity').innerHTML=opts(['Critical','High','Medium','Low'],'All severities',f.severity);
    el('fStatus').innerHTML=opts(['Draft','Open','Merged','Closed','In progress','Blocked','Done'],'All statuses',f.status);
    el('fSearch').value=f.search;
  }
  function metric(name,value,foot,tone,ico){
    return '<div class="metric '+(tone||'')+'"><div class="metric-top"><span>'+e(name)+'</span><span class="metric-icon" aria-hidden="true">'+e(ico||'◈')+'</span></div><div class="metric-num">'+e(value)+'</div><div class="metric-foot">'+e(foot)+'</div></div>';
  }
  function renderMetrics(){
    var ps=visiblePrs(), jobs=ps.filter(function(p){return stepClassification(p.workflow)==='RUNNER_NOT_ADMITTED';}).length;
    el('metrics').innerHTML=
      metric('Tracked pull requests',ps.length,'Filtered GitHub snapshot · not live','','#')+
      metric('Formal obligations',visibleInvs().length,'Safety, liveness & provenance','','◇')+
      metric('Runner not admitted',jobs,'Confirmed null, empty or zero step arrays','alert','!')+
      metric('Audited guest parity',0,'No independently verified guest receipts','warn','∅');
    el('filterCount').textContent=String(ps.length);
    el('guestProofs').textContent='0 independently verified';
  }
  function panelHead(title,sub,right){
    return '<div class="panel-head"><div><h2>'+e(title)+'</h2>'+(sub?'<p>'+e(sub)+'</p>':'')+'</div>'+(right||'')+'</div>';
  }
  function noRows(msg){return '<div class="empty">'+e(msg||'No matching records. Clear filters to widen the view.')+'</div>';}
  function sectionOpen(title,sub,body){
    return '<section class="panel">'+panelHead(title,sub) + body + '</section>';
  }
  function invariantEvidence(id,backend){
    var ps=data.prs.filter(function(p){return p.invariants.indexOf(id)>=0 && p.backend===backend;});
    if(ps.some(function(p){return p.evidence==='HOST_ONLY';}))return {text:'Host only',cls:''};
    if(ps.some(function(p){return p.evidence==='BOUNDED_MODEL';}))return {text:'Bounded model',cls:''};
    if(ps.length)return {text:'Authored only',cls:''};
    if(data.prs.some(function(p){return p.invariants.indexOf(id)>=0 && p.backend==='Multi-backend';}))
      return {text:'Contract only',cls:'unknown'};
    return {text:'Not verified',cls:'unknown'};
  }
  function renderMatrix(){
    var backends=data.backends||SEED.backends, invs=visibleInvs();
    return '<div class="table-scroll"><table class="mini-matrix"><thead><tr><th style="text-align:left">Invariant</th>'+
      backends.map(function(b){return '<th>'+e(b)+'</th>';}).join('')+'</tr></thead><tbody>'+
      invs.map(function(inv){return '<tr><th style="text-align:left"><button class="linkish" data-open-inv="'+e(inv.id)+'">'+e(inv.id)+'</button></th>'+
        backends.map(function(b){var s=invariantEvidence(inv.id,b);return '<td class="'+e(s.cls)+'">'+e(s.text)+'<p>Guest unverified</p></td>';}).join('')+'</tr>';}).join('')+
      '</tbody></table></div>';
  }
  function priorityRow(t,i){
    return '<div class="signal"><div class="signal-n">'+(i+1)+'</div><div><button class="linkish" data-open-task="'+e(t.id)+'">'+e(t.title)+'</button><p>'+e(t.kind)+' · '+e(t.prId)+' · '+e(nameFor(t.invariant))+'</p></div>'+badge(t.priority,t.priority==='P0'?'red':'amber')+'</div>';
  }
  function renderModelReport(){
    var m=data.modelReport;
    if(!m || m.classification!=='BOUNDED_DESIGN_MODEL_ONLY' || !Array.isArray(m.results))
      return '<div class="panel-body"><div class="notice">No attached model-checker run report. Authored TLA+ files and source-only checks must not be counted as executed proof.</div></div>';
    var base=m.results.filter(function(r){return !r.mutant;});
    var bad=m.results.filter(function(r){return r.mutant;});
    var rows=base.map(function(r){
      return '<tr><td>'+e(r.model)+'</td><td>'+e(r.states)+'</td><td>'+e(r.edges)+'</td><td>'+badge(r.depthTruncated?'Bound truncated':'Bounded safety result',r.depthTruncated?'red':'amber')+'</td></tr>';
    }).join('');
    var mutations=bad.map(function(r){
      return '<p class="sub-cell"><b>'+e(r.model)+' / '+e(r.mutant)+'</b> · '+e(r.violation||'No violation description')+
        ' · witness: '+e(Array.isArray(r.counterexample)?r.counterexample.join(' → '):'not recorded')+'</p>';
    }).join('');
    return '<div class="panel-body"><div class="notice"><b>BOUNDED_DESIGN_MODEL_ONLY.</b> '+base.length+
      ' reference models and '+bad.length+' negative controls reported. The imported report is not independently authenticated, and no guest was executed.</div>'+
      '<div class="table-scroll"><table class="data-table"><thead><tr><th>Model</th><th>Reachable states</th><th>Transitions</th><th>Scope</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<div style="margin-top:12px"><b>Mutation witnesses</b>'+mutations+'</div></div>';
  }
  function renderOverview(){
    var ps=visiblePrs(), total=ps.length, count=function(pred){return ps.filter(pred).length;};
    var bars=[
      ['Tracked source PRs',total],
      ['Reported bounded models',count(function(p){return p.evidence==='BOUNDED_MODEL';})],
      ['Host-only evidence',count(function(p){return p.evidence==='HOST_ONLY';})],
      ['Reported started-step jobs',count(function(p){return stepClassification(p.workflow)==='STEPS_EXECUTED';})],
      ['Independently audited guest',0]
    ];
    var funnel='<div class="panel-body">'+bars.map(function(r,i){return '<div class="bar-row"><span>'+e(r[0])+'</span><div class="bar-bg"><div class="bar '+(i===4?'bar-muted':'')+'" style="width:'+(total?Math.round(r[1]/total*100):0)+'%"></div></div><b>'+r[1]+'</b></div>';}).join('')+'<p class="sub-cell">Counts describe this curated snapshot, not all GitHub PRs. Executed steps do not alone prove compiler/guest success.</p></div>';
    var tasks=visibleTasks().slice(0,5);
    var priorities='<div class="panel-body"><div class="signal-list">'+(tasks.length?tasks.map(priorityRow).join(''):noRows())+'</div></div>';
    var policy='<div class="receipt-policy">'+[
      ['01 · Admission','steps=null, steps=[] and 0 indicate no established runner execution.'],
      ['02 · Evidence scope','Model, source and host checks do not establish production refinement or a real .atto guest.'],
      ['03 · Merge control','Draft, requested reviews and mergeable status never substitute for independent approval and fresh CI.']
    ].map(function(x){return '<div class="rule"><strong>'+e(x[0])+'</strong><p>'+e(x[1])+'</p></div>';}).join('')+'</div>';
    var collectionNotice = data.collector ? '<div class="notice">Private API collection: '+e(data.collector.complete)+'/'+e(data.collector.records)+' records with completed metadata reads. '+e(data.collector.completeness)+'. This is metadata only, not independent guest or checkout proof.</div>' : '';
    return collectionNotice+'<div class="stack">'+
      '<div class="columns">'+
        sectionOpen('Verification funnel','The distance from authored checks to guest evidence',funnel)+
        sectionOpen('Immediate priority queue','Highest-impact unresolved tasks',priorities)+
      '</div>'+
      sectionOpen('Bounded model evidence','Source-only finite-state exploration and mutation witnesses',renderModelReport())+
      sectionOpen('Five-backend evidence map','Coverage describes source/model/host state; it never certifies guest parity','<div class="panel-body">'+renderMatrix()+'</div>')+
      sectionOpen('Non-negotiable acceptance gates','Proof promotion rules are deliberately strict','<div class="panel-body">'+policy+'</div>')+
    '</div>';
  }
  function registryRows(){
    return visiblePrs().map(function(p){
      return '<tr class="clickable" data-open-pr="'+e(p.id)+'" tabindex="0" role="button" aria-label="Inspect '+e(p.repo)+' pull request '+e(p.number)+'">'+
        '<td><div class="primary-cell">'+e(p.repo.split('/')[1])+' <span class="mono">#'+e(p.number)+'</span></div><div class="sub-cell">'+e(p.title)+'</div></td>'+
        '<td>'+e(p.backend)+'</td>'+
        '<td>'+badge(p.severity,p.severity==='Critical'?'red':'amber')+'</td>'+
        '<td>'+p.invariants.map(function(id){return '<span class="mono">'+e(id)+'</span>';}).join(' · ')+'</td>'+
        '<td><span class="sha" title="'+e(p.head)+'">'+e(short(p.head,10))+'</span><div class="sub-cell">Tree: '+(p.tree?'<span title="'+e(p.tree)+'">'+e(short(p.tree,8))+'*</span>':'not verified')+'</div></td>'+
        '<td>'+badge(p.evidence.replace(/_/g,' '),p.evidence==='HOST_ONLY'?'blue':p.evidence==='BOUNDED_MODEL'?'amber':'gray')+'</td>'+
        '<td>'+stepBadge(p)+'</td>'+
        '<td>'+badge(p.state,p.state==='Merged'?'blue':p.state==='Draft'?'amber':'gray')+'</td></tr>';
    }).join('');
  }
  function renderRegistry(){
    var ps=visiblePrs();
    var head='<thead><tr><th>Repository / PR</th><th>Backend</th><th>Severity</th><th>Invariant mapping</th><th>Head / tree</th><th>Evidence class</th><th>Workflow</th><th>PR state</th></tr></thead>';
    return '<div class="notice">A Git commit head is not the same as a verified root Git tree. A tree value marked * is quoted from a PR description and has not been independently read back. No seeded PR is independently certified merge-ready.</div>'+
      sectionOpen('Mapped repository portfolio',ps.length+' PR records in the filtered snapshot','<div class="table-scroll"><table class="data-table">'+head+'<tbody>'+registryRows()+'</tbody></table>'+(ps.length?'':noRows())+'</div>');
  }
  function renderInvariants(){
    var xs=visibleInvs();
    return '<div class="invariant-grid">'+(xs.length?xs.map(function(inv){
      var count=visiblePrs({ignoreStatus:true}).filter(function(p){return p.invariants.indexOf(inv.id)>=0;}).length;
      return '<article class="inv-card"><div class="inv-top"><span class="inv-id">'+e(inv.id)+'</span>'+badge(inv.severity,inv.severity==='Critical'?'red':'amber')+'</div>'+
        '<h3>'+e(inv.name)+'</h3><p>'+e(inv.threat)+'</p>'+
        '<div class="template-detail"><b>Safety obligation</b><code>'+e(inv.spec)+'</code></div>'+
        '<div class="inv-footer"><span>'+count+' linked PR'+(count===1?'':'s')+' · '+e(inv.domain)+'</span><button class="btn small" data-open-inv="'+e(inv.id)+'">Inspect →</button></div></article>';
    }).join(''):noRows())+'</div>';
  }
  function renderEvidence(){
    var ps=visiblePrs(),rows=[];
    ps.forEach(function(p){
      var w=p.workflow, jobs=w&&Array.isArray(w.jobs)&&w.jobs.length?w.jobs:[null];
      jobs.forEach(function(job){
        var cls=job?job.classification:stepClassification(w);
        var steps=job?job.steps:stepCount(w);
        var label=cls==='RUNNER_NOT_ADMITTED'?'Runner not admitted':
          cls==='STEPS_EXECUTED'?'Started steps claimed':
          cls==='STEP_RECORDS_NOT_EXECUTED'?'Unstarted/skip-only records':
          cls==='STEP_COUNT_CLAIMED'?'Count-only claim':'Not inspected';
        var note=cls==='RUNNER_NOT_ADMITTED'?'No runner execution established, not compiler failure':
          cls==='STEPS_EXECUTED'?'GitHub step readback, original checkout and guest unverified':
          'No independently verified compiler-backed guest result';
        var jobName=job?job.name:w&&w.job||'—';
        var attempted=w&&w.attempt!==null?w.attempt:'Unknown';
        var run=w&&Number.isSafeInteger(w.run)&&w.run>0?w.run:null;
        var link=run?'<a href="https://github.com/'+encodeURI(p.repo)+'/actions/runs/'+run+
          '" target="_blank" rel="noopener noreferrer">'+run+'</a>':'Not inspected';
        rows.push('<tr><td class="primary-cell">'+e(p.repo.split('/')[1])+' #'+e(p.number)+'</td>'+
          '<td>'+link+'</td><td>'+e(jobName)+'</td><td class="mono">'+e(attempted)+'</td>'+
          '<td>'+e(steps)+'</td><td>'+badge(label,cls==='RUNNER_NOT_ADMITTED'?'red':cls==='STEPS_EXECUTED'?'amber':'gray')+'</td>'+
          '<td><span class="sha" title="'+e(p.head)+'">'+e(short(p.head,9))+
          '</span><div class="sub-cell">Run head readback ≠ actual checkout head</div></td>'+
          '<td>'+badge('Guest UNPROVEN','red')+'<div class="sub-cell">'+e(note)+'</div></td></tr>');
      });
    });
    return '<div class="notice"><strong>Scope boundary:</strong> these are reported GitHub job records, not independently authenticated run or compiler receipts. In particular, nonempty entries and run-head equality never prove actual checkout, .atto compilation, linkage or guest execution.</div>'+
      '<div class="stack">'+sectionOpen('Workflow evidence ledger','One row per job when collector evidence includes job details','<div class="table-scroll"><table class="data-table"><thead><tr><th>Repository / PR</th><th>Run</th><th>Job</th><th>Attempt</th><th>Started-step count</th><th>Admission</th><th>Source head</th><th>Guest</th></tr></thead><tbody>'+rows.join('')+'</tbody></table>'+(rows.length?'':noRows())+'</div>')+
      sectionOpen('Evidence promotion ladder','Never infer a stronger class from a weaker artifact','<div class="panel-body"><div class="receipt-policy">'+
        [['Source-authored','Specification, .atto fixture and test file exist; no execution implied.'],
         ['Model / host executed','A finite model or standalone host test ran; no production refinement implied.'],
         ['Compiler-backed guest','Requires independent job/attempt/head/tree/blob, compiler digest, actual link/AOT and guest stdout/exit. None certified here.']].map(function(x){return '<div class="rule"><strong>'+e(x[0])+'</strong><p>'+e(x[1])+'</p></div>';}).join('')+
      '</div></div>')+'</div>';
  }
  function renderQueue(){
    var kinds=['All','Hardening','Formalization gap','Conformance test','Merge blocker','Evidence'];
    var tabs=kinds.map(function(k){return '<button type="button" class="tab '+(queueTab===k?'active':'')+'" data-queue-tab="'+e(k)+'">'+e(k)+'</button>';}).join('');
    var ts=visibleTasks();
    var html=ts.map(function(t){
      var p=byPr(t.prId),st=taskStatus(t);
      return '<article class="task '+e(t.priority.toLowerCase())+'"><div>'+
        badge(t.priority,t.priority==='P0'?'red':t.priority==='P1'?'amber':'gray')+' '+
        badge(t.kind,'gray')+' '+badge(t.severity,t.severity==='Critical'?'red':'amber')+
        '<h3><button class="linkish" data-open-task="'+e(t.id)+'">'+e(t.title)+'</button></h3>'+
        '<p>'+e(p?p.repo+' #'+p.number:'Unknown PR')+' · '+e(t.invariant)+' · '+e(t.accept)+'</p>'+
        '</div><div class="task-actions"><label class="mono" for="task-'+e(t.id)+'">Local status</label>'+
        '<select id="task-'+e(t.id)+'" data-task-status="'+e(t.id)+'" aria-label="Local status for '+e(t.title)+'">'+
          ['Open','In progress','Blocked','Done'].map(function(s){return '<option'+(s===st?' selected':'')+'>'+e(s)+'</option>';}).join('')+
        '</select></div></article>';
    }).join('');
    return '<div class="notice">Changing a task status edits only local browser triage state. It does not update issues, approve PRs or trigger CI. “Done” is not a proof or merge-readiness attestation.</div>'+
      '<div class="queue-tabs">'+tabs+'</div><div class="task-list">'+(html||noRows())+'</div>';
  }
  function renderTemplates(){
    var ts=visibleTemplates();
    return '<div class="template-grid">'+(ts.length?ts.map(function(t){
      return '<article class="template-card"><div class="inv-top"><span class="inv-id">'+e(t.invariant)+'</span>'+badge('Reusable specification','blue')+'</div>'+
        '<h3>'+e(t.name)+'</h3><p>'+e(t.assumptions)+'</p>'+
        '<div class="template-detail"><b>Core safety statement</b><code>'+e(t.safety)+'</code></div>'+
        '<div class="inv-footer"><span>Model · property · mutant · guest</span><div><button class="btn small" data-copy-template="'+e(t.id)+'">Copy</button> <button class="btn small" data-open-template="'+e(t.id)+'">Open →</button></div></div></article>';
    }).join(''):noRows())+'</div>';
  }
  function render(){
    if(!titles[view])view='overview';
    el('pageTitle').textContent=titles[view][0];
    el('pageDescription').textContent=titles[view][1];
    el('breadcrumb').textContent=titles[view][0];
    el('snapshotTime').textContent='Captured '+String(data.capturedAt||'unknown').replace('T',' ').replace('Z',' UTC');
    el('snapshotSource').textContent=data.imported?'Local import · unverified':'GitHub snapshot · not live';
    document.querySelectorAll('[data-view]').forEach(function(b){
      b.classList.toggle('active',b.dataset.view===view);
      if(b.dataset.view===view)b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
    });
    renderMetrics();
    var output={overview:renderOverview,registry:renderRegistry,invariants:renderInvariants,evidence:renderEvidence,queue:renderQueue,templates:renderTemplates}[view]();
    el('view').innerHTML=output;
  }
  function navigate(v){
    if(!titles[v])return;
    view=v; location.hash=v;
    el('shell').classList.remove('menu-open'); render();
    window.scrollTo({top:0,behavior:'auto'});
  }
  function detail(k,v){
    return '<div class="detail-row"><dt>'+e(k)+'</dt><dd>'+e(v)+'</dd></div>';
  }
  function openInspector(title,body){
    el('inspector').innerHTML='<div class="inspector-head"><div><div class="eyebrow">Assurance inspector</div><h2>'+e(title)+'</h2></div><button class="btn" data-close aria-label="Close details">✕</button></div><div class="inspector-body">'+body+'</div>';
    el('inspector').hidden=false;el('scrim').hidden=false;
    var b=el('inspector').querySelector('[data-close]');if(b)b.focus();
    document.body.style.overflow='hidden';
  }
  function closeInspector(){el('scrim').hidden=true;el('inspector').hidden=true;document.body.style.overflow='';}
  function openPR(id){
    var p=byPr(id);if(!p)return;
    var w=p.workflow;
    var body='<div class="detail-banner">Guest parity is independently UNPROVEN. '+e(mergeGate(p))+'.</div>'+
      detail('Repository',p.repo)+detail('Pull request','#'+p.number+' · '+p.state)+
      detail('Backend',p.backend)+detail('Severity',p.severity)+
      detail('Head SHA',p.head)+detail('Root tree',p.tree||'Not verified')+
      detail('Tree source',p.treeSource)+
      detail('Runner checkout head/tree', 'Not independently verified by metadata collector')+
      detail('Per-job readback',w&&Array.isArray(w.jobs)?w.jobs.map(function(j){return j.name+': '+j.classification+' (attempt '+j.attempt+')';}).join('; '):'Not inspected')+
      detail('Mapped invariants',p.invariants.map(nameFor).join('; '))+
      detail('Threat model',p.threat)+detail('Formal spec / model',p.formal)+
      detail('Properties',p.properties)+detail('Mutation tests',p.mutation)+
      detail('Evidence class',p.evidence+' — not compiler guest proof')+
      detail('Workflow job',w?w.job+' · '+(w.run||'unknown'):'Not inspected')+
      detail('Observed steps',stepCount(w)+' ('+stepLabel(p)+')')+
      detail('Job attempt',w&&w.attempt!==null?w.attempt:'Not verified')+
      detail('Run head matches PR',w&&w.runHeadMatches?'API metadata matches; checkout NOT attested':'Not independently verified')+
      detail('Duplicate workflow jobs',w&&w.duplicateJobNames?'Yes; receipt must be rejected':'Not reported; may be uninspected')+
      detail('Run bound to head/tree',w&&w.headBound?'Claimed only; requires independent verification':'Not verified')+
      detail('API collection status',p.metadataStatus||'Curated initial snapshot')+
      detail('Metadata errors',Array.isArray(p.metadataErrors) && p.metadataErrors.length ? p.metadataErrors.join('; ') : 'None reported; completeness is not proof')+
      detail('Independent review',p.review)+detail('Current-head approvals',p.approvalsOnHead===undefined?'Not independently inspected':p.approvalsOnHead)+
      detail('Merge gate',mergeGate(p))+
      detail('Next step',p.next)+
      '<p style="margin-top:20px"><a class="btn dark" href="'+prUrl(p)+'" target="_blank" rel="noopener noreferrer">Open GitHub pull request ↗</a> '+
      (w?'<a class="btn" href="'+runUrl(p)+'" target="_blank" rel="noopener noreferrer">Open workflow ↗</a>':'')+'</p>';
    openInspector(p.title,body);
  }
  function openInvariant(id){
    var inv=byInv(id);if(!inv)return;
    var links=visiblePrs({ignoreStatus:true}).filter(function(p){return p.invariants.indexOf(id)>=0;});
    var body=detail('Invariant ID',inv.id)+detail('Domain',inv.domain)+detail('Severity',inv.severity)+
      detail('Threat model',inv.threat)+detail('Formal contract',inv.spec)+detail('Property testing',inv.property)+
      detail('Mutation negative',inv.mutation)+detail('Model approach',inv.models)+detail('Conformance tests',inv.tests)+
      '<h3 style="margin:22px 0 10px">Linked PRs in current filters</h3>'+
      (links.length?links.map(function(p){return '<p style="margin:8px 0"><button class="linkish" data-open-pr="'+e(p.id)+'">'+e(p.repo)+' #'+p.number+' — '+e(p.title)+'</button></p>';}).join(''):noRows());
    openInspector(inv.name,body);
  }
  function openTask(id){
    var t=data.tasks.find(function(x){return x.id===id;});if(!t)return;
    var p=byPr(t.prId);
    var body=detail('Priority',t.priority)+detail('Category',t.kind)+detail('Status (local)',taskStatus(t))+
      detail('Severity',t.severity)+detail('Invariant',nameFor(t.invariant))+
      detail('PR',p?p.repo+' #'+p.number:'Unknown')+
      detail('Acceptance criteria',t.accept)+
      '<div class="detail-banner">Acceptance criteria are future gates, not verified outcomes. Task status is local only.</div>'+
      (p?'<button class="btn dark" data-open-pr="'+e(p.id)+'">Inspect source PR →</button>':'');
    openInspector(t.title,body);
  }
  function templateText(t){
    return [
      '# '+t.name+' ('+t.invariant+')',
      'Assumptions: '+t.assumptions,
      'Safety: '+t.safety,
      'Liveness: '+t.liveness,
      'Model/checker: '+t.model,
      'Property-based tests: '+t.properties,
      'Mutation negatives: '+t.mutants,
      'Compiler-backed guest conformance: '+t.guest,
      'Evidence policy: steps=null, steps=[], or zero means runner admission not established. Reported model/host checks do not prove a real AttoLang guest. Bind exact head, tree, fixture blobs, run, attempt, job, compiler artifact and output; require independent readback and review.'
    ].join('\n');
  }
  function openTemplate(id){
    var t=data.templates.find(function(x){return x.id===id;});if(!t)return;
    var body=detail('Invariant',nameFor(t.invariant))+detail('Assumptions',t.assumptions)+
      detail('Safety contract',t.safety)+detail('Liveness contract',t.liveness)+
      detail('Formal model',t.model)+detail('Property-based tests',t.properties)+
      detail('Mutation negatives',t.mutants)+detail('Native guest conformance',t.guest)+
      '<div class="detail-banner">Template is a design starting point, not an executed proof or a verified compiler result.</div>'+
      '<button class="btn dark" data-copy-template="'+e(t.id)+'">Copy formal template</button>';
    openInspector(t.name,body);
  }
  function toast(s){
    el('toast').textContent=s;el('toast').hidden=false;
    clearTimeout(toast.timer);toast.timer=setTimeout(function(){el('toast').hidden=true;},3300);
  }
  function download(name,content,mime){
    var blob=new Blob([content],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  function csvEscape(s){
    var v=String(s===null||s===undefined?'':s);
    if(/^[\s]*[=+\-@]/.test(v))v="'"+v;
    return '"'+v.replace(/"/g,'""')+'"';
  }
  function exportCSV(){
    var rows=[['repo','pr','title','backend','severity','state','head','tree','tree_source','invariants','evidence_class','workflow_run','job','attempt','steps','runner_admission','guest_proof','merge_gate']];
    visiblePrs().forEach(function(p){
      var w=p.workflow;
      rows.push([p.repo,p.number,p.title,p.backend,p.severity,p.state,p.head,p.tree||'',p.treeSource,p.invariants.join(';'),p.evidence,w&&w.run||'',w&&w.job||'',w&&w.attempt||'',stepCount(w),stepClassification(w),'UNVERIFIED',mergeGate(p)]);
    });
    download('atto-assurance-filtered-prs.csv',rows.map(function(r){return r.map(csvEscape).join(',');}).join('\n'),'text/csv;charset=utf-8');
  }
  function exportJSON(){
    download('atto-assurance-snapshot.json',JSON.stringify({snapshot:data,localTaskStatus:taskState,exportWarning:'This is an unverified local snapshot, not a GitHub or guest attestation.'},null,2),'application/json');
  }
  function parseImport(textContent){
    if(textContent.length>2*1024*1024)throw new Error('Import too large (max 2 MiB)');
    var parsed=JSON.parse(textContent);
    var snapshot=parsed && parsed.snapshot && parsed.snapshot.schemaVersion===1 ? parsed.snapshot : parsed;
    validate(snapshot);
    var cloned=JSON.parse(JSON.stringify(snapshot));
    // A browser JSON file cannot authenticate a GitHub run or genuine compiler artifact.
    cloned.source='Unverified local JSON import';cloned.imported=true;
    cloned.prs.forEach(function(p){p.guest='NOT_INDEPENDENTLY_VERIFIED';if(p.workflow){p.workflow.headBound=false;p.workflow.checkoutHeadVerified=false;}});
    if(cloned.modelReport){cloned.modelReport.guestExecution='NOT_EXECUTED';cloned.modelReport.unboundedProof=false;cloned.modelReport.refinementProven=false;cloned.modelReport.provenance='UNVERIFIED_BROWSER_IMPORT';}
    return cloned;
  }
  document.getElementById('nav').addEventListener('click',function(ev){
    var b=ev.target.closest('[data-view]');if(b)navigate(b.dataset.view);
  });
  document.getElementById('view').addEventListener('click',function(ev){
    var x=ev.target.closest('[data-open-pr]');if(x){openPR(x.dataset.openPr);return;}
    x=ev.target.closest('[data-open-inv]');if(x){openInvariant(x.dataset.openInv);return;}
    x=ev.target.closest('[data-open-task]');if(x){openTask(x.dataset.openTask);return;}
    x=ev.target.closest('[data-open-template]');if(x){openTemplate(x.dataset.openTemplate);return;}
    x=ev.target.closest('[data-copy-template]');if(x){copyTemplate(x.dataset.copyTemplate);return;}
    x=ev.target.closest('[data-queue-tab]');if(x){queueTab=x.dataset.queueTab;render();return;}
  });
  document.getElementById('view').addEventListener('change',function(ev){
    var x=ev.target.closest('[data-task-status]');if(!x)return;
    var value=x.value;
    if(!['Open','In progress','Blocked','Done'].includes(value))return;
    taskState[x.dataset.taskStatus]=value;
    try{localStorage.setItem(TASK_KEY,JSON.stringify(taskState));}catch(err){toast('Local storage unavailable');}
    render();toast('Local task status saved · GitHub unchanged');
  });
  document.getElementById('view').addEventListener('keydown',function(ev){
    var row=ev.target.closest('tr[data-open-pr]');
    if(row && (ev.key==='Enter'||ev.key===' ')){ev.preventDefault();openPR(row.dataset.openPr);}
  });
  function copyTemplate(id){
    var t=data.templates.find(function(x){return x.id===id;});if(!t)return;
    if(navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(templateText(t)).then(function(){toast('Template copied');}).catch(function(){toast('Clipboard not available in this context');});
    } else {toast('Clipboard access not available; open template to select text');}
  }
  document.getElementById('inspector').addEventListener('click',function(ev){
    var x=ev.target.closest('[data-close]');if(x){closeInspector();return;}
    x=ev.target.closest('[data-open-pr]');if(x){openPR(x.dataset.openPr);return;}
    x=ev.target.closest('[data-copy-template]');if(x){copyTemplate(x.dataset.copyTemplate);return;}
  });
  el('scrim').addEventListener('click',closeInspector);
  ['Search','Repo','Backend','Pr','Invariant','Evidence','Severity','Status'].forEach(function(name){
    var dom=el('f'+name),key=name.charAt(0).toLowerCase()+name.slice(1);
    dom.addEventListener(name==='Search'?'input':'change',function(){f[key]=dom.value;render();});
  });
  el('clearFilters').addEventListener('click',function(){
    Object.keys(f).forEach(function(k){f[k]='';});setupFilters();render();
  });
  el('mobileMenu').addEventListener('click',function(){el('shell').classList.toggle('menu-open');});
  el('csvBtn').addEventListener('click',exportCSV);
  el('exportBtn').addEventListener('click',exportJSON);
  el('importBtn').addEventListener('click',function(){el('fileInput').click();});
  el('fileInput').addEventListener('change',function(ev){
    var file=ev.target.files && ev.target.files[0];if(!file)return;
    if(file.size>2*1024*1024){toast('Import rejected: file too large');ev.target.value='';return;}
    file.text().then(function(txt){
      var next=parseImport(txt);
      data=next;taskState={};Object.keys(f).forEach(function(k){f[k]='';});
      localStorage.setItem(SNAPSHOT_KEY,JSON.stringify(data));
      localStorage.removeItem(TASK_KEY);setupFilters();render();toast('Local snapshot imported · receipts remain unverified');
    }).catch(function(err){toast('Import rejected: '+err.message);});
    ev.target.value='';
  });
  document.addEventListener('keydown',function(ev){
    if(ev.key==='Escape'){closeInspector();el('shell').classList.remove('menu-open');}
    if(ev.key==='/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){ev.preventDefault();el('fSearch').focus();}
  });
  window.addEventListener('hashchange',function(){var next=location.hash.slice(1);if(titles[next] && next!==view){view=next;render();}});
  // Exposed for source-only tests. These helpers do not assert real guest execution.
  window.ATTO_ASSURANCE_TEST = Object.freeze({stepClassification:stepClassification,mergeGate:mergeGate,validate:validate,parseImport:parseImport,templateText:templateText});
  setupFilters();render();
})();
