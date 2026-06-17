const SAVED_KEY = "jobscout_saved_v1";
const PREF_KEY  = "jobscout_prefs_v1";
let JOBS = [], DEF = {title_keywords:[],medical_keywords:[],level_tokens:[],cities:[],metro:[],remote_ok:true};
let FILTER = "all";
const saved = new Set(JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"));
const prefs = Object.assign(
  {disabled:{kw:[],city:[]}, added:{kw:[],city:[]}, remoteOnly:false, showHidden:false},
  JSON.parse(localStorage.getItem(PREF_KEY) || "{}"));

const el = (s) => document.querySelector(s);
const lc = (a) => (a||[]).map(x=>x.toLowerCase());
function savePrefs(){ localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }
function persistSaved(){ localStorage.setItem(SAVED_KEY, JSON.stringify([...saved])); }
function keyOf(j){ return (j.company_name + "|" + j.title).toLowerCase(); }
function money(j){ if(!j.salary_min) return null;
  const k=n=>"$"+Math.round(n/1000)+"k";
  return j.salary_max&&j.salary_max!==j.salary_min ? k(j.salary_min)+"–"+k(j.salary_max) : k(j.salary_min)+"+"; }
function isTulsa(j){ const t=(j.location_text+" "+(j.city||"")+" "+(j.state||"")).toLowerCase();
  return j.remote_type!=="remote" && /tulsa|broken arrow|owasso|bixby|sand springs|jenks|catoosa|sapulpa|glenpool|collinsville|coweta|wagoner|skiatook/.test(t); }

/* effective (default + user) filter lists */
function effWords(){
  const base=[...DEF.title_keywords,...DEF.medical_keywords,...DEF.level_tokens].map(x=>x.toLowerCase());
  const off=new Set(lc(prefs.disabled.kw));
  return [...base.filter(w=>!off.has(w)), ...lc(prefs.added.kw)];
}
function effCities(){
  const off=new Set(lc(prefs.disabled.city));
  return [...lc(DEF.cities).filter(c=>!off.has(c)), ...lc(prefs.added.city)];
}
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

function matches(j){
  if(prefs.remoteOnly && j.remote_type!=="remote") return false;
  if(FILTER==="all") return true;
  if(FILTER==="saved") return saved.has(keyOf(j));
  if(FILTER==="tulsa") return isTulsa(j);
  if(FILTER==="remote") return j.remote_type==="remote";
  if(FILTER==="entry") return j.seniority==="entry"||j.seniority==="intern"||(j.sub_scores&&j.sub_scores.entry>=12);
  if(FILTER==="strong") return j.sub_scores && j.sub_scores.title>=17.5;
  return true;
}

function briefing(){
  const vis=JOBS.filter(j=>!excludeReason(j));
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
  const reason=excludeReason(j);
  const p=Math.min(100,Math.round(j.fit_score));
  const tags=[];
  if(isTulsa(j)) tags.push('<span class="tag loc">Tulsa metro</span>');
  if(j.remote_type==="remote") tags.push('<span class="tag rem">Remote</span>');
  const m=money(j); if(m) tags.push(`<span class="tag sal">${m}</span>`);
  if(j.seniority==="entry"||j.seniority==="intern") tags.push('<span class="tag entry">Entry</span>');
  if(reason) tags.push(`<span class="tag hide">Hidden: ${reason}</span>`);
  const on=saved.has(keyOf(j))?"on":"";
  const reasons=(j.fit_reason||[]).map(r=>`<li>• ${r}</li>`).join("");
  return `<article class="jobcard ${reason?"hidden-job":""}" data-k="${keyOf(j)}">
    <div class="score" style="--p:${p}"><span>${p}</span></div>
    <div class="jc-body">
      <p class="jc-title">${j.title}</p>
      <p class="jc-co">${j.company_name}</p>
      <div class="tags">${tags.join("")}</div>
      <ul class="reasons">${reasons}</ul>
    </div>
    <button class="star ${on}" data-star="${keyOf(j)}">${on?"★":"☆"}</button>
  </article>`;
}

function render(){
  briefing();
  let items=JOBS.filter(matches);
  if(!prefs.showHidden) items=items.filter(j=>!excludeReason(j));
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
  el("#sheetCard").innerHTML=`<h2>${j.title}</h2>
    <p class="jc-co">${j.company_name} · ${j.location_text||"—"}${m?" · "+m:""}</p>
    <div class="subbars"><b style="font-size:13px;color:var(--accent)">Fit ${Math.round(j.fit_score)}/100</b>${bars}</div>
    <p class="desc">${(j.description||"No description.").slice(0,1200)}</p>
    <a class="applybtn" href="${j.apply_url}" target="_blank" rel="noopener">Apply / View posting →</a>
    <p class="foot" style="padding:12px 0 0">Source: ${j.source}</p>`;
  el("#sheet").classList.remove("hidden");
}

/* ---------- settings / filter editor ---------- */
function chip(label,isDefault,off,kind){
  return `<span class="fchip ${off?"off":""}"><span>${label}</span><b data-tog="${kind}" data-val="${label}">×</b></span>`;
}
function openSettings(){
  const offKw=new Set(lc(prefs.disabled.kw)), offCity=new Set(lc(prefs.disabled.city));
  const words=[...DEF.title_keywords,...DEF.medical_keywords,...DEF.level_tokens];
  const wordChips=words.map(w=>chip(w,true,offKw.has(w.toLowerCase()),"kw")).join("")
    + prefs.added.kw.map(w=>chip(w,false,false,"kw")).join("");
  const cityChips=DEF.cities.map(c=>chip(c,true,offCity.has(c.toLowerCase()),"city")).join("")
    + prefs.added.city.map(c=>chip(c,false,false,"city")).join("");
  el("#settingsCard").innerHTML=`
    <h2>Filters</h2>
    <p class="jc-co">Edits apply instantly and save on this device.</p>
    <div class="set-sec"><h3>Excluded title words</h3>
      <p class="hint">Jobs whose title contains any of these are hidden. Tap × to toggle a default off, or add your own.</p>
      <div class="chiplist" id="kwlist">${wordChips}</div>
      <div class="addrow"><input id="kwadd" placeholder="add a word (e.g. welder)"><button data-add="kw">Add</button></div>
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
    <button class="resetbtn" id="resetFilters">Reset filters to defaults</button>`;
  el("#settings").classList.remove("hidden");
}
function toggleDefault(kind,val){
  const arr=prefs.disabled[kind], i=arr.findIndex(x=>x.toLowerCase()===val.toLowerCase());
  const isDefaultItem=(kind==="kw"
    ? [...DEF.title_keywords,...DEF.medical_keywords,...DEF.level_tokens]
    : DEF.cities).some(x=>x.toLowerCase()===val.toLowerCase());
  if(isDefaultItem){ if(i>=0)arr.splice(i,1); else arr.push(val); }
  else { const a=prefs.added[kind], j=a.findIndex(x=>x.toLowerCase()===val.toLowerCase()); if(j>=0)a.splice(j,1); }
  savePrefs(); openSettings(); render();
}

document.addEventListener("click",(e)=>{
  const sw=e.target.closest("[data-sw]");
  if(sw){ prefs[sw.dataset.sw]=!prefs[sw.dataset.sw]; savePrefs(); openSettings(); render(); return; }
  const tog=e.target.closest("[data-tog]");
  if(tog){ toggleDefault(tog.dataset.tog,tog.dataset.val); return; }
  const add=e.target.closest("[data-add]");
  if(add){ const kind=add.dataset.add; const inp=el(kind==="kw"?"#kwadd":"#cityadd");
    const v=(inp.value||"").trim(); if(v){ prefs.added[kind].push(v); savePrefs(); openSettings(); render(); } return; }
  if(e.target.id==="resetFilters"){ prefs.disabled={kw:[],city:[]}; prefs.added={kw:[],city:[]};
    prefs.remoteOnly=false; prefs.showHidden=false; savePrefs(); openSettings(); render(); return; }
  const star=e.target.closest("[data-star]");
  if(star){ const k=star.dataset.star; saved.has(k)?saved.delete(k):saved.add(k); persistSaved(); render(); return; }
  const cardEl=e.target.closest(".jobcard");
  if(cardEl){ const j=JOBS.find(x=>keyOf(x)===cardEl.dataset.k); if(j) openSheet(j); }
});
el("#sheetClose").onclick=()=>el("#sheet").classList.add("hidden");
el("#sheet").onclick=(e)=>{ if(e.target.id==="sheet") el("#sheet").classList.add("hidden"); };
el("#settingsBtn").onclick=openSettings;
el("#settingsClose").onclick=()=>el("#settings").classList.add("hidden");
el("#settings").onclick=(e)=>{ if(e.target.id==="settings") el("#settings").classList.add("hidden"); };
el("#filters").addEventListener("click",(e)=>{ const c=e.target.closest(".chip"); if(!c)return;
  document.querySelectorAll(".chip").forEach(x=>x.classList.remove("active"));
  c.classList.add("active"); FILTER=c.dataset.f; render(); });
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
