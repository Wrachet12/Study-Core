/* ===================== AUTH (real accounts via Supabase) ===================== */
// Fill in your project's URL + anon key in js/config.js — see README.md.
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUserId = null;
let data = null; // current user's app data object (mirrors a JSON column in Supabase)

function newNotebookSet(prefix){
  return [1,2,3,4,5].map(i => ({ name: `Subject ${i}`, pages: {} }));
}
function newUserData(){
  return {
    xp:0, level:1, streak:0, lastActiveDate:null,
    tasks:[], leitner:{1:[],2:[],3:[],4:[],5:[]}, leitnerSeq:0,
    bubbles:[], connections:[], bubbleSeq:0,
    basicNotebooks: newNotebookSet(), formalNotebooks: newNotebookSet(),
    flashcardStacks: [1,2,3,4,5].map(i => ({ name: `Subject ${i}`, cards: [] })), flashcardSeq:0,
    feynman: { entries: [], countSinceUnlock:0, lockUntilTs:null, draft:{concept:'',explain:'',gaps:'',simplify:''} },
    questionLog: {
      subjects: [1,2,3,4,5].map(i => ({ name: `Subject ${i}`, terms: {1:[],2:[],3:[],4:[]} })),
      questionSeq:0, practiceTests: [], testSeq:0, mistakes: [], mistakeSeq:0
    }
  };
}

document.getElementById('showLogin').addEventListener('click', ()=>switchAuthTab('login'));
document.getElementById('showSignup').addEventListener('click', ()=>switchAuthTab('signup'));
function switchAuthTab(which){
  document.getElementById('showLogin').classList.toggle('active', which==='login');
  document.getElementById('showSignup').classList.toggle('active', which==='signup');
  document.getElementById('loginForm').style.display = which==='login' ? 'flex' : 'none';
  document.getElementById('signupForm').style.display = which==='signup' ? 'flex' : 'none';
}

document.getElementById('signupPassword').addEventListener('input', (e)=>{
  const v = e.target.value;
  const strength = v.length>=12 && /[0-9]/.test(v) && /[A-Z]/.test(v) ? 'Strong' : v.length>=8 && /[0-9]/.test(v) ? 'Okay' : 'Weak';
  document.getElementById('signupStrength').textContent = v ? `Strength: ${strength}` : '';
});

document.getElementById('signupForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim().toLowerCase();
  const pw = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirm').value;
  const errEl = document.getElementById('signupError');
  if(pw.length<8){ errEl.textContent='Password needs at least 8 characters.'; return; }
  if(pw!==confirm){ errEl.textContent="Passwords don't match."; return; }
  errEl.textContent='';
  submitBtn.disabled = true; submitBtn.textContent = 'Creating account…';
  const { data: signUpData, error } = await sb.auth.signUp({
    email, password: pw, options: { data: { name: name || email.split('@')[0] } }
  });
  submitBtn.disabled = false; submitBtn.textContent = 'Create account';
  if(error){ errEl.textContent = error.message; return; }
  if(!signUpData.session){
    // Project has email confirmation turned on — no session yet.
    showToast('Account created. Check your email to confirm, then log in.');
    switchAuthTab('login');
    return;
  }
  await loadProfileAndEnter(signUpData.user.id, signUpData.user.email);
});

document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pw = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent='';
  submitBtn.disabled = true; submitBtn.textContent = 'Logging in…';
  const { data: signInData, error } = await sb.auth.signInWithPassword({ email, password: pw });
  submitBtn.disabled = false; submitBtn.textContent = 'Log in';
  if(error){ errEl.textContent = 'Incorrect email or password.'; return; }
  await loadProfileAndEnter(signInData.user.id, signInData.user.email);
});

async function loadProfileAndEnter(userId, email){
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', userId).single();
  if(error || !profile){
    showToast('Could not load your account data — check your connection and try again.');
    return;
  }
  currentUserId = userId;
  data = Object.assign(newUserData(), profile.app_data || {});
  document.getElementById('authOverlay').style.display='none';
  document.getElementById('appShell').style.display='block';
  document.getElementById('userName').textContent = profile.name || (email ? email.split('@')[0] : 'Student');
  renderAll();
}

document.getElementById('logoutBtn').addEventListener('click', async ()=>{
  await saveData(); // flush any unsaved changes first
  await sb.auth.signOut();
  currentUserId=null; data=null;
  document.getElementById('appShell').style.display='none';
  document.getElementById('authOverlay').style.display='flex';
  document.getElementById('loginEmail').value=''; document.getElementById('loginPassword').value='';
});

// Restore an existing session automatically (e.g. you refreshed the page).
(async function restoreSession(){
  const { data: sessionData } = await sb.auth.getSession();
  if(sessionData && sessionData.session){
    await loadProfileAndEnter(sessionData.session.user.id, sessionData.session.user.email);
  }
})();

/* ===================== CLOUD SAVE ===================== */
let saveTimer = null;
function scheduleSave(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveData, 900);
}
async function saveData(){
  if(!currentUserId || !data) return;
  try{
    await sb.from('profiles').update({ app_data: data, updated_at: new Date().toISOString() }).eq('id', currentUserId);
  }catch(err){
    console.error('Save failed', err);
    showToast('Could not save your changes — check your connection.');
  }
}
window.addEventListener('beforeunload', ()=>{ if(currentUserId) saveData(); });

/* ===================== HELPERS ===================== */
const INTERVALS = {1:1,2:2,3:4,4:9,5:14};
const todayStr = ()=> new Date().toISOString().slice(0,10);
const addDays = (dateStr,n)=>{ const d=new Date(dateStr+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const daysBetween = (a,b)=> Math.round((new Date(b+'T00:00:00') - new Date(a+'T00:00:00'))/86400000);

/* ===================== TOASTS / ENCOURAGEMENT ===================== */
const ENCOURAGE = [
  "Nice work — future you says thanks.",
  "One step closer. Keep that momentum.",
  "Small steps add up. You're doing it.",
  "That's progress, not perfection — and it counts.",
  "Streak's alive. Don't let today be the gap.",
  "Your brain just got a little stronger.",
  "Locked in. That's how it's done."
];
function showToast(msg){
  const el = document.createElement('div');
  el.className='toast';
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(()=>el.remove(), 4200);
}
function maybeNotify(title, body){
  if(typeof Notification === 'undefined') return;
  if(Notification.permission === 'granted'){ try{ new Notification(title,{body}); }catch(e){} }
}
function encourage(){ showToast(ENCOURAGE[Math.floor(Math.random()*ENCOURAGE.length)]); }

/* ===================== GAMIFICATION ===================== */
function awardXP(amount, withEncouragement){
  if(!data) return;
  data.xp += amount;
  const newLevel = Math.floor(data.xp/100)+1;
  const leveledUp = newLevel > data.level;
  data.level = newLevel;
  touchStreak();
  renderStats();
  if(leveledUp){ showToast(`Level up! You're now level ${data.level}.`); }
  if(withEncouragement) encourage();
  scheduleSave();
}
function touchStreak(){
  const t = todayStr();
  if(data.lastActiveDate === t) return;
  if(data.lastActiveDate){
    const gap = daysBetween(data.lastActiveDate, t);
    data.streak = (gap===1) ? data.streak+1 : 1;
  } else { data.streak = 1; }
  data.lastActiveDate = t;
  if(data.streak>1 && data.streak%5===0) showToast(`${data.streak}-day streak! Procrastination doesn't stand a chance.`);
}
function renderStats(){
  document.getElementById('levelNum').textContent = data.level;
  document.getElementById('xpNum').textContent = data.xp;
  document.getElementById('streakNum').textContent = data.streak;
  document.getElementById('xpBar').style.width = (data.xp % 100) + '%';
}

/* ===================== TAB SWITCHING ===================== */
document.querySelectorAll('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  });
});
document.querySelectorAll('.subtab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.subtab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.subpanel').forEach(p=>p.style.display='none');
    btn.classList.add('active');
    document.getElementById(btn.dataset.sub).style.display='block';
  });
});
document.querySelectorAll('.qsubtab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.qsubtab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.qsubpanel').forEach(p=>p.style.display='none');
    btn.classList.add('active');
    document.getElementById(btn.dataset.qsub).style.display='block';
  });
});

