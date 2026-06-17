const SAVED_KEY = "jobscout_saved_v1";
const PREF_KEY  = "jobscout_prefs_v1";
let JOBS = [], DEF = {title_keywords:[],medical_keywords:[],level_tokens:[],cities:[],metro:[],remote_ok:true};
/* Built-in filter chips are read from the static HTML so each edition keeps its
   own labels (e.g. "Physics core" vs "Game core"). ACTIVE holds the toggled-on
   filters; empty set == "All". Filters combine with AND. */
const BUILTIN = [...document.querySelectorAll("#filters .chip")]
  .map(c=>({f:c.dataset.f, label:(c.textContent||"").trim()}))
  .filter(b=>b.f && b.f!=="all");
const ALL_LABEL = (document.querySelector('#filters .chip[data-f="all"]')||{}).textContent || "All";
const ACTIVE = new Set();
const saved = new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"));
const prefs = Object.assign(
  {disabled:{kw:[],city:[]}, added:{kw:[],city:[]}, include:{kw:[],city:[]},
   off:{addkw:[],addcity:[],inckw:[],inccity:[]}, remoteOnly:false, showHidden:false},
  JSON.parse(localStorage.getItem(PREF_KEY) || "{}"));
/* backfill nested shapes for prefs saved by older versions */
prefs.disabled = Object.assign({kw:[],city:[]}, prefs.disabled||{});
prefs.added    = Object.assign({kw:[],city:[]}, prefs.added||{});
prefs.include  = Object.assign({kw:[],city:[]}, prefs.include||{});
prefs.off      = Object.assign({addkw:[],addcity:[],inckw:[],inccity:[]}, prefs.off||{});

const el = (s) => document.querySelector(s);
const lc = (a) => (a||[]).map(x=>x.toLowerCase());
const esc = (s) => String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const has = (arr,v) => (arr||[]).some(x=>x.toLowerCase()===String(v).toLowerCase());
const drop = (arr,v) => { const i=(arr||[]).findIndex(x=>x.toLowerCase()===String(v).toLowerCase()); if(i>=0)arr.splice(i,1); };
function savePrefs(){ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }
function persistSaved(){ localStorage.setItem(SAVED_KEY, JSON.stringify([...saved])); }
function keyOf(j){ return (j.company_name + "|" + j.title).toLowerCase(); }
function money(j){ if(!j.salary_min) return null;
  const k=n=>"$"+Math.round(n/1000)+"k";
  return j.salary_max&&j.salary_max!==j.salary_min ? k(j.salary_min)+"–"+k(j.salary_max) : k(j.salary_min)+"+"; }
function isTulsa(j){ const t=(j.location_text+" "+(j.city||"")+" "+(j.state||"")).toLowerCase();
  return j.remote_type!=="remote" && /tulsa|broken arrow|owasso|bixby|sand springs|jenks|catoosa|sapulpa|glenpool|collinsville|coweta|wagoner|skiatook/.test(t); }

/* A "search" entry is an aggregator query, not a specific posting — its link
   opens current matching results on a job board, so we label it honestly. */
function isSearch(j){ return (j.source||"").toLowerCase().startsWith("search:"); }
function searchSite(j){
  const s=(j.source||"").split(":")[1]||"";
  const names={"talent.com":"Talent.com",indeed:"Indeed",glassdoor:"Glassdoor",ziprecruiter:"ZipRecruiter",linkedin:"LinkedIn",google:"Google Jobs",jooble:"Jooble"};
  return names[s] || (s ? s.charAt(0).toUpperCase()+s.slice(1) : "job board");
}
/* strip fabricated "(NN live openings)" counts from any displayed title */
function cleanTitle(j){ return (j.title||"").replace(/\s*[\(\[]\s*\d+\+?\s*(live\s+)?(openings?|jobs?|results?|matches?)\s*[\)\]]/ig,"").trim(); }

