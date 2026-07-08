/* ===================== AUTH (real accounts via Supabase) ===================== */
// Fill in your project's URL + anon key in config.js — see below.
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
    mindmaps: [1,2,3,4,5].map(i => ({ name: `Subject ${i}`, bubbles: [], connections: [], bubbleSeq: 0 })),
    basicNotebooks: newNotebookSet(), formalNotebooks: newNotebookSet(),
    flashcardStacks: [1,2,3,4,5].map(i => ({ name: `Subject ${i}`, cards: [] })), flashcardSeq:0,
    feynman: { entries: [], countSinceUnlock:0, lockUntilTs:null, draft:{concept:'',explain:'',gaps:'',simplify:''} },
    questionLog: {
      subjects: [1,2,3,4,5].map(i => ({ name: `Subject ${i}`, terms: {1:[],2:[],3:[],4:[]} })),
      questionSeq:0, practiceTests: [], testSeq:0, mistakes: [], mistakeSeq:0
    },
    friends: [], friendRequests: [], darkMode: false, displayName: '',
    // activity log powers the Weekly Recap — lightweight events, trimmed to
    // the last 60 days on save so it never grows unbounded
    activityLog: [],
    lifetimeStats: { focusSessions:0, leitnerReviews:0, flashcards:0, testsCompleted:0, notesEdited:0, tasksCompleted:0 },
    achievements: [], // ids of unlocked achievements
    ambientSound: 'none',
    schedule: {
      periods: [], // up to 10, each {name, subject} — added one at a time
      bells: [] // up to 9 "HH:MM" bell times, in order — added one at a time
    },
    gradeTracker: {
      subjects: [1,2,3,4,5].map(i => ({
        name: `Subject ${i}`,
        weights: { major: 70, quiz: 30 },
        terms: { 1:{major:[],quiz:[]}, 2:{major:[],quiz:[]}, 3:{major:[],quiz:[]}, 4:{major:[],quiz:[]} }
      }))
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
  try{
    const { data: signUpData, error } = await sb.auth.signUp({
      email, password: pw, options: { data: { name: name || email.split('@')[0] } }
    });
    if(error){ errEl.textContent = error.message; return; }
    if(!signUpData.session){
      // Project has email confirmation turned on — no session yet.
      showToast('Account created. Check your email to confirm, then log in.');
      switchAuthTab('login');
      return;
    }
    await loadProfileAndEnter(signUpData.user.id, signUpData.user.email);
  }catch(err){
    console.error('Signup request failed:', err);
    errEl.textContent = "Couldn't reach the server — check that SUPABASE_URL/SUPABASE_ANON_KEY in config.js are correct, and that you're online.";
  }finally{
    submitBtn.disabled = false; submitBtn.textContent = 'Create account';
  }
});

document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const submitBtn = e.target.querySelector('button[type="submit"]');
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pw = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent='';
  submitBtn.disabled = true; submitBtn.textContent = 'Logging in…';
  try{
    const { data: signInData, error } = await sb.auth.signInWithPassword({ email, password: pw });
    if(error){ errEl.textContent = error.message; return; }
    await loadProfileAndEnter(signInData.user.id, signInData.user.email);
  }catch(err){
    console.error('Login request failed:', err);
    errEl.textContent = "Couldn't reach the server — check that SUPABASE_URL/SUPABASE_ANON_KEY in config.js are correct, and that you're online.";
  }finally{
    submitBtn.disabled = false; submitBtn.textContent = 'Log in';
  }
});

