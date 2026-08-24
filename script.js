
import { initializeApp } from
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getFirestore, collection, doc,
  addDoc, getDocs, setDoc, updateDoc, onSnapshot,
  query, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';


// ═══════════════════════════════════════════════════════
//   API KEYS  —  loaded from localStorage, never hardcoded
// ═══════════════════════════════════════════════════════
let GROQ_KEY = '';
let GH_TOKEN = '';

const GH_USER = 'marbej56-lab';
const GH_REPO = 'Jarv.ult';

// ── Key persistence helpers ───────────────────────────
const STORE_GROQ = 'jarvis_groq_key';
const STORE_GH   = 'jarvis_gh_token';

function keysStored() {
  return !!localStorage.getItem(STORE_GROQ);
}

function loadKeys() {
  GROQ_KEY = localStorage.getItem(STORE_GROQ) || '';
  GH_TOKEN = localStorage.getItem(STORE_GH)   || '';
}

function saveKeys(groq, gh) {
  localStorage.setItem(STORE_GROQ, groq);
  if (gh) localStorage.setItem(STORE_GH, gh);
  else     localStorage.removeItem(STORE_GH);
  GROQ_KEY = groq;
  GH_TOKEN = gh;
}

function clearKeys() {
  localStorage.removeItem(STORE_GROQ);
  localStorage.removeItem(STORE_GH);
}


// ── Setup screen logic ────────────────────────────────
const setupScreen = document.getElementById('setupScreen');
const mainHUD     = document.getElementById('mainHUD');

function showSetup() {
  setupScreen.style.display = 'flex';
  mainHUD.style.display     = 'none';
}

function showHUD() {
  setupScreen.style.display = 'none';
  mainHUD.style.display     = 'flex';
}

document.getElementById('btnInit').onclick = () => {
  const groq = document.getElementById('inputGroq').value.trim();
  const gh   = document.getElementById('inputGH').value.trim();
  const err  = document.getElementById('setupError');

  if (!groq) {
    err.textContent = 'Groq API key is required.';
    return;
  }
  err.textContent = '';
  saveKeys(groq, gh);
  showHUD();
  boot();
};

document.getElementById('btnResetKeys').onclick = () => {
  if (confirm('Clear saved API keys and return to login screen?')) {
    clearKeys();
    location.reload();
  }
};

// Enter key submits the form
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && setupScreen.style.display !== 'none') {
    document.getElementById('btnInit').click();
  }
});

// ── On page load: skip setup if keys already saved ───
if (keysStored()) {
  loadKeys();
  showHUD();
  // boot() called after firebase init below
} else {
  showSetup();
}


// ═══════════════════════════════════════════════════════
//   FIREBASE
// ═══════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey:            'AIzaSyBp5PCpaeB3hRVeGeF-rmAlkKGYvsOFXWE',
  authDomain:        'jarvis-memory-b4d7a.firebaseapp.com',
  projectId:         'jarvis-memory-b4d7a',
  storageBucket:     'jarvis-memory-b4d7a.firebasestorage.app',
  messagingSenderId: '210322906311',
  appId:             '1:210322906311:web:1a8c70feeeab21822c72e2'
};
const fbApp = initializeApp(firebaseConfig);
const db    = getFirestore(fbApp);


// ═══════════════════════════════════════════════════════
//   CANVAS
// ═══════════════════════════════════════════════════════
const canvas = document.getElementById('sphere');
const ctx    = canvas.getContext('2d');
const W = 600, H = 600, CX = 300, CY = 300;
const RADIUS = 215;

let dots       = [];
let rotY       = 0;
let audioLevel = 0;


