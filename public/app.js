/* ============================= STATE ============================= */
const S = {
  token: localStorage.getItem('tula_token') || null,
  session: null,
  view: 'landing',
  authRole: null,
  authTab: 'login',
  authError: '',
  apps: [],
  certs: [],
  stakeholders: [],
  expandedAppId: null,
  selectedAppId: null,
  selectedCertId: null,
  filters: { status: '', type: '', state: '' },
  verifyQuery: '',
  verifyResult: undefined,
  scannerOpen: false,
  scanError: '',
  loaded: false,
  busy: false
};

let qrScannerInstance = null;
let qrScanLocked = false;
const MOBILE_BREAKPOINT = 980;
function isMobileLayout(){ return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches; }

const STATES = ["Tamil Nadu","Karnataka","Maharashtra","Delhi","Uttar Pradesh","Gujarat","West Bengal","Kerala","Telangana","Punjab","Rajasthan","Bihar"];
const INSTRUMENT_TYPES = [
  "Non-automatic weighing instrument (counter scale)","Weighbridge","Fuel dispensing pump","Water meter",
  "Energy (electricity) meter","Taxi / auto meter","Linear (length) measure","Capacity (volumetric) measure",
  "Commercial gas cylinder weighing scale","Standard weight"
];
const roleLabel = {owner:'Instrument Owner', lmo:'Legal Metrology Officer', gatc:'Government Approved Test Centre', admin:'Department Administrator'};

/* ============================= HELPERS ============================= */
function esc(s){ return (s===undefined||s===null) ? '' : String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtDate(iso){ if(!iso) return '—'; const d = new Date(iso+'T00:00:00'); return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}); }
function daysUntil(iso){ const d = new Date(iso+'T00:00:00'); const t = new Date(new Date().toISOString().slice(0,10)+'T00:00:00'); return Math.round((d-t)/86400000); }
function appById(id){ return S.apps.find(a=>a.id===id); }
function certById(id){ return S.certs.find(c=>c.id===id); }
function initials(name){ return (name||'').split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }

async function apiFetch(path, opts = {}){
  const headers = opts.headers || {};
  if(S.token) headers['Authorization'] = 'Bearer ' + S.token;
  if(!(opts.body instanceof FormData) && opts.body && typeof opts.body !== 'string'){
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, { ...opts, headers });
  let data = null;
  try{ data = await res.json(); }catch(e){ data = null; }
  if(!res.ok){
    const err = new Error((data && data.error) || 'Request failed');
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ============================= NAV ============================= */
function setView(v){
  if(S.view === 'verify' && v !== 'verify') stopQrScanner();
  S.view = v; S.expandedAppId = null; S.scannerOpen = false; S.scanError = '';
  render(); window.scrollTo(0,0);
}
function goAuth(role, tab){ S.authRole = role; S.authTab = tab || (role ? 'register' : 'login'); S.authError = ''; S.view = 'auth'; render(); }
function switchAuthTab(tab){ S.authTab = tab; S.authError = ''; render(); }

async function refreshData(){
  const tasks = [apiFetch('/api/applications'), apiFetch('/api/certificates')];
  if(S.session.role === 'admin') tasks.push(apiFetch('/api/stakeholders'));
  const results = await Promise.all(tasks);
  S.apps = results[0];
  S.certs = results[1];
  if(S.session.role === 'admin') S.stakeholders = results[2];
}

async function init(){
  // Deep link from a QR scan / shared link, e.g. /verify/TULA-CERT-000001 —
  // check this BEFORE anything else so scanning a certificate always lands
  // on its verification result, logged in or not.
  const deepLinkMatch = window.location.pathname.match(/^\/verify\/(.+)$/);
  if(deepLinkMatch){
    S.view = 'verify';
    S.verifyQuery = decodeURIComponent(deepLinkMatch[1]);
  }

  if(S.token){
    try{
      const { user } = await apiFetch('/api/me');
      S.session = user;
      await refreshData();
      if(!deepLinkMatch) S.view = 'dashboard';
    }catch(e){
      localStorage.removeItem('tula_token');
      S.token = null; S.session = null;
      if(!deepLinkMatch) S.view = 'landing';
    }
  }

  if(deepLinkMatch){
    try{
      S.verifyResult = await apiFetch('/api/verify/' + encodeURIComponent(S.verifyQuery));
    }catch(e){
      S.verifyResult = { found:false };
    }
  }

  S.loaded = true;
  render();
}

function logout(){ localStorage.removeItem('tula_token'); S.token = null; S.session = null; S.view = 'landing'; render(); }

async function submitAuth(e){
  e.preventDefault();
  const f = e.target;
  S.authError = '';
  try{
    let data;
    if(S.authTab === 'login'){
      data = await apiFetch('/api/auth/login', { method:'POST', body:{ email: f.email.value.trim(), password: f.password.value } });
    }else{
      data = await apiFetch('/api/auth/register', { method:'POST', body:{
        name: f.name.value.trim(), email: f.email.value.trim(), password: f.password.value,
        role: S.authRole, org: f.org ? f.org.value.trim() : '', district: f.district.value.trim(), state: f.state.value
      }});
    }
    localStorage.setItem('tula_token', data.token);
    S.token = data.token;
    S.session = data.user;
    await refreshData();
    setView('dashboard');
  }catch(err){
    S.authError = err.message;
    render();
  }
}

/* ============================= ICONS ============================= */
const ICONS = {
  dashboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="5" rx="1"/><rect x="13" y="12" width="8" height="9" rx="1"/><rect x="3" y="14" width="8" height="7" rx="1"/></svg>',
  add: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 5v14M5 12h14"/></svg>',
  list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  cert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="4" width="18" height="13" rx="1.5"/><circle cx="8" cy="19.5" r="1.2"/><circle cx="16" cy="19.5" r="1.2"/><path d="M8 19.5L10 17M16 19.5L14 17"/></svg>',
  queue: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
  people: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2"/><circle cx="17.5" cy="8.5" r="2.5"/><path d="M15.5 13.8c2.7.4 4.5 2.6 4.5 6.2h2"/></svg>',
  alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17h.01"/></svg>',
  exit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
  menu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  shield: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l8 3v6c0 5-3.4 8.7-8 11-4.6-2.3-8-6-8-11V5l8-3z"/><path d="M9 12l2 2 4-4"/></svg>'
};
function monoLogo(){
  return `<svg class="mono-icon" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="16" cy="16" r="15" stroke="#A97A34" stroke-width="1.4"/>
    <line x1="16" y1="7" x2="16" y2="23" stroke="#132330" stroke-width="1.6"/>
    <line x1="9" y1="10.5" x2="23" y2="10.5" stroke="#132330" stroke-width="1.6"/>
    <path d="M6 10.5 L4 15 A5 5 0 0 0 14 15 L12 10.5" stroke="#A97A34" stroke-width="1.3" fill="none"/>
    <path d="M20 10.5 L18 15 A5 5 0 0 0 28 15 L26 10.5" stroke="#A97A34" stroke-width="1.3" fill="none"/>
  </svg>`;
}

/* ============================= RENDER ROOT ============================= */
function render(){
  const app = document.getElementById('app');
  if(!S.loaded){ app.innerHTML = '<div class="boot">Loading TULA…</div>'; return; }
  // Verification is a public route by design — reachable whether or not
  // someone is logged in (e.g. an LMO scanning a certificate in the field).
  if(S.view === 'verify'){
    app.innerHTML = wrapPublic(viewVerify());
  }else if(!S.session){
    if(S.view==='auth') app.innerHTML = wrapPublic(viewAuth());
    else app.innerHTML = wrapPublic(viewLanding());
  }else{
    app.innerHTML = viewShell();
  }
  postRender();
}

function wrapPublic(content){
  const rightLink = S.session
    ? `<button class="btn small" onclick="setView('dashboard')">Go to dashboard</button>`
    : `<button class="btn small" onclick="goAuth(null,'login')">Log in</button>`;
  return `
  <div class="pubnav">
    <div class="brandmark">${monoLogo()}<div><div class="wordmark">TULA</div><div class="sub">National Legal Metrology Verification Platform</div></div></div>
    <div class="pubnav-links">
      <button class="textlink" onclick="setView('${S.session?'dashboard':'landing'}')">Home</button>
      <button class="textlink" onclick="setView('verify')">Verify a Certificate</button>
      ${rightLink}
    </div>
  </div>
  ${content}
  <footer class="pubfoot">Deployed for Smart India Hackathon — demonstrating the Legal Metrology online verification &amp; digital certification workflow under the Legal Metrology Act, 2009.</footer>
  `;
}

function viewLanding(){
  return `
  <div class="hero">
    <div>
      <div class="eyebrow">LEGAL METROLOGY ACT, 2009 · GENERAL RULES, 2011</div>
      <h1>One verification record for every scale, meter and measure in the country.</h1>
      <p class="lead">TULA lets instrument owners apply for verification online, lets Legal Metrology Officers and Government Approved Test Centres schedule and record inspections digitally, and issues QR-authenticated certificates anyone can check in seconds.</p>
      <div class="cta-row">
        <button class="btn brass" onclick="document.getElementById('roles-anchor').scrollIntoView({behavior:'smooth'})">Get started</button>
        <button class="btn outline" onclick="setView('verify')">Verify a certificate</button>
      </div>
    </div>
    <div class="scale-illustration">${scaleSvg()}</div>
  </div>

  <div class="steps">
    <div class="step"><div class="stepline"><div class="dotnum">01</div></div><h4>Apply</h4><p>Instrument owner submits an application for verification or re-verification online, with instrument details and photographs.</p></div>
    <div class="step"><div class="stepline"><div class="dotnum">02</div></div><h4>Schedule</h4><p>A Legal Metrology Officer or GATC accepts the application and fixes a date for physical inspection.</p></div>
    <div class="step"><div class="stepline"><div class="dotnum">03</div></div><h4>Inspect</h4><p>Observations and readings are recorded digitally against permissible error limits at the time of inspection.</p></div>
    <div class="step"><div class="stepline"><div class="dotnum">04</div></div><h4>Certify</h4><p>A QR-coded digital certificate is issued instantly, valid until its due date, and verifiable by anyone online.</p></div>
  </div>

  <div class="roles-section" id="roles-anchor">
    <div class="roles-inner">
      <h2>Register or continue</h2>
      <div class="sub">New here? Choose your role to register. Already have an account? Use "Log in" above.</div>
      <div class="role-grid">
        <button class="role-card" onclick="goAuth('owner','register')"><span class="rc-icon">⚖</span><h4>Instrument Owner</h4><p>Apply for verification, track status, download certificates.</p></button>
        <button class="role-card" onclick="goAuth('lmo','register')"><span class="rc-icon">${ICONS.queue}</span><h4>Legal Metrology Officer</h4><p>Schedule inspections, record readings, issue certificates.</p></button>
        <button class="role-card" onclick="goAuth('gatc','register')"><span class="rc-icon">${ICONS.cert}</span><h4>Govt. Approved Test Centre</h4><p>Handle verification workload allocated in your jurisdiction.</p></button>
        <button class="role-card" onclick="goAuth('admin','register')"><span class="rc-icon">${ICONS.shield}</span><h4>Department Administrator</h4><p>Monitor pendency, enforcement and expiry across jurisdictions.</p></button>
      </div>
    </div>
  </div>
  `;
}

function scaleSvg(){
  return `<svg viewBox="0 0 300 260" width="340" fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="150" y1="20" x2="150" y2="200" stroke="#A97A34" stroke-width="4"/>
    <line x1="60" y1="55" x2="240" y2="55" stroke="#132330" stroke-width="4"/>
    <line x1="60" y1="55" x2="45" y2="110" stroke="#132330" stroke-width="2"/>
    <line x1="60" y1="55" x2="75" y2="110" stroke="#132330" stroke-width="2"/>
    <path d="M40 110 A20 20 0 0 0 80 110 Z" fill="#D3A15C"/>
    <line x1="240" y1="55" x2="225" y2="118" stroke="#132330" stroke-width="2"/>
    <line x1="240" y1="55" x2="255" y2="118" stroke="#132330" stroke-width="2"/>
    <path d="M220 118 A20 20 0 0 0 260 118 Z" fill="#D3A15C"/>
    <circle cx="150" cy="55" r="7" fill="#A97A34"/>
    <rect x="110" y="200" width="80" height="14" rx="2" fill="#132330"/>
    <rect x="130" y="214" width="40" height="30" rx="2" fill="#132330"/>
  </svg>`;
}

function viewAuth(){
  const label = S.authRole ? roleLabel[S.authRole] : null;
  const orgLabel = S.authRole==='owner' ? 'Business / shop name (optional)' : (S.authRole==='gatc' ? 'GATC name' : 'Department / office name');
  return `
  <div class="center-wrap">
    <div class="auth-card">
      <h2>${label ? 'Register as ' + label : 'Welcome back'}</h2>
      <div class="muted-line">${S.authTab==='login' ? 'Log in with your registered email.' : 'Create your TULA account.'}</div>
      <div class="tabbar">
        <button class="${S.authTab==='login'?'active':''}" onclick="switchAuthTab('login')">Log in</button>
        <button class="${S.authTab==='register'?'active':''}" onclick="switchAuthTab('register')">Register</button>
      </div>
      ${S.authTab==='register' && !S.authRole ? `
        <div class="field"><label>I am a...</label>
          <select onchange="S.authRole=this.value; render();">
            <option value="">Select role</option>
            <option value="owner">Instrument Owner</option>
            <option value="lmo">Legal Metrology Officer</option>
            <option value="gatc">Government Approved Test Centre</option>
            <option value="admin">Department Administrator</option>
          </select>
        </div>` : ''}
      ${S.authError ? `<div class="form-error">${esc(S.authError)}</div>` : ''}
      ${S.authTab==='login' ? `<div class="demo-hint">Demo logins (password: <b>demo1234</b>): owner@demo.tula · lmo@demo.tula · gatc@demo.tula · admin@demo.tula</div>` : ''}
      <form onsubmit="submitAuth(event)">
        ${S.authTab==='register' ? `<div class="field"><label>Full name</label><input name="name" required placeholder="e.g. Priya Sundaram"></div>` : ''}
        <div class="field"><label>Email</label><input name="email" type="email" required placeholder="you@example.com"></div>
        <div class="field"><label>Password</label><input name="password" type="password" required minlength="6" placeholder="At least 6 characters"></div>
        ${S.authTab==='register' && S.authRole ? `
          <div class="field"><label>${orgLabel}</label><input name="org" ${S.authRole==='owner'?'':'required'} placeholder="e.g. ${S.authRole==='lmo'?'Office of Legal Metrology, Chennai':(S.authRole==='gatc'?'Southern GATC Pvt Ltd':'Star Weighing Traders')}"></div>
          <div class="field-row">
            <div class="field"><label>State</label><select name="state" required>${STATES.map(s=>`<option>${s}</option>`).join('')}</select></div>
            <div class="field"><label>District</label><input name="district" required placeholder="e.g. Coimbatore"></div>
          </div>` : ''}
        <button class="btn brass" style="width:100%; margin-top:6px;" type="submit" ${S.authTab==='register' && !S.authRole ? 'disabled' : ''}>${S.authTab==='login' ? 'Log in' : 'Create account'}</button>
      </form>
      <div style="margin-top:16px;"><button class="link-btn" onclick="setView('landing')">← back to home</button></div>
    </div>
  </div>
  `;
}

function viewVerify(){
  let resultHtml = '';
  if(S.verifyResult !== undefined){
    if(!S.verifyResult || !S.verifyResult.found){
      resultHtml = `<div class="verify-result invalid"><h3>Not found</h3><p>No certificate matches "${esc(S.verifyQuery)}". Check the certificate number printed below the QR code and try again.</p></div>`;
    }else{
      const c = S.verifyResult.certificate;
      const expired = daysUntil(c.valid_until) < 0;
      resultHtml = `<div class="verify-result ${expired?'expired':'valid'}">
        <h3>${expired?'Certificate expired':'Certificate is valid'}</h3>
        <p><b>${esc(c.cert_no)}</b> — ${esc(c.instrument_type)}</p>
        <p>Issued to: ${esc(c.owner_name)}${c.business_name?(' ('+esc(c.business_name)+')'):''}, ${esc(c.district)}, ${esc(c.state)}</p>
        <p>Verified by: ${esc(c.verified_by_name)}, ${esc(c.verifying_org)}</p>
        <p>Valid: ${fmtDate(c.verification_date)} → ${fmtDate(c.valid_until)}${expired?' (expired '+Math.abs(daysUntil(c.valid_until))+' days ago)':''}</p>
      </div>`;
    }
  }
  return `
  <div class="verify-box">
    <div class="icon-mark">${monoLogo()}</div>
    <h2>Verify a certificate</h2>
    <p style="color:var(--muted); font-size:13.5px;">Scan the QR code on a TULA certificate with this page, or type its certificate number below to confirm it is genuine and check its validity.</p>
    <form class="verify-input-row" onsubmit="doVerify(event)">
      <input name="q" placeholder="e.g. TULA-CERT-000001" value="${esc(S.verifyQuery||'')}">
      <button class="btn brass" type="submit">Verify</button>
    </form>
    <div style="margin-top:14px;">
      <button class="btn outline small" onclick="toggleQrScanner()">${S.scannerOpen ? 'Close scanner' : '⌗ Scan QR code'}</button>
    </div>
    ${S.scannerOpen ? `<div id="qr-reader" style="margin:16px auto 0; max-width:320px;"></div><p style="font-size:12px; color:var(--muted); margin-top:8px;">Point your camera at the QR code on the certificate.</p>` : ''}
    ${S.scanError ? `<div class="form-error" style="margin-top:14px; text-align:left;">${esc(S.scanError)}</div>` : ''}
    ${resultHtml}
  </div>`;
}
async function doVerify(e){
  e.preventDefault();
  const q = e.target.q.value.trim();
  S.verifyQuery = q;
  try{
    S.verifyResult = await apiFetch('/api/verify/' + encodeURIComponent(q));
  }catch(err){
    S.verifyResult = { found:false };
  }
  render();
}

/* ---------- QR scanning (browser camera) ---------- */
function toggleQrScanner(){
  if(S.scannerOpen){
    stopQrScanner();
    S.scannerOpen = false;
  }else{
    S.scannerOpen = true;
    S.scanError = '';
  }
  render();
}

function extractCertNo(decodedText){
  try{
    const url = new URL(decodedText);
    const parts = url.pathname.split('/').filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || decodedText);
  }catch(e){
    return decodedText.trim();
  }
}

async function startQrScannerIfNeeded(){
  if(S.view !== 'verify' || !S.scannerOpen) return;
  const el = document.getElementById('qr-reader');
  if(!el || qrScannerInstance || !window.Html5Qrcode) return;
  qrScanLocked = false;
  try{
    qrScannerInstance = new Html5Qrcode('qr-reader');
    await qrScannerInstance.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 } },
      (decodedText) => {
        // The library keeps calling this for every frame the code is in view.
        // Only act on the first hit — and never call .stop() synchronously
        // from inside this callback, which is a known cause of the scanner
        // silently hanging (state-transition conflict inside the library).
        if(qrScanLocked) return;
        qrScanLocked = true;
        handleQrScanSuccess(decodedText);
      },
      () => { /* per-frame scan miss — expected constantly, ignore */ }
    );
  }catch(err){
    S.scanError = 'Could not access the camera. Check camera permissions for this site, and that you are on HTTPS.';
    S.scannerOpen = false;
    qrScannerInstance = null;
    render();
  }
}