async function loadProfileAndEnter(userId, email){
  const { data: profile, error } = await sb.from('profiles').select('*').eq('id', userId).single();
  if(error || !profile){
    showToast('Could not load your account data — check your connection and try again.');
    return;
  }
  currentUserId = userId;
  data = Object.assign(newUserData(), profile.app_data || {});
  // One-time migration: earlier versions had a single flat mind map
  // (data.bubbles/data.connections) instead of 5 subject boards. Fold any
  // existing bubbles into Subject 1 so nothing gets lost.
  const oldBubbles = profile.app_data && profile.app_data.bubbles;
  if(Array.isArray(oldBubbles) && oldBubbles.length){
    data.mindmaps[0].bubbles = oldBubbles;
    data.mindmaps[0].connections = profile.app_data.connections || [];
    data.mindmaps[0].bubbleSeq = profile.app_data.bubbleSeq || 0;
  }
  document.getElementById('authOverlay').style.display='none';
  document.getElementById('appShell').style.display='block';
  document.getElementById('userName').textContent = profile.name || (email ? email.split('@')[0] : 'Student');
  await renderAll();
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
    // BUGFIX: xp/level/streak weren't being synced to their own profile
    // columns, only buried inside app_data — but the public leaderboard view
    // reads xp/level from those columns, so the leaderboard always showed 0
    // for everyone. Keep both in sync on every save.
    await sb.from('profiles').update({
      app_data: data,
      xp: data.xp||0,
      level: data.level||1,
      streak: data.streak||0,
      updated_at: new Date().toISOString()
    }).eq('id', currentUserId);
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
function logActivity(type, amount=1){
  if(!data) return;
  if(!data.activityLog) data.activityLog=[];
  data.activityLog.push({ date: todayStr(), type, amount, ts: Date.now() });
  // keep this from growing forever — 60 days of history is plenty for a
  // weekly recap; lifetimeStats below (never trimmed) covers achievements
  const cutoff = addDays(todayStr(), -60);
  data.activityLog = data.activityLog.filter(e=>e.date >= cutoff);
  if(!data.lifetimeStats) data.lifetimeStats = { focusSessions:0, leitnerReviews:0, flashcards:0, testsCompleted:0, notesEdited:0, tasksCompleted:0 };
  if(data.lifetimeStats[type]!==undefined) data.lifetimeStats[type] += amount;
  checkAchievements();
}
const ACHIEVEMENT_DEFS = [
  { id:'streak_3', label:'On a Roll', desc:'3-day streak', check:d=>d.streak>=3 },
  { id:'streak_7', label:'Week Warrior', desc:'7-day streak', check:d=>d.streak>=7 },
  { id:'streak_30', label:'Unstoppable', desc:'30-day streak', check:d=>d.streak>=30 },
  { id:'level_5', label:'Level 5', desc:'Reached level 5', check:d=>d.level>=5 },
  { id:'level_10', label:'Level 10', desc:'Reached level 10', check:d=>d.level>=10 },
  { id:'level_25', label:'Level 25', desc:'Reached level 25', check:d=>d.level>=25 },
  { id:'first_focus', label:'First Focus Session', desc:'Completed your first Pomodoro session', check:d=>(d.lifetimeStats?.focusSessions||0)>=1 },
  { id:'ten_focus', label:'Focus Finisher', desc:'Completed 10 focus sessions', check:d=>(d.lifetimeStats?.focusSessions||0)>=10 },
  { id:'fifty_focus', label:'Deep Work', desc:'Completed 50 focus sessions', check:d=>(d.lifetimeStats?.focusSessions||0)>=50 },
  { id:'fifty_leitner', label:'Spaced Repetition Pro', desc:'Completed 50 Leitner reviews', check:d=>(d.lifetimeStats?.leitnerReviews||0)>=50 },
  { id:'hundred_flashcards', label:'Flashcard Master', desc:'Made 100 flashcards', check:d=>(d.lifetimeStats?.flashcards||0)>=100 },
  { id:'first_test', label:'First Practice Test', desc:'Completed your first practice test', check:d=>(d.lifetimeStats?.testsCompleted||0)>=1 },
  { id:'ten_tests', label:'Test Veteran', desc:'Completed 10 practice tests', check:d=>(d.lifetimeStats?.testsCompleted||0)>=10 },
  { id:'fifty_notes', label:'Note Taker', desc:'Edited notes 50 times', check:d=>(d.lifetimeStats?.notesEdited||0)>=50 },
  { id:'hundred_tasks', label:'Task Crusher', desc:'Completed 100 planner tasks', check:d=>(d.lifetimeStats?.tasksCompleted||0)>=100 },
];
function checkAchievements(){
  if(!data.achievements) data.achievements=[];
  ACHIEVEMENT_DEFS.forEach(a=>{
    if(!data.achievements.includes(a.id) && a.check(data)){
      data.achievements.push(a.id);
      showToast(`🏆 Achievement unlocked: ${a.label}`);
    }
  });
}
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
  if(idx>-1){ t.doneDays.splice(idx,1); scheduleSave(); } else { t.doneDays.push(day); awardXP(8,true); logActivity('tasksCompleted',1); }
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
      logActivity('focusSessions', Math.round(workSec/60));
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

/* ===================== AMBIENT SOUND (generated, no files/cost) ===================== */
let audioCtx = null, ambientNodes = null;
function makeNoiseBuffer(ctx, colorFn){
  const bufferSize = 2*ctx.sampleRate;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  colorFn(buffer.getChannelData(0));
  return buffer;
}
function stopAmbient(){
  if(ambientNodes){
    ambientNodes.forEach(n=>{ try{ if(n.stop) n.stop(); }catch(e){} try{ n.disconnect(); }catch(e){} });
    ambientNodes = null;
  }
}
function startAmbient(type, volume){
  stopAmbient();
  if(type==='none') return;
  if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  const ctx = audioCtx;
  if(ctx.state==='suspended') ctx.resume();
  const gainNode = ctx.createGain();
  gainNode.gain.value = volume;
  gainNode.connect(ctx.destination);
  const nodes = [gainNode];
  const whiteFill = out=>{ for(let i=0;i<out.length;i++) out[i]=Math.random()*2-1; };

  if(type==='white'){
    const src = ctx.createBufferSource(); src.buffer = makeNoiseBuffer(ctx, whiteFill); src.loop=true;
    src.connect(gainNode); src.start(); nodes.push(src);
  } else if(type==='pink'){
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    const buffer = makeNoiseBuffer(ctx, out=>{
      for(let i=0;i<out.length;i++){
        const white = Math.random()*2-1;
        b0=0.99886*b0+white*0.0555179; b1=0.99332*b1+white*0.0750759; b2=0.96900*b2+white*0.1538520;
        b3=0.86650*b3+white*0.3104856; b4=0.55000*b4+white*0.5329522; b5=-0.7616*b5-white*0.0168980;
        out[i]=(b0+b1+b2+b3+b4+b5+b6+white*0.5362)*0.11; b6=white*0.115926;
      }
    });
    const src = ctx.createBufferSource(); src.buffer=buffer; src.loop=true;
    src.connect(gainNode); src.start(); nodes.push(src);
  } else if(type==='brown'){
    let lastOut=0;
    const buffer = makeNoiseBuffer(ctx, out=>{
      for(let i=0;i<out.length;i++){
        const white = Math.random()*2-1;
        out[i] = (lastOut + 0.02*white)/1.02; lastOut = out[i]; out[i] *= 3.5;
      }
    });
    const src = ctx.createBufferSource(); src.buffer=buffer; src.loop=true;
    src.connect(gainNode); src.start(); nodes.push(src);
  } else if(type==='rain'){
    const src = ctx.createBufferSource(); src.buffer = makeNoiseBuffer(ctx, whiteFill); src.loop=true;
    const filter = ctx.createBiquadFilter(); filter.type='bandpass'; filter.frequency.value=3000; filter.Q.value=0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value=0.15;
    const lfoGain = ctx.createGain(); lfoGain.gain.value=800;
    lfo.connect(lfoGain); lfoGain.connect(filter.frequency); lfo.start();
    src.connect(filter); filter.connect(gainNode); src.start();
    nodes.push(src, filter, lfo, lfoGain);
  } else if(type==='ocean'){
    const src = ctx.createBufferSource(); src.buffer = makeNoiseBuffer(ctx, whiteFill); src.loop=true;
    const filter = ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=500;
    const waveGain = ctx.createGain(); waveGain.gain.value=0.7;
    const lfo = ctx.createOscillator(); lfo.frequency.value=0.1;
    const lfoGain = ctx.createGain(); lfoGain.gain.value=0.3;
    lfo.connect(lfoGain); lfoGain.connect(waveGain.gain); lfo.start();
    src.connect(filter); filter.connect(waveGain); waveGain.connect(gainNode); src.start();
    nodes.push(src, filter, lfo, lfoGain, waveGain);
  }
  ambientNodes = nodes;
}
document.getElementById('ambientSelect').addEventListener('change', (e)=>{
  const vol = (parseInt(document.getElementById('ambientVolume').value)||50)/100;
  startAmbient(e.target.value, vol);
  if(data){ data.ambientSound = e.target.value; scheduleSave(); }
});
document.getElementById('ambientVolume').addEventListener('input', (e)=>{
  const vol = (parseInt(e.target.value)||50)/100;
  if(ambientNodes && ambientNodes[0]) ambientNodes[0].gain.value = vol;
});

/* ===================== CLASS BELL SCHEDULE ===================== */
function renderPeriodEditRows(){
  const wrap = document.getElementById('periodEditRows');
  const periods = data.schedule.periods;
  wrap.innerHTML = periods.map((p,i)=>`
    <div class="row" style="align-items:center;margin-bottom:6px;">
      <div style="flex:0 0 90px;font-weight:600;">Period ${i+1}</div>
      <div style="flex:2"><input data-period-i="${i}" class="periodSubjectInput" placeholder="e.g. Algebra II, Lunch, Free period" value="${(p.subject||'').replace(/"/g,'&quot;')}"></div>
      <div style="flex:0 0 auto;"><button class="btn small red" onclick="removePeriod(${i})">Remove</button></div>
    </div>`).join('') || '<p style="color:#999;font-size:.82rem;">No periods added yet.</p>';
  document.getElementById('addPeriodBtn').disabled = periods.length>=10;
  wrap.querySelectorAll('.periodSubjectInput').forEach(inp=>{
    inp.addEventListener('input', (e)=>{
      data.schedule.periods[parseInt(e.target.dataset.periodI)].subject = e.target.value;
      scheduleSave();
      updateBellStatus();
    });
  });
}
function removePeriod(i){ data.schedule.periods.splice(i,1); renderPeriodEditRows(); scheduleSave(); updateBellStatus(); }
document.getElementById('addPeriodBtn').addEventListener('click', ()=>{
  if(data.schedule.periods.length>=10){ showToast('Max 10 periods.'); return; }
  data.schedule.periods.push({ name:`Period ${data.schedule.periods.length+1}`, subject:'' });
  renderPeriodEditRows(); scheduleSave();
});
function renderBellEditRows(){
  const wrap = document.getElementById('bellEditRows');
  const bells = data.schedule.bells;
  wrap.innerHTML = bells.map((b,i)=>`
    <div class="row" style="align-items:center;margin-bottom:6px;">
      <div style="flex:0 0 90px;font-weight:600;">Bell ${i+1}</div>
      <div style="flex:1"><input type="time" data-bell-i="${i}" class="bellTimeInput" value="${b}"></div>
      <div style="flex:0 0 auto;"><button class="btn small red" onclick="removeBell(${i})">Remove</button></div>
    </div>`).join('') || '<p style="color:#999;font-size:.82rem;">No bell times added yet.</p>';
  document.getElementById('addBellBtn').disabled = bells.length>=9;
  wrap.querySelectorAll('.bellTimeInput').forEach(inp=>{
    inp.addEventListener('input', (e)=>{
      data.schedule.bells[parseInt(e.target.dataset.bellI)] = e.target.value;
      data.schedule.bells.sort();
      renderBellEditRows(); scheduleSave(); updateBellStatus();
    });
  });
}
function removeBell(i){ data.schedule.bells.splice(i,1); renderBellEditRows(); scheduleSave(); updateBellStatus(); }
document.getElementById('addBellBtn').addEventListener('click', ()=>{
  if(data.schedule.bells.length>=9){ showToast('Max 9 bell times.'); return; }
  data.schedule.bells.push('08:00');
  data.schedule.bells.sort();
  renderBellEditRows(); scheduleSave();
});
function timeStrToMinutes(t){ const [h,m]=t.split(':').map(Number); return h*60+m; }
function updateBellStatus(){
  const el = document.getElementById('bellNowStatus');
  if(!el || !data) return;
  const bells = (data.schedule.bells||[]).slice().sort();
  const periods = data.schedule.periods||[];
  if(bells.length===0 || periods.length===0){
    el.textContent = "Set up your periods and bell times below to see what's next.";
    return;
  }
  const nowMin = new Date().getHours()*60 + new Date().getMinutes();
  const bellMins = bells.map(timeStrToMinutes);
  let idx = bellMins.findIndex(bm => nowMin < bm);
  if(idx === -1) idx = bellMins.length;
  if(idx >= periods.length){
    el.textContent = "School's out for the day — good time for a focus session or flashcard review.";
    return;
  }
  const period = periods[idx];
  const label = period.subject ? `Period ${idx+1} (${period.subject})` : `Period ${idx+1}`;
  if(idx < bellMins.length){
    el.textContent = `Currently: ${label} — ${bellMins[idx]-nowMin} min until the bell.`;
  } else {
    el.textContent = `Currently: ${label} (last period).`;
  }
}
setInterval(updateBellStatus, 30000);
function renderSchedule(){
  renderPeriodEditRows();
  renderBellEditRows();
  updateBellStatus();
  document.getElementById('ambientSelect').value = data.ambientSound || 'none';
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
document.getElementById('basicNote').addEventListener('blur', (e)=>{ if(e.target.value.trim()){ awardXP(3,false); logActivity('notesEdited',1); } });
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
  document.getElementById(id).addEventListener('blur', (e)=>{ if(e.target.value.trim()){ awardXP(3,false); logActivity('notesEdited',1); } });
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
  const catBadge = card.category ? `<span style="position:absolute;top:8px;right:14px;font-size:.65rem;font-weight:700;text-transform:uppercase;padding:2px 8px;border-radius:10px;background:#E3EEF8;color:#1c4a66;">${card.category.replace(/</g,'&lt;')}</span>` : '';
  wrap.innerHTML = `
    <div class="flip-card" id="flipCardEl"><span class="side-label">${label}</span>${catBadge}${showing.replace(/</g,'&lt;') || '(blank)'}</div>
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
// BUGFIX (share rewrite): sharing used to synchronously JSON.stringify +
// base64-encode the whole deck (including any embedded images) BEFORE
// showing the modal — with anything but a tiny deck that's a real, visible
// freeze before the popup appears. The setup SQL already has a
// public.shared_decks table for exactly this. Open the modal instantly in a
// "generating…" state, then do the (fast) DB insert in the background —
// and the resulting code is short and works across devices.
const shareKindLabels = { flashcards: 'Share flashcard stack', practice_test: 'Share practice test' };
async function shareViaTable(kind, title, payload){
  document.getElementById('shareModalTitle').textContent = shareKindLabels[kind] || 'Share';
  document.getElementById('shareCode').textContent = 'Generating code…';
  document.getElementById('shareModal').style.display='flex';
  try{
    const code = Math.random().toString(36).slice(2,8).toUpperCase();
    const { error } = await sb.from('shared_decks').insert({
      owner_id: currentUserId,
      owner_name: data.displayName || document.getElementById('userName').textContent,
      title, kind, payload, share_code: code
    });
    if(error) throw error;
    document.getElementById('shareCode').textContent = code;
  }catch(e){
    document.getElementById('shareCode').textContent = 'Error generating code — close and try again.';
  }
}
document.getElementById('flashShareBtn').addEventListener('click', ()=>{
  const stack = data.flashcardStacks[flashActiveStack];
  if(!stack.cards.length){ showToast('This stack has no cards to share yet.'); return; }
  shareViaTable('flashcards', stack.name, { name: stack.name, cards: stack.cards });
});
document.getElementById('closeShareModal').addEventListener('click', ()=>{ document.getElementById('shareModal').style.display='none'; });
document.getElementById('copyShareCodeBtn').addEventListener('click', ()=>{
  navigator.clipboard.writeText(document.getElementById('shareCode').textContent).then(()=>showToast('Code copied!'));
});

// Import is its own modal now — separate from sharing — opened from a
// dedicated button on the Flashcards screen and the Practice Tests screen.
document.getElementById('flashImportBtn').addEventListener('click', ()=>{
  document.getElementById('importModalTitle').textContent = 'Import a flashcard stack';
  document.getElementById('importModal').style.display='flex';
});
document.getElementById('ptImportBtn').addEventListener('click', ()=>{
  document.getElementById('importModalTitle').textContent = 'Import a practice test';
  document.getElementById('importModal').style.display='flex';
});
document.getElementById('closeImportModal').addEventListener('click', ()=>{ document.getElementById('importModal').style.display='none'; });

document.getElementById('importStackBtn').addEventListener('click', async ()=>{
  const code = document.getElementById('importCodeInput').value.trim().toUpperCase();
  if(!code){ showToast('Enter a share code.'); return; }
  try{
    const { data: rows } = await sb.from('shared_decks').select('*').eq('share_code', code).limit(1);
    if(!rows || rows.length===0){ showToast('Invalid share code — check and try again.'); return; }
    const deck = rows[0];
    if(deck.kind === 'flashcards'){
      const payload = deck.payload;
      if(!payload.cards || !Array.isArray(payload.cards) || payload.cards.length===0){ showToast('This shared stack has no cards.'); return; }
      const emptyStack = data.flashcardStacks.findIndex(s=>s.cards.length===0);
      const target = emptyStack>-1 ? emptyStack : 0;
      data.flashcardStacks[target].name = payload.name || 'Imported';
      data.flashcardStacks[target].cards = payload.cards.map(c=>({...c, id: (data.flashcardSeq = (data.flashcardSeq||0)+1)}));
      flashActiveStack = target; flashActiveCard=0; flashFlipped=false;
      renderFlashAll();
      showToast(`Imported "${payload.name}" into Stack ${target+1}.`);
    } else if(deck.kind === 'practice_test'){
      // BUGFIX: importing a shared practice test never worked before — this
      // shared modal only ever checked for a `.cards` array, so a practice
      // test's `.questions` payload silently failed with "Invalid share code".
      const payload = deck.payload;
      if(!payload.questions || !Array.isArray(payload.questions) || payload.questions.length===0){ showToast('This shared test has no questions.'); return; }
      const subj = data.questionLog.subjects[qActiveSubject];
      // BUGFIX: id generation used `(data.questionLog.questionSeq = (data.questionLog.questionSeq||0)+1)`, which
      // becomes NaN if that counter is ever missing/undefined on an
      // account — every imported question then got a NaN id, so the test
      // was created with a name and term but its questions could never be
      // found again ("all questions in this test have been deleted").
      // This form is safe even if the counter was never initialized.
      const newIds = payload.questions.map(q=>{
        const newQ = {...q, id: (data.questionLog.questionSeq = (data.questionLog.questionSeq||0)+1)};
        subj.terms[qActiveTerm].push(newQ);
        return newQ.id;
      });
      data.questionLog.practiceTests.push({ id: (data.questionLog.testSeq = (data.questionLog.testSeq||0)+1), name: payload.name||'Imported test', subjectIndex: qActiveSubject, term: qActiveTerm, questionIds: newIds });
      renderQList(); renderPtList(); updateQCountTip();
      showToast(`Imported practice test "${payload.name}" into ${subj.name}, Term ${qActiveTerm}.`);
    } else {
      throw new Error('Unknown deck kind');
    }
    scheduleSave();
    document.getElementById('importCodeInput').value='';
    document.getElementById('importModal').style.display='none';
  }catch(e){ showToast('Invalid share code — check and try again.'); }
});
document.getElementById('flashAddBtn').addEventListener('click', ()=>{
  const stack = data.flashcardStacks[flashActiveStack];
  if(stack.cards.length >= 150){ showToast('This stack is full at 150 cards — try another stack.'); return; }
  const front = document.getElementById('flashFront').value.trim();
  const back = document.getElementById('flashBack').value.trim();
  const category = document.getElementById('flashCategory').value.trim();
  if(!front || !back){ showToast('Fill in both the front and back of the card.'); return; }
  stack.cards.push({ id: (data.flashcardSeq = (data.flashcardSeq||0)+1), front, back, category });
  document.getElementById('flashFront').value=''; document.getElementById('flashBack').value=''; document.getElementById('flashCategory').value='';
  flashActiveCard = stack.cards.length-1; flashFlipped=false;
  renderFlashCount(); renderFlashViewer();
  awardXP(2,false);
  logActivity('flashcards',1);
});

/* ===================== MINDMAP ===================== */
const canvas = document.getElementById('mindmapCanvas');
const svg = document.getElementById('mapLines');
const bubbleColors = ['#FBE3E1','#FBF1DC','#E7F4EB','#E3EEF8','#F1E5F6'];
let dragTarget=null, dragOffX=0, dragOffY=0, dragMoved=false;
let connectMode=false, connectFirst=null;
let mmActiveSubject = 0;
function activeMM(){ return data.mindmaps[mmActiveSubject]; }

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
  const mm = activeMM();
  const entry = { id: (mm.bubbleSeq = (mm.bubbleSeq||0)+1), x: Math.max(0,x-60), y: Math.max(0,y-25), text: text||'New idea', color: bubbleColors[Math.floor(Math.random()*bubbleColors.length)] };
  mm.bubbles.push(entry);
  createBubbleEl(entry);
  awardXP(2,false);
  scheduleSave();
}
function deleteBubble(id){
  const mm = activeMM();
  mm.bubbles = mm.bubbles.filter(b=>b.id!==id);
  mm.connections = mm.connections.filter(c=>c.from!==id && c.to!==id);
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
      // BUGFIX: this used to clear connectFirst after every single
      // connection, forcing you to re-click the same origin bubble before
      // adding each new line — which made it look like a bubble could only
      // ever have one connection. Now the origin bubble stays selected so
      // you can click several other bubbles in a row and fan out multiple
      // lines from it. Click the origin bubble again (or turn Connect off)
      // when you're done with it.
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
    const entry = activeMM().bubbles.find(b=>b.id===id);
    if(entry){ entry.x = dragTarget.offsetLeft; entry.y = dragTarget.offsetTop; }
    if(dragMoved) scheduleSave();
  }
  dragTarget=null;
  document.removeEventListener('pointermove', onDrag);
  document.removeEventListener('pointerup', stopDrag);
}
function toggleConnection(a,b){
  const mm = activeMM();
  const idx = mm.connections.findIndex(c => (c.from===a&&c.to===b)||(c.from===b&&c.to===a));
  if(idx>-1){ mm.connections.splice(idx,1); } else { mm.connections.push({from:a, to:b}); }
  renderLines();
  scheduleSave();
}
function renderLines(){
  if(!data) return;
  svg.innerHTML='';
  activeMM().connections.forEach(c=>{
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
  renderSubjectTabs('mmSubjectTabs', data.mindmaps, mmActiveSubject, (i)=>{
    mmActiveSubject = i; renderMindmap();
  });
  document.getElementById('mmSubjectName').value = activeMM().name;
  canvas.querySelectorAll('.bubble').forEach(b=>b.remove());
  activeMM().bubbles.forEach(entry=>createBubbleEl(entry));
  renderLines();
  document.getElementById('mindmapViewport').scrollLeft = 0;
  document.getElementById('mindmapViewport').scrollTop = 0;
}
document.getElementById('mmSubjectName').addEventListener('input', (e)=>{
  activeMM().name = e.target.value || `Subject ${mmActiveSubject+1}`;
  renderSubjectTabs('mmSubjectTabs', data.mindmaps, mmActiveSubject, (i)=>{ mmActiveSubject=i; renderMindmap(); });
  scheduleSave();
});
canvas.addEventListener('dblclick', (e)=>{
  if(e.target !== canvas && e.target !== svg) return;
  const rect = canvas.getBoundingClientRect();
  addBubble(e.clientX-rect.left, e.clientY-rect.top);
});
document.getElementById('addBubbleBtn').addEventListener('click', ()=>{
  const vp = document.getElementById('mindmapViewport');
  // drop the new bubble roughly in the middle of whatever part of the
  // (now much bigger) board you're currently scrolled to, not always top-left
  addBubble(vp.scrollLeft + 80 + Math.random()*200, vp.scrollTop + 60 + Math.random()*200);
});
document.getElementById('connectModeBtn').addEventListener('click', (e)=>{
  connectMode = !connectMode;
  e.currentTarget.classList.toggle('active', connectMode);
  canvas.style.cursor = connectMode ? 'crosshair' : 'default';
  if(connectMode){
    showToast('Connect mode: click a bubble, then click others to link them all to it.');
  }
  if(!connectMode && connectFirst!=null){
    canvas.querySelectorAll('.bubble.selected').forEach(b=>b.classList.remove('selected'));
    connectFirst=null;
  }
});
document.getElementById('clearMapBtn').addEventListener('click', ()=>{
  if(!data) return;
  const mm = activeMM();
  mm.bubbles=[]; mm.connections=[];
  canvas.querySelectorAll('.bubble').forEach(b=>b.remove());
  svg.innerHTML='';
  scheduleSave();
});

/* ===================== LEITNER BOXES ===================== */
const boxLabels = {1:'Box 1 — hardest',2:'Box 2',3:'Box 3',4:'Box 4',5:'Box 5 — easiest'};
const DAY_MS = 86400000;
// Due at 11:59:59 PM on (today + intervalDays), not an exact 24h-multiple from "now".
// This means a card added at 7pm is due by 11:59pm the same calendar day + interval,
// not stuck waiting until 7pm on the future day.
function nextReviewEndOfDay(intervalDays){
  const d = new Date();
  d.setDate(d.getDate() + intervalDays);
  d.setHours(23,59,59,999);
  return d.getTime();
}
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
      const dueText = due ? 'ready now' : `unlocks ${fmtCountdown(c.nextReviewTs-now)} (by 11:59pm)`;
      cardEl.innerHTML = `<div>${c.text}</div><div style="font-size:.68rem;color:#888;">${dueText}</div>
        <div class="actions">
          <button class="btn small green" ${due?'':'disabled'} onclick="reviewCard(${c.id},true)">Got it</button>
          <button class="btn small red" ${due?'':'disabled'} onclick="reviewCard(${c.id},false)">Still hard</button>
          <button class="btn small ghost" onclick="deleteLeitnerCard(${c.id})">Delete</button>
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
  data.leitner[box].push({ id: (data.leitnerSeq = (data.leitnerSeq||0)+1), text, box, lastReviewTs: now, nextReviewTs: nextReviewEndOfDay(INTERVALS[box]) });
  input.value='';
  awardXP(3,false);
  renderBoxes();
  scheduleSave();
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
      card.box = newBox; card.lastReviewTs = now; card.nextReviewTs = nextReviewEndOfDay(INTERVALS[newBox]);
      data.leitner[newBox].push(card);
      awardXP(5,true);
      logActivity('leitnerReviews',1);
      break;
    }
  }
  renderBoxes();
  scheduleSave();
}
function deleteLeitnerCard(id){
  for(let b=1;b<=5;b++){
    const idx = data.leitner[b].findIndex(c=>c.id===id);
    if(idx>-1){ data.leitner[b].splice(idx,1); break; }
  }
  renderBoxes();
  scheduleSave();
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

function syncQTermSelect(){
  const sel = document.getElementById('qTermSelect');
  if(!sel) return;
  sel.innerHTML = [1,2,3,4].map(t=>`<option value="${t}" ${t===qActiveTerm?'selected':''}>Term ${t}</option>`).join('');
}
function renderQTypeFields(prefill){
  syncQTermSelect();
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
document.getElementById('qTermSelect').addEventListener('change', (e)=>{
  const t = parseInt(e.target.value)||1;
  if(t !== qActiveTerm){
    qActiveTerm = t; qEditingId = null;
    renderQTermTabs(); updateQCountTip(); renderQList();
    // keep the prompt/type the user was mid-typing; just refresh the term-dependent bits
    syncQTermSelect();
  }
});

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
    terms[qActiveTerm].push({ id: (data.questionLog.questionSeq = (data.questionLog.questionSeq||0)+1), type, prompt, category, difficulty, options, answer, image: qPendingImage });
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
  data.questionLog.practiceTests.push({ id: (data.questionLog.testSeq = (data.questionLog.testSeq||0)+1), name, subjectIndex, term, questionIds, createdAt: Date.now() });
  document.getElementById('ptName').value='';
  awardXP(3,false);
  renderPtList();
  scheduleSave();
});
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
      id: (data.questionLog.mistakeSeq = (data.questionLog.mistakeSeq||0)+1), ts: Date.now(), subjectName: ptRunnerState.subjectName, term: ptRunnerState.test.term,
      prompt: q.prompt, type: q.type, correctAnswer: correctDisplay, userAnswer: userDisplay, explanation: ''
    });
  });
  ptRunnerState.stage = 'results';
  ptRunnerState.score = correctCount;
  awardXP(correctCount*4 + ptRunnerState.questions.length, true);
  logActivity('testsCompleted',1);
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