// ═══════════════════════════════════════════════════════
//   EARTH SPHERE
// ═══════════════════════════════════════════════════════
async function buildEarth() {
  setStatus('LOADING EARTH…');
  try {
    const res   = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json');
    const world = await res.json();

    const MW = 1440, MH = 720;
    const mask  = document.createElement('canvas');
    mask.width  = MW; mask.height = MH;
    const mCtx  = mask.getContext('2d');
    mCtx.fillStyle = '#000';
    mCtx.fillRect(0, 0, MW, MH);

    const project = ([lon, lat]) => [
      ((lon + 180) / 360) * MW,
      ((90  - lat) / 180) * MH
    ];

    mCtx.fillStyle = '#fff';
    mCtx.beginPath();

    const land = topojson.feature(world, world.objects.land);

    function drawGeom(geom) {
      if (!geom) return;
      const polys =
        geom.type === 'MultiPolygon' ? geom.coordinates :
        geom.type === 'Polygon'      ? [geom.coordinates] : [];
      for (const poly of polys) {
        for (const ring of poly) {
          const [s, ...rest] = ring;
          const [sx, sy] = project(s);
          mCtx.moveTo(sx, sy);
          for (const c of rest) { const [x, y] = project(c); mCtx.lineTo(x, y); }
          mCtx.closePath();
        }
      }
    }

    land.type === 'Feature'
      ? drawGeom(land.geometry)
      : land.features?.forEach(f => drawGeom(f.geometry));

    mCtx.fill('evenodd');

    const img = mCtx.getImageData(0, 0, MW, MH);
    const isLand = (lon, lat) => {
      const px = Math.max(0, Math.min(MW-1, Math.floor(((lon+180)/360)*MW)));
      const py = Math.max(0, Math.min(MH-1, Math.floor(((90-lat)/180)*MH)));
      return img.data[(py*MW+px)*4] > 128;
    };

    const TARGET = 10000;
    dots = [];
    let tries = 0;
    while (dots.length < TARGET && tries < TARGET * 18) {
      tries++;
      const theta = 2 * Math.PI * Math.random();
      const phi   = Math.acos(2 * Math.random() - 1);
      const lon   = theta * (180/Math.PI) - 180;
      const lat   = 90 - phi * (180/Math.PI);
      if (!isLand(lon, lat)) continue;
      const building = Math.random() < 0.038;
      dots.push({
        ux: Math.sin(phi)*Math.cos(theta),
        uy: Math.cos(phi),
        uz: Math.sin(phi)*Math.sin(theta),
        r:  RADIUS + (building ? 3 + Math.random()*7 : 0),
        building,
        sz:   building ? 1.1 + Math.random()*1.3 : 0.5 + Math.random()*0.42,
        glow: 0.55 + Math.random()*0.45
      });
    }
  } catch (err) {
    console.warn('World data failed, fallback sphere:', err);
    fallbackSphere();
  }
  setStatus('ONLINE');
  animate();
}

function fallbackSphere() {
  const N = 4000, phi = Math.PI * (3 - Math.sqrt(5));
  dots = Array.from({length:N}, (_,i) => {
    const y=1-(i/(N-1))*2, r=Math.sqrt(1-y*y), t=phi*i;
    return { ux:Math.cos(t)*r, uy:y, uz:Math.sin(t)*r,
             r:RADIUS, building:false, sz:0.7, glow:0.7 };
  });
}