/* ---- effective filter lists (defaults +/- user edits, minus paused ones) ---- */
function effWords(){
  const offDef=new Set(lc(prefs.disabled.kw)), offAdd=new Set(lc(prefs.off.addkw));
  const base=[...DEF.title_keywords,...DEF.medical_keywords,...DEF.level_tokens].map(x=>x.toLowerCase()).filter(w=>!offDef.has(w));
  const added=lc(prefs.added.kw).filter(w=>!offAdd.has(w));
  return [...base, ...added];
}
function effCities(){
  const offDef=new Set(lc(prefs.disabled.city)), offAdd=new Set(lc(prefs.off.addcity));
  const base=lc(DEF.cities).filter(c=>!offDef.has(c));
  const added=lc(prefs.added.city).filter(c=>!offAdd.has(c));
  return [...base, ...added];
}
function incWords(){ const off=new Set(lc(prefs.off.inckw)); return lc(prefs.include.kw).filter(w=>!off.has(w)); }
function incCities(){ const off=new Set(lc(prefs.off.inccity)); return lc(prefs.include.city).filter(c=>!off.has(c)); }

/* client-side exclusion — mirrors engine/filters.py so edits take effect live */
function excludeReason(j){
  const title=(j.title||"").toLowerCase();
  for(const w of effWords()){
    if(!w) continue;
    if(w.length<=3){ if(new RegExp("\\b"+w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\b").test(title)) return "word '"+w+"'"; }
    else if(title.includes(w)) return "word '"+w+"'";
  }
  if(j.remote_type==="remote") return "";
  const loc=((j.location_text||"")+" "+(j.city||"")).toLowerCase();
  if(lc(DEF.metro).some(c=>loc.includes(c))) return "";
  for(const c of effCities()){ if(c&&loc.includes(c)) return "city '"+c+"'"; }
  return "";
}
/* must-match: if any include terms are active, a job must match at least one */
function includeReason(j){
  const iw=incWords(), ic=incCities();
  if(!iw.length && !ic.length) return "";
  const title=(j.title||"").toLowerCase();
  const loc=((j.location_text||"")+" "+(j.city||"")+" "+(j.state||"")).toLowerCase();
  const hit = iw.some(w=>title.includes(w)) || ic.some(c=>loc.includes(c));
  return hit ? "" : "no required keyword";
}
function hiddenReason(j){ return excludeReason(j) || includeReason(j); }

/* a job passes the row when it satisfies EVERY active filter (AND) */
function passesFilter(j,f){
  if(f==="tulsa") return isTulsa(j);
  if(f==="remote") return j.remote_type==="remote";
  if(f==="entry") return j.seniority==="entry"||j.seniority==="intern"||(j.sub_scores&&j.sub_scores.entry>=12);
  if(f==="strong") return j.sub_scores && j.sub_scores.title>=17.5;
  if(f==="saved") return saved.has(keyOf(j));
  return true;
}
function matches(j){
  if(prefs.remoteOnly && j.remote_type!=="remote") return false;
  for(const f of ACTIVE){ if(!passesFilter(j,f)) return false; }
  return true;
}

/* rebuild the filter row: built-in toggle chips + a divider + custom-criteria
   chips. Custom chips: tap body to pause/resume, tap ✕ to delete entirely. */
function custChip(cls,kind,val,label,toggleable){
  const paused = toggleable && (
    (kind==="addkw"&&has(prefs.off.addkw,val)) || (kind==="addcity"&&has(prefs.off.addcity,val)) ||
    (kind==="inckw"&&has(prefs.off.inckw,val)) || (kind==="inccity"&&has(prefs.off.inccity,val)));
  const main = toggleable ? `data-custtoggle="${kind}" data-val="${esc(val)}"` : `data-custdel="${kind}" data-val="${esc(val)}"`;
  return `<button class="chip cust ${cls} ${paused?"paused":""}" ${main} title="${toggleable?"Tap to turn on/off":"Tap to remove"}">${label}<b class="px" data-custdel="${kind}" data-val="${esc(val)}" title="Remove">✕</b></button>`;
}
function customChips(){
  const out=[];
  if(prefs.remoteOnly) out.push(custChip("cust-on","remoteOnly","","Remote only",false));
  for(const w of prefs.added.kw)    out.push(custChip("cust-hide","addkw",w,`Hiding “${esc(w)}”`,true));
  for(const c of prefs.added.city)  out.push(custChip("cust-hide","addcity",c,`Hiding “${esc(c)}”`,true));
  for(const w of prefs.include.kw)  out.push(custChip("cust-inc","inckw",w,`“${esc(w)}”`,true));
  for(const c of prefs.include.city)out.push(custChip("cust-inc","inccity",c,`“${esc(c)}”`,true));
  for(const w of prefs.disabled.kw) out.push(custChip("cust-show","delkw",w,`Showing “${esc(w)}”`,false));
  for(const c of prefs.disabled.city)out.push(custChip("cust-show","delcity",c,`Showing “${esc(c)}”`,false));
  return out;
}
function renderFilters(){
  const builtin=[`<button class="chip ${ACTIVE.size===0?"active":""}" data-f="all">${esc(ALL_LABEL.trim())}</button>`]
    .concat(BUILTIN.map(b=>`<button class="chip ${ACTIVE.has(b.f)?"active":""}" data-f="${b.f}">${esc(b.label)}</button>`));
  const cust=customChips();
  el("#filters").innerHTML = builtin.join("") + (cust.length ? `<span class="chip-div" aria-hidden="true"></span>`+cust.join("") : "");
  const hintEl=el("#filterhint");
  if(hintEl){ hintEl.textContent = cust.length ? "Tap a custom pill to mute or un-mute it · ✕ removes it" : ""; hintEl.style.display = cust.length ? "" : "none"; }
}

function briefing(){
  const vis=JOBS.filter(j=>!hiddenReason(j));
  const strong=vis.filter(j=>j.fit_score>=72).length;
  const local=vis.filter(isTulsa).length;
  const remote=vis.filter(j=>j.remote_type==="remote").length;
  const hidden=JOBS.length-vis.length;
  const when=new Date(window.__GEN__||Date.now());
  el("#briefing").innerHTML=
    `<h2>Good morning ☀</h2>
     <p class="big"><b>${vis.length}</b> matching opportunities · <b>${strong}</b> strong (72+)</p>
     <p>${local} in the Tulsa metro · ${remote} remote · ${hidden} filtered out · saved: ${saved.size}</p>
     <p>Updated ${when.toLocaleDateString()} · ${window.__PROFILE__||"profile"}</p>`;
}

function card(j){
  const reason=hiddenReason(j);
  const p=Math.min(100,Math.round(j.fit_score));
  const tags=[];
  if(isTulsa(j)) tags.push('<span class="tag loc">Tulsa metro</span>');
  if(j.remote_type==="remote") tags.push('<span class="tag rem">Remote</span>');
  const m=money(j); if(m) tags.push(`<span class="tag sal">${m}</span>`);
  if(j.seniority==="entry"||j.seniority==="intern") tags.push('<span class="tag entry">Entry</span>');
  if(isSearch(j)) tags.push(`<span class="tag search">🔎 ${searchSite(j)} search</span>`);
  if(reason) tags.push(`<span class="tag hide">Hidden: ${reason}</span>`);
  const on=saved.has(keyOf(j))?"on":"";
  const reasons=(j.fit_reason||[]).map(r=>`<li>• ${r}</li>`).join("");
  return `<article class="jobcard ${reason?"hidden-job":""}" data-k="${keyOf(j)}">
    <div class="score" style="--p:${p}"><span>${p}</span></div>
    <div class="jc-body">
      <p class="jc-title">${cleanTitle(j)}</p>
      <p class="jc-co">${j.company_name}</p>
      <div class="tags">${tags.join("")}</div>
      <ul class="reasons">${reasons}</ul>
    </div>
    <button class="star ${on}" data-star="${keyOf(j)}">${on?"★":"☆"}</button>
  </article>`;
}

function render(){
  renderFilters();
  briefing();
  let items=JOBS.filter(matches);
  if(!prefs.showHidden) items=items.filter(j=>!hiddenReason(j));
  el("#list").innerHTML=items.length ? items.map(card).join("")
    : `<div class="empty">No jobs in this view.<br>Try another filter or adjust ⚙ filters.</div>`;
  el("#foot").innerHTML=`Real listings from public sources — verify on the employer page before applying.<br>Tap a card for the score breakdown · ⚙ to edit filters.`;
}

function openSheet(j){
  const sub=j.sub_scores||{};
  const labels={title:"Title relevance",degree:"Degree fit",entry:"Entry-level",location:"Location",salary:"Salary",skills:"Skills",freshness:"Freshness"};
  const max={title:25,degree:20,entry:15,location:15,salary:10,skills:10,freshness:5};
  const bars=Object.keys(labels).map(k=>{const v=sub[k]||0,pct=Math.round(v/max[k]*100);
    return `<div class="bar"><span style="width:96px">${labels[k]}</span><div class="track"><div class="fill" style="width:${pct}%"></div></div><span>${v}/${max[k]}</span></div>`;}).join("");
  const m=money(j);
  const search=isSearch(j), site=searchSite(j);
  const note=search
    ? `<p class="searchnote">🔎 This is a live <b>${site}</b> search, not a single posting. The link opens current matching roles — titles and counts change as employers post and close jobs.</p>`
    : "";
  const btn=search
    ? `<a class="applybtn" href="${j.apply_url}" target="_blank" rel="noopener">Browse ${site} results →</a>`
    : `<a class="applybtn" href="${j.apply_url}" target="_blank" rel="noopener">Apply / View posting →</a>`;
  el("#sheetCard").innerHTML=`<h2>${cleanTitle(j)}</h2>
    <p class="jc-co">${j.company_name} · ${j.location_text||"—"}${m?" · "+m:""}</p>
    <div class="subbars"><b style="font-size:13px;color:var(--accent)">Fit ${Math.round(j.fit_score)}/100</b>${bars}</div>
    <p class="desc">${(j.description||"No description.").slice(0,1200)}</p>
    ${note}
    ${btn}
    <p class="foot" style="padding:12px 0 0">Source: ${j.source}</p>
    <button class="closebtn" data-close="sheet">Close</button>`;
  el("#sheet").classList.remove("hidden");
}

/* ---------- settings / filter editor ---------- */
function chip(label,isDefault,off,kind){
  return `<span class="fchip ${off?"off":""}"><span>${esc(label)}</span><b data-tog="${kind}" data-val="${esc(label)}">×</b></span>`;
}
function incChipHTML(label,kind){
  return `<span class="fchip inc"><span>${esc(label)}</span><b data-incdel="${kind}" data-val="${esc(label)}">×</b></span>`;
}
function openSettings(){
  const offKw=new Set(lc(prefs.disabled.kw)), offCity=new Set(lc(prefs.disabled.city));
  const words=[...DEF.title_keywords,...DEF.medical_keywords,...DEF.level_tokens];
  const wordChips=words.map(w=>chip(w,true,offKw.has(w.toLowerCase()),"kw")).join("")
    + prefs.added.kw.map(w=>chip(w,false,false,"kw")).join("");
  const cityChips=DEF.cities.map(c=>chip(c,true,offCity.has(c.toLowerCase()),"city")).join("")
    + prefs.added.city.map(c=>chip(c,false,false,"city")).join("");
  const incKwChips=prefs.include.kw.map(w=>incChipHTML(w,"inckw")).join("") || `<span class="hint">none — showing all titles</span>`;
  const incCityChips=prefs.include.city.map(c=>incChipHTML(c,"inccity")).join("") || `<span class="hint">none — any location</span>`;
  el("#settingsCard").innerHTML=`
    <h2>Filters</h2>
    <p class="jc-co">Edits apply instantly, save on this device, and appear as chips on the filter row.</p>
    <div class="set-sec inc-sec"><h3>Must include — title words</h3>
      <p class="hint">If set, only jobs whose title contains at least one of these are shown.</p>
      <div class="chiplist" id="inckwlist">${incKwChips}</div>
      <div class="addrow"><input id="inckwadd" placeholder="add a word (e.g. optics)"><button data-add="inckw">Add</button></div>
    </div>
    <div class="set-sec inc-sec"><h3>Must include — cities</h3>
      <p class="hint">If set, only jobs in at least one of these locations are shown.</p>
      <div class="chiplist" id="inccitylist">${incCityChips}</div>
      <div class="addrow"><input id="inccityadd" placeholder="add a city (e.g. dallas)"><button data-add="inccity">Add</button></div>
    </div>
    <div class="set-sec"><h3>Excluded title words</h3>
      <p class="hint">Jobs whose title contains any of these are hidden. Tap × to toggle a default off, or add your own.</p>
      <div class="chiplist" id="kwlist">${wordChips}</div>
      <div class="addrow"><input id="kwadd" placeholder="add a word (e.g. senior)"><button data-add="kw">Add</button></div>
    </div>
    <div class="set-sec"><h3>Excluded cities (non-remote)</h3>
      <p class="hint">Onsite jobs in these cities are hidden. Remote jobs and anything in the Tulsa metro are always kept.</p>
      <div class="chiplist" id="citylist">${cityChips}</div>
      <div class="addrow"><input id="cityadd" placeholder="add a city (e.g. wichita)"><button data-add="city">Add</button></div>
    </div>
    <div class="set-sec">
      <div class="toggle"><span>Remote-only</span><button class="switch ${prefs.remoteOnly?"on":""}" data-sw="remoteOnly"><i></i></button></div>
      <div class="toggle"><span>Show hidden jobs (dimmed)</span><button class="switch ${prefs.showHidden?"on":""}" data-sw="showHidden"><i></i></button></div>
    </div>
    <button class="resetbtn" id="resetFilters">Reset filters to defaults</button>
    <button class="closebtn" data-close="settings">Close</button>`;
  el("#settings").classList.remove("hidden");
}
function toggleDefault(kind,val){
  const arr=prefs.disabled[kind], i=arr.findIndex(x=>x.toLowerCase()===val.toLowerCase());
  const isDefaultItem=(kind==="kw"
    ? [...DEF.title_keywords,...DEF.medical_keywords,...DEF.level_tokens]
    : DEF.cities).some(x=>x.toLowerCase()===val.toLowerCase());
  if(isDefaultItem){ if(i>=0)arr.splice(i,1); else arr.push(val); }
  else { drop(prefs.added[kind],val); drop(prefs.off["add"+kind],val); }
  savePrefs(); openSettings(); render();
}

/* custom-criteria chips on the filter row: pause/resume or delete a criterion */
function toggleCustom(kind,val){
  const bucket={addkw:"addkw",addcity:"addcity",inckw:"inckw",inccity:"inccity"}[kind];
  if(!bucket) return;
  has(prefs.off[bucket],val) ? drop(prefs.off[bucket],val) : prefs.off[bucket].push(val);
  savePrefs(); render();
}
function removeCustom(kind,val){
  if(kind==="remoteOnly"){ prefs.remoteOnly=false; }
  else if(kind==="addkw"){ drop(prefs.added.kw,val); drop(prefs.off.addkw,val); }
  else if(kind==="addcity"){ drop(prefs.added.city,val); drop(prefs.off.addcity,val); }
  else if(kind==="inckw"){ drop(prefs.include.kw,val); drop(prefs.off.inckw,val); }
  else if(kind==="inccity"){ drop(prefs.include.city,val); drop(prefs.off.inccity,val); }
  else if(kind==="delkw"){ drop(prefs.disabled.kw,val); }
  else if(kind==="delcity"){ drop(prefs.disabled.city,val); }
  savePrefs(); render();
}

document.addEventListener("click",(e)=>{
  const cl=e.target.closest("[data-close]");
  if(cl){ const t=el("#"+cl.dataset.close); if(t) t.classList.add("hidden"); return; }
  const sw=e.target.closest("[data-sw]");
  if(sw){ prefs[sw.dataset.sw]=!prefs[sw.dataset.sw]; savePrefs(); openSettings(); render(); return; }
  const tog=e.target.closest("[data-tog]");
  if(tog){ toggleDefault(tog.dataset.tog,tog.dataset.val); return; }
  const incdel=e.target.closest("[data-incdel]");
  if(incdel){ const k=incdel.dataset.incdel; drop(k==="inckw"?prefs.include.kw:prefs.include.city, incdel.dataset.val);
    savePrefs(); openSettings(); render(); return; }
  const add=e.target.closest("[data-add]");
  if(add){ const kind=add.dataset.add;
    const inputId={kw:"#kwadd",city:"#cityadd",inckw:"#inckwadd",inccity:"#inccityadd"}[kind];
    const inp=el(inputId); const v=(inp&&inp.value||"").trim();
    if(v){
      if(kind==="kw") prefs.added.kw.push(v);
      else if(kind==="city") prefs.added.city.push(v);
      else if(kind==="inckw") prefs.include.kw.push(v);
      else if(kind==="inccity") prefs.include.city.push(v);
      savePrefs(); openSettings(); render();
    } return; }
  if(e.target.id==="resetFilters"){ prefs.disabled={kw:[],city:[]}; prefs.added={kw:[],city:[]};
    prefs.include={kw:[],city:[]}; prefs.off={addkw:[],addcity:[],inckw:[],inccity:[]};
    prefs.remoteOnly=false; prefs.showHidden=false; savePrefs(); openSettings(); render(); return; }
  const star=e.target.closest("[data-star]");
  if(star){ const k=star.dataset.star; saved.has(k)?saved.delete(k):saved.add(k); persistSaved(); render(); return; }
  const cardEl=e.target.closest(".jobcard");
  if(cardEl){ const j=JOBS.find(x=>keyOf(x)===cardEl.dataset.k); if(j) openSheet(j); }
});
el("#sheet").onclick=(e)=>{ if(e.target.id==="sheet") el("#sheet").classList.add("hidden"); };
el("#settingsBtn").onclick=openSettings;
el("#settings").onclick=(e)=>{ if(e.target.id==="settings") el("#settings").classList.add("hidden"); };
/* filter row: ✕ deletes a criterion; body of a custom chip pauses/resumes it;
   built-in chips toggle (AND) */
el("#filters").addEventListener("click",(e)=>{
  const del=e.target.closest("[data-custdel]");
  if(del){ removeCustom(del.dataset.custdel, del.dataset.val); return; }
  const tg=e.target.closest("[data-custtoggle]");
  if(tg){ toggleCustom(tg.dataset.custtoggle, tg.dataset.val); return; }
  const c=e.target.closest(".chip"); if(!c||!c.dataset.f) return;
  const f=c.dataset.f;
  if(f==="all") ACTIVE.clear();
  else { ACTIVE.has(f) ? ACTIVE.delete(f) : ACTIVE.add(f); }
  render();
});
el("#refreshBtn").onclick=()=>load(true);

async function load(bust){
  try{
    const [jr,fr]=await Promise.all([
      fetch("data/jobs.json"+(bust?("?t="+Date.now()):"")),
      fetch("data/filters.json"+(bust?("?t="+Date.now()):"")).catch(()=>null)
    ]);
    const d=await jr.json();
    window.__GEN__=d.generated_at; window.__PROFILE__=d.profile; JOBS=d.jobs||[];
    if(fr){ try{ DEF=Object.assign(DEF, await fr.json()); }catch(e){} }
  }catch(err){ JOBS=[]; }
  render();
}
load();
if("serviceWorker" in navigator){ navigator.serviceWorker.register("sw.js").catch(()=>{}); }
