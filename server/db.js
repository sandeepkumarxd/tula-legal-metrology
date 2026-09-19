const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, 'tula.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  org TEXT,
  district TEXT,
  state TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  app_no TEXT NOT NULL,
  application_type TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  capacity TEXT,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  business_name TEXT,
  phone TEXT,
  photo_path TEXT,
  address TEXT,
  state TEXT,
  district TEXT,
  status TEXT NOT NULL DEFAULT 'Submitted',
  submitted_date TEXT NOT NULL,
  assigned_officer_id TEXT,
  assigned_officer_name TEXT,
  assigned_org TEXT,
  scheduled_date TEXT,
  inspection_json TEXT,
  certificate_id TEXT,
  rejection_reason TEXT
);

CREATE TABLE IF NOT EXISTS certificates (
  id TEXT PRIMARY KEY,
  cert_no TEXT NOT NULL,
  application_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  instrument_type TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  business_name TEXT,
  verified_by_id TEXT NOT NULL,
  verified_by_name TEXT NOT NULL,
  verifying_org TEXT,
  verification_date TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  state TEXT,
  district TEXT
);
`);

function seqNo(prefix, table) {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
  return `${prefix}-${String(row.c + 1).padStart(6, '0')}`;
}

function addYears(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---- seed demo data on first run ----
const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (userCount === 0) {
  const demoPasswordHash = bcrypt.hashSync('demo1234', 10);

  const owner = { id: crypto.randomUUID(), name: 'R. Kannan', email: 'owner@demo.tula', role: 'owner', org: 'Kannan Provision Stores', district: 'Coimbatore', state: 'Tamil Nadu' };
  const lmo = { id: crypto.randomUUID(), name: 'S. Priya', email: 'lmo@demo.tula', role: 'lmo', org: 'Office of Legal Metrology, Coimbatore', district: 'Coimbatore', state: 'Tamil Nadu' };
  const gatc = { id: crypto.randomUUID(), name: 'K. Ramesh', email: 'gatc@demo.tula', role: 'gatc', org: 'Southern GATC Pvt Ltd', district: 'Salem', state: 'Tamil Nadu' };
  const admin = { id: crypto.randomUUID(), name: 'V. Anand', email: 'admin@demo.tula', role: 'admin', org: 'Directorate of Legal Metrology', district: 'Chennai', state: 'Tamil Nadu' };

  const insUser = db.prepare(`INSERT INTO users (id,name,email,password_hash,role,org,district,state,created_at) VALUES (@id,@name,@email,@password_hash,@role,@org,@district,@state,@created_at)`);
  [owner, lmo, gatc, admin].forEach(u => insUser.run({ ...u, password_hash: demoPasswordHash, created_at: new Date().toISOString() }));

  const insApp = db.prepare(`INSERT INTO applications (id,app_no,application_type,instrument_type,capacity,owner_id,owner_name,business_name,phone,photo_path,address,state,district,status,submitted_date,assigned_officer_id,assigned_officer_name,assigned_org,scheduled_date,inspection_json,certificate_id,rejection_reason)
    VALUES (@id,@app_no,@application_type,@instrument_type,@capacity,@owner_id,@owner_name,@business_name,@phone,@photo_path,@address,@state,@district,@status,@submitted_date,@assigned_officer_id,@assigned_officer_name,@assigned_org,@scheduled_date,@inspection_json,@certificate_id,@rejection_reason)`);
  const insCert = db.prepare(`INSERT INTO certificates (id,cert_no,application_id,owner_id,instrument_type,owner_name,business_name,verified_by_id,verified_by_name,verifying_org,verification_date,valid_until,state,district)
    VALUES (@id,@cert_no,@application_id,@owner_id,@instrument_type,@owner_name,@business_name,@verified_by_id,@verified_by_name,@verifying_org,@verification_date,@valid_until,@state,@district)`);

  const oneYearAgo = addYears(todayISO(), -1);
  const a1Id = crypto.randomUUID();
  const c1Id = crypto.randomUUID();
  insApp.run({
    id: a1Id, app_no: 'APP-000001', application_type: 'New verification', instrument_type: 'Non-automatic weighing instrument (counter scale)',
    capacity: '0-30 kg', owner_id: owner.id, owner_name: owner.name, business_name: owner.org, phone: '9840012345', photo_path: null,
    address: '12 Gandhi Street', state: 'Tamil Nadu', district: 'Coimbatore', status: 'Verified', submitted_date: oneYearAgo,
    assigned_officer_id: lmo.id, assigned_officer_name: lmo.name, assigned_org: lmo.org, scheduled_date: oneYearAgo,
    inspection_json: JSON.stringify({ standard: '20 kg standard weight set', before: '20.05 kg', after: '20.00 kg', error: '0.00%', result: 'Pass', remarks: 'Instrument within permissible error limits.' }),
    certificate_id: c1Id, rejection_reason: null
  });
  insCert.run({
    id: c1Id, cert_no: 'TULA-CERT-000001', application_id: a1Id, owner_id: owner.id, instrument_type: 'Non-automatic weighing instrument (counter scale)',
    owner_name: owner.name, business_name: owner.org, verified_by_id: lmo.id, verified_by_name: lmo.name, verifying_org: lmo.org,
    verification_date: oneYearAgo, valid_until: addYears(oneYearAgo, 1), state: 'Tamil Nadu', district: 'Coimbatore'
  });

  insApp.run({
    id: crypto.randomUUID(), app_no: 'APP-000002', application_type: 'Re-verification', instrument_type: 'Fuel dispensing pump',
    capacity: 'Single nozzle', owner_id: owner.id, owner_name: owner.name, business_name: 'Kannan Fuel Point', phone: '9840012345', photo_path: null,
    address: 'NH-47 Bypass Road', state: 'Tamil Nadu', district: 'Coimbatore', status: 'Scheduled', submitted_date: todayISO(),
    assigned_officer_id: lmo.id, assigned_officer_name: lmo.name, assigned_org: lmo.org, scheduled_date: todayISO(),
    inspection_json: null, certificate_id: null, rejection_reason: null
  });

  insApp.run({
    id: crypto.randomUUID(), app_no: 'APP-000003', application_type: 'New verification', instrument_type: 'Water meter',
    capacity: '15mm domestic', owner_id: owner.id, owner_name: 'Meena Traders', business_name: '', phone: '9976543210', photo_path: null,
    address: '44 Mill Road', state: 'Tamil Nadu', district: 'Salem', status: 'Submitted', submitted_date: todayISO(),
    assigned_officer_id: null, assigned_officer_name: null, assigned_org: null, scheduled_date: null,
    inspection_json: null, certificate_id: null, rejection_reason: null
  });

  console.log('Seeded demo data. Demo logins (password: demo1234):');
  console.log('  owner@demo.tula, lmo@demo.tula, gatc@demo.tula, admin@demo.tula');
}

module.exports = { db, seqNo, addYears, todayISO };