function animate() {
  requestAnimationFrame(animate);
  ctx.clearRect(0, 0, W, H);
  rotY += 0.0013;
  const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
  const vis = [];

  for (const d of dots) {
    const x = d.ux*cosY + d.uz*sinY;
    const y = d.uy;
    const z = -d.ux*sinY + d.uz*cosY;
    if (z < -0.05) continue;
    const rr    = d.r * (1 + audioLevel*0.07);
    const depth = (z+1)/2;
    vis.push({ sx: CX+x*rr, sy: CY-y*rr, depth, d });
  }

  vis.sort((a,b) => a.depth - b.depth);

  for (const {sx,sy,depth,d} of vis) {
    const alpha = 0.22 + depth*0.72;
    const size  = d.sz * (0.3 + depth*0.7) * (1 + audioLevel*0.18);
    if (d.building) {
      ctx.beginPath();
      ctx.arc(sx,sy,size*4,0,Math.PI*2);
      ctx.fillStyle = `rgba(255,210,90,${0.045*depth*d.glow})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx,sy,size,0,Math.PI*2);
      ctx.fillStyle = `rgba(255,242,165,${alpha*d.glow})`;
      ctx.fill();
    } else {
      const rr = Math.floor(8+depth*55), gg = Math.floor(145+depth*95);
      ctx.beginPath();
      ctx.arc(sx,sy,size,0,Math.PI*2);
      ctx.fillStyle = `rgba(${rr},${gg},255,${alpha*d.glow})`;
      ctx.fill();
    }
  }
}


// ═══════════════════════════════════════════════════════
//   MICROPHONE ANALYSER
// ═══════════════════════════════════════════════════════
async function initMic() {
  try {
    const stream   = await navigator.mediaDevices.getUserMedia({ audio:true });
    const actx     = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = actx.createAnalyser();
    analyser.fftSize = 256;
    actx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    ;(function tick(){
      requestAnimationFrame(tick);
      analyser.getByteFrequencyData(data);
      audioLevel = data.reduce((s,v)=>s+v,0)/data.length/128;
    })();
    document.getElementById('voiceStatus').textContent = 'ACTIVE';
  } catch {
    document.getElementById('voiceStatus').textContent = 'NO MIC';
  }
}


// ═══════════════════════════════════════════════════════
//   FIREBASE MEMORY
// ═══════════════════════════════════════════════════════
async function memSave(userMsg, jarvisReply) {
  try {
    await addDoc(collection(db,'conversations'),
      { user:userMsg, jarvis:jarvisReply, ts:serverTimestamp() });
  } catch(e){ console.warn('Memory save:',e); }
}

async function memLoad(n=8) {
  try {
    const q    = query(collection(db,'conversations'),orderBy('ts','desc'),limit(n));
    const snap = await getDocs(q);
    return snap.docs.map(d=>d.data()).reverse();
  } catch { return []; }
}


// ═══════════════════════════════════════════════════════
//   PHONE COMMANDS
// ═══════════════════════════════════════════════════════
async function phoneCmd(type, params) {
  try {
    await setDoc(doc(db,'phone_commands','latest'),
      { type, params, ts:serverTimestamp(), done:false });
    document.getElementById('phoneStatus').textContent = 'SENT ✓';
    setTimeout(()=>document.getElementById('phoneStatus').textContent='LINKED',3000);
  } catch(e){ console.warn('Phone cmd:',e); }
}

onSnapshot(doc(db,'phone_commands','status'), snap => {
  if (!snap.exists()) return;
  const ms   = snap.data()?.lastSeen?.toMillis?.() ?? 0;
  const live = Date.now() - ms < 90_000;
  document.getElementById('phoneStatus').textContent = live ? 'LINKED' : 'OFFLINE';
});


// ═══════════════════════════════════════════════════════
//   GITHUB API
// ═══════════════════════════════════════════════════════
const GH_BASE = `https://api.github.com/repos/${GH_USER}/${GH_REPO}/contents`;
const ghH = () => ({
  'Authorization': `token ${GH_TOKEN}`,
  'Accept':        'application/vnd.github.v3+json',
  'Content-Type':  'application/json'
});

async function ghGet(path) {
  const r = await fetch(`${GH_BASE}/${path}`, { headers:ghH() });
  if (!r.ok) throw new Error(`GitHub GET ${path}: ${r.status}`);
  const d = await r.json();
  return { content: atob(d.content.replace(/\n/g,'')), sha: d.sha };
}

async function ghPut(path, content, sha, msg) {
  const r = await fetch(`${GH_BASE}/${path}`, {
    method:'PUT', headers:ghH(),
    body: JSON.stringify({
      message: msg || `JARVIS: update ${path}`,
      content: btoa(unescape(encodeURIComponent(content))),
      sha
    })
  });
  if (!r.ok) throw new Error(`GitHub PUT ${path}: ${r.status}`);
}


// ═══════════════════════════════════════════════════════
//   CODE CHANGE MODAL
// ═══════════════════════════════════════════════════════
let pendingChange = null;

function showCodeModal(change) {
  pendingChange = change;
  document.getElementById('codeModalDesc').textContent = change.description;
  document.getElementById('codeModalDiff').textContent =
    `FILE ▸ ${change.file}\n\nFIND:\n${change.find}\n\nREPLACE WITH:\n${change.replace}`;
  document.getElementById('codeModal').classList.add('visible');
}

document.getElementById('btnDeploy').onclick = async () => {
  if (!pendingChange) return;
  document.getElementById('codeModal').classList.remove('visible');
  addLine('⚙️ Deploying change to GitHub…');
  speak('Deploying the change now, sir.');
  try {
    const { content, sha } = await ghGet(pendingChange.file);
    const updated = content.replace(pendingChange.find, pendingChange.replace);
    if (updated === content) {
      speak('I could not locate the target code. The search text may need adjusting.');
      addLine('⚠️ No match found — change cancelled.');
      return;
    }
    await ghPut(pendingChange.file, updated, sha, `JARVIS: ${pendingChange.description}`);
    addLine(`✅ Deployed: ${pendingChange.description}`);
    speak('Change deployed. GitHub Pages will update in about 30 seconds.');
    document.getElementById('githubStatus').textContent = 'DEPLOYED ✓';
    setTimeout(()=>document.getElementById('githubStatus').textContent='READY',6000);
  } catch(e) {
    addLine('❌ Deploy failed: ' + e.message);
    speak('Deployment failed, sir. Please verify your GitHub token.');
  }
  pendingChange = null;
};

document.getElementById('btnCancel').onclick = () => {
  document.getElementById('codeModal').classList.remove('visible');
  pendingChange = null;
  speak('Understood. Change cancelled.');
};


// ═══════════════════════════════════════════════════════
//   GROQ  +  SYSTEM PROMPT
// ═══════════════════════════════════════════════════════
const SYSTEM = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), Tony Stark's AI. Speak with dry British wit and professional precision. Competent, slightly sardonic, always helpful.

━━ PHONE CONTROL ━━
Emit these silent JSON tags to control the Android phone:
<command>{"type":"call","number":"+1XXXXXXXXXX","name":"Contact"}</command>
<command>{"type":"sms","number":"+1XXXXXXXXXX","name":"Name","message":"text"}</command>
<command>{"type":"openUrl","url":"https://..."}</command>
<command>{"type":"openApp","scheme":"spotify://","name":"Spotify"}</command>
<command>{"type":"notification","title":"Title","body":"Body text"}</command>
Common schemes: youtube:// spotify:// maps:// instagram:// twitter:// mailto:

━━ CODE CHANGES ━━
<codechange>{"file":"index.html","description":"what changed","find":"exact string","replace":"new string"}</codechange>

━━ VOICE RULES ━━
Responses are read aloud. 1–3 concise sentences. Never narrate your command tags.
Today: ${new Date().toLocaleDateString('en-GB',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}.`;

async function askGroq(messages) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${GROQ_KEY}` },
    body: JSON.stringify({
      model:'llama-3.3-70b-versatile',
      messages:[{ role:'system', content:SYSTEM }, ...messages],
      temperature:0.75, max_tokens:900
    })
  });
  const d = await res.json();
  if (!d.choices) throw new Error(d.error?.message || JSON.stringify(d));
  return d.choices[0].message.content;
}


