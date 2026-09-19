require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

const { db, seqNo, addYears, todayISO } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_change_me';
const ROLES = ['owner', 'lmo', 'gatc', 'admin'];

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json());

// ---------- file uploads ----------
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });
app.use('/uploads', express.static(uploadsDir));

// ---------- auth helpers ----------
function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}
function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT id,name,email,role,org,district,state FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'User no longer exists' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Not permitted for your role' });
    next();
  };
}

function appRow(id) { return db.prepare('SELECT * FROM applications WHERE id = ?').get(id); }
function certRow(id) { return db.prepare('SELECT * FROM certificates WHERE id = ?').get(id); }
function serializeApp(a) { return { ...a, inspection: a.inspection_json ? JSON.parse(a.inspection_json) : null }; }
function canViewApp(user, a) {
  if (user.role === 'admin') return true;
  if (user.role === 'owner') return a.owner_id === user.id;
  if (user.role === 'lmo' || user.role === 'gatc') return a.status === 'Submitted' || a.assigned_officer_id === user.id;
  return false;
}
function canViewCert(user, c) {
  if (user.role === 'admin') return true;
  if (user.role === 'owner') return c.owner_id === user.id;
  if (user.role === 'lmo' || user.role === 'gatc') return c.verified_by_id === user.id;
  return false;
}

// ==================== AUTH ====================
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, role, org, district, state } = req.body || {};
  if (!name || !email || !password || !role || !district || !state) return res.status(400).json({ error: 'All fields are required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });
  const id = crypto.randomUUID();
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (id,name,email,password_hash,role,org,district,state,created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(id, name.trim(), email.toLowerCase().trim(), password_hash, role, (org || '').trim(), district.trim(), state, new Date().toISOString());
  const user = db.prepare('SELECT id,name,email,role,org,district,state FROM users WHERE id = ?').get(id);
  res.json({ token: sign(user), user });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!row || !bcrypt.compareSync(password, row.password_hash)) return res.status(401).json({ error: 'Incorrect email or password' });
  const user = { id: row.id, name: row.name, email: row.email, role: row.role, org: row.org, district: row.district, state: row.state };
  res.json({ token: sign(user), user });
});

app.get('/api/me', authRequired, (req, res) => res.json({ user: req.user }));

