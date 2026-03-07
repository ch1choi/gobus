const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'gobus.db');

let db = null;

function runSelectOne(sql, params) {
  const stmt = db.prepare(sql);
  stmt.bind(params || []);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

function runSelectAll(sql, params) {
  const stmt = db.prepare(sql);
  stmt.bind(params || []);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function init() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const buf = fs.readFileSync(dbPath);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS alarms (
      id TEXT PRIMARY KEY,
      subscription_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      original_time TEXT NOT NULL,
      alarm_time TEXT NOT NULL,
      offset_minutes INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (subscription_id) REFERENCES push_subscriptions(id)
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_alarms_active_time ON alarms(active, alarm_time);`);
  save();
  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function insertSubscription(endpoint, keys) {
  const p256dh = keys.p256dh || keys.keys_p256dh;
  const auth = keys.auth || keys.keys_auth;
  let row = getSubscriptionByEndpoint(endpoint);
  if (row) {
    db.run('UPDATE push_subscriptions SET keys_p256dh = ?, keys_auth = ? WHERE id = ?', [p256dh, auth, row.id]);
    save();
    return row;
  }
  db.run('INSERT INTO push_subscriptions (endpoint, keys_p256dh, keys_auth) VALUES (?, ?, ?)', [endpoint, p256dh, auth]);
  save();
  row = getSubscriptionByEndpoint(endpoint);
  return row;
}

function getSubscriptionByEndpoint(endpoint) {
  return runSelectOne('SELECT * FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
}

function getSubscriptionById(id) {
  return runSelectOne('SELECT * FROM push_subscriptions WHERE id = ?', [id]);
}

function insertAlarms(subscriptionId, date, alarms) {
  for (const a of alarms) {
    db.run(
      'INSERT INTO alarms (id, subscription_id, date, original_time, alarm_time, offset_minutes, active) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [a.id, subscriptionId, date, a.originalTime, a.alarmTime, a.offset]
    );
  }
  save();
  return alarms.length;
}

function getDueAlarms() {
  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return runSelectAll(
    `SELECT a.*, p.endpoint, p.keys_p256dh, p.keys_auth
     FROM alarms a
     JOIN push_subscriptions p ON a.subscription_id = p.id
     WHERE a.active = 1 AND a.alarm_time = ?`,
    [currentHHMM]
  );
}

function deactivateAlarm(id) {
  db.run('UPDATE alarms SET active = 0 WHERE id = ?', [id]);
  save();
}

function getAlarmsBySubscription(subscriptionId) {
  return runSelectAll('SELECT * FROM alarms WHERE subscription_id = ? ORDER BY alarm_time', [subscriptionId]);
}

function getAlarmsByEndpoint(endpoint) {
  const sub = getSubscriptionByEndpoint(endpoint);
  if (!sub) return [];
  return getAlarmsBySubscription(sub.id);
}

function deleteAlarm(id) {
  db.run('DELETE FROM alarms WHERE id = ?', [id]);
  save();
}

module.exports = {
  init,
  insertSubscription,
  getSubscriptionByEndpoint,
  getSubscriptionById,
  insertAlarms,
  getDueAlarms,
  deactivateAlarm,
  getAlarmsBySubscription,
  getAlarmsByEndpoint,
  deleteAlarm,
};