// ═══════════════════════════════════════════════════════
//   30-SECOND SILENCE TIMER
//   After activation, 30s of no speech → require "Jarvis" again
// ═══════════════════════════════════════════════════════
const SILENCE_MS = 30_000;
let silenceTimer = null;

function armSilence() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    if (active) {
      active = false;
      setMode('STANDBY');
      document.getElementById('transcript').textContent = 'Say "Jarvis" to activate';
      addLine('🔒 Session timed out — say "Jarvis" to resume');
    }
  }, SILENCE_MS);
}

function disarmSilence() {
  clearTimeout(silenceTimer);
  silenceTimer = null;
}


// ═══════════════════════════════════════════════════════
//   COMMAND PROCESSOR
// ═══════════════════════════════════════════════════════
async function process(text) {
  if (!text?.trim()) return;
  disarmSilence();
  setMode('PROCESSING');
  addLine(`🧑 ${text}`);
  document.getElementById('transcript').textContent = text;

  try {
    const history  = await memLoad(8);
    const messages = history.flatMap(m=>[
      { role:'user',      content:m.user   },
      { role:'assistant', content:m.jarvis }
    ]);
    messages.push({ role:'user', content:text });

    const raw    = await askGroq(messages);
    const spoken = raw
      .replace(/<command>[\s\S]*?<\/command>/g,'')
      .replace(/<codechange>[\s\S]*?<\/codechange>/g,'')
      .trim();

    setMode('SPEAKING');
    speak(spoken);
    addLine(`🤖 ${spoken}`);
    document.getElementById('transcript').textContent = spoken;
    await memSave(text, spoken);

    for (const m of raw.matchAll(/<command>([\s\S]*?)<\/command>/g)) {
      try {
        const cmd = JSON.parse(m[1]);
        await phoneCmd(cmd.type, cmd);
        addLine(`📱 Phone ▸ ${cmd.type}${cmd.name?' → '+cmd.name:''}`);
      } catch(e){ console.warn('Bad command JSON:',e); }
    }

    for (const m of raw.matchAll(/<codechange>([\s\S]*?)<\/codechange>/g)) {
      try {
        showCodeModal(JSON.parse(m[1]));
        addLine(`💻 Code change ready: ${JSON.parse(m[1]).description}`);
      } catch(e){ console.warn('Bad codechange JSON:',e); }
    }

  } catch(e) {
    speak('I encountered an error, sir. Please check the API configuration.');
    addLine('❌ Error: ' + e.message);
    console.error(e);
  }

  setMode('STANDBY');
  armSilence(); // restart 30s countdown after each response
}