async function handleQrScanSuccess(decodedText){
  const certNo = extractCertNo(decodedText);
  S.verifyQuery = certNo;
  S.scannerOpen = false;
  try{
    S.verifyResult = await apiFetch('/api/verify/' + encodeURIComponent(certNo));
  }catch(err){
    S.verifyResult = { found:false };
  }
  render();
  // Release the camera AFTER the UI has updated, and deferred to the next
  // tick so we're outside html5-qrcode's own scan-loop call stack.
  const instance = qrScannerInstance;
  qrScannerInstance = null;
  if(instance){
    setTimeout(() => {
      instance.stop().then(() => instance.clear()).catch(() => {});
    }, 50);
  }
}

async function stopQrScanner(){
  if(qrScannerInstance){
    try{ await qrScannerInstance.stop(); qrScannerInstance.clear(); }catch(e){ /* already stopped */ }
    qrScannerInstance = null;
  }
}

/* ============================= LOGGED-IN SHELL ============================= */
function navItemsFor(role){
  if(role==='owner') return [['dashboard','Dashboard',ICONS.dashboard],['newApplication','New Application',ICONS.add],['myApplications','My Applications',ICONS.list],['myCertificates','My Certificates',ICONS.cert]];
  if(role==='lmo' || role==='gatc') return [['dashboard','Dashboard',ICONS.dashboard],['queue','Verification Queue',ICONS.queue],['issuedCerts','Issued Certificates',ICONS.cert]];
  if(role==='admin') return [['dashboard','Dashboard',ICONS.dashboard],['adminApps','All Applications',ICONS.list],['adminStakeholders','Stakeholders',ICONS.people],['adminExpiry','Expiry Monitor',ICONS.alert]];
  return [];
}