/* ===================== PLANNER ===================== */
document.getElementById('taskStart').value = todayStr();
document.getElementById('taskDue').value = addDays(todayStr(),7);

function checkVague(){
  const text = document.getElementById('taskTitle').value.trim();
  const words = text.split(/\s+/).filter(Boolean);
  const broad = /\b(test|exam|midterm|final|study|finish|class)\b/i.test(text);
  const box = document.getElementById('vagueWarning');
  if(text.length===0){ box.innerHTML=''; return; }
  if(broad && words.length<=4){
    box.innerHTML = `<div class="tip risk">⚠ This reads like an end goal, not a step. Risky — it's vague about what to actually do today. Try something like "Redo last quiz's wrong answers" instead.</div>`;
  } else {
    box.innerHTML = `<div class="tip good">Good — this is a concrete, doable step.</div>`;
  }
}
document.getElementById('taskTitle').addEventListener('input', checkVague);

document.getElementById('addTaskBtn').addEventListener('click', ()=>{
  if(!data) return;
  const title = document.getElementById('taskTitle').value.trim();
  const type = document.getElementById('taskType').value;
  const qty = parseInt(document.getElementById('taskQty').value)||0;
  const start = document.getElementById('taskStart').value;
  let due = document.getElementById('taskDue').value;
  if(!title || !due){ showToast('Add a step description and a due date first.'); return; }

  const parkinson = document.getElementById('parkCheck').checked;
  let effectiveDue = due;
  if(parkinson){
    const totalDays = Math.max(1, daysBetween(start,due));
    const tightened = Math.max(1, Math.floor(totalDays*0.85));
    effectiveDue = addDays(start, tightened);
  }
  data.tasks.push({ id: Date.now(), title, type, qty: type==='none'?0:qty, start, due, effectiveDue, parkinson, doneDays:[] });
  document.getElementById('taskTitle').value='';
  document.getElementById('vagueWarning').innerHTML='';
  awardXP(5,true);
  renderTasks();
});