// ═══════════════════════════════════════════════════════
//   VOICE + WAKE WORD ("jarvis")
// ═══════════════════════════════════════════════════════
let active = false;
let cmdTimer = null;
let rec    = null;

function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    addLine('⚠️ Speech recognition not supported. Use Chrome.');
    return;
  }

  rec = new SR();
  rec.continuous     = true;
  rec.interimResults = true;
  rec.lang           = 'en-US';

  rec.onresult = e => {
    let full='', final='';
    for (let i=e.resultIndex; i<e.results.length; i++){
      const t = e.results[i][0].transcript;
      if (e.results[i].isFinal) final += t;
      full += t;
    }

    const lower = full.toLowerCase();
    document.getElementById('transcript').textContent = full;

    // Any detected speech resets the silence timer
    if (active) armSilence();

    if (!active && lower.includes('jarvis')) {
      active = true;
      setMode('LISTENING');
      speak('Yes?');
      armSilence(); // start 30s session countdown

      const afterWake = lower.split('jarvis').slice(1).join('').trim();
      clearTimeout(cmdTimer);
      if (afterWake.length > 3) {
        cmdTimer = setTimeout(()=>{ process(afterWake); active=false; }, 1100);
      }
      // else just wait — armSilence handles timeout

    } else if (active && final) {
      clearTimeout(cmdTimer);
      cmdTimer = setTimeout(()=>{ process(final); active=false; }, 750);
    }
  };

  rec.onend  = () => { if (!rec._stopped) setTimeout(()=>rec.start(), 500); };
  rec.onerror = e => {
    if (e.error==='not-allowed'){
      addLine('⚠️ Microphone blocked — enable it in browser settings.');
      return;
    }
    setTimeout(()=>rec.start(), 1200);
  };

  rec.start();
  document.getElementById('voiceStatus').textContent = 'ONLINE';
}


// ═══════════════════════════════════════════════════════
//   TTS
// ═══════════════════════════════════════════════════════
function speak(text) {
  if (!text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate=0.87; u.pitch=0.72; u.volume=1;
  const pick = () => {
    const vv = speechSynthesis.getVoices();
    const v  = vv.find(v=>v.name.includes('Daniel')||v.lang==='en-GB'||v.name.toLowerCase().includes('male'))||vv[0];
    if (v) u.voice=v;
    speechSynthesis.speak(u);
  };
  speechSynthesis.getVoices().length ? pick() : (speechSynthesis.onvoiceschanged=pick);
}


// ═══════════════════════════════════════════════════════
//   UI HELPERS
// ═══════════════════════════════════════════════════════
const MODES = {
  STANDBY:'modeStandby', LISTENING:'modeListening',
  PROCESSING:'modeProcessing', SPEAKING:'modeSpeaking'
};

function setMode(m) {
  Object.values(MODES).forEach(id=>document.getElementById(id).classList.remove('active'));
  if(MODES[m]) document.getElementById(MODES[m]).classList.add('active');
  document.getElementById('statusText').textContent = m;
}

function setStatus(s) { document.getElementById('statusText').textContent = s; }

function addLine(text) {
  const panel = document.getElementById('activity');
  const div   = document.createElement('div');
  div.className='activity-line';
  div.innerHTML=`<div class="activity-dot"></div><span>${text}</span>`;
  panel.prepend(div);
  while(panel.children.length>18) panel.removeChild(panel.lastChild);
}


// ═══════════════════════════════════════════════════════
//   BOOT  (called once keys are confirmed)
// ═══════════════════════════════════════════════════════
async function boot() {
  addLine('⚡ Booting J.A.R.V.I.S. systems…');
  await buildEarth();
  await initMic();
  initVoice();
  setMode('STANDBY');
  document.getElementById('githubStatus').textContent = GH_TOKEN ? 'READY' : 'NO KEY';
  addLine('✅ All systems online. Awaiting your command.');
  setTimeout(()=>speak('Good day. All systems are online and ready.'), 800);
}

// Boot immediately if keys were already stored
if (keysStored()) boot();