// ==================== APPLICATIONS ====================
app.post('/api/applications', authRequired, requireRole('owner'), upload.single('photo'), (req, res) => {
  const { applicationType, instrumentType, capacity, businessName, phone, address, state, district } = req.body || {};
  if (!applicationType || !instrumentType || !capacity || !phone || !address || !state || !district) {
    return res.status(400).json({ error: 'Please fill in all required fields' });
  }
  const id = crypto.randomUUID();
  const app_no = seqNo('APP', 'applications');
  db.prepare(`INSERT INTO applications (id,app_no,application_type,instrument_type,capacity,owner_id,owner_name,business_name,phone,photo_path,address,state,district,status,submitted_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, app_no, applicationType, instrumentType, capacity, req.user.id, req.user.name, (businessName || req.user.org || ''), phone,
      req.file ? ('/uploads/' + req.file.filename) : null, address, state, district, 'Submitted', todayISO());
  res.json(serializeApp(appRow(id)));
});

app.get('/api/applications', authRequired, (req, res) => {
  let rows;
  if (req.user.role === 'owner') {
    rows = db.prepare('SELECT * FROM applications WHERE owner_id = ? ORDER BY submitted_date DESC').all(req.user.id);
  } else if (req.user.role === 'lmo' || req.user.role === 'gatc') {
    rows = db.prepare(`SELECT * FROM applications WHERE status = 'Submitted' OR assigned_officer_id = ? ORDER BY submitted_date DESC`).all(req.user.id);
  } else {
    rows = db.prepare('SELECT * FROM applications ORDER BY submitted_date DESC').all();
  }
  res.json(rows.map(serializeApp));
});

app.get('/api/applications/:id', authRequired, (req, res) => {
  const a = appRow(req.params.id);
  if (!a) return res.status(404).json({ error: 'Application not found' });
  if (!canViewApp(req.user, a)) return res.status(403).json({ error: 'Not permitted to view this application' });
  res.json(serializeApp(a));
});

app.post('/api/applications/:id/schedule', authRequired, requireRole('lmo', 'gatc'), (req, res) => {
  const a = appRow(req.params.id);
  if (!a) return res.status(404).json({ error: 'Application not found' });
  if (a.status !== 'Submitted') return res.status(400).json({ error: 'This application is not awaiting scheduling' });
  const { date } = req.body || {};
  if (!date) return res.status(400).json({ error: 'Inspection date is required' });
  db.prepare(`UPDATE applications SET assigned_officer_id=?, assigned_officer_name=?, assigned_org=?, scheduled_date=?, status='Scheduled' WHERE id=?`)
    .run(req.user.id, req.user.name, req.user.org, date, a.id);
  res.json(serializeApp(appRow(a.id)));
});

app.post('/api/applications/:id/inspect', authRequired, requireRole('lmo', 'gatc'), (req, res) => {
  const a = appRow(req.params.id);
  if (!a) return res.status(404).json({ error: 'Application not found' });
  if (a.status !== 'Scheduled' || a.assigned_officer_id !== req.user.id) {
    return res.status(400).json({ error: 'This application is not scheduled to you for inspection' });
  }
  const { standard, before, after, error, result, remarks } = req.body || {};
  if (!standard || !before || !after || !error || !result) return res.status(400).json({ error: 'All inspection fields are required' });
  const inspection = { standard, before, after, error, result, remarks: remarks || '' };
  let certificate = null;
  if (result === 'Pass') {
    const certId = crypto.randomUUID();
    const certNo = seqNo('TULA-CERT', 'certificates');
    const validUntil = addYears(a.scheduled_date, 1);
    db.prepare(`INSERT INTO certificates (id,cert_no,application_id,owner_id,instrument_type,owner_name,business_name,verified_by_id,verified_by_name,verifying_org,verification_date,valid_until,state,district)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(certId, certNo, a.id, a.owner_id, a.instrument_type, a.owner_name, a.business_name, req.user.id, req.user.name, req.user.org, a.scheduled_date, validUntil, a.state, a.district);
    db.prepare(`UPDATE applications SET inspection_json=?, status='Verified', certificate_id=? WHERE id=?`).run(JSON.stringify(inspection), certId, a.id);
    certificate = certRow(certId);
  } else {
    db.prepare(`UPDATE applications SET inspection_json=?, status='Rejected', rejection_reason=? WHERE id=?`)
      .run(JSON.stringify(inspection), remarks || 'Instrument failed permissible error check.', a.id);
  }
  res.json({ application: serializeApp(appRow(a.id)), certificate });
});

// ==================== CERTIFICATES ====================
app.get('/api/certificates', authRequired, (req, res) => {
  let rows;
  if (req.user.role === 'owner') rows = db.prepare('SELECT * FROM certificates WHERE owner_id = ? ORDER BY valid_until ASC').all(req.user.id);
  else if (req.user.role === 'lmo' || req.user.role === 'gatc') rows = db.prepare('SELECT * FROM certificates WHERE verified_by_id = ? ORDER BY valid_until ASC').all(req.user.id);
  else rows = db.prepare('SELECT * FROM certificates ORDER BY valid_until ASC').all();
  res.json(rows);
});

app.get('/api/certificates/:id', authRequired, (req, res) => {
  const c = certRow(req.params.id);
  if (!c) return res.status(404).json({ error: 'Certificate not found' });
  if (!canViewCert(req.user, c)) return res.status(403).json({ error: 'Not permitted to view this certificate' });
  res.json(c);
});

// Public verification endpoint - no auth, this is what a QR scan hits
app.get('/api/verify/:certNo', (req, res) => {
  const c = db.prepare('SELECT * FROM certificates WHERE cert_no = ?').get(req.params.certNo.trim());
  if (!c) return res.status(404).json({ found: false });
  res.json({ found: true, certificate: c });
});

// ==================== STAKEHOLDERS (admin) ====================
app.get('/api/stakeholders', authRequired, requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT id,name,role,org,district,state,created_at FROM users ORDER BY created_at DESC').all();
  res.json(rows);
});

// ==================== static frontend ====================
const publicDir = path.join(__dirname, '..', 'public');
// dotfiles: 'allow' is required so /.well-known/assetlinks.json (needed for
// the Android TWA app to remove its browser URL bar) actually gets served —
// Express's static middleware hides dotfiles/dot-directories by default.
app.use(express.static(publicDir, { dotfiles: 'allow' }));
app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.listen(PORT, () => console.log(`TULA server running on port ${PORT}`));