/* ===================== ACCOUNT SETTINGS + DARK MODE ===================== */
function applyDarkMode(on){
  document.body.classList.toggle('dark-mode', on);
  const toggle = document.getElementById('darkModeToggle');
  if(toggle) toggle.checked = on;
}
document.getElementById('accountBtn').addEventListener('click', ()=>{
  document.getElementById('settingsName').value = data.displayName || document.getElementById('userName').textContent;
  document.getElementById('darkModeToggle').checked = data.darkMode || false;
  document.getElementById('accountModal').style.display='flex';
});
document.getElementById('closeSettingsBtn').addEventListener('click', ()=>{ document.getElementById('accountModal').style.display='none'; });

/* ===================== WEEKLY RECAP ===================== */
const RECAP_LABELS = {
  focusSessions:{ label:'Focus sessions', unit:'min', icon:'⏱' },
  leitnerReviews:{ label:'Leitner reviews', unit:'card(s)', icon:'📦' },
  flashcards:{ label:'Flashcards made', unit:'card(s)', icon:'🗂' },
  testsCompleted:{ label:'Practice tests taken', unit:'test(s)', icon:'📝' },
  notesEdited:{ label:'Note edits', unit:'edit(s)', icon:'📓' },
  tasksCompleted:{ label:'Planner tasks completed', unit:'task(s)', icon:'✅' },
};
function renderWeeklyRecap(){
  const cutoff = addDays(todayStr(), -6); // last 7 days inclusive of today
  const recent = (data.activityLog||[]).filter(e=>e.date>=cutoff);
  const totals = {};
  recent.forEach(e=>{ totals[e.type] = (totals[e.type]||0) + e.amount; });
  const rows = Object.keys(RECAP_LABELS).map(key=>{
    const info = RECAP_LABELS[key];
    const count = totals[key]||0;
    return `<div class="home-item">${info.icon} ${info.label}: <strong>${count} ${info.unit}</strong></div>`;
  }).join('');
  const focusMinutes = totals.focusSessions||0;
  const hours = Math.floor(focusMinutes/60), mins = focusMinutes%60;
  const summary = focusMinutes>0
    ? `<p style="font-weight:600;margin-bottom:10px;">You focused for ${hours>0?`${hours}h `:''}${mins}m this week.</p>`
    : `<p style="color:#999;margin-bottom:10px;">No focus sessions logged this week yet — the Timer tab is right there.</p>`;
  document.getElementById('weeklyRecapContent').innerHTML = summary + rows;
}
document.getElementById('weeklyRecapBtn').addEventListener('click', ()=>{
  renderWeeklyRecap();
  document.getElementById('weeklyRecapModal').style.display='flex';
});
document.getElementById('closeWeeklyRecap').addEventListener('click', ()=>{ document.getElementById('weeklyRecapModal').style.display='none'; });