document.getElementById('filterRec').addEventListener('click', ()=>setFilter('rec'));
document.getElementById('filterRisk').addEventListener('click', ()=>setFilter('risk'));
let currentFilter='rec';
function setFilter(f){
  currentFilter=f;
  document.getElementById('filterRec').classList.toggle('active', f==='rec');
  document.getElementById('filterRisk').classList.toggle('active', f==='risk');
  renderTasks();
}
function flexibilityScore(task){
  const remaining = Math.max(0, daysBetween(todayStr(), task.effectiveDue));
  if(task.qty<=0) return remaining;
  return remaining / task.qty;
}
function renderTasks(){
  if(!data) return;
  const list = document.getElementById('taskList');
  if(data.tasks.length===0){ list.innerHTML = '<p style="color:#888;font-size:.85rem;">Nothing planned yet — add your first step above.</p>'; return; }
  const withScore = data.tasks.map(t=>({t, score: flexibilityScore(t)}));
  withScore.sort((a,b)=> currentFilter==='rec' ? a.score-b.score : b.score-a.score);
  list.innerHTML = withScore.map(({t,score})=>{
    const remaining = Math.max(0, daysBetween(todayStr(), t.effectiveDue));
    const daysTotal = Math.max(1, daysBetween(t.start, t.effectiveDue));
    let badgeClass='flex-mid', badgeLabel='Moderate flexibility';
    if(score < 1) { badgeClass='flex-low'; badgeLabel='Low flexibility — urgent'; }
    else if(score > 3){ badgeClass='flex-high'; badgeLabel='High flexibility'; }
    let breakdownRows='';
    if(t.qty>0){
      const perDay = Math.ceil(t.qty / daysTotal);
      let remainderQty = t.qty;
      for(let i=0;i<daysTotal;i++){
        const day = addDays(t.start,i);
        const amount = (i===daysTotal-1) ? remainderQty : Math.min(perDay, remainderQty);
        remainderQty -= amount;
        const done = t.doneDays.includes(day);
        breakdownRows += `<tr class="${done?'done':''}"><td>${day}</td><td>${amount} ${t.type}</td><td><button class="btn small ${done?'ghost':'green'}" onclick="toggleDay(${t.id},'${day}')">${done?'Undo':'Mark done'}</button></td></tr>`;
      }
    }
    return `<div class="task">
      <div class="task-head">
        <div>
          <div class="task-title">${t.title}</div>
          <div style="font-size:.78rem;color:#777;margin-top:2px;">Due ${t.due}${t.parkinson?` · tightened to ${t.effectiveDue} (Parkinson's Law)`:''} · ${remaining} day(s) left</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <span class="badge ${badgeClass}">${badgeLabel}</span>
          <button class="btn small red" onclick="removeTask(${t.id})">Delete</button>
        </div>
      </div>
      ${t.qty>0 ? `<details><summary>Daily breakdown (${daysTotal} day plan)</summary><table class="daily-table"><tr><th>Date</th><th>Target</th><th></th></tr>${breakdownRows}</table></details>` : ''}
    </div>`;
  }).join('');
}
function removeTask(id){ data.tasks = data.tasks.filter(t=>t.id!==id); renderTasks(); scheduleSave(); }
function toggleDay(id, day){
  const t = data.tasks.find(t=>t.id===id);
  if(!t) return;
  const idx = t.doneDays.indexOf(day);
  if(idx>-1){ t.doneDays.splice(idx,1); scheduleSave(); } else { t.doneDays.push(day); awardXP(8,true); }
  renderTasks();
}

/* ===================== TIMER ===================== */
let workSec=25*60, breakSec=5*60, longBreakSec=15*60;
let remaining=workSec, mode='Focus', running=false, timerHandle=null, sessionCount=0;
const timeDisplay = document.getElementById('timeDisplay');
const modeDisplay = document.getElementById('modeDisplay');
const sessionCounter = document.getElementById('sessionCounter');
function fmt(s){ const m=Math.floor(s/60); const sec=s%60; return String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0'); }
function renderTimer(){ timeDisplay.textContent = fmt(remaining); modeDisplay.textContent = mode; }
renderTimer();
document.getElementById('startBtn').addEventListener('click', ()=>{
  if(typeof Notification!=='undefined' && Notification.permission==='default'){ Notification.requestPermission(); }
  workSec = (parseInt(document.getElementById('workMin').value)||25)*60;
  breakSec = (parseInt(document.getElementById('breakMin').value)||5)*60;
  longBreakSec = (parseInt(document.getElementById('longBreakMin').value)||15)*60;
  if(running) return;
  running=true;
  timerHandle = setInterval(tick,1000);
});
document.getElementById('workMin').addEventListener('input', (e)=>{
  workSec = (parseInt(e.target.value)||25)*60;
  if(!running && mode==='Focus'){ remaining = workSec; renderTimer(); }
});
document.getElementById('breakMin').addEventListener('input', (e)=>{
  breakSec = (parseInt(e.target.value)||5)*60;
  if(!running && mode==='Break'){ remaining = breakSec; renderTimer(); }
});
document.getElementById('longBreakMin').addEventListener('input', (e)=>{
  longBreakSec = (parseInt(e.target.value)||15)*60;
  if(!running && mode==='Long break'){ remaining = longBreakSec; renderTimer(); }
});
document.getElementById('pauseBtn').addEventListener('click', ()=>{ running=false; clearInterval(timerHandle); });
document.getElementById('resetBtn').addEventListener('click', ()=>{
  running=false; clearInterval(timerHandle); mode='Focus'; remaining=workSec; sessionCount=0; renderTimer();
  sessionCounter.textContent = `Session 0 of 4 before a long break`;
});
function tick(){
  remaining--;
  if(remaining<=0){
    if(mode==='Focus'){
      sessionCount++;
      awardXP(10,false);
      maybeNotify('Focus session complete', "Nice — time for a breather.");
      showToast('Focus session done! Take a short break.');
      if(sessionCount % 4 === 0){ mode='Long break'; remaining=longBreakSec; } else { mode='Break'; remaining=breakSec; }
      sessionCounter.textContent = `Session ${sessionCount} of 4 before a long break`;
    } else {
      mode='Focus'; remaining=workSec;
      maybeNotify('Break is over', "Let's get back to it — you've got this.");
      showToast("Break's over. Back to it — momentum is on your side.");
    }
  }
  renderTimer();
}
function isWeekendOrOff(){ const d=new Date().getDay(); return d===0||d===6; }
function buildSchedule(){
  const strip = document.getElementById('scheduleStrip');
  strip.innerHTML='';
  const now = new Date(); const hour = now.getHours();
  let currentCls='neutral';
  for(let h=0;h<24;h++){
    const seg = document.createElement('div');
    seg.className='seg';
    let cls='neutral';
    if(h>=4 && h<7) cls='risky';
    else if(h>=16 && h<20) cls='good';
    else if(h>=10 && h<14) cls = isWeekendOrOff() ? 'good' : 'risky';
    seg.classList.add(cls);
    strip.appendChild(seg);
    if(h===hour){ currentCls=cls; }
  }
  const marker = document.createElement('div');
  marker.className='now-marker';
  marker.style.left = ((hour+0.5)/24*100)+'%';
  strip.appendChild(marker);
  const note = document.getElementById('scheduleNote');
  if(currentCls==='good') note.textContent = "Right now is a recommended study window.";
  else if(currentCls==='risky') note.textContent = "Right now is a risky window for studying — focus is usually lower here, or it's reserved for weekends/days off.";
  else note.textContent = "Right now is a neutral window — fine for lighter review.";
}
buildSchedule();
setInterval(buildSchedule, 60000);

/* ===================== NOTES: NOTEBOOKS (5 subjects x 300 pages) ===================== */
const MAX_PAGES = 300;
let basicActiveSubject = 0, basicActivePage = 1;
let formalActiveSubject = 0, formalActivePage = 1;

function applyFont(textareaIds, fontSelectId, sizeSelectId){
  const font = document.getElementById(fontSelectId).value;
  const size = document.getElementById(sizeSelectId).value;
  textareaIds.forEach(id=>{ const el=document.getElementById(id); el.style.fontFamily=font; el.style.fontSize=size+'px'; });
}
document.getElementById('basicFont').addEventListener('change', ()=>applyFont(['basicNote'],'basicFont','basicSize'));
document.getElementById('basicSize').addEventListener('change', ()=>applyFont(['basicNote'],'basicFont','basicSize'));
document.getElementById('formalFont').addEventListener('change', ()=>applyFont(['formalTerms','formalNotes','formalSummary'],'formalFont','formalSize'));
document.getElementById('formalSize').addEventListener('change', ()=>applyFont(['formalTerms','formalNotes','formalSummary'],'formalFont','formalSize'));

function renderSubjectTabs(containerId, notebooks, activeIndex, onSelect){
  const wrap = document.getElementById(containerId);
  wrap.innerHTML = notebooks.map((nb,i)=>
    `<button class="${i===activeIndex?'active':''}" data-i="${i}">${nb.name}</button>`
  ).join('');
  wrap.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('click', ()=> onSelect(parseInt(btn.dataset.i)));
  });
}

/* ---- Basic notebooks ---- */
function loadBasicPage(){
  const nb = data.basicNotebooks[basicActiveSubject];
  document.getElementById('basicSubjectName').value = nb.name;
  document.getElementById('basicPageNum').value = basicActivePage;
  document.getElementById('basicNote').value = nb.pages[basicActivePage] || '';
}
function renderBasicNotebooks(){
  renderSubjectTabs('basicSubjectTabs', data.basicNotebooks, basicActiveSubject, (i)=>{
    basicActiveSubject = i; basicActivePage = 1; renderBasicNotebooks();
  });
  loadBasicPage();
}
document.getElementById('basicSubjectName').addEventListener('input', (e)=>{
  data.basicNotebooks[basicActiveSubject].name = e.target.value || `Subject ${basicActiveSubject+1}`;
  renderSubjectTabs('basicSubjectTabs', data.basicNotebooks, basicActiveSubject, (i)=>{ basicActiveSubject=i; basicActivePage=1; renderBasicNotebooks(); });
  scheduleSave();
});
document.getElementById('basicNote').addEventListener('input', (e)=>{
  data.basicNotebooks[basicActiveSubject].pages[basicActivePage] = e.target.value;
  scheduleSave();
});
document.getElementById('basicNote').addEventListener('blur', (e)=>{ if(e.target.value.trim()) awardXP(3,false); });
function goBasicPage(n){
  n = Math.max(1, Math.min(MAX_PAGES, n));
  basicActivePage = n;
  loadBasicPage();
}
document.getElementById('basicPageNum').addEventListener('change', (e)=> goBasicPage(parseInt(e.target.value)||1));
document.getElementById('basicPrevPage').addEventListener('click', ()=> goBasicPage(basicActivePage-1));
document.getElementById('basicNextPage').addEventListener('click', ()=> goBasicPage(basicActivePage+1));

/* ---- Formal notebooks (Cornell) ---- */
function loadFormalPage(){
  const nb = data.formalNotebooks[formalActiveSubject];
  const page = nb.pages[formalActivePage] || {terms:'',notes:'',summary:''};
  document.getElementById('formalSubjectName').value = nb.name;
  document.getElementById('formalPageNum').value = formalActivePage;
  document.getElementById('formalTerms').value = page.terms || '';
  document.getElementById('formalNotes').value = page.notes || '';
  document.getElementById('formalSummary').value = page.summary || '';
}
function renderFormalNotebooks(){
  renderSubjectTabs('formalSubjectTabs', data.formalNotebooks, formalActiveSubject, (i)=>{
    formalActiveSubject = i; formalActivePage = 1; renderFormalNotebooks();
  });
  loadFormalPage();
}
document.getElementById('formalSubjectName').addEventListener('input', (e)=>{
  data.formalNotebooks[formalActiveSubject].name = e.target.value || `Subject ${formalActiveSubject+1}`;
  renderSubjectTabs('formalSubjectTabs', data.formalNotebooks, formalActiveSubject, (i)=>{ formalActiveSubject=i; formalActivePage=1; renderFormalNotebooks(); });
  scheduleSave();
});
function saveFormalField(field, value){
  const nb = data.formalNotebooks[formalActiveSubject];
  if(!nb.pages[formalActivePage]) nb.pages[formalActivePage] = {terms:'',notes:'',summary:''};
  nb.pages[formalActivePage][field] = value;
  scheduleSave();
}
document.getElementById('formalTerms').addEventListener('input', (e)=> saveFormalField('terms', e.target.value));
document.getElementById('formalNotes').addEventListener('input', (e)=> saveFormalField('notes', e.target.value));
document.getElementById('formalSummary').addEventListener('input', (e)=> saveFormalField('summary', e.target.value));
['formalTerms','formalNotes','formalSummary'].forEach(id=>{
  document.getElementById(id).addEventListener('blur', (e)=>{ if(e.target.value.trim()) awardXP(3,false); });
});
function goFormalPage(n){
  n = Math.max(1, Math.min(MAX_PAGES, n));
  formalActivePage = n;
  loadFormalPage();
}
document.getElementById('formalPageNum').addEventListener('change', (e)=> goFormalPage(parseInt(e.target.value)||1));
document.getElementById('formalPrevPage').addEventListener('click', ()=> goFormalPage(formalActivePage-1));
document.getElementById('formalNextPage').addEventListener('click', ()=> goFormalPage(formalActivePage+1));

/* ===================== FEYNMAN WORKSHEET (rate-limited) ===================== */
const FEYNMAN_DAILY_CAP = 5;
const fIds = {fConcept:'concept', fExplain:'explain', fGaps:'gaps', fSimplify:'simplify'};
Object.keys(fIds).forEach(id=>{
  document.getElementById(id).addEventListener('input', (e)=>{
    data.feynman.draft[fIds[id]] = e.target.value;
    scheduleSave();
  });
});
function loadFeynmanDraft(){
  Object.keys(fIds).forEach(id=>{ document.getElementById(id).value = data.feynman.draft[fIds[id]] || ''; });
}
function fmtCountdown(ms){
  if(ms<=0) return '0m';
  const totalMin = Math.ceil(ms/60000);
  const days = Math.floor(totalMin/1440), hrs = Math.floor((totalMin%1440)/60), mins = totalMin%60;
  let out='';
  if(days) out += days+'d ';
  if(hrs || days) out += hrs+'h ';
  out += mins+'m';
  return out.trim();
}
function nextTwoPM(fromTs){
  const d = new Date(fromTs);
  d.setDate(d.getDate()+1);
  d.setHours(14,0,0,0);
  return d.getTime();
}
function renderFeynmanStatus(){
  const status = document.getElementById('feynmanStatus');
  const btn = document.getElementById('feynmanDoneBtn');
  const now = Date.now();
  if(data.feynman.lockUntilTs && now < data.feynman.lockUntilTs){
    status.className = 'tip risk';
    status.textContent = `Daily limit reached. Unlocks in ${fmtCountdown(data.feynman.lockUntilTs - now)} (2:00 PM tomorrow).`;
    btn.disabled = true;
  } else {
    if(data.feynman.lockUntilTs && now >= data.feynman.lockUntilTs){
      data.feynman.lockUntilTs = null;
      data.feynman.countSinceUnlock = 0;
    }
    const remainingToday = FEYNMAN_DAILY_CAP - data.feynman.countSinceUnlock;
    status.className = 'tip good';
    status.textContent = `${remainingToday} of ${FEYNMAN_DAILY_CAP} sessions left today.`;
    btn.disabled = false;
  }
}
document.getElementById('feynmanDoneBtn').addEventListener('click', ()=>{
  const now = Date.now();
  if(data.feynman.lockUntilTs && now < data.feynman.lockUntilTs) return;
  const d = data.feynman.draft;
  if(!d.concept.trim() && !d.explain.trim() && !d.gaps.trim() && !d.simplify.trim()){
    showToast('Fill in at least one box before marking it complete.');
    return;
  }
  data.feynman.entries.push({ ts: now, ...d });
  data.feynman.countSinceUnlock++;
  data.feynman.draft = {concept:'',explain:'',gaps:'',simplify:''};
  loadFeynmanDraft();
  if(data.feynman.countSinceUnlock >= FEYNMAN_DAILY_CAP){
    data.feynman.lockUntilTs = nextTwoPM(now);
  }
  renderFeynmanStatus();
  awardXP(15,false);
  showToast('Great job applying the Feynman Technique!');
});
setInterval(renderFeynmanStatus, 30000);

/* ===================== FLASHCARDS ===================== */
let flashActiveStack = 0, flashActiveCard = 0, flashFlipped = false;
function renderFlashStackTabs(){
  renderSubjectTabs('flashStackTabs', data.flashcardStacks, flashActiveStack, (i)=>{
    flashActiveStack = i; flashActiveCard = 0; flashFlipped = false; renderFlashAll();
  });
  document.getElementById('flashStackName').value = data.flashcardStacks[flashActiveStack].name;
}
function renderFlashCount(){
  const stack = data.flashcardStacks[flashActiveStack];
  document.getElementById('flashCount').textContent = `${stack.cards.length} / 150 cards in this stack`;
  document.getElementById('flashAddBtn').disabled = stack.cards.length >= 150;
}
function renderFlashViewer(){
  const stack = data.flashcardStacks[flashActiveStack];
  const wrap = document.getElementById('flashViewer');
  if(stack.cards.length === 0){
    wrap.innerHTML = '<div class="flash-empty">No cards yet — add one above.</div>';
    return;
  }
  if(flashActiveCard >= stack.cards.length) flashActiveCard = stack.cards.length-1;
  const card = stack.cards[flashActiveCard];
  const showing = flashFlipped ? card.back : card.front;
  const label = flashFlipped ? 'Answer' : 'Question';
  wrap.innerHTML = `
    <div class="flip-card" id="flipCardEl"><span class="side-label">${label}</span>${showing.replace(/</g,'&lt;') || '(blank)'}</div>
    <div class="flash-nav">
      <button class="btn small ghost" id="flashPrevBtn">‹ Prev</button>
      <button class="btn small blue" id="flashFlipBtn">Flip</button>
      <button class="btn small ghost" id="flashNextBtn">Next ›</button>
      <button class="btn small red" id="flashDeleteBtn">Delete</button>
    </div>
    <div class="flash-meta">Card ${flashActiveCard+1} of ${stack.cards.length}</div>
  `;
  document.getElementById('flipCardEl').addEventListener('click', toggleFlip);
  document.getElementById('flashFlipBtn').addEventListener('click', toggleFlip);
  document.getElementById('flashPrevBtn').addEventListener('click', ()=>{ flashActiveCard = (flashActiveCard-1+stack.cards.length)%stack.cards.length; flashFlipped=false; renderFlashViewer(); });
  document.getElementById('flashNextBtn').addEventListener('click', ()=>{ flashActiveCard = (flashActiveCard+1)%stack.cards.length; flashFlipped=false; renderFlashViewer(); });
  document.getElementById('flashDeleteBtn').addEventListener('click', ()=>{
    stack.cards.splice(flashActiveCard,1);
    flashFlipped=false;
    renderFlashCount(); renderFlashViewer(); scheduleSave();
  });
}
function toggleFlip(){ flashFlipped = !flashFlipped; renderFlashViewer(); }
function renderFlashAll(){ renderFlashStackTabs(); renderFlashCount(); renderFlashViewer(); }
document.getElementById('flashStackName').addEventListener('input', (e)=>{
  data.flashcardStacks[flashActiveStack].name = e.target.value || `Subject ${flashActiveStack+1}`;
  renderSubjectTabs('flashStackTabs', data.flashcardStacks, flashActiveStack, (i)=>{ flashActiveStack=i; flashActiveCard=0; flashFlipped=false; renderFlashAll(); });
  scheduleSave();
});
document.getElementById('flashAddBtn').addEventListener('click', ()=>{
  const stack = data.flashcardStacks[flashActiveStack];
  if(stack.cards.length >= 150){ showToast('This stack is full at 150 cards — try another stack.'); return; }
  const front = document.getElementById('flashFront').value.trim();
  const back = document.getElementById('flashBack').value.trim();
  if(!front || !back){ showToast('Fill in both the front and back of the card.'); return; }
  stack.cards.push({ id: data.flashcardSeq++, front, back });
  document.getElementById('flashFront').value=''; document.getElementById('flashBack').value='';
  flashActiveCard = stack.cards.length-1; flashFlipped=false;
  renderFlashCount(); renderFlashViewer();
  awardXP(2,false);
});

/* ===================== MINDMAP ===================== */
const canvas = document.getElementById('mindmapCanvas');
const svg = document.getElementById('mapLines');
const bubbleColors = ['#FBE3E1','#FBF1DC','#E7F4EB','#E3EEF8','#F1E5F6'];
let dragTarget=null, dragOffX=0, dragOffY=0, dragMoved=false;
let connectMode=false, connectFirst=null;

function createBubbleEl(entry){
  const el = document.createElement('div');
  el.className='bubble';
  el.dataset.id = entry.id;
  el.style.left = entry.x+'px';
  el.style.top = entry.y+'px';
  el.style.background = entry.color;
  el.innerHTML = `<span class="del">×</span><span class="txt" contenteditable="true">${entry.text}</span>`;
  el.querySelector('.del').addEventListener('click', (e)=>{ e.stopPropagation(); deleteBubble(entry.id); });
  el.querySelector('.txt').addEventListener('blur', ()=>{ entry.text = el.querySelector('.txt').textContent; scheduleSave(); });
  el.addEventListener('pointerdown', (e)=>onBubblePointerDown(e, el, entry));
  canvas.appendChild(el);
  return el;
}
function addBubble(x,y,text){
  if(!data) return;
  const entry = { id: data.bubbleSeq++, x: Math.max(0,x-60), y: Math.max(0,y-25), text: text||'New idea', color: bubbleColors[Math.floor(Math.random()*bubbleColors.length)] };
  data.bubbles.push(entry);
  createBubbleEl(entry);
  awardXP(2,false);
}
function deleteBubble(id){
  data.bubbles = data.bubbles.filter(b=>b.id!==id);
  data.connections = data.connections.filter(c=>c.from!==id && c.to!==id);
  const el = canvas.querySelector(`.bubble[data-id="${id}"]`);
  if(el) el.remove();
  renderLines();
  scheduleSave();
}
function onBubblePointerDown(e, el, entry){
  if(e.target.classList.contains('del')) return;
  if(connectMode){
    e.stopPropagation();
    if(e.target.classList.contains('txt')) e.preventDefault();
    if(!connectFirst){
      connectFirst = entry.id;
      el.classList.add('selected');
    } else if(connectFirst === entry.id){
      el.classList.remove('selected'); connectFirst=null;
    } else {
      toggleConnection(connectFirst, entry.id);
      canvas.querySelectorAll('.bubble.selected').forEach(b=>b.classList.remove('selected'));
      connectFirst=null;
    }
    return;
  }
  if(e.target.classList.contains('txt')) return;
  dragTarget = el; dragMoved=false;
  const rect = canvas.getBoundingClientRect();
  dragOffX = e.clientX - el.offsetLeft - rect.left;
  dragOffY = e.clientY - el.offsetTop - rect.top;
  document.addEventListener('pointermove', onDrag);
  document.addEventListener('pointerup', stopDrag);
}
function onDrag(e){
  if(!dragTarget) return;
  dragMoved=true;
  const rect = canvas.getBoundingClientRect();
  let nx = e.clientX - rect.left - dragOffX;
  let ny = e.clientY - rect.top - dragOffY;
  nx = Math.max(0, Math.min(nx, canvas.clientWidth-110));
  ny = Math.max(0, Math.min(ny, canvas.clientHeight-40));
  dragTarget.style.left = nx+'px';
  dragTarget.style.top = ny+'px';
  renderLines();
}
function stopDrag(){
  if(dragTarget && data){
    const id = parseInt(dragTarget.dataset.id);
    const entry = data.bubbles.find(b=>b.id===id);
    if(entry){ entry.x = dragTarget.offsetLeft; entry.y = dragTarget.offsetTop; }
    if(dragMoved) scheduleSave();
  }
  dragTarget=null;
  document.removeEventListener('pointermove', onDrag);
  document.removeEventListener('pointerup', stopDrag);
}
function toggleConnection(a,b){
  const idx = data.connections.findIndex(c => (c.from===a&&c.to===b)||(c.from===b&&c.to===a));
  if(idx>-1){ data.connections.splice(idx,1); } else { data.connections.push({from:a, to:b}); }
  renderLines();
  scheduleSave();
}
function renderLines(){
  if(!data) return;
  svg.innerHTML='';
  data.connections.forEach(c=>{
    const elA = canvas.querySelector(`.bubble[data-id="${c.from}"]`);
    const elB = canvas.querySelector(`.bubble[data-id="${c.to}"]`);
    if(!elA || !elB) return;
    const x1 = elA.offsetLeft + elA.offsetWidth/2, y1 = elA.offsetTop + elA.offsetHeight/2;
    const x2 = elB.offsetLeft + elB.offsetWidth/2, y2 = elB.offsetTop + elB.offsetHeight/2;
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',x1); line.setAttribute('y1',y1); line.setAttribute('x2',x2); line.setAttribute('y2',y2);
    line.setAttribute('stroke','#b3a98a'); line.setAttribute('stroke-width','2.5');
    svg.appendChild(line);
  });
}
function renderMindmap(){
  canvas.querySelectorAll('.bubble').forEach(b=>b.remove());
  data.bubbles.forEach(entry=>createBubbleEl(entry));
  renderLines();
}
canvas.addEventListener('dblclick', (e)=>{
  if(e.target !== canvas && e.target !== svg) return;
  const rect = canvas.getBoundingClientRect();
  addBubble(e.clientX-rect.left, e.clientY-rect.top);
});
document.getElementById('addBubbleBtn').addEventListener('click', ()=> addBubble(80+Math.random()*200, 60+Math.random()*200));
document.getElementById('connectModeBtn').addEventListener('click', (e)=>{
  connectMode = !connectMode;
  e.currentTarget.classList.toggle('active', connectMode);
  canvas.style.cursor = connectMode ? 'crosshair' : 'default';
  if(!connectMode && connectFirst!=null){
    canvas.querySelectorAll('.bubble.selected').forEach(b=>b.classList.remove('selected'));
    connectFirst=null;
  }
});
document.getElementById('clearMapBtn').addEventListener('click', ()=>{
  if(!data) return;
  data.bubbles=[]; data.connections=[];
  canvas.querySelectorAll('.bubble').forEach(b=>b.remove());
  svg.innerHTML='';
  scheduleSave();
});

/* ===================== LEITNER BOXES ===================== */
const boxLabels = {1:'Box 1 — hardest',2:'Box 2',3:'Box 3',4:'Box 4',5:'Box 5 — easiest'};
const DAY_MS = 86400000;
function renderBoxes(){
  if(!data) return;
  const wrap = document.getElementById('boxesWrap');
  wrap.innerHTML='';
  const now = Date.now();
  for(let b=1;b<=5;b++){
    const col = document.createElement('div');
    col.className='box-col';
    col.innerHTML = `<h4>${boxLabels[b]}</h4><div class="interval">review every ${INTERVALS[b]} day(s)</div>`;
    data.leitner[b].forEach(c=>{
      const due = now >= c.nextReviewTs;
      const cardEl = document.createElement('div');
      cardEl.className = 'lcard'+(due?' due':'');
      const dueText = due ? 'ready now' : `unlocks in ${fmtCountdown(c.nextReviewTs-now)}`;
      cardEl.innerHTML = `<div>${c.text}</div><div style="font-size:.68rem;color:#888;">${dueText}</div>
        <div class="actions">
          <button class="btn small green" ${due?'':'disabled'} onclick="reviewCard(${c.id},true)">Got it</button>
          <button class="btn small red" ${due?'':'disabled'} onclick="reviewCard(${c.id},false)">Still hard</button>
        </div>
        ${due?'':`<div class="wait">Locked until the review interval passes</div>`}`;
      col.appendChild(cardEl);
    });
    wrap.appendChild(col);
  }
}
document.getElementById('leitnerAddBtn').addEventListener('click', ()=>{
  if(!data) return;
  const input = document.getElementById('leitnerInput');
  const text = input.value.trim();
  if(!text) return;
  const box = parseInt(document.getElementById('leitnerBoxSelect').value)||1;
  const now = Date.now();
  data.leitner[box].push({ id: ++data.leitnerSeq, text, box, lastReviewTs: now, nextReviewTs: now + INTERVALS[box]*DAY_MS });
  input.value='';
  awardXP(3,false);
  renderBoxes();
});
function reviewCard(id, correct){
  const now = Date.now();
  for(let b=1;b<=5;b++){
    const idx = data.leitner[b].findIndex(c=>c.id===id);
    if(idx>-1){
      const card = data.leitner[b][idx];
      if(now < card.nextReviewTs) return; // still locked — guards against XP farming
      data.leitner[b].splice(idx,1);
      const newBox = correct ? Math.min(card.box+1,5) : 1;
      card.box = newBox; card.lastReviewTs = now; card.nextReviewTs = now + INTERVALS[newBox]*DAY_MS;
      data.leitner[newBox].push(card);
      awardXP(5,true);
      break;
    }
  }
  renderBoxes();
}
setInterval(renderBoxes, 30000);

/* ===================== QUESTION LOG ===================== */
const MAX_QUESTIONS_PER_TERM = 50;
let qActiveSubject = 0, qActiveTerm = 1, qEditingId = null, qPendingImage = '';

function renderQSubjectTabs(){
  renderSubjectTabs('qSubjectTabs', data.questionLog.subjects, qActiveSubject, (i)=>{
    qActiveSubject = i; qActiveTerm = 1; qEditingId=null; resetQuestionForm();
    renderQSubjectTabs(); renderQTermTabs(); updateQCountTip(); renderQList(); renderPtSubjectSelect();
  });
  document.getElementById('qSubjectName').value = data.questionLog.subjects[qActiveSubject].name;
}
document.getElementById('qSubjectName').addEventListener('input', (e)=>{
  data.questionLog.subjects[qActiveSubject].name = e.target.value || `Subject ${qActiveSubject+1}`;
  renderQSubjectTabs();
  renderPtSubjectSelect();
  scheduleSave();
});
function renderQTermTabs(){
  const wrap = document.getElementById('qTermTabs');
  wrap.innerHTML = [1,2,3,4].map(t=>`<button class="${t===qActiveTerm?'active':''}" data-t="${t}">Term ${t}</button>`).join('');
  wrap.querySelectorAll('button').forEach(b=>{
    b.addEventListener('click', ()=>{
      qActiveTerm = parseInt(b.dataset.t); qEditingId=null; resetQuestionForm();
      renderQTermTabs(); updateQCountTip(); renderQList();
    });
  });
}
function updateQCountTip(){
  const subj = data.questionLog.subjects[qActiveSubject];
  const termCount = subj.terms[qActiveTerm].length;
  const totalCount = [1,2,3,4].reduce((s,t)=>s+subj.terms[t].length,0);
  const tip = document.getElementById('qCountTip');
  tip.className = 'tip' + (termCount>=MAX_QUESTIONS_PER_TERM ? ' risk' : '');
  tip.textContent = `${termCount} / ${MAX_QUESTIONS_PER_TERM} questions in Term ${qActiveTerm} · ${totalCount} / 200 total in ${subj.name}`;
  document.getElementById('qAddBtn').disabled = termCount>=MAX_QUESTIONS_PER_TERM && !qEditingId;
}

function renderQTypeFields(prefill){
  const type = document.getElementById('qType').value;
  const wrap = document.getElementById('qTypeFields');
  if(type==='mcq'){
    wrap.innerHTML = `
      <div class="row">
        <div><label>Option A</label><input id="qOptA"></div>
        <div><label>Option B</label><input id="qOptB"></div>
      </div>
      <div class="row">
        <div><label>Option C</label><input id="qOptC"></div>
        <div><label>Option D</label><input id="qOptD"></div>
      </div>
      <label>Correct option</label>
      <select id="qCorrectMcq"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select>`;
    if(prefill){
      ['A','B','C','D'].forEach((L,i)=>{ document.getElementById('qOpt'+L).value = prefill.options[i]||''; });
      document.getElementById('qCorrectMcq').value = prefill.answer;
    }
  } else if(type==='tf'){
    wrap.innerHTML = `<label>Correct answer</label><select id="qCorrectTf"><option value="true">True</option><option value="false">False</option></select>`;
    if(prefill) document.getElementById('qCorrectTf').value = prefill.answer;
  } else {
    wrap.innerHTML = `<label>Model / reference answer (for self-checking later)</label><textarea id="qModelAnswer" style="min-height:50px;"></textarea>`;
    if(prefill) document.getElementById('qModelAnswer').value = prefill.answer || '';
  }
}
document.getElementById('qType').addEventListener('change', ()=>renderQTypeFields());

document.getElementById('qImageInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    qPendingImage = reader.result;
    document.getElementById('qImagePreview').innerHTML = `<img class="qimg-thumb" src="${qPendingImage}"><button class="btn small ghost" id="qRemoveImgBtn" style="margin-top:6px;">Remove image</button>`;
    document.getElementById('qRemoveImgBtn').addEventListener('click', ()=>{ qPendingImage=''; document.getElementById('qImagePreview').innerHTML=''; document.getElementById('qImageInput').value=''; });
  };
  reader.readAsDataURL(file);
});

function resetQuestionForm(){
  document.getElementById('qPrompt').value='';
  document.getElementById('qType').value='frq';
  document.getElementById('qCategory').value='';
  document.getElementById('qDifficulty').value='5';
  document.getElementById('qImageInput').value='';
  qPendingImage='';
  document.getElementById('qImagePreview').innerHTML='';
  renderQTypeFields();
  document.getElementById('qAddBtn').textContent = '+ Add question';
  document.getElementById('qCancelEditBtn').style.display='none';
  qEditingId = null;
  updateQCountTip();
}
document.getElementById('qCancelEditBtn').addEventListener('click', resetQuestionForm);

document.getElementById('qAddBtn').addEventListener('click', ()=>{
  const prompt = document.getElementById('qPrompt').value.trim();
  if(!prompt){ showToast('Write the question prompt first.'); return; }
  const type = document.getElementById('qType').value;
  const category = document.getElementById('qCategory').value.trim();
  const difficulty = Math.max(1, Math.min(10, parseInt(document.getElementById('qDifficulty').value)||5));
  let options=null, answer=null;
  if(type==='mcq'){
    options = ['qOptA','qOptB','qOptC','qOptD'].map(id=>document.getElementById(id).value.trim());
    if(options.some(o=>!o)){ showToast('Fill in all four options.'); return; }
    answer = parseInt(document.getElementById('qCorrectMcq').value);
  } else if(type==='tf'){
    answer = document.getElementById('qCorrectTf').value;
  } else {
    answer = document.getElementById('qModelAnswer').value.trim();
  }
  const terms = data.questionLog.subjects[qActiveSubject].terms;

  if(qEditingId){
    const q = terms[qActiveTerm].find(q=>q.id===qEditingId);
    if(q){ Object.assign(q, {type, prompt, category, difficulty, options, answer, image: qPendingImage}); }
  } else {
    if(terms[qActiveTerm].length >= MAX_QUESTIONS_PER_TERM){ showToast(`Term ${qActiveTerm} is full at ${MAX_QUESTIONS_PER_TERM} questions.`); return; }
    terms[qActiveTerm].push({ id: ++data.questionLog.questionSeq, type, prompt, category, difficulty, options, answer, image: qPendingImage });
    awardXP(2,false);
  }
  resetQuestionForm();
  renderQList();
  updateQCountTip();
  scheduleSave();
});

function loadQuestionIntoForm(id){
  const q = data.questionLog.subjects[qActiveSubject].terms[qActiveTerm].find(q=>q.id===id);
  if(!q) return;
  qEditingId = id;
  document.getElementById('qPrompt').value = q.prompt;
  document.getElementById('qType').value = q.type;
  document.getElementById('qCategory').value = q.category||'';
  document.getElementById('qDifficulty').value = q.difficulty;
  qPendingImage = q.image||'';
  document.getElementById('qImagePreview').innerHTML = qPendingImage ? `<img class="qimg-thumb" src="${qPendingImage}"><button class="btn small ghost" id="qRemoveImgBtn" style="margin-top:6px;">Remove image</button>` : '';
  if(qPendingImage) document.getElementById('qRemoveImgBtn').addEventListener('click', ()=>{ qPendingImage=''; document.getElementById('qImagePreview').innerHTML=''; });
  renderQTypeFields(q);
  document.getElementById('qAddBtn').textContent = 'Save changes';
  document.getElementById('qCancelEditBtn').style.display='inline-block';
  window.scrollTo({top: document.getElementById('qPrompt').offsetTop, behavior:'smooth'});
}
function deleteQuestion(id){
  const terms = data.questionLog.subjects[qActiveSubject].terms;
  terms[qActiveTerm] = terms[qActiveTerm].filter(q=>q.id!==id);
  renderQList(); updateQCountTip(); scheduleSave();
}
function renderQList(){
  const list = document.getElementById('qList');
  const questions = data.questionLog.subjects[qActiveSubject].terms[qActiveTerm];
  if(questions.length===0){ list.innerHTML = '<p style="color:#888;font-size:.85rem;">No questions yet in this term.</p>'; return; }
  const typeLabel = {frq:'FRQ', mcq:'Multiple choice', tf:'True/False'};
  list.innerHTML = questions.map(q=>`
    <div class="qcard">
      <div class="qcard-head">
        <div>
          <div class="qcard-prompt">${q.prompt.replace(/</g,'&lt;')}</div>
          <div class="qmeta">
            <span class="qtype-badge">${typeLabel[q.type]}</span>
            <span class="qdiff-badge">Difficulty ${q.difficulty}/10</span>
            ${q.category?`<span class="qcat-badge">${q.category.replace(/</g,'&lt;')}</span>`:''}
          </div>
          ${q.image?`<img class="qimg-thumb" src="${q.image}">`:''}
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn small ghost" onclick="loadQuestionIntoForm(${q.id})">Edit</button>
          <button class="btn small red" onclick="deleteQuestion(${q.id})">Delete</button>
        </div>
      </div>
    </div>`).join('');
}

/* ---- Practice tests ---- */
function renderPtSubjectSelect(){
  const sel = document.getElementById('ptSubject');
  const prev = sel.value;
  sel.innerHTML = data.questionLog.subjects.map((s,i)=>`<option value="${i}">${s.name}</option>`).join('');
  if(prev !== '' && prev < data.questionLog.subjects.length) sel.value = prev;
}
document.getElementById('ptCreateBtn').addEventListener('click', ()=>{
  const subjectIndex = parseInt(document.getElementById('ptSubject').value)||0;
  const term = parseInt(document.getElementById('ptTerm').value)||1;
  const subj = data.questionLog.subjects[subjectIndex];
  const questionIds = subj.terms[term].map(q=>q.id);
  if(questionIds.length===0){ showToast('That term has no questions yet.'); return; }
  const name = document.getElementById('ptName').value.trim() || `${subj.name} · Term ${term} test`;
  data.questionLog.practiceTests.push({ id: ++data.questionLog.testSeq, name, subjectIndex, term, questionIds, createdAt: Date.now() });
  document.getElementById('ptName').value='';
  awardXP(3,false);
  renderPtList();
  scheduleSave();
});
function renderPtList(){
  const wrap = document.getElementById('ptList');
  const tests = data.questionLog.practiceTests;
  if(tests.length===0){ wrap.innerHTML = '<p style="color:#888;font-size:.85rem;">No practice tests yet — create one above.</p>'; return; }
  wrap.innerHTML = tests.map(t=>{
    const subj = data.questionLog.subjects[t.subjectIndex];
    const subjName = subj ? subj.name : '(deleted subject)';
    return `<div class="pt-card">
      <div style="flex:1;min-width:200px;">
        <input value="${t.name.replace(/"/g,'&quot;')}" onchange="renameTest(${t.id}, this.value)">
        <div style="font-size:.75rem;color:#888;margin-top:4px;">${subjName} · Term ${t.term} · ${t.questionIds.length} question(s)</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn small green" onclick="startPracticeTest(${t.id})">Start</button>
        <button class="btn small red" onclick="deleteTest(${t.id})">Delete</button>
      </div>
    </div>`;
  }).join('');
}
function renameTest(id, newName){
  const t = data.questionLog.practiceTests.find(t=>t.id===id);
  if(t){ t.name = newName.trim() || t.name; scheduleSave(); }
}
function deleteTest(id){
  data.questionLog.practiceTests = data.questionLog.practiceTests.filter(t=>t.id!==id);
  renderPtList(); scheduleSave();
}

let ptRunnerState = null;
function startPracticeTest(id){
  const test = data.questionLog.practiceTests.find(t=>t.id===id);
  if(!test) return;
  const subj = data.questionLog.subjects[test.subjectIndex];
  const questions = test.questionIds.map(qid=>{
    for(const t of [1,2,3,4]){ const found = subj.terms[t].find(q=>q.id===qid); if(found) return found; }
    return null;
  }).filter(Boolean);
  if(questions.length===0){ showToast('All questions in this test have been deleted.'); return; }
  ptRunnerState = { test, subjectName: subj.name, questions, index:0, answers:new Array(questions.length).fill(null), selfChecks:new Array(questions.length).fill(null), stage:'answering' };
  renderPtRunner();
}
function ptSetAnswer(value){ ptRunnerState.answers[ptRunnerState.index] = value; }
function ptGoTo(i){
  ptRunnerState.index = Math.max(0, Math.min(ptRunnerState.questions.length-1, i));
  renderPtRunner();
}
function ptFinishAnswering(){
  ptRunnerState.stage = 'selfcheck';
  ptRunnerState.selfCheckQueue = ptRunnerState.questions.map((q,i)=>i).filter(i=>ptRunnerState.questions[i].type==='frq');
  ptRunnerState.selfCheckPointer = 0;
  renderPtRunner();
}
function ptSelfCheck(correct){
  const i = ptRunnerState.selfCheckQueue[ptRunnerState.selfCheckPointer];
  ptRunnerState.selfChecks[i] = correct;
  ptRunnerState.selfCheckPointer++;
  renderPtRunner();
}
function ptComputeResults(){
  let correctCount = 0;
  ptRunnerState.questions.forEach((q,i)=>{
    let isCorrect;
    if(q.type==='mcq') isCorrect = String(ptRunnerState.answers[i]) === String(q.answer);
    else if(q.type==='tf') isCorrect = String(ptRunnerState.answers[i]) === String(q.answer);
    else isCorrect = ptRunnerState.selfChecks[i] === true;
    if(isCorrect){ correctCount++; return; }
    const correctDisplay = q.type==='mcq' ? `${['A','B','C','D'][q.answer]}. ${q.options[q.answer]}` : q.type==='tf' ? (q.answer==='true'?'True':'False') : (q.answer || '(no model answer given)');
    let userDisplay;
    if(q.type==='mcq') userDisplay = (ptRunnerState.answers[i]!=null) ? `${['A','B','C','D'][ptRunnerState.answers[i]]}. ${q.options[ptRunnerState.answers[i]]}` : '(no answer)';
    else userDisplay = ptRunnerState.answers[i] || '(no answer)';
    data.questionLog.mistakes.push({
      id: ++data.questionLog.mistakeSeq, ts: Date.now(), subjectName: ptRunnerState.subjectName, term: ptRunnerState.test.term,
      prompt: q.prompt, type: q.type, correctAnswer: correctDisplay, userAnswer: userDisplay, explanation: ''
    });
  });
  ptRunnerState.stage = 'results';
  ptRunnerState.score = correctCount;
  awardXP(correctCount*4 + ptRunnerState.questions.length, true);
  renderMistakeList();
  scheduleSave();
}
function ptExit(){ ptRunnerState = null; renderPtRunner(); }
function renderPtRunner(){
  const wrap = document.getElementById('ptRunner');
  if(!ptRunnerState){ wrap.innerHTML=''; return; }
  const st = ptRunnerState;

  if(st.stage === 'answering'){
    const q = st.questions[st.index];
    let inputHtml = '';
    if(q.type==='mcq'){
      inputHtml = q.options.map((opt,i)=>`
        <label class="mcq-opt"><input type="radio" name="ptopt" value="${i}" ${st.answers[st.index]===i?'checked':''} onchange="ptSetAnswer(${i})"> ${['A','B','C','D'][i]}. ${opt.replace(/</g,'&lt;')}</label>`).join('');
    } else if(q.type==='tf'){
      inputHtml = `
        <label class="mcq-opt"><input type="radio" name="ptopt" value="true" ${st.answers[st.index]==='true'?'checked':''} onchange="ptSetAnswer('true')"> True</label>
        <label class="mcq-opt"><input type="radio" name="ptopt" value="false" ${st.answers[st.index]==='false'?'checked':''} onchange="ptSetAnswer('false')"> False</label>`;
    } else {
      inputHtml = `<textarea style="min-height:90px;" oninput="ptSetAnswer(this.value)">${st.answers[st.index]||''}</textarea>`;
    }
    const isLast = st.index === st.questions.length-1;
    wrap.innerHTML = `
      <div class="test-card">
        <div class="test-progress">Question ${st.index+1} of ${st.questions.length} — ${st.test.name}</div>
        <div class="qcard-prompt">${q.prompt.replace(/</g,'&lt;')}</div>
        ${q.image?`<img class="test-q-img" src="${q.image}">`:''}
        <div style="margin-top:12px;">${inputHtml}</div>
        <div class="test-nav">
          <button class="btn small ghost" onclick="ptGoTo(${st.index-1})" ${st.index===0?'disabled':''}>‹ Prev</button>
          <button class="btn small red" onclick="ptExit()">Exit test</button>
          ${isLast ? `<button class="btn small amber" onclick="ptFinishAnswering()">Review &amp; finish</button>` : `<button class="btn small blue" onclick="ptGoTo(${st.index+1})">Next ›</button>`}
        </div>
      </div>`;
  } else if(st.stage === 'selfcheck'){
    if(st.selfCheckPointer >= st.selfCheckQueue.length){ ptComputeResults(); renderPtRunner(); return; }
    const i = st.selfCheckQueue[st.selfCheckPointer];
    const q = st.questions[i];
    wrap.innerHTML = `
      <div class="test-card">
        <div class="test-progress">Self-check ${st.selfCheckPointer+1} of ${st.selfCheckQueue.length} free-response question(s)</div>
        <div class="qcard-prompt">${q.prompt.replace(/</g,'&lt;')}</div>
        ${q.image?`<img class="test-q-img" src="${q.image}">`:''}
        <div class="answer-compare" style="margin-top:10px;">
          <div><strong>You wrote:</strong><br>${(st.answers[i]||'(no answer)').replace(/</g,'&lt;')}</div>
          <div><strong>Model answer:</strong><br>${(q.answer||'(none provided)').replace(/</g,'&lt;')}</div>
        </div>
        <div class="pillgroup">
          <button class="btn small green" onclick="ptSelfCheck(true)">I got this right</button>
          <button class="btn small red" onclick="ptSelfCheck(false)">I got this wrong</button>
        </div>
      </div>`;
  } else if(st.stage === 'results'){
    wrap.innerHTML = `
      <div class="test-card">
        <h3>Results: ${st.score} / ${st.questions.length} correct</h3>
        <p style="font-size:.85rem;color:#666;">Anything you missed just got logged in the Mistake Log tab — add an explanation there while it's fresh.</p>
        <button class="btn amber" onclick="ptExit()">Done</button>
      </div>`;
  }
}

/* ---- Mistake log ---- */
function renderMistakeList(){
  const wrap = document.getElementById('mistakeList');
  const mistakes = data.questionLog.mistakes.slice().sort((a,b)=>b.ts-a.ts);
  if(mistakes.length===0){ wrap.innerHTML = '<p style="color:#888;font-size:.85rem;">No mistakes logged yet — they\'ll show up here after a practice test.</p>'; return; }
  wrap.innerHTML = mistakes.map(m=>`
    <div class="mistake-card">
      <div class="qcard-prompt">${m.prompt.replace(/</g,'&lt;')}</div>
      <div class="qmeta"><span class="qtype-badge">${m.subjectName} · Term ${m.term}</span></div>
      <div class="answer-compare">
        <div class="wrong-ans">Your answer: ${m.userAnswer.replace(/</g,'&lt;')}</div>
        <div class="right-ans">Correct answer: ${m.correctAnswer.replace(/</g,'&lt;')}</div>
      </div>
      <label style="margin-top:4px;">Why did I miss this?</label>
      <textarea style="min-height:60px;" oninput="updateMistakeExplanation(${m.id}, this.value)">${m.explanation||''}</textarea>
      <button class="btn small red" style="margin-top:6px;" onclick="deleteMistake(${m.id})">Delete</button>
    </div>`).join('');
}
function updateMistakeExplanation(id, val){
  const m = data.questionLog.mistakes.find(m=>m.id===id);
  if(m){ m.explanation = val; scheduleSave(); }
}
function deleteMistake(id){
  data.questionLog.mistakes = data.questionLog.mistakes.filter(m=>m.id!==id);
  renderMistakeList(); scheduleSave();
}

function renderQuestionLog(){
  renderQSubjectTabs();
  renderQTermTabs();
  updateQCountTip();
  renderQTypeFields();
  renderQList();
  renderPtSubjectSelect();
  renderPtList();
  renderMistakeList();
  ptRunnerState = null;
  document.getElementById('ptRunner').innerHTML='';
}

/* ===================== FULL RENDER ON LOGIN ===================== */
function renderAll(){
  renderStats();
  renderTasks();
  renderBoxes();
  renderMindmap();
  renderBasicNotebooks();
  renderFormalNotebooks();
  renderFlashAll();
  loadFeynmanDraft();
  renderFeynmanStatus();
  renderQuestionLog();
  buildSchedule();
}