// Same destinations, arranged for a bottom tab bar: a primary "create" action
// (if the role has one) is pulled out into a raised center FAB instead of
// competing with the other tabs for space.
function bottomNavItemsFor(role){
  if(role==='owner') return { tabs:[['dashboard','Dashboard',ICONS.dashboard],['myApplications','Applications',ICONS.list],['myCertificates','Certificates',ICONS.cert]], fab:['newApplication','New',ICONS.add] };
  if(role==='lmo' || role==='gatc') return { tabs:[['dashboard','Dashboard',ICONS.dashboard],['queue','Queue',ICONS.queue],['issuedCerts','Certificates',ICONS.cert]], fab:null };
  if(role==='admin') return { tabs:[['dashboard','Dashboard',ICONS.dashboard],['adminApps','Applications',ICONS.list],['adminStakeholders','Stakeholders',ICONS.people],['adminExpiry','Expiry',ICONS.alert]], fab:null };
  return { tabs:[], fab:null };
}

function renderBottomNav(role){
  const { tabs, fab } = bottomNavItemsFor(role);
  const bnItem = ([v,l,icon]) => `<button class="bn-item ${S.view===v?'active':''}" onclick="setView('${v}')">${icon}<span>${l}</span></button>`;
  if(!fab) return `<nav class="bottom-nav">${tabs.map(bnItem).join('')}</nav>`;
  const mid = Math.ceil(tabs.length/2);
  return `<nav class="bottom-nav">
    ${tabs.slice(0,mid).map(bnItem).join('')}
    <div class="bn-fab-wrap"><button class="bn-fab" onclick="setView('${fab[0]}')" aria-label="${fab[1]}">${fab[2]}</button><span class="bn-fab-label">${fab[1]}</span></div>
    ${tabs.slice(mid).map(bnItem).join('')}
  </nav>`;
}

function viewShell(){
  const mobile = isMobileLayout();
  const items = navItemsFor(S.session.role);
  let content = '';
  if(S.view==='dashboard') content = viewDashboard();
  else if(S.view==='newApplication') content = viewNewApplication();
  else if(S.view==='myApplications') content = viewMyApplications();
  else if(S.view==='appDetail') content = viewAppDetail();
  else if(S.view==='myCertificates') content = viewMyCertificates();
  else if(S.view==='certView') content = viewCert();
  else if(S.view==='queue') content = viewQueue();
  else if(S.view==='issuedCerts') content = viewIssuedCerts();
  else if(S.view==='adminApps') content = viewAdminApps();
  else if(S.view==='adminStakeholders') content = viewAdminStakeholders();
  else if(S.view==='adminExpiry') content = viewAdminExpiry();
  else content = viewDashboard();

  const sidebarHtml = mobile ? '' : `
    <div class="sidebar">
      <div class="brandmark">${monoLogo()}<div><div class="wordmark">TULA</div><div class="sub">Verification Platform</div></div></div>
      <div class="divider"></div>
      <nav style="margin-top:12px;">
        ${items.map(([v,l,icon]) => `<button class="navitem ${S.view===v?'active':''}" onclick="setView('${v}')">${icon}<span>${l}</span></button>`).join('')}
      </nav>
      <div class="signout"><button class="navitem" onclick="logout()">${ICONS.exit}<span>Sign out</span></button></div>
    </div>`;

  return `
  <div class="shell ${mobile?'mobile-shell':''}">
    ${sidebarHtml}
    <div class="main">
      <div class="topbar">
        <div class="who"><b>${esc(S.session.name)}</b> · ${roleLabel[S.session.role]}${S.session.org?(' · '+esc(S.session.org)):''}</div>
        <div class="avatar-row">
          <div class="avatar-dot">${initials(S.session.name)}</div>
          ${mobile ? `<button class="icon-btn" onclick="logout()" aria-label="Sign out">${ICONS.exit}</button>` : ''}
        </div>
      </div>
      ${content}
    </div>
    ${mobile ? renderBottomNav(S.session.role) : ''}
  </div>`;
}

/* ---------- Dashboard ---------- */
function viewDashboard(){
  const role = S.session.role;
  if(role==='owner') return dashOwner();
  if(role==='lmo' || role==='gatc') return dashOfficer();
  return dashAdmin();
}