/* ===================== ACHIEVEMENT LOG ===================== */
function renderAchievementLog(){
  const unlocked = data.achievements||[];
  document.getElementById('achievementLogContent').innerHTML = ACHIEVEMENT_DEFS.map(a=>{
    const done = unlocked.includes(a.id);
    return `<div class="home-item" style="${done?'':'opacity:.45;'}">${done?'🏆':'🔒'} <strong>${a.label}</strong> — ${a.desc}</div>`;
  }).join('') + `<p style="margin-top:10px;font-size:.8rem;color:#999;">${unlocked.length} of ${ACHIEVEMENT_DEFS.length} unlocked</p>`;
}
document.getElementById('achievementLogBtn').addEventListener('click', ()=>{
  renderAchievementLog();
  document.getElementById('achievementLogModal').style.display='flex';
});
document.getElementById('closeAchievementLog').addEventListener('click', ()=>{ document.getElementById('achievementLogModal').style.display='none'; });

document.getElementById('saveSettingsBtn').addEventListener('click', async ()=>{
  const newName = document.getElementById('settingsName').value.trim();
  const dark = document.getElementById('darkModeToggle').checked;
  if(newName){ data.displayName = newName; document.getElementById('userName').textContent = newName; }
  data.darkMode = dark;
  applyDarkMode(dark);
  // also save the name back to the profiles table
  if(newName && currentUserId){
    try{ await sb.from('profiles').update({ name: newName }).eq('id', currentUserId); }catch(e){}
  }
  scheduleSave();
  document.getElementById('accountModal').style.display='none';
  showToast('Settings saved.');
});

/* ===================== SEARCH BAR ===================== */
const searchInput = document.getElementById('globalSearch');
const searchDropdown = document.getElementById('searchResults');
// Jump to any tab / subtab / qsubtab, then optionally scroll to a specific
// element once it's visible. Used by every clickable search result below.
function navTo(tab, opts={}){
  document.querySelector(`.tab[data-tab="${tab}"]`)?.click();
  if(opts.subtab) document.querySelector(`.subtab[data-sub="${opts.subtab}"]`)?.click();
  if(opts.qsubtab) document.querySelector(`.qsubtab[data-qsub="${opts.qsubtab}"]`)?.click();
  if(opts.after) opts.after();
  if(opts.scrollTo){
    setTimeout(()=>{ document.getElementById(opts.scrollTo)?.scrollIntoView({behavior:'smooth', block:'start'}); }, 30);
  }
  searchDropdown.classList.remove('open');
  searchInput.value = '';
}

// Every tab/section is directly searchable by name, even with no content
// match, so typing e.g. "Feynman" or "Leaderboard" jumps straight there.
function openModalNav(modalId, beforeFn){
  if(beforeFn) beforeFn();
  document.getElementById(modalId).style.display='flex';
  searchDropdown.classList.remove('open');
  searchInput.value = '';
}
const navSearchItems = [
  { label:'Today', preview:'Your daily overview', run:()=>navTo('home') },
  { label:'Study', preview:'Mind map, Leitner box, flashcards', run:()=>navTo('study') },
  { label:'Mind map', preview:'Visual brainstorming canvas, 5 subject boards', run:()=>navTo('study',{scrollTo:'mindmapCanvas'}) },
  { label:'Leitner box', preview:'Spaced-repetition review boxes', run:()=>navTo('study',{scrollTo:'boxesWrap'}) },
  { label:'Flashcards', preview:'5 stacks, 150 cards each', run:()=>navTo('study',{scrollTo:'flashStackTabs'}) },
  { label:'Planner', preview:'Your assignments and deadlines', run:()=>navTo('planner') },
  { label:'Add assignment', preview:'Add a new task to your planner', run:()=>navTo('planner',{scrollTo:'taskTitle'}) },
  { label:'Import calendar', preview:'Import assignments from a school .ics file', run:()=>navTo('calendar',{scrollTo:'icsFileInput'}) },
  { label:'Timer', preview:'Pomodoro focus timer', run:()=>navTo('timer') },
  { label:'Ambient sound', preview:'White noise, pink noise, brown noise, rain, ocean waves', run:()=>navTo('timer',{scrollTo:'ambientSelect'}) },
  { label:'Class bell schedule', preview:'Set your periods and bell times', run:()=>navTo('timer',{scrollTo:'bellNowStatus'}) },
  { label:'Notes', preview:'Basic notes, formal notes, Feynman', run:()=>navTo('notes',{subtab:'basic'}) },
  { label:'Basic notes', preview:'Quick freeform notes by subject', run:()=>navTo('notes',{subtab:'basic',scrollTo:'basic'}) },
  { label:'Formal notes', preview:'Cornell-style notes by subject', run:()=>navTo('notes',{subtab:'formal',scrollTo:'formal'}) },
  { label:'Feynman', preview:'Explain-it-simply worksheet', run:()=>navTo('notes',{subtab:'feynman',scrollTo:'feynman'}) },
  { label:'Question log', preview:'Question bank, practice tests, mistakes', run:()=>navTo('qlog',{qsubtab:'qbank'}) },
  { label:'Question bank', preview:'All your saved questions', run:()=>navTo('qlog',{qsubtab:'qbank',scrollTo:'qList'}) },
  { label:'Practice test', preview:'Build and take practice tests', run:()=>navTo('qlog',{qsubtab:'qtests',scrollTo:'ptList'}) },
  { label:'Mistake log', preview:'Questions you got wrong', run:()=>navTo('qlog',{qsubtab:'qmistakes',scrollTo:'mistakeList'}) },
  { label:'Grades', preview:'Major/quiz grades, semesters, final grade', run:()=>navTo('grades') },
  { label:'Grade tracker', preview:'Track grades for up to 5 subjects', run:()=>navTo('grades',{scrollTo:'gtSubjectTabs'}) },
  { label:'Friends', preview:'Add and manage friends', run:()=>navTo('social') },
  { label:'Leaderboard', preview:'See where you rank', run:()=>navTo('social',{scrollTo:'leaderboard'}) },
  { label:'Calendar', preview:'Monthly view of tasks and reviews', run:()=>navTo('calendar') },
  { label:'Weekly recap', preview:'Your last 7 days at a glance', run:()=>openModalNav('weeklyRecapModal', renderWeeklyRecap) },
  { label:'Achievements', preview:'Unlockable milestones and badges', run:()=>openModalNav('achievementLogModal', renderAchievementLog) },
  { label:'Achievement log', preview:'Unlockable milestones and badges', run:()=>openModalNav('achievementLogModal', renderAchievementLog) },
  { label:'Account', preview:'Your name, dark mode, and settings', run:()=>openModalNav('accountModal', ()=>{
      document.getElementById('settingsName').value = data.displayName || document.getElementById('userName').textContent;
      document.getElementById('darkModeToggle').checked = data.darkMode || false;
    }) },
];

searchInput.addEventListener('input', ()=>{
  const q = searchInput.value.trim().toLowerCase();
  if(q.length < 2){ searchDropdown.classList.remove('open'); return; }
  const results = [];

  // section/tab names — matched first so navigating is always fast
  navSearchItems.forEach(item=>{
    if(item.label.toLowerCase().includes(q))
      results.push({type:'Go to', label:item.label, preview:item.preview, action:item.run});
  });

  // named items — flashcard stacks, notebook subjects, practice tests
  data.flashcardStacks.forEach((st,i)=>{
    if(st.name && st.name.toLowerCase().includes(q))
      results.push({type:'Flashcards', label:st.name, preview:`${st.cards.length} card(s)`, action:()=>{
        flashActiveStack=i; flashActiveCard=0; flashFlipped=false; renderFlashAll();
        navTo('study',{scrollTo:'flashStackTabs'});
      }});
  });
  data.basicNotebooks.forEach((nb,i)=>{
    if(nb.name && nb.name.toLowerCase().includes(q))
      results.push({type:'Basic notes', label:nb.name, preview:'Jump to this subject', action:()=>{
        basicActiveSubject=i; basicActivePage=1; renderBasicNotebooks();
        navTo('notes',{subtab:'basic',scrollTo:'basic'});
      }});
  });
  data.formalNotebooks.forEach((nb,i)=>{
    if(nb.name && nb.name.toLowerCase().includes(q))
      results.push({type:'Formal notes', label:nb.name, preview:'Jump to this subject', action:()=>{
        formalActiveSubject=i; formalActivePage=1; renderFormalNotebooks();
        navTo('notes',{subtab:'formal',scrollTo:'formal'});
      }});
  });
  (data.questionLog.practiceTests||[]).forEach(t=>{
    if(t.name && t.name.toLowerCase().includes(q))
      results.push({type:'Practice test', label:t.name, preview:`${t.questionIds.length} question(s)`, action:()=>{
        qActiveSubject=t.subjectIndex; qActiveTerm=t.term; qEditingId=null;
        renderQSubjectTabs(); renderQTermTabs(); renderPtSubjectSelect(); renderPtList(); updateQCountTip();
        navTo('qlog',{qsubtab:'qtests',scrollTo:'ptList'});
      }});
  });

  // basic notebook page text
  data.basicNotebooks.forEach((nb,i)=>{
    Object.entries(nb.pages).forEach(([pg, text])=>{
      if(text && text.toLowerCase().includes(q))
        results.push({type:'Basic note', label:`${nb.name} · p.${pg}`, preview: text.slice(0,60), action:()=>{
          basicActiveSubject=i; basicActivePage=parseInt(pg); renderBasicNotebooks();
          navTo('notes',{subtab:'basic',scrollTo:'basic'});
        }});
    });
  });
  // formal notebook pages — these are objects {terms, notes, summary}, not
  // plain strings like basic notes, so search each field separately.
  // BUGFIX: treating the whole page object as a string here threw a
  // TypeError on every search (since almost every formal notebook has at
  // least one page created), which silently killed the entire search —
  // that's why it always said "No results" no matter what you typed.
  data.formalNotebooks.forEach((nb,i)=>{
    Object.entries(nb.pages).forEach(([pg, page])=>{
      if(!page) return;
      const combined = [page.terms, page.notes, page.summary].filter(Boolean).join(' ');
      if(combined.toLowerCase().includes(q))
        results.push({type:'Formal note', label:`${nb.name} · p.${pg}`, preview: combined.slice(0,60), action:()=>{
          formalActiveSubject=i; formalActivePage=parseInt(pg); renderFormalNotebooks();
          navTo('notes',{subtab:'formal',scrollTo:'formal'});
        }});
    });
  });
  // flashcard front/back text
  data.flashcardStacks.forEach((st,i)=>{
    st.cards.forEach((c,ci)=>{
      if(c.front.toLowerCase().includes(q)||c.back.toLowerCase().includes(q))
        results.push({type:'Flashcard', label:`${st.name}: ${c.front.slice(0,40)}`, preview:c.back.slice(0,50), action:()=>{
          flashActiveStack=i; flashActiveCard=ci; flashFlipped=false; renderFlashAll();
          navTo('study',{scrollTo:'flashStackTabs'});
        }});
    });
  });
  // questions
  data.questionLog.subjects.forEach((s,si)=>{
    [1,2,3,4].forEach(t=>{
      s.terms[t].forEach(q2=>{
        if(q2.prompt.toLowerCase().includes(q))
          results.push({type:'Question', label:`${s.name} T${t}: ${q2.prompt.slice(0,50)}`, preview:`Difficulty ${q2.difficulty}`, action:()=>{
            qActiveSubject=si; qActiveTerm=t; qEditingId=null;
            renderQSubjectTabs(); renderQTermTabs(); updateQCountTip(); renderQList();
            navTo('qlog',{qsubtab:'qbank',scrollTo:'qList'});
          }});
      });
    });
  });
  // tasks/deadlines
  (data.tasks||[]).forEach(t=>{
    if(t.title && t.title.toLowerCase().includes(q))
      results.push({type:'Task', label:t.title, preview:`Due ${t.effectiveDue}`, action:()=>navTo('planner',{scrollTo:'taskList'})});
  });
  // mind map bubbles — across all 5 subject boards now, not one flat list
  (data.mindmaps||[]).forEach((mm,mi)=>{
    (mm.bubbles||[]).forEach(b=>{
      if(b.text && b.text.toLowerCase().includes(q))
        results.push({type:'Mind map', label:`${mm.name}: ${b.text.slice(0,50)}`, preview:'Mind map bubble', action:()=>{
          mmActiveSubject=mi; renderMindmap();
          navTo('study',{scrollTo:'mindmapCanvas'});
        }});
    });
  });
  // mind map subject names themselves
  (data.mindmaps||[]).forEach((mm,mi)=>{
    if(mm.name && mm.name.toLowerCase().includes(q))
      results.push({type:'Mind map', label:mm.name, preview:`${(mm.bubbles||[]).length} bubble(s)`, action:()=>{
        mmActiveSubject=mi; renderMindmap();
        navTo('study',{scrollTo:'mindmapCanvas'});
      }});
  });

  currentSearchResults = results;
  if(results.length===0){
    searchDropdown.innerHTML='<div class="search-result" style="color:#aaa;">No results</div>';
  } else {
    searchDropdown.innerHTML = results.slice(0,12).map((r,i)=>`
      <div class="search-result" data-i="${i}">
        <span class="sr-type">${r.type}</span><br>${r.label.replace(/</g,'&lt;')}
        <div style="color:#999;font-size:.72rem;margin-top:2px;">${r.preview.replace(/</g,'&lt;')}</div>
      </div>`).join('');
  }
  searchDropdown.classList.add('open');
});
// BUGFIX: search results were never actually clickable before — there was
// no listener wired up at all, so `action` never ran no matter what you
// clicked. This delegates clicks on any rendered result to its action.
let currentSearchResults = [];
searchDropdown.addEventListener('click', (e)=>{
  const row = e.target.closest('.search-result[data-i]');
  if(!row) return;
  const r = currentSearchResults[parseInt(row.dataset.i)];
  if(r && r.action) r.action();
});
document.addEventListener('click', (e)=>{
  if(!e.target.closest('.topbar-center')) searchDropdown.classList.remove('open');
});