function dashOwner(){
  const apps = S.apps;
  const certs = S.certs;
  const pending = apps.filter(a=>a.status==='Submitted'||a.status==='Scheduled').length;
  const verified = apps.filter(a=>a.status==='Verified').length;
  const expiringSoon = certs.filter(c => daysUntil(c.valid_until) <= 30 && daysUntil(c.valid_until) >= 0);
  const expired = certs.filter(c => daysUntil(c.valid_until) < 0);
  return `
  <div class="page-title">Dashboard</div>
  <div class="page-sub">Overview of your instruments and verification status.</div>
  ${expiringSoon.length ? `<div class="banner amber">${ICONS.alert}${expiringSoon.length} certificate(s) expiring within 30 days — apply for re-verification to avoid lapse.</div>` : ''}
  ${expired.length ? `<div class="banner red">${ICONS.alert}${expired.length} certificate(s) have expired. Using an unverified instrument in trade may attract penalty under the Legal Metrology Act.</div>` : ''}
  <div class="stat-row">
    <div class="stat-card"><div class="num">${apps.length}</div><div class="lbl">Total applications</div></div>
    <div class="stat-card brass"><div class="num">${pending}</div><div class="lbl">Pending / in progress</div></div>
    <div class="stat-card green"><div class="num">${verified}</div><div class="lbl">Verified instruments</div></div>
    <div class="stat-card red"><div class="num">${expiringSoon.length + expired.length}</div><div class="lbl">Needs attention</div></div>
  </div>
  <div class="panel">
    <div class="panel-head"><h3>Recent applications</h3><button class="btn brass small" onclick="setView('newApplication')">+ New Application</button></div>
    ${appsTable(apps.slice(0,5), false)}
  </div>`;
}

function dashOfficer(){
  const mine = S.apps;
  const submitted = S.apps.filter(a=>a.status==='Submitted').length;
  const scheduled = S.apps.filter(a=>a.status==='Scheduled' && a.assigned_officer_id===S.session.id).length;
  const verifiedByMe = S.certs.length;
  const rejectedByMe = S.apps.filter(a=>a.status==='Rejected' && a.assigned_officer_id===S.session.id).length;
  return `
  <div class="page-title">Dashboard</div>
  <div class="page-sub">Your verification workload.</div>
  <div class="stat-row">
    <div class="stat-card brass"><div class="num">${submitted}</div><div class="lbl">Awaiting scheduling</div></div>
    <div class="stat-card"><div class="num">${scheduled}</div><div class="lbl">Scheduled by you</div></div>
    <div class="stat-card green"><div class="num">${verifiedByMe}</div><div class="lbl">Certificates issued</div></div>
    <div class="stat-card red"><div class="num">${rejectedByMe}</div><div class="lbl">Rejected</div></div>
  </div>
  <div class="panel">
    <div class="panel-head"><h3>Applications needing action</h3><button class="btn outline small" onclick="setView('queue')">Open queue →</button></div>
    ${appsTable(mine.slice(0,6), false)}
  </div>`;
}

function dashAdmin(){
  const total = S.apps.length;
  const statuses = ['Submitted','Scheduled','Verified','Rejected'];
  const counts = statuses.map(s => S.apps.filter(a=>a.status===s).length);
  const expiring = S.certs.filter(c => daysUntil(c.valid_until) <= 30);
  const byType = {};
  S.apps.forEach(a => byType[a.instrument_type] = (byType[a.instrument_type]||0)+1);
  const typeEntries = Object.entries(byType).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const maxType = Math.max(1, ...typeEntries.map(e=>e[1]));
  return `
  <div class="page-title">Dashboard</div>
  <div class="page-sub">System-wide monitoring across all jurisdictions.</div>
  ${expiring.length ? `<div class="banner amber">${ICONS.alert}${expiring.length} certificate(s) across the system are expiring within 30 days or have expired.</div>` : ''}
  <div class="stat-row">
    <div class="stat-card"><div class="num">${total}</div><div class="lbl">Total applications</div></div>
    <div class="stat-card brass"><div class="num">${counts[0]+counts[1]}</div><div class="lbl">Pending / scheduled</div></div>
    <div class="stat-card green"><div class="num">${counts[2]}</div><div class="lbl">Verified</div></div>
    <div class="stat-card red"><div class="num">${counts[3]}</div><div class="lbl">Rejected</div></div>
  </div>
  <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
    <div class="panel">
      <h3>Applications by status</h3>
      ${statuses.map((s,i)=>`<div class="bar-row"><div class="bl">${s}</div><div class="bar-track"><div class="bar-fill" style="width:${total?(counts[i]/total*100):0}%"></div></div><div class="bv">${counts[i]}</div></div>`).join('')}
    </div>
    <div class="panel">
      <h3>Top instrument categories</h3>
      ${typeEntries.map(([t,n])=>`<div class="bar-row"><div class="bl" title="${esc(t)}">${esc(t.length>22?t.slice(0,22)+'…':t)}</div><div class="bar-track"><div class="bar-fill" style="width:${n/maxType*100}%"></div></div><div class="bv">${n}</div></div>`).join('') || '<div class="empty">No data yet</div>'}
    </div>
  </div>`;
}

/* ---------- Applications table ---------- */
function statusBadge(s){
  const cls = {Submitted:'submitted', Scheduled:'scheduled', Verified:'verified', Rejected:'rejected'}[s] || 'submitted';
  return `<span class="badge ${cls}">${s}</span>`;
}
function appsTable(list, showOwnerCol){
  if(!list.length) return `<div class="empty">No applications yet.</div>`;
  return `<table>
    <thead><tr><th>Application No.</th><th>Instrument</th>${showOwnerCol?'<th>Owner</th>':''}<th>Type</th><th>Status</th><th>Submitted</th><th></th></tr></thead>
    <tbody>
      ${list.map(a=>`<tr>
        <td style="font-family:var(--mono); font-size:12.5px;">${a.app_no}</td>
        <td>${esc(a.instrument_type)}</td>
        ${showOwnerCol?`<td>${esc(a.owner_name)}</td>`:''}
        <td>${esc(a.application_type)}</td>
        <td>${statusBadge(a.status)}</td>
        <td>${fmtDate(a.submitted_date)}</td>
        <td><button class="link-btn" onclick="openAppDetail('${a.id}')">View</button></td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}
function openAppDetail(id){ S.selectedAppId = id; setView('appDetail'); }