/* ===================== TODAY / HOME SCREEN ===================== */
function renderHome(){
  const now = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('todayGreeting').textContent = `Good ${now.getHours()<12?'morning':now.getHours()<17?'afternoon':'evening'}, ${data.displayName || document.getElementById('userName').textContent} 👋`;
  document.getElementById('todayDate').textContent = `${days[now.getDay()]}, ${months[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;

  // Due today / urgent
  const today = todayStr();
  const urgentTasks = data.tasks.filter(t=> t.effectiveDue <= today);
  const homeTasks = document.getElementById('homeTasks');
  homeTasks.innerHTML = urgentTasks.length ? urgentTasks.map(t=>`<div class="home-item">📌 ${t.title.replace(/</g,'&lt;')} <span style="color:var(--red);font-size:.72rem;">due ${t.effectiveDue}</span></div>`).join('') : '<div class="home-empty">Nothing urgent today!</div>';

  // Leitner cards ready
  const readyCards = [];
  for(let b=1;b<=5;b++) data.leitner[b].forEach(c=>{ if(Date.now()>=c.nextReviewTs) readyCards.push(c); });
  document.getElementById('homeLeitner').innerHTML = readyCards.length ? readyCards.slice(0,5).map(c=>`<div class="home-item">🃏 ${c.text.replace(/</g,'&lt;')}</div>`).join('') + (readyCards.length>5?`<div class="home-empty">+${readyCards.length-5} more</div>`:'') : '<div class="home-empty">All caught up!</div>';

  // Upcoming 7 days
  const upcoming = data.tasks.filter(t=>{ const d=daysBetween(today, t.effectiveDue); return d>0 && d<=7; }).sort((a,b)=>a.effectiveDue.localeCompare(b.effectiveDue));
  document.getElementById('homeUpcoming').innerHTML = upcoming.length ? upcoming.map(t=>`<div class="home-item">📋 ${t.title.replace(/</g,'&lt;')} <span style="color:#888;font-size:.72rem;">${t.effectiveDue}</span></div>`).join('') : '<div class="home-empty">Nothing due in 7 days.</div>';

  // Weak spots from mistakes
  const catCounts = {};
  data.questionLog.mistakes.forEach(m=>{ if(m.subjectName) catCounts[m.subjectName]=(catCounts[m.subjectName]||0)+1; });
  const sorted = Object.entries(catCounts).sort((a,b)=>b[1]-a[1]);
  document.getElementById('homeWeakness').innerHTML = sorted.length ? sorted.slice(0,4).map(([cat,ct])=>`<div class="home-item">⚠️ ${cat.replace(/</g,'&lt;')} <span style="color:var(--red);font-size:.72rem;">${ct} mistake(s)</span></div>`).join('') : '<div class="home-empty">No mistakes logged yet.</div>';

  // Stats
  document.getElementById('homeStats').innerHTML = `
    <div class="home-item">🔥 Streak: <strong>${data.streak} day(s)</strong></div>
    <div class="home-item">⭐ Level ${data.level} · <strong>${data.xp} XP</strong></div>
    <div class="home-item" style="font-size:.75rem;color:#999;">${100-(data.xp%100)} XP to next level</div>`;

  // Unreviewed mistakes (no explanation yet)
  const unreviewed = data.questionLog.mistakes.filter(m=>!m.explanation || m.explanation.trim()==='');
  document.getElementById('homeMistakes').innerHTML = unreviewed.length ? unreviewed.slice(0,4).map(m=>`<div class="home-item">❌ ${m.prompt.slice(0,50).replace(/</g,'&lt;')}</div>`).join('')+(unreviewed.length>4?`<div class="home-empty">+${unreviewed.length-4} more</div>`:'') : '<div class="home-empty">All mistakes reviewed!</div>';
}

/* ===================== FRIENDS / LEADERBOARD (browser-local) ===================== */
// Friends are stored in the Supabase profiles table by display name lookup.
// For the leaderboard, we show globally using the profiles table and locally for friends.
let lbMode = 'friends';
document.getElementById('lbFriendsBtn').addEventListener('click', ()=>{ lbMode='friends'; document.getElementById('lbFriendsBtn').classList.add('active'); document.getElementById('lbGlobalBtn').classList.remove('active'); renderLeaderboard(); });
document.getElementById('lbGlobalBtn').addEventListener('click', ()=>{ lbMode='global'; document.getElementById('lbGlobalBtn').classList.add('active'); document.getElementById('lbFriendsBtn').classList.remove('active'); renderLeaderboard(); });

// BUGFIX (friend system rewrite): friend requests used to be stuffed inside
// each user's private app_data JSON, and lookups queried profiles directly —
// both blocked by Row Level Security for anyone who isn't you, which is
// exactly why adding a friend by name always said "no user exists" even
// though they did. The setup SQL already defines a proper public.friends
// table with correct RLS (you can see rows involving you) plus the safe
// public.leaderboard view for name lookups — this rewires the UI to use them.
let friendsCache = { accepted: [], incoming: [] };

async function loadFriendsData(){
  try{
    const { data: rows } = await sb.from('friends').select('*').or(`user_id.eq.${currentUserId},friend_id.eq.${currentUserId}`);
    const accepted = [], incoming = [];
    (rows||[]).forEach(r=>{
      if(r.status==='accepted'){
        const otherId = r.user_id===currentUserId ? r.friend_id : r.user_id;
        accepted.push(otherId);
      } else if(r.status==='pending' && r.friend_id===currentUserId){
        incoming.push(r.user_id); // someone else sent me a request
      }
    });
    // look up display names for everyone involved via the safe public view
    const ids = [...new Set([...accepted, ...incoming])];
    let names = {};
    if(ids.length){
      const { data: profiles } = await sb.from('leaderboard').select('id,name,username').in('id', ids);
      (profiles||[]).forEach(p=>{ names[p.id] = p.name || p.username || 'Student'; });
    }
    friendsCache = { accepted: accepted.map(id=>({id, name:names[id]||'Student'})), incoming: incoming.map(id=>({id, name:names[id]||'Student'})) };
    data.friends = accepted; // keep in sync for leaderboard "friends" mode
  }catch(e){ console.error('Could not load friends', e); }
}

document.getElementById('friendAddBtn').addEventListener('click', async ()=>{
  const name = document.getElementById('friendInput').value.trim();
  if(!name){ showToast('Enter a display name.'); return; }
  try{
    const { data: profiles } = await sb.from('leaderboard').select('id,name,username').or(`name.ilike.${name},username.ilike.${name}`);
    if(!profiles || profiles.length===0){ showToast('No user found with that display name.'); return; }
    const target = profiles[0];
    if(target.id === currentUserId){ showToast("That's you!"); return; }
    if(friendsCache.accepted.some(f=>f.id===target.id)){ showToast('Already friends.'); return; }
    const { error } = await sb.from('friends').insert({ user_id: currentUserId, friend_id: target.id, status: 'pending' });
    if(error){ if(error.code==='23505'){ showToast('Request already sent.'); } else { throw error; } return; }
    showToast(`Friend request sent to ${target.name||target.username}!`);
    document.getElementById('friendInput').value='';
  }catch(e){ showToast('Could not send request — try again.'); }
});

async function acceptFriend(fromId, fromName){
  try{
    await sb.from('friends').update({ status: 'accepted' }).eq('user_id', fromId).eq('friend_id', currentUserId);
  }catch(e){ showToast('Could not accept — try again.'); return; }
  await loadFriendsData();
  renderFriends();
  showToast(`You and ${fromName} are now friends!`);
}
async function declineFriend(fromId){
  try{ await sb.from('friends').delete().eq('user_id', fromId).eq('friend_id', currentUserId); }catch(e){}
  await loadFriendsData();
  renderFriends();
}
async function removeFriend(id){
  try{
    await sb.from('friends').delete().eq('user_id', currentUserId).eq('friend_id', id);
    await sb.from('friends').delete().eq('user_id', id).eq('friend_id', currentUserId);
  }catch(e){}
  await loadFriendsData();
  renderFriends();
}

function renderFriends(){
  const reqWrap = document.getElementById('friendRequests');
  const reqs = friendsCache.incoming||[];
  reqWrap.innerHTML = reqs.length ? reqs.map(r=>`<div class="friend-row"><span>${r.name.replace(/</g,'&lt;')}</span><div style="display:flex;gap:6px;"><button class="btn small green" onclick="acceptFriend('${r.id}','${r.name.replace(/'/g,"\\'")}')">Accept</button><button class="btn small red" onclick="declineFriend('${r.id}')">Decline</button></div></div>`).join('') : '<p style="color:#aaa;font-size:.82rem;">No pending requests.</p>';
  const friendWrap = document.getElementById('friendList');
  const friends = friendsCache.accepted||[];
  friendWrap.innerHTML = friends.length ? friends.map(f=>`<div class="friend-row"><span>${f.name.replace(/</g,'&lt;')}</span><button class="btn small ghost" onclick="removeFriend('${f.id}')">Remove</button></div>`).join('') : '<p style="color:#aaa;font-size:.82rem;">No friends yet.</p>';
}

async function renderLeaderboard(){
  const wrap = document.getElementById('leaderboard');
  wrap.innerHTML = '<p style="color:#aaa;font-size:.82rem;">Loading…</p>';
  try{
    // BUGFIX: this used to query profiles.app_data directly, which Row Level
    // Security blocks for anyone else's row (each user can only see their own
    // profile) — so it silently only ever returned yourself. The setup SQL
    // already defines a safe `public.leaderboard` view (id, username, name,
    // xp, level — never the private app_data) that's readable by everyone
    // signed in. Use that instead.
    let rows = [];
    if(lbMode==='global'){
      const { data: profiles } = await sb.from('leaderboard').select('id,name,xp,level').order('xp',{ascending:false}).limit(50);
      rows = (profiles||[]).map(p=>({ id:p.id, name:p.name||'Student', xp:p.xp||0, level:p.level||1 }));
    } else {
      const ids = [...(data.friends||[]), currentUserId];
      const { data: profiles } = await sb.from('leaderboard').select('id,name,xp,level').in('id', ids);
      rows = (profiles||[]).map(p=>({ id:p.id, name:p.name||'Student', xp:p.xp||0, level:p.level||1 }));
    }
    rows.sort((a,b)=>b.xp-a.xp);
    wrap.innerHTML = rows.length ? rows.map((r,i)=>`<div class="lb-row ${r.id===currentUserId?'lb-me':''}"><span class="lb-rank">${i+1}</span><span class="lb-name">${r.name.replace(/</g,'&lt;')}${r.id===currentUserId?' (you)':''}</span><span class="lb-xp">Lv ${r.level} · ${r.xp} XP</span></div>`).join('') : '<p style="color:#aaa;font-size:.82rem;">Nobody to show yet.</p>';
  }catch(e){ wrap.innerHTML='<p style="color:var(--red);font-size:.82rem;">Could not load leaderboard.</p>'; }
}

/* ===================== PRACTICE TEST SHARE ===================== */
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
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn small green" onclick="startPracticeTest(${t.id})">Start</button>
        <button class="btn small blue" onclick="sharePracticeTest(${t.id})">Share</button>
        <button class="btn small red" onclick="deleteTest(${t.id})">Delete</button>
      </div>
    </div>`;
  }).join('');
}
function sharePracticeTest(id){
  const test = data.questionLog.practiceTests.find(t=>t.id===id);
  if(!test) return;
  const subj = data.questionLog.subjects[test.subjectIndex];
  const questions = test.questionIds.map(qid=>{ for(const t of [1,2,3,4]){ const found=subj.terms[t].find(q=>q.id===qid); if(found) return found; } return null; }).filter(Boolean);
  // BUGFIX: this used to upload whatever came out of the lookup above with
  // no check — if it came out empty, you'd get a share code for an empty
  // deck (looked fine on your end, but the person importing it would see a
  // test with the right name/term and zero questions). Catch that here
  // instead of silently sharing a broken deck.
  if(questions.length === 0){ showToast('This test has no questions to share — its questions may have been deleted.'); return; }
  shareViaTable('practice_test', test.name, { name: test.name, questions });
}

/* ===================== MISTAKE LOG — MANUAL ADD ===================== */
function renderMlTypeFields(){
  const type = document.getElementById('mlType').value;
  const wrap = document.getElementById('mlTypeFields');
  if(type==='mcq'){
    wrap.innerHTML = `<div class="row">
      <div><label>Option A</label><input id="mlOptA"></div><div><label>Option B</label><input id="mlOptB"></div>
      <div><label>Option C</label><input id="mlOptC"></div><div><label>Option D</label><input id="mlOptD"></div>
    </div>
    <label>Correct option</label><select id="mlCorrectMcq"><option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option></select>`;
  } else if(type==='tf'){
    wrap.innerHTML = `<label>Correct answer</label><select id="mlCorrectTf"><option value="true">True</option><option value="false">False</option></select>`;
  } else {
    wrap.innerHTML = `<label>Correct / model answer</label><textarea id="mlModelAnswer" style="min-height:50px;"></textarea>`;
  }
}
document.getElementById('mlType').addEventListener('change', renderMlTypeFields);
let mlPendingImage='';
document.getElementById('mlImageInput').addEventListener('change', (e)=>{
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{ mlPendingImage=reader.result; document.getElementById('mlImagePreview').innerHTML=`<img class="qimg-thumb" src="${mlPendingImage}">`; };
  reader.readAsDataURL(file);
});
function mlSubjectSelect(){
  const sel = document.getElementById('mlSubject');
  sel.innerHTML = data.questionLog.subjects.map((s,i)=>`<option value="${i}">${s.name}</option>`).join('');
}
document.getElementById('mlAddBtn').addEventListener('click', ()=>{
  const prompt = document.getElementById('mlPrompt').value.trim();
  if(!prompt){ showToast('Write the question prompt.'); return; }
  const type = document.getElementById('mlType').value;
  const userAnswer = document.getElementById('mlUserAnswer').value.trim();
  const subjectIndex = parseInt(document.getElementById('mlSubject').value)||0;
  const term = parseInt(document.getElementById('mlTerm').value)||1;
  const category = document.getElementById('mlCategory').value.trim();
  const difficulty = Math.max(1,Math.min(10,parseInt(document.getElementById('mlDifficulty').value)||5));
  const image = mlPendingImage;
  let correctAnswer='';
  if(type==='mcq'){
    const opts=['A','B','C','D'];
    const letters=['mlOptA','mlOptB','mlOptC','mlOptD'].map(id=>document.getElementById(id).value.trim());
    const correct=parseInt(document.getElementById('mlCorrectMcq').value)||0;
    correctAnswer=`${opts[correct]}. ${letters[correct]}`;
  } else if(type==='tf'){
    correctAnswer=document.getElementById('mlCorrectTf').value==='true'?'True':'False';
  } else {
    correctAnswer=document.getElementById('mlModelAnswer').value.trim();
  }
  data.questionLog.mistakes.push({
    id:(data.questionLog.mistakeSeq = (data.questionLog.mistakeSeq||0)+1), ts:Date.now(),
    subjectName:data.questionLog.subjects[subjectIndex].name, term, prompt, type,
    correctAnswer, userAnswer, explanation:'', category, difficulty, image, manual:true
  });
  mlPendingImage='';
  document.getElementById('mlImagePreview').innerHTML='';
  document.getElementById('mlPrompt').value='';
  document.getElementById('mlUserAnswer').value='';
  document.getElementById('mlCategory').value='';
  document.getElementById('mlDifficulty').value='5';
  document.getElementById('mlImageInput').value='';
  renderMlTypeFields();
  renderMistakeList();
  scheduleSave();
  showToast('Added to mistake log.');
});

/* update renderMistakeList to show image, category, difficulty */
function renderMistakeList(){
  const wrap = document.getElementById('mistakeList');
  const mistakes = data.questionLog.mistakes.slice().sort((a,b)=>b.ts-a.ts);
  if(mistakes.length===0){ wrap.innerHTML = '<p style="color:#888;font-size:.85rem;">No mistakes logged yet.</p>'; return; }
  const typeLabel = {frq:'FRQ', mcq:'Multiple choice', tf:'True/False'};
  wrap.innerHTML = mistakes.map(m=>`
    <div class="mistake-card">
      <div class="qcard-prompt">${m.prompt.replace(/</g,'&lt;')}</div>
      <div class="qmeta">
        <span class="qtype-badge">${m.subjectName} · Term ${m.term}</span>
        ${m.category?`<span class="qcat-badge">${m.category.replace(/</g,'&lt;')}</span>`:''}
        ${m.difficulty?`<span class="qdiff-badge">Difficulty ${m.difficulty}/10</span>`:''}
        ${m.manual?`<span style="font-size:.65rem;background:#F1E5F6;color:#6b3d8a;padding:2px 6px;border-radius:8px;font-weight:700;">Manual</span>`:''}
      </div>
      ${m.image?`<img class="qimg-thumb" src="${m.image}">`:''}
      <div class="answer-compare">
        <div class="wrong-ans">Your answer: ${(m.userAnswer||'(no answer)').replace(/</g,'&lt;')}</div>
        <div class="right-ans">Correct: ${m.correctAnswer.replace(/</g,'&lt;')}</div>
      </div>
      <label style="margin-top:4px;">Why did I miss this?</label>
      <textarea style="min-height:60px;" oninput="updateMistakeExplanation(${m.id}, this.value)">${m.explanation||''}</textarea>
      <button class="btn small red" style="margin-top:6px;" onclick="deleteMistake(${m.id})">Delete</button>
    </div>`).join('');
}

/* ===================== GRADE TRACKER ===================== */
let gtActiveSubject = 0, gtActiveTerm = 1;
function catAvg(entries){
  if(!entries || entries.length===0) return null;
  const sumScore = entries.reduce((s,e)=>s+e.score,0);
  const sumTotal = entries.reduce((s,e)=>s+e.total,0);
  if(sumTotal===0) return null;
  return (sumScore/sumTotal)*100;
}
function termAvg(subject, term){
  const t = subject.terms[term];
  const majorAvg = catAvg(t.major);
  const quizAvg = catAvg(t.quiz);
  if(majorAvg===null && quizAvg===null) return null;
  const wMajor = subject.weights.major, wQuiz = subject.weights.quiz;
  if(majorAvg===null) return quizAvg;
  if(quizAvg===null) return majorAvg;
  return (majorAvg*wMajor + quizAvg*wQuiz) / (wMajor+wQuiz);
}
function semesterAvg(subject, termA, termB){
  const a = termAvg(subject, termA), b = termAvg(subject, termB);
  if(a===null && b===null) return null;
  if(a===null) return b;
  if(b===null) return a;
  return (a+b)/2;
}
function finalGrade(subject){
  const s1 = semesterAvg(subject,1,2), s2 = semesterAvg(subject,3,4);
  if(s1===null && s2===null) return null;
  if(s1===null) return s2;
  if(s2===null) return s1;
  return (s1+s2)/2;
}
function fmtPct(v){ return v===null ? '—' : v.toFixed(1)+'%'; }
function renderGradeTracker(){
  if(!data || !data.gradeTracker) return;
  const gt = data.gradeTracker;
  renderSubjectTabs('gtSubjectTabs', gt.subjects, gtActiveSubject, (i)=>{ gtActiveSubject=i; renderGradeTracker(); });
  const subj = gt.subjects[gtActiveSubject];
  document.getElementById('gtSubjectName').value = subj.name;
  document.getElementById('gtMajorWeight').value = subj.weights.major;
  document.getElementById('gtQuizWeight').value = subj.weights.quiz;
  document.getElementById('gtTermTabs').innerHTML = [1,2,3,4].map(t=>
    `<button class="pill-toggle ${t===gtActiveTerm?'active':''}" onclick="gtSelectTerm(${t})">Term ${t}</button>`).join('');
  const term = subj.terms[gtActiveTerm];
  const renderList = (entries, listId, kind) => {
    document.getElementById(listId).innerHTML = entries.length ? entries.map((e,i)=>
      `<div class="home-item" style="display:flex;justify-content:space-between;align-items:center;">
        <span>${e.label.replace(/</g,'&lt;')}: ${e.score}/${e.total} (${((e.score/e.total)*100).toFixed(1)}%)</span>
        <button class="btn small red" onclick="gtRemoveEntry('${kind}',${i})">×</button>
      </div>`).join('') : '<p style="color:#999;font-size:.8rem;">No grades yet.</p>';
  };
  renderList(term.major, 'gtMajorList', 'major');
  renderList(term.quiz, 'gtQuizList', 'quiz');
  document.getElementById('gtMajorAvg').textContent = catAvg(term.major)!==null ? `— avg ${fmtPct(catAvg(term.major))}` : '';
  document.getElementById('gtQuizAvg').textContent = catAvg(term.quiz)!==null ? `— avg ${fmtPct(catAvg(term.quiz))}` : '';
  const avg = termAvg(subj, gtActiveTerm);
  document.getElementById('gtTermAvg').textContent = avg!==null ? `Term ${gtActiveTerm} average: ${fmtPct(avg)}` : `No grades entered yet for Term ${gtActiveTerm}.`;

  // overview table across all 5 subjects
  const rows = gt.subjects.map(s=>{
    const t1=termAvg(s,1), t2=termAvg(s,2), t3=termAvg(s,3), t4=termAvg(s,4);
    const sem1=semesterAvg(s,1,2), sem2=semesterAvg(s,3,4), fin=finalGrade(s);
    return `<tr><td><strong>${s.name.replace(/</g,'&lt;')}</strong></td><td>${fmtPct(t1)}</td><td>${fmtPct(t2)}</td><td>${fmtPct(t3)}</td><td>${fmtPct(t4)}</td><td>${fmtPct(sem1)}</td><td>${fmtPct(sem2)}</td><td><strong>${fmtPct(fin)}</strong></td></tr>`;
  }).join('');
  document.getElementById('gtOverviewTable').innerHTML = `<tr><th>Subject</th><th>T1</th><th>T2</th><th>T3</th><th>T4</th><th>Sem 1</th><th>Sem 2</th><th>Final</th></tr>${rows}`;
}
function gtSelectTerm(t){ gtActiveTerm=t; renderGradeTracker(); }
function gtRemoveEntry(kind, i){
  const subj = data.gradeTracker.subjects[gtActiveSubject];
  subj.terms[gtActiveTerm][kind].splice(i,1);
  renderGradeTracker(); scheduleSave();
}
document.getElementById('gtSubjectName').addEventListener('input', (e)=>{
  data.gradeTracker.subjects[gtActiveSubject].name = e.target.value || `Subject ${gtActiveSubject+1}`;
  renderSubjectTabs('gtSubjectTabs', data.gradeTracker.subjects, gtActiveSubject, (i)=>{ gtActiveSubject=i; renderGradeTracker(); });
  scheduleSave();
});
document.getElementById('gtMajorWeight').addEventListener('input', (e)=>{
  let major = Math.max(0, Math.min(100, parseInt(e.target.value)||0));
  const subj = data.gradeTracker.subjects[gtActiveSubject];
  subj.weights.major = major; subj.weights.quiz = 100-major;
  document.getElementById('gtQuizWeight').value = subj.weights.quiz;
  renderGradeTracker(); scheduleSave();
});
document.getElementById('gtMajorAddBtn').addEventListener('click', ()=>{
  const label = document.getElementById('gtMajorLabel').value.trim();
  const score = parseFloat(document.getElementById('gtMajorScore').value);
  const total = parseFloat(document.getElementById('gtMajorTotal').value);
  if(!label || isNaN(score) || isNaN(total) || total<=0){ showToast('Fill in a label, score, and total (out of).'); return; }
  data.gradeTracker.subjects[gtActiveSubject].terms[gtActiveTerm].major.push({label, score, total});
  document.getElementById('gtMajorLabel').value=''; document.getElementById('gtMajorScore').value=''; document.getElementById('gtMajorTotal').value='100';
  renderGradeTracker(); scheduleSave();
});
document.getElementById('gtQuizAddBtn').addEventListener('click', ()=>{
  const label = document.getElementById('gtQuizLabel').value.trim();
  const score = parseFloat(document.getElementById('gtQuizScore').value);
  const total = parseFloat(document.getElementById('gtQuizTotal').value);
  if(!label || isNaN(score) || isNaN(total) || total<=0){ showToast('Fill in a label, score, and total (out of).'); return; }
  data.gradeTracker.subjects[gtActiveSubject].terms[gtActiveTerm].quiz.push({label, score, total});
  document.getElementById('gtQuizLabel').value=''; document.getElementById('gtQuizScore').value=''; document.getElementById('gtQuizTotal').value='100';
  renderGradeTracker(); scheduleSave();
});

/* ===================== CALENDAR ===================== */
let calYear = new Date().getFullYear(), calMonth = new Date().getMonth(), calSelectedDay = null;
const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function renderCalendar(){
  const label = document.getElementById('calMonthLabel');
  label.textContent = `${CAL_MONTHS[calMonth]} ${calYear}`;
  const grid = document.getElementById('calGrid');
  grid.innerHTML = CAL_DAYS.map(d=>`<div class="cal-day-label">${d}</div>`).join('');
  const first = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();
  const todayObj = new Date(); const todayD=todayObj.getDate(), todayM=todayObj.getMonth(), todayY=todayObj.getFullYear();

  // collect events
  const events = {};
  const addEvent=(dateStr, text, cls)=>{ if(!events[dateStr]) events[dateStr]=[]; events[dateStr].push({text,cls}); };
  data.tasks.forEach(t=>{ addEvent(t.effectiveDue, t.title.slice(0,20), 'cal-ev-task'); });
  data.questionLog.mistakes.forEach(m=>{
    const d=new Date(m.ts); const ds=d.toISOString().slice(0,10);
    addEvent(ds, m.prompt.slice(0,20), 'cal-ev-mistake');
  });

  // prev month padding
  for(let i=0;i<first;i++){
    const d=daysInPrev-first+i+1;
    grid.innerHTML += `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`;
  }
  for(let d=1;d<=daysInMonth;d++){
    const ds=`${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday=d===todayD&&calMonth===todayM&&calYear===todayY;
    const isSelected=calSelectedDay===ds;
    const evs=events[ds]||[];
    const evHtml=evs.slice(0,3).map(e=>`<div class="cal-event ${e.cls}">${e.text.replace(/</g,'&lt;')}</div>`).join('');
    grid.innerHTML+=`<div class="cal-day${isToday?' today':''}${isSelected?' selected':''}" data-date="${ds}">
      <div class="cal-day-num">${d}</div>${evHtml}
    </div>`;
  }
  // next month padding
  const total=first+daysInMonth; const rem=(7-total%7)%7;
  for(let i=1;i<=rem;i++) grid.innerHTML+=`<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`;

  grid.querySelectorAll('.cal-day:not(.other-month)').forEach(el=>{
    el.addEventListener('click', ()=>{
      calSelectedDay=el.dataset.date;
      renderCalendar();
      showCalDayDetail(el.dataset.date);
    });
  });
  if(!calSelectedDay) document.getElementById('calDayDetail').style.display='none';
}
function showCalDayDetail(dateStr){
  const detail=document.getElementById('calDayDetail');
  detail.style.display='block';
  const tasks=data.tasks.filter(t=>t.effectiveDue===dateStr);
  const mistakes=data.questionLog.mistakes.filter(m=>new Date(m.ts).toISOString().slice(0,10)===dateStr);
  let html=`<h3>${dateStr}</h3>`;
  if(tasks.length) html+=`<strong>Tasks due:</strong>`+tasks.map(t=>`<div class="home-item">📋 ${t.title.replace(/</g,'&lt;')}</div>`).join('');
  if(mistakes.length) html+=`<strong>Mistakes logged:</strong>`+mistakes.map(m=>`<div class="home-item" style="color:var(--red);">❌ ${m.prompt.slice(0,60).replace(/</g,'&lt;')}</div>`).join('');
  if(!tasks.length&&!mistakes.length) html+='<p style="color:#aaa;font-size:.82rem;">Nothing logged for this day.</p>';
  detail.innerHTML=html;
}
document.getElementById('calPrevBtn').addEventListener('click', ()=>{ calMonth--; if(calMonth<0){calMonth=11;calYear--;} calSelectedDay=null; renderCalendar(); });
document.getElementById('calNextBtn').addEventListener('click', ()=>{ calMonth++; if(calMonth>11){calMonth=0;calYear++;} calSelectedDay=null; renderCalendar(); });
document.getElementById('calTodayBtn').addEventListener('click', ()=>{ calYear=new Date().getFullYear(); calMonth=new Date().getMonth(); calSelectedDay=null; renderCalendar(); });