/* ---------- New Application ---------- */
function viewNewApplication(){
  return `
  <div class="page-title">New Application</div>
  <div class="page-sub">Submit an application for verification or re-verification of a weighing/measuring instrument.</div>
  <div class="panel" style="max-width:660px;">
    <form onsubmit="submitApplication(event)">
      <div class="field-row">
        <div class="field"><label>Application type</label><select name="applicationType" required><option>New verification</option><option>Re-verification</option></select></div>
        <div class="field"><label>Instrument type</label><select name="instrumentType" required>${INSTRUMENT_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>Capacity / specification</label><input name="capacity" placeholder="e.g. 0–50 kg, single nozzle, 15mm" required></div>
      <div class="field-row">
        <div class="field"><label>Business name (optional)</label><input name="businessName" value="${esc(S.session.org||'')}"></div>
        <div class="field"><label>Contact phone</label><input name="phone" required placeholder="10-digit mobile"></div>
      </div>
      <div class="field"><label>Photograph of instrument (optional)</label><input type="file" name="photo" accept="image/*"></div>
      <div class="field"><label>Installation / premises address</label><textarea name="address" rows="2" required></textarea></div>
      <div class="field-row">
        <div class="field"><label>State</label><select name="state" required>${STATES.map(s=>`<option ${s===S.session.state?'selected':''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>District</label><input name="district" value="${esc(S.session.district||'')}" required></div>
      </div>
      ${S.authError ? `<div class="form-error">${esc(S.authError)}</div>` : ''}
      <button class="btn brass" type="submit" style="margin-top:6px;">Submit Application</button>
    </form>
  </div>`;
}
async function submitApplication(e){
  e.preventDefault();
  const f = e.target;
  const fd = new FormData();
  fd.append('applicationType', f.applicationType.value);
  fd.append('instrumentType', f.instrumentType.value);
  fd.append('capacity', f.capacity.value);
  fd.append('businessName', f.businessName.value);
  fd.append('phone', f.phone.value);
  fd.append('address', f.address.value);
  fd.append('state', f.state.value);
  fd.append('district', f.district.value);
  if(f.photo.files[0]) fd.append('photo', f.photo.files[0]);
  try{
    await apiFetch('/api/applications', { method:'POST', body: fd });
    await refreshData();
    setView('myApplications');
  }catch(err){
    S.authError = err.message;
    render();
  }
}

function viewMyApplications(){
  return `
  <div class="page-title">My Applications</div>
  <div class="page-sub">Track the status of every application you have submitted.</div>
  <div class="panel">${appsTable(S.apps, false)}</div>`;
}

function viewMyCertificates(){
  const certs = S.certs;
  return `
  <div class="page-title">My Certificates</div>
  <div class="page-sub">Digital, QR-authenticated verification certificates for your instruments.</div>
  ${!certs.length ? '<div class="panel"><div class="empty">No certificates issued yet.</div></div>' : `
  <div class="panel"><table><thead><tr><th>Certificate No.</th><th>Instrument</th><th>Valid until</th><th></th></tr></thead><tbody>
    ${certs.map(c=>`<tr><td style="font-family:var(--mono); font-size:12.5px;">${c.cert_no}</td><td>${esc(c.instrument_type)}</td><td>${fmtDate(c.valid_until)} ${daysUntil(c.valid_until)<0?'<span class="badge rejected">Expired</span>':(daysUntil(c.valid_until)<=30?'<span class="badge scheduled">Expiring soon</span>':'')}</td><td><button class="link-btn" onclick="openCert('${c.id}')">View</button></td></tr>`).join('')}
  </tbody></table></div>`}`;
}
function openCert(id){ S.selectedCertId = id; setView('certView'); }

/* ---------- Application Detail ---------- */
function viewAppDetail(){
  const a = appById(S.selectedAppId);
  if(!a) return `<div class="panel">Application not found.</div>`;
  const tl = [];
  tl.push({t:'Application submitted', d:a.submitted_date, done:true, desc:`${a.application_type} — ${a.instrument_type}`});
  if(a.assigned_officer_name) tl.push({t:'Scheduled for inspection', d:a.scheduled_date, done:true, desc:`Assigned to ${a.assigned_officer_name} (${a.assigned_org||''})`});
  if(a.status==='Verified') tl.push({t:'Verified & certificate issued', d:a.scheduled_date, done:true, desc:(a.inspection && a.inspection.remarks) || ''});
  if(a.status==='Rejected') tl.push({t:'Application rejected', d:a.scheduled_date, done:true, rejected:true, desc:a.rejection_reason || ''});
  if(a.status==='Submitted') tl.push({t:'Awaiting officer allocation', d:null, done:false, desc:''});
  if(a.status==='Scheduled') tl.push({t:'Awaiting inspection', d:null, done:false, desc:''});

  return `
  <div class="page-title">${a.app_no}</div>
  <div class="page-sub">${esc(a.instrument_type)} · ${esc(a.application_type)}</div>
  <div style="display:grid; grid-template-columns:1.3fr 1fr; gap:20px;">
    <div class="panel">
      <h3>Instrument &amp; applicant details</h3>
      <div class="cert-grid">
        <div class="cg-item"><div class="cg-lbl">Owner / applicant</div><div class="cg-val">${esc(a.owner_name)}</div></div>
        <div class="cg-item"><div class="cg-lbl">Business name</div><div class="cg-val">${esc(a.business_name)||'—'}</div></div>
        <div class="cg-item"><div class="cg-lbl">Specification</div><div class="cg-val">${esc(a.capacity)}</div></div>
        <div class="cg-item"><div class="cg-lbl">Contact phone</div><div class="cg-val">${esc(a.phone)||'—'}</div></div>
        <div class="cg-item"><div class="cg-lbl">Address</div><div class="cg-val">${esc(a.address)}</div></div>
        <div class="cg-item"><div class="cg-lbl">District / State</div><div class="cg-val">${esc(a.district)}, ${esc(a.state)}</div></div>
      </div>
      ${a.photo_path ? `<div class="photo-chip"><img src="${a.photo_path}" alt=""> attached photo</div>` : ''}
      ${a.inspection ? `<h3 style="margin-top:22px;">Inspection observations</h3>
        <div class="cert-grid">
          <div class="cg-item"><div class="cg-lbl">Standard used</div><div class="cg-val">${esc(a.inspection.standard)}</div></div>
          <div class="cg-item"><div class="cg-lbl">Result</div><div class="cg-val">${esc(a.inspection.result)}</div></div>
          <div class="cg-item"><div class="cg-lbl">Reading before</div><div class="cg-val">${esc(a.inspection.before)}</div></div>
          <div class="cg-item"><div class="cg-lbl">Reading after</div><div class="cg-val">${esc(a.inspection.after)}</div></div>
          <div class="cg-item"><div class="cg-lbl">Observed error</div><div class="cg-val">${esc(a.inspection.error)}</div></div>
        </div>
        <p style="font-size:13px; color:var(--muted); margin-top:10px;">${esc(a.inspection.remarks)}</p>` : ''}
      ${a.status==='Verified' ? `<button class="btn brass small" style="margin-top:16px;" onclick="openCert('${a.certificate_id}')">View certificate →</button>` : ''}
    </div>
    <div class="panel">
      <h3>Status timeline</h3>
      <div class="timeline">
        ${tl.map(item=>`<div class="tl-item"><div class="tl-dot ${item.done?'done':''} ${item.rejected?'rejected':''}"></div><div class="tl-body"><b>${item.t}</b>${item.d?`<div class="date">${fmtDate(item.d)}</div>`:''}${item.desc?`<p>${esc(item.desc)}</p>`:''}</div></div>`).join('')}
      </div>
    </div>
  </div>
  <button class="link-btn" style="margin-top:16px;" onclick="setView(S.session.role==='owner'?'myApplications':(S.session.role==='admin'?'adminApps':'queue'))">← back</button>
  `;
}

/* ---------- Certificate view ---------- */
function viewCert(){
  const c = certById(S.selectedCertId);
  if(!c) return `<div class="panel">Certificate not found.</div>`;
  const expired = daysUntil(c.valid_until) < 0;
  const soon = !expired && daysUntil(c.valid_until) <= 30;
  return `
  <div class="cert-wrap">
    <div class="cert">
      <div class="cert-frame">
        <div class="cert-watermark">TULA</div>
        <div class="cert-band">
          <div><h3>Certificate of Verification</h3><div class="sub">Issued under the Legal Metrology Act, 2009 &amp; General Rules, 2011</div></div>
          <div class="cert-seal">${ICONS.shield}</div>
        </div>
        <div class="cert-body">
          <span class="badge ${expired?'rejected':(soon?'scheduled':'verified')}">${expired?'Expired':(soon?'Expiring soon':'Valid')}</span>
          <div class="cert-grid">
            <div class="cg-item"><div class="cg-lbl">Instrument</div><div class="cg-val">${esc(c.instrument_type)}</div></div>
            <div class="cg-item"><div class="cg-lbl">Owner / applicant</div><div class="cg-val">${esc(c.owner_name)}${c.business_name?(' ('+esc(c.business_name)+')'):''}</div></div>
            <div class="cg-item"><div class="cg-lbl">District / State</div><div class="cg-val">${esc(c.district)}, ${esc(c.state)}</div></div>
            <div class="cg-item"><div class="cg-lbl">Verified by</div><div class="cg-val">${esc(c.verified_by_name)}, ${esc(c.verifying_org)}</div></div>
            <div class="cg-item"><div class="cg-lbl">Date of verification</div><div class="cg-val">${fmtDate(c.verification_date)}</div></div>
            <div class="cg-item"><div class="cg-lbl">Valid until</div><div class="cg-val">${fmtDate(c.valid_until)}</div></div>
          </div>
          <div class="cert-foot">
            <div><div class="cert-no">${c.cert_no}</div><div style="font-size:11px; color:var(--muted); margin-top:5px;">Authenticate this certificate any time at TULA → Verify a Certificate.</div></div>
            <div class="qr-box"><div id="qr-target"></div><div class="qr-caption">Scan to verify</div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="cert-actions">
    <button class="btn outline" onclick="window.print()">Print / Save as PDF</button>
    <button class="btn brass" onclick="setView(S.session.role==='owner'?'myCertificates':'issuedCerts')">Done</button>
  </div>`;
}

/* ---------- LMO / GATC Queue ---------- */
function viewQueue(){
  const list = S.apps.filter(a => a.status==='Submitted' || (a.status==='Scheduled' && a.assigned_officer_id===S.session.id));
  if(!list.length) return `<div class="page-title">Verification Queue</div><div class="page-sub">Applications awaiting scheduling or inspection.</div><div class="panel"><div class="empty">Queue is empty. Nothing pending right now.</div></div>`;
  return `
  <div class="page-title">Verification Queue</div>
  <div class="page-sub">Accept new applications, schedule inspections, and record results.</div>
  <div class="panel">
    <table>
      <thead><tr><th>Application No.</th><th>Instrument</th><th>Owner</th><th>Location</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${list.map(a=>`
          <tr>
            <td style="font-family:var(--mono); font-size:12.5px;">${a.app_no}</td>
            <td>${esc(a.instrument_type)}</td>
            <td>${esc(a.owner_name)}</td>
            <td>${esc(a.district)}, ${esc(a.state)}</td>
            <td>${statusBadge(a.status)}</td>
            <td>
              ${a.status==='Submitted' ? `<button class="btn small outline" onclick="toggleExpand('${a.id}')">${S.expandedAppId===a.id?'Close':'Accept & Schedule'}</button>` : ''}
              ${a.status==='Scheduled' ? `<button class="btn small brass" onclick="toggleExpand('${a.id}')">${S.expandedAppId===a.id?'Close':'Record Inspection'}</button>` : ''}
              <button class="link-btn" style="margin-left:8px;" onclick="openAppDetail('${a.id}')">Details</button>
            </td>
          </tr>
          ${S.expandedAppId===a.id ? `<tr class="expand-row"><td colspan="6">${a.status==='Submitted' ? scheduleForm(a) : inspectForm(a)}${S.authError?`<div class="form-error" style="margin-top:12px;">${esc(S.authError)}</div>`:''}</td></tr>` : ''}
        `).join('')}
      </tbody>
    </table>
  </div>`;
}
function toggleExpand(id){ S.expandedAppId = S.expandedAppId===id ? null : id; S.authError=''; render(); }

function scheduleForm(a){
  return `<form onsubmit="doSchedule(event, '${a.id}')" style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap;">
    <div class="field" style="margin:0;"><label>Inspection date</label><input type="date" name="date" min="${new Date().toISOString().slice(0,10)}" value="${new Date().toISOString().slice(0,10)}" required></div>
    <button class="btn brass small" type="submit">Confirm schedule</button>
  </form>`;
}
async function doSchedule(e, id){
  e.preventDefault();
  try{
    await apiFetch(`/api/applications/${id}/schedule`, { method:'POST', body:{ date: e.target.date.value } });
    S.expandedAppId = null; S.authError='';
    await refreshData();
    render();
  }catch(err){ S.authError = err.message; render(); }
}

function inspectForm(a){
  return `<form onsubmit="doInspect(event, '${a.id}')">
    <div class="field-row">
      <div class="field" style="margin:0;"><label>Standard weight/measure used</label><input name="standard" required placeholder="e.g. 20 kg standard weight set"></div>
      <div class="field" style="margin:0;"><label>Result</label><select name="result" required><option>Pass</option><option>Fail</option></select></div>
    </div>
    <div class="field-row" style="margin-top:12px;">
      <div class="field" style="margin:0;"><label>Reading before adjustment</label><input name="before" required></div>
      <div class="field" style="margin:0;"><label>Reading after adjustment</label><input name="after" required></div>
    </div>
    <div class="field-row" style="margin-top:12px;">
      <div class="field" style="margin:0;"><label>Observed error</label><input name="error" required placeholder="e.g. 0.02%"></div>
      <div class="field" style="margin:0;"><label>Remarks</label><input name="remarks" placeholder="Notes for the record"></div>
    </div>
    <button class="btn brass small" type="submit" style="margin-top:14px;">Submit inspection</button>
  </form>`;
}
async function doInspect(e, id){
  e.preventDefault();
  const f = e.target;
  try{
    await apiFetch(`/api/applications/${id}/inspect`, { method:'POST', body:{ standard:f.standard.value, before:f.before.value, after:f.after.value, error:f.error.value, result:f.result.value, remarks:f.remarks.value } });
    S.expandedAppId = null; S.authError='';
    await refreshData();
    render();
  }catch(err){ S.authError = err.message; render(); }
}

function viewIssuedCerts(){
  const certs = S.certs;
  return `
  <div class="page-title">Issued Certificates</div>
  <div class="page-sub">Certificates you have issued.</div>
  <div class="panel">${!certs.length ? '<div class="empty">No certificates issued yet.</div>' : `
  <table><thead><tr><th>Certificate No.</th><th>Instrument</th><th>Owner</th><th>Valid until</th><th></th></tr></thead><tbody>
    ${certs.map(c=>`<tr><td style="font-family:var(--mono); font-size:12.5px;">${c.cert_no}</td><td>${esc(c.instrument_type)}</td><td>${esc(c.owner_name)}</td><td>${fmtDate(c.valid_until)}</td><td><button class="link-btn" onclick="openCert('${c.id}')">View</button></td></tr>`).join('')}
  </tbody></table>`}</div>`;
}

/* ---------- Admin views ---------- */
function viewAdminApps(){
  let list = S.apps.slice();
  if(S.filters.status) list = list.filter(a=>a.status===S.filters.status);
  if(S.filters.type) list = list.filter(a=>a.instrument_type===S.filters.type);
  if(S.filters.state) list = list.filter(a=>a.state===S.filters.state);
  return `
  <div class="page-title">All Applications</div>
  <div class="page-sub">Every application submitted across the system.</div>
  <div class="filters">
    <select onchange="S.filters.status=this.value; render();"><option value="">All statuses</option>${['Submitted','Scheduled','Verified','Rejected'].map(s=>`<option ${S.filters.status===s?'selected':''}>${s}</option>`).join('')}</select>
    <select onchange="S.filters.type=this.value; render();"><option value="">All instrument types</option>${INSTRUMENT_TYPES.map(t=>`<option ${S.filters.type===t?'selected':''}>${t}</option>`).join('')}</select>
    <select onchange="S.filters.state=this.value; render();"><option value="">All states</option>${STATES.map(s=>`<option ${S.filters.state===s?'selected':''}>${s}</option>`).join('')}</select>
  </div>
  <div class="panel">${appsTable(list, true)}</div>`;
}

function viewAdminStakeholders(){
  return `
  <div class="page-title">Stakeholders</div>
  <div class="page-sub">All registered users of TULA.</div>
  <div class="panel">
    <table><thead><tr><th>Name</th><th>Role</th><th>Organisation</th><th>District / State</th></tr></thead><tbody>
      ${S.stakeholders.map(s=>`<tr><td>${esc(s.name)}</td><td>${roleLabel[s.role]||s.role}</td><td>${esc(s.org)||'—'}</td><td>${esc(s.district)}, ${esc(s.state)}</td></tr>`).join('')}
    </tbody></table>
  </div>`;
}

function viewAdminExpiry(){
  const sorted = S.certs.slice().sort((a,b)=> daysUntil(a.valid_until) - daysUntil(b.valid_until));
  return `
  <div class="page-title">Expiry Monitor</div>
  <div class="page-sub">Certificates sorted by nearest validity due date.</div>
  <div class="panel">${!sorted.length ? '<div class="empty">No certificates issued yet.</div>' : `
  <table><thead><tr><th>Certificate No.</th><th>Instrument</th><th>Owner</th><th>Valid until</th><th>Status</th></tr></thead><tbody>
    ${sorted.map(c=>{
      const d = daysUntil(c.valid_until);
      const st = d<0 ? '<span class="badge rejected">Expired</span>' : (d<=30 ? '<span class="badge scheduled">Due in '+d+'d</span>' : '<span class="badge verified">Active</span>');
      return `<tr><td style="font-family:var(--mono); font-size:12.5px;">${c.cert_no}</td><td>${esc(c.instrument_type)}</td><td>${esc(c.owner_name)}</td><td>${fmtDate(c.valid_until)}</td><td>${st}</td></tr>`;
    }).join('')}
  </tbody></table>`}</div>`;
}

/* ============================= POST RENDER (QR) ============================= */
function postRender(){
  if(S.session && S.view==='certView'){
    const c = certById(S.selectedCertId);
    const target = document.getElementById('qr-target');
    if(c && target && window.QRCode){
      target.innerHTML = '';
      new QRCode(target, { text: window.location.origin + '/verify/' + c.cert_no, width:106, height:106, colorDark:'#132330', colorLight:'#ffffff' });
    }
  }
  if(S.view==='verify' && S.scannerOpen){
    startQrScannerIfNeeded();
  }
}

/* ============================= INIT ============================= */
let resizeRenderTimer = null;
window.addEventListener('resize', () => {
  if(!S.loaded || !S.session) return; // only the shell (sidebar vs bottom-nav) depends on width
  clearTimeout(resizeRenderTimer);
  resizeRenderTimer = setTimeout(render, 150);
});

init();