/* ===================== ICS CALENDAR IMPORT ===================== */
function parseICS(text){
  // unfold continuation lines per RFC5545 (lines starting with a space/tab
  // are a continuation of the previous line)
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines = [];
  rawLines.forEach(line=>{
    if(/^[ \t]/.test(line) && lines.length){ lines[lines.length-1] += line.slice(1); }
    else { lines.push(line); }
  });
  const events = [];
  let cur = null;
  lines.forEach(line=>{
    if(line.startsWith('BEGIN:VEVENT')){ cur = {}; }
    else if(line.startsWith('END:VEVENT')){ if(cur) events.push(cur); cur=null; }
    else if(cur){
      const idx = line.indexOf(':');
      if(idx<0) return;
      const key = line.slice(0,idx).split(';')[0];
      const value = line.slice(idx+1);
      if(key==='SUMMARY') cur.summary = value;
      else if(key==='DTSTART') cur.dtstart = value;
      else if(key==='DTEND') cur.dtend = value;
      else if(key==='DUE') cur.due = value;
    }
  });
  return events;
}
function icsDateToYMD(v){
  if(!v) return null;
  const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
let icsParsedEvents = [];
document.getElementById('icsFileInput').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    const events = parseICS(ev.target.result);
    icsParsedEvents = events.map(ev2=>({
      title: ev2.summary || 'Untitled assignment',
      due: icsDateToYMD(ev2.due || ev2.dtend || ev2.dtstart) || todayStr(),
      type: 'none', qty: 0, include: true,
    }));
    if(icsParsedEvents.length===0) showToast('No events found in that file.');
    renderIcsReview();
  };
  reader.readAsText(file);
});
function renderIcsReview(){
  const wrap = document.getElementById('icsReviewList');
  const btn = document.getElementById('icsImportBtn');
  if(icsParsedEvents.length===0){ wrap.innerHTML=''; btn.style.display='none'; return; }
  wrap.innerHTML = `<p style="font-size:.8rem;color:#666;margin-bottom:8px;">${icsParsedEvents.length} event(s) found. Uncheck any you don't want, and set a workload type/amount if you want Parkinson's Law day-by-day breakdowns.</p>` +
    icsParsedEvents.map((ev,i)=>`
    <div class="row" style="align-items:center;margin-bottom:8px;border-bottom:1px solid #eee;padding-bottom:8px;">
      <div style="flex:0 0 auto;"><input type="checkbox" data-ics-i="${i}" class="icsIncludeCheck" ${ev.include?'checked':''} style="width:auto;"></div>
      <div style="flex:2"><input data-ics-i="${i}" class="icsTitleInput" value="${ev.title.replace(/"/g,'&quot;')}"></div>
      <div style="flex:1"><input type="date" data-ics-i="${i}" class="icsDueInput" value="${ev.due}"></div>
      <div style="flex:1"><select data-ics-i="${i}" class="icsTypeSelect">
        <option value="none" ${ev.type==='none'?'selected':''}>No quantity</option>
        <option value="questions" ${ev.type==='questions'?'selected':''}>Questions</option>
        <option value="pages" ${ev.type==='pages'?'selected':''}>Pages</option>
      </select></div>
      <div style="flex:1"><input type="number" min="0" data-ics-i="${i}" class="icsQtyInput" value="${ev.qty}" ${ev.type==='none'?'disabled':''} placeholder="Amount"></div>
    </div>`).join('');
  btn.style.display='inline-block';
  wrap.querySelectorAll('.icsIncludeCheck').forEach(el=>el.addEventListener('change', e=>{ icsParsedEvents[+e.target.dataset.icsI].include = e.target.checked; }));
  wrap.querySelectorAll('.icsTitleInput').forEach(el=>el.addEventListener('input', e=>{ icsParsedEvents[+e.target.dataset.icsI].title = e.target.value; }));
  wrap.querySelectorAll('.icsDueInput').forEach(el=>el.addEventListener('input', e=>{ icsParsedEvents[+e.target.dataset.icsI].due = e.target.value; }));
  wrap.querySelectorAll('.icsTypeSelect').forEach(el=>el.addEventListener('change', e=>{ icsParsedEvents[+e.target.dataset.icsI].type = e.target.value; renderIcsReview(); }));
  wrap.querySelectorAll('.icsQtyInput').forEach(el=>el.addEventListener('input', e=>{ icsParsedEvents[+e.target.dataset.icsI].qty = parseInt(e.target.value)||0; }));
}
document.getElementById('icsImportBtn').addEventListener('click', ()=>{
  const toImport = icsParsedEvents.filter(ev=>ev.include);
  if(toImport.length===0){ showToast('Nothing selected to import.'); return; }
  toImport.forEach(ev=>{
    data.tasks.push({
      id: Date.now()+Math.floor(Math.random()*1000),
      title: ev.title, type: ev.type, qty: ev.type==='none'?0:ev.qty,
      start: todayStr(), due: ev.due, effectiveDue: ev.due, parkinson:false, doneDays:[]
    });
  });
  showToast(`Imported ${toImport.length} assignment(s) into your Planner.`);
  icsParsedEvents = [];
  document.getElementById('icsReviewList').innerHTML='';
  document.getElementById('icsImportBtn').style.display='none';
  document.getElementById('icsFileInput').value='';
  renderTasks();
  scheduleSave();
});

/* ===================== FULL RENDER ON LOGIN ===================== */
// BUGFIX: renderAll() used to call renderQuestionLog(), which didn't exist —
// that threw a ReferenceError partway through renderAll() and silently
// skipped everything after it (friends, leaderboard, calendar, mistake-log
// fields, dark mode, display name). Defining it properly fixes all of those
// "only works after I switch tabs" symptoms in one shot.
function renderQuestionLog(){
  renderQSubjectTabs();
  renderQTermTabs();
  updateQCountTip();
  renderQList();
  resetQuestionForm();
  renderPtSubjectSelect();
  renderPtList();
  renderMistakeList();
}

async function renderAll(){
  renderStats();
  renderHome();
  renderTasks();
  renderBoxes();
  renderMindmap();
  renderBasicNotebooks();
  renderFormalNotebooks();
  renderFlashAll();
  loadFeynmanDraft();
  renderFeynmanStatus();
  renderQuestionLog();
  await loadFriendsData();
  renderFriends();
  renderLeaderboard();
  renderCalendar();
  mlSubjectSelect();
  renderMlTypeFields();
  buildSchedule();
  renderSchedule();
  renderGradeTracker();
  applyDarkMode(data.darkMode||false);
  // restore display name if saved
  if(data.displayName) document.getElementById('userName').textContent = data.displayName;
}
