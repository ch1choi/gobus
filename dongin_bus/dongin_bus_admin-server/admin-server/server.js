'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const cookieSession = require('cookie-session');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');

const PORT = Number(process.env.PORT || 3000);
const DONGIN_BUS_DIR = path.resolve(process.env.DONGIN_BUS_DIR || path.join(__dirname, '..'));
const INDEX_FILE = path.join(DONGIN_BUS_DIR, 'index.html');
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 3 * 1024 * 1024);
const MAX_BACKUPS = Number(process.env.MAX_BACKUPS || 30);

/** CCTV 뷰어 정적 소스 (index.html, data/routes.json). 기본: DONGIN_BUS_DIR/cctv_viewer — 별도 볼륨 없이 동일 마운트 사용 */
const CCTV_ADMIN_ENABLED = process.env.CCTV_ADMIN_ENABLED !== '0';
const CCTV_VIEWER_DIR = path.resolve(
  process.env.CCTV_VIEWER_DIR || path.join(DONGIN_BUS_DIR, 'cctv_viewer')
);
const CCTV_INDEX_FILE = path.join(CCTV_VIEWER_DIR, 'index.html');
const CCTV_DATA_DIR = path.join(CCTV_VIEWER_DIR, 'data');
const CCTV_ROUTES_FILE = path.join(CCTV_DATA_DIR, 'routes.json');

const ADMIN_USER = process.env.ADMIN_USER || 'dongin-admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'change-me-on-deploy';
let SESSION_KEYS = (process.env.SESSION_KEYS || 'dev-key-change-in-production-use-long-random')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (!SESSION_KEYS.length) {
  SESSION_KEYS = ['dev-key-change-in-production-use-long-random'];
}

/** URL 접두사. 변경 시 nginx(dit-admin.conf) 의 `/dit-admin` 리다이렉트·location 과 일치시킬 것. 관리 UI 는 apiUrl() 로 상대 경로 요청. */
function normalizeAdminBase(raw) {
  if (raw == null || String(raw).trim() === '') return '/dit-admin';
  let b = String(raw).trim().replace(/\/+$/, '');
  if (b === '') return '/dit-admin';
  return b.startsWith('/') ? b : '/' + b;
}
const ADMIN_BASE = normalizeAdminBase(process.env.ADMIN_BASE_PATH);

const VISIT_TRACKING_DISABLED = process.env.VISIT_TRACKING_ENABLED === '0';
const DEFAULT_VISIT_DB = path.join(DONGIN_BUS_DIR, '_metrics', 'pageviews.sqlite');
const VISIT_DB_PATH = path.resolve(process.env.VISIT_DB_PATH || DEFAULT_VISIT_DB);
/** index.html 비콘·관리 표시 노선 목록 동기화 필요 */
const TRACK_FOR_STATS = ['108', '501', '511', '513'];

function timingSafeEqualStr(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function backupStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    '_' +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

const BACKUP_RE = /^index\.html_\d{8}_\d{6}$/;
const CCTV_BACKUP_RE_INDEX = /^index\.html_\d{8}_\d{6}$/;
const CCTV_BACKUP_RE_ROUTES = /^routes\.json_\d{8}_\d{6}$/;

function listBackups() {
  let names = [];
  try {
    names = fs.readdirSync(DONGIN_BUS_DIR);
  } catch {
    return [];
  }
  return names
    .filter((n) => BACKUP_RE.test(n))
    .map((n) => ({
      name: n,
      full: path.join(DONGIN_BUS_DIR, n),
      mtime: fs.statSync(path.join(DONGIN_BUS_DIR, n)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
}

function pruneBackups() {
  const list = listBackups();
  if (list.length <= MAX_BACKUPS) return;
  const drop = list.slice(MAX_BACKUPS);
  for (const x of drop) {
    try {
      fs.unlinkSync(x.full);
    } catch (_) {}
  }
}

function validateHtml(buf) {
  const head = buf.slice(0, Math.min(buf.length, 8000)).toString('utf8').toLowerCase();
  return head.includes('<!doctype') || head.includes('<html');
}

function validateRoutesJson(buf) {
  try {
    const v = JSON.parse(buf.toString('utf8'));
    return typeof v === 'object' && v !== null;
  } catch {
    return false;
  }
}

function ensureCctvDirs() {
  fs.mkdirSync(CCTV_VIEWER_DIR, { recursive: true });
  fs.mkdirSync(CCTV_DATA_DIR, { recursive: true });
}

function listCctvBackupsIndex() {
  let names = [];
  try {
    names = fs.readdirSync(CCTV_VIEWER_DIR);
  } catch {
    return [];
  }
  return names
    .filter((n) => CCTV_BACKUP_RE_INDEX.test(n))
    .map((n) => ({
      name: n,
      full: path.join(CCTV_VIEWER_DIR, n),
      mtime: fs.statSync(path.join(CCTV_VIEWER_DIR, n)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
}

function listCctvBackupsRoutes() {
  let names = [];
  try {
    if (!fs.existsSync(CCTV_DATA_DIR)) return [];
    names = fs.readdirSync(CCTV_DATA_DIR);
  } catch {
    return [];
  }
  return names
    .filter((n) => CCTV_BACKUP_RE_ROUTES.test(n))
    .map((n) => ({
      name: n,
      full: path.join(CCTV_DATA_DIR, n),
      mtime: fs.statSync(path.join(CCTV_DATA_DIR, n)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
}

function pruneCctvBackupsIndex() {
  const list = listCctvBackupsIndex();
  if (list.length <= MAX_BACKUPS) return;
  for (const x of list.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(x.full);
    } catch (_) {}
  }
}

function pruneCctvBackupsRoutes() {
  const list = listCctvBackupsRoutes();
  if (list.length <= MAX_BACKUPS) return;
  for (const x of list.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(x.full);
    } catch (_) {}
  }
}

function cctvStatusPayload() {
  if (!CCTV_ADMIN_ENABLED) {
    return { enabled: false, message: 'CCTV_ADMIN_ENABLED=0' };
  }
  const bi = listCctvBackupsIndex();
  const br = listCctvBackupsRoutes();
  return {
    enabled: true,
    cctvViewerDir: CCTV_VIEWER_DIR,
    indexExists: fs.existsSync(CCTV_INDEX_FILE),
    routesExists: fs.existsSync(CCTV_ROUTES_FILE),
    backupCountIndex: bi.length,
    backupCountRoutes: br.length,
    latestBackupIndex: bi[0] ? bi[0].name : null,
    latestBackupRoutes: br[0] ? br[0].name : null,
    backupsIndex: bi.map((b) => ({ name: b.name, mtimeMs: b.mtime })),
    backupsRoutes: br.map((b) => ({ name: b.name, mtimeMs: b.mtime })),
  };
}

/** Asia/Seoul 달력 일자 yyyy-mm-dd */
function formatKSTDate(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ms);
}

let visitDbInstance = null;
function getVisitDb() {
  if (VISIT_TRACKING_DISABLED) return null;
  if (visitDbInstance) return visitDbInstance;
  try {
    fs.mkdirSync(path.dirname(VISIT_DB_PATH), { recursive: true });
    const db = new Database(VISIT_DB_PATH);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS pageviews_daily (
        date TEXT PRIMARY KEY,
        cnt INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS pageviews_route_daily (
        date TEXT NOT NULL,
        route TEXT NOT NULL,
        cnt INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (date, route)
      );
    `);
    visitDbInstance = db;
    return visitDbInstance;
  } catch (e) {
    console.error('visit-stats DB open 실패:', e.message || e);
    return null;
  }
}

function incrPageviewsTotal() {
  const db = getVisitDb();
  if (!db) return;
  const day = formatKSTDate();
  db.prepare(
    `INSERT INTO pageviews_daily(date, cnt) VALUES (?, 1)
     ON CONFLICT(date) DO UPDATE SET cnt = cnt + 1`
  ).run(day);
}

function incrPageviewsRoute(routeId) {
  const db = getVisitDb();
  if (!db) return;
  const day = formatKSTDate();
  db.prepare(
    `INSERT INTO pageviews_route_daily(date, route, cnt) VALUES (?, ?, 1)
     ON CONFLICT(date, route) DO UPDATE SET cnt = cnt + 1`
  ).run(day, routeId);
}

const collectLimiter = rateLimit({
  windowMs: 60000,
  limit: Number(process.env.COLLECT_RATE_LIMIT_PER_MINUTE || 120),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: false,
});

/** 최근 일자 순 desc (오늘이 첫 줄). totals·라우트 맵 포함. */
function gatherVisitSeries(daysRequested) {
  const n = Math.min(Math.max(Number(daysRequested) || 30, 1), 366);
  const routeIds = [...TRACK_FOR_STATS];
  const dayMs = 24 * 60 * 60 * 1000;
  const dates = [];
  for (let i = 0; i < n; i++) {
    dates.push(formatKSTDate(Date.now() - i * dayMs));
  }

  const totalsMap = new Map();
  const routeAgg = new Map();
  const db = getVisitDb();
  const minD = dates[dates.length - 1];
  const maxD = dates[0];
  let dbUnreachable = Boolean(!VISIT_TRACKING_DISABLED && !db);

  if (db && minD && maxD) {
    db.prepare(`SELECT date, cnt FROM pageviews_daily WHERE date >= ? AND date <= ?`).all(minD, maxD).forEach((row) => {
      totalsMap.set(row.date, row.cnt);
    });
    db.prepare(`SELECT date, route, cnt FROM pageviews_route_daily WHERE date >= ? AND date <= ?`).all(minD, maxD).forEach((row) => {
      const k = `${row.date}\0${row.route}`;
      routeAgg.set(k, row.cnt);
    });
    dbUnreachable = false;
  }

  const series = dates.map((d) => {
    const row = {
      date: d,
      total: totalsMap.has(d) ? totalsMap.get(d) : 0,
      byRoute: {},
    };
    for (const rid of routeIds) {
      row.byRoute[rid] = routeAgg.has(`${d}\0${rid}`) ? routeAgg.get(`${d}\0${rid}`) : 0;
    }
    return row;
  });

  return {
    routes: routeIds,
    days: n,
    series,
    dbDisabled: VISIT_TRACKING_DISABLED,
    dbPath: VISIT_DB_PATH,
    dbUnreachable,
  };
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authed === true) return next();
  res.status(401).json({ ok: false, error: '인증 필요' });
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
// 기본(false)이면 app.get('/dit-admin') 가 '/dit-admin/' 까지 매칭되어 302 루프·헬스 실패 유발.
app.set('strict routing', true);

// Docker/Swarm 헬스체크 전용 — cookie-session·정적 파일보다 앞에 둠.
app.get('/health', (req, res) => {
  res.status(200).type('text/plain').send('ok');
});

app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '2kb' }));

// 인증 불필요·cookie-session 필요 없음(익명 수집)
app.post(`${ADMIN_BASE}/api/collect/pageview`, collectLimiter, (req, res) => {
  try {
    if (VISIT_TRACKING_DISABLED) {
      res.status(204).end();
      return;
    }
    const rawKind = req.body != null ? String(req.body.kind || 'total').toLowerCase() : 'total';
    const kind = rawKind === 'route' ? 'route' : 'total';
    if (kind === 'total') incrPageviewsTotal();
    else {
      const route = req.body != null && req.body.route != null ? String(req.body.route).trim() : '';
      if (TRACK_FOR_STATS.includes(route)) incrPageviewsRoute(route);
    }
  } catch (e) {
    console.error('collect/pageview:', e.message || e);
  }
  res.status(204).end();
});

app.use(
  cookieSession({
    name: 'dit_admin_sess',
    keys: SESSION_KEYS,
    maxAge: 12 * 60 * 60 * 1000,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === '1',
  })
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');
}

app.get('/', (req, res) => {
  res.redirect(302, `${ADMIN_BASE}/`);
});

app.get(ADMIN_BASE, (req, res) => {
  res.redirect(302, `${ADMIN_BASE}/`);
});

app.post(`${ADMIN_BASE}/api/login`, (req, res) => {
  const { username, password } = req.body || {};
  const userOk = timingSafeEqualStr(String(username || ''), ADMIN_USER);
  const passOk =
    typeof password === 'string' &&
    timingSafeEqualStr(sha256hex(password), sha256hex(ADMIN_PASS));
  if (userOk && passOk) {
    req.session.authed = true;
    return res.json({ ok: true });
  }
  setTimeout(() => res.status(401).json({ ok: false, error: '아이디 또는 비밀번호가 올바르지 않습니다.' }), 400);
});

app.post(`${ADMIN_BASE}/api/logout`, (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get(`${ADMIN_BASE}/api/status`, requireAuth, (req, res) => {
  const backups = listBackups();
  res.json({
    ok: true,
    donginBusDir: DONGIN_BUS_DIR,
    latestBackup: backups[0] ? backups[0].name : null,
    backupCount: backups.length,
    indexExists: fs.existsSync(INDEX_FILE),
    backups: backups.map((b) => ({ name: b.name, mtimeMs: b.mtime })),
    cctv: cctvStatusPayload(),
  });
});

app.get(`${ADMIN_BASE}/api/visit-stats`, requireAuth, (req, res) => {
  try {
    const raw = req.query && req.query.days != null ? Number(req.query.days) : 30;
    const data = gatherVisitSeries(raw);
    res.json(Object.assign({ ok: true }, data));
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.get(`${ADMIN_BASE}/api/download`, requireAuth, (req, res) => {
  try {
    if (!fs.existsSync(INDEX_FILE)) {
      res.status(404).json({ ok: false, error: 'index.html 파일이 없습니다.' });
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="index.html"');
    fs.createReadStream(INDEX_FILE).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post(`${ADMIN_BASE}/api/upload`, requireAuth, upload.single('file'), (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, error: 'file 필드가 필요합니다.' });
    }
    if (!validateHtml(req.file.buffer)) {
      return res.status(400).json({ ok: false, error: 'HTML 로 보이지 않습니다. (<!DOCTYPE 또는 <html 확인)' });
    }

    if (fs.existsSync(INDEX_FILE)) {
      const bakName = `index.html_${backupStamp()}`;
      fs.renameSync(INDEX_FILE, path.join(DONGIN_BUS_DIR, bakName));
    }
    fs.writeFileSync(INDEX_FILE, req.file.buffer, { mode: 0o644 });
    pruneBackups();
    res.json({ ok: true, message: '저장되었습니다.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post(`${ADMIN_BASE}/api/rollback`, requireAuth, (req, res) => {
  try {
    const backups = listBackups();
    if (!backups.length) {
      return res.status(400).json({ ok: false, error: '롤백할 백업이 없습니다.' });
    }

    let target = backups[0];
    const rawName = req.body && req.body.backupName != null ? String(req.body.backupName).trim() : '';
    if (rawName !== '') {
      if (!BACKUP_RE.test(rawName)) {
        return res.status(400).json({ ok: false, error: '허용되지 않는 백업 파일명입니다.' });
      }
      const hit = backups.find((b) => b.name === rawName);
      if (!hit) {
        return res.status(404).json({ ok: false, error: '요청한 백업을 찾을 수 없습니다.' });
      }
      target = hit;
    }

    if (fs.existsSync(INDEX_FILE)) {
      const bakName = `index.html_${backupStamp()}`;
      fs.renameSync(INDEX_FILE, path.join(DONGIN_BUS_DIR, bakName));
    }
    fs.copyFileSync(target.full, INDEX_FILE);
    pruneBackups();
    res.json({ ok: true, restoredFrom: target.name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

const MAX_DELETE_BACKUPS = Number(process.env.MAX_DELETE_BACKUPS || 100);

app.post(`${ADMIN_BASE}/api/delete-backup`, requireAuth, (req, res) => {
  try {
    const body = req.body || {};
    let names = [];
    if (Array.isArray(body.backupNames)) {
      names = body.backupNames.map((x) => String(x).trim()).filter(Boolean);
    } else if (body.backupName != null && String(body.backupName).trim() !== '') {
      names = [String(body.backupName).trim()];
    }
    names = [...new Set(names)];
    if (!names.length) {
      return res.status(400).json({ ok: false, error: 'backupName 또는 backupNames(배열)이 필요합니다.' });
    }
    if (names.length > MAX_DELETE_BACKUPS) {
      return res.status(400).json({
        ok: false,
        error: `한 번에 삭제할 수 있는 최대 개수는 ${MAX_DELETE_BACKUPS}개입니다.`,
      });
    }

    const paths = [];
    for (const rawName of names) {
      if (!BACKUP_RE.test(rawName)) {
        return res.status(400).json({ ok: false, error: '허용되지 않는 백업 파일명: ' + rawName });
      }
      const full = path.join(DONGIN_BUS_DIR, rawName);
      if (path.basename(full) !== rawName) {
        return res.status(400).json({ ok: false, error: '잘못된 경로입니다.' });
      }
      if (!fs.existsSync(full)) {
        return res.status(404).json({ ok: false, error: '백업 파일이 없습니다: ' + rawName });
      }
      paths.push({ rawName, full });
    }

    for (const p of paths) {
      fs.unlinkSync(p.full);
    }
    res.json({ ok: true, deleted: paths.map((p) => p.rawName), count: paths.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

// ----- CCTV 뷰어 소스 (같은 볼륨: DONGIN_BUS_DIR/cctv_viewer) -----
function requireCctvAdmin(_req, res, next) {
  if (!CCTV_ADMIN_ENABLED) {
    return res.status(403).json({ ok: false, error: 'CCTV 관리 비활성화(CCTV_ADMIN_ENABLED=0)' });
  }
  next();
}

app.get(`${ADMIN_BASE}/api/cctv/download`, requireAuth, requireCctvAdmin, (req, res) => {
  try {
    const target = String(req.query.target || 'index').toLowerCase();
    if (target === 'index') {
      if (!fs.existsSync(CCTV_INDEX_FILE)) {
        return res.status(404).json({ ok: false, error: 'cctv_viewer/index.html 이 없습니다.' });
      }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="cctv-index.html"');
      fs.createReadStream(CCTV_INDEX_FILE).pipe(res);
      return;
    }
    if (target === 'routes') {
      if (!fs.existsSync(CCTV_ROUTES_FILE)) {
        return res.status(404).json({ ok: false, error: 'data/routes.json 이 없습니다.' });
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="routes.json"');
      fs.createReadStream(CCTV_ROUTES_FILE).pipe(res);
      return;
    }
    return res.status(400).json({ ok: false, error: 'target=index 또는 routes' });
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post(`${ADMIN_BASE}/api/cctv/upload`, requireAuth, requireCctvAdmin, upload.single('file'), (req, res) => {
  try {
    const target = String(req.body.target || '').toLowerCase().trim();
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ ok: false, error: 'file 필드가 필요합니다. target=index|routes 함께 전송.' });
    }
    ensureCctvDirs();

    if (target === 'index') {
      if (!validateHtml(req.file.buffer)) {
        return res.status(400).json({ ok: false, error: 'HTML 로 보이지 않습니다. (<!DOCTYPE 또는 <html)' });
      }
      if (fs.existsSync(CCTV_INDEX_FILE)) {
        const bakName = `index.html_${backupStamp()}`;
        fs.renameSync(CCTV_INDEX_FILE, path.join(CCTV_VIEWER_DIR, bakName));
      }
      fs.writeFileSync(CCTV_INDEX_FILE, req.file.buffer, { mode: 0o644 });
      pruneCctvBackupsIndex();
      return res.json({ ok: true, message: 'cctv_viewer/index.html 저장됨.' });
    }
    if (target === 'routes') {
      if (!validateRoutesJson(req.file.buffer)) {
        return res.status(400).json({ ok: false, error: '유효한 JSON 이 아닙니다.' });
      }
      if (fs.existsSync(CCTV_ROUTES_FILE)) {
        const bakName = `routes.json_${backupStamp()}`;
        fs.renameSync(CCTV_ROUTES_FILE, path.join(CCTV_DATA_DIR, bakName));
      }
      fs.writeFileSync(CCTV_ROUTES_FILE, req.file.buffer, { mode: 0o644 });
      pruneCctvBackupsRoutes();
      return res.json({ ok: true, message: 'data/routes.json 저장됨.' });
    }
    return res.status(400).json({ ok: false, error: 'target 은 index 또는 routes' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post(`${ADMIN_BASE}/api/cctv/rollback`, requireAuth, requireCctvAdmin, (req, res) => {
  try {
    const target = String((req.body && req.body.target) || '').toLowerCase().trim();
    const rawName =
      req.body && req.body.backupName != null ? String(req.body.backupName).trim() : '';

    if (target === 'index') {
      const backups = listCctvBackupsIndex();
      if (!backups.length) {
        return res.status(400).json({ ok: false, error: 'index.html 롤백용 백업이 없습니다.' });
      }
      let pick = backups[0];
      if (rawName !== '') {
        if (!CCTV_BACKUP_RE_INDEX.test(rawName)) {
          return res.status(400).json({ ok: false, error: '허용되지 않는 백업 파일명입니다.' });
        }
        const hit = backups.find((b) => b.name === rawName);
        if (!hit) return res.status(404).json({ ok: false, error: '백업을 찾을 수 없습니다.' });
        pick = hit;
      }
      ensureCctvDirs();
      if (fs.existsSync(CCTV_INDEX_FILE)) {
        fs.renameSync(CCTV_INDEX_FILE, path.join(CCTV_VIEWER_DIR, `index.html_${backupStamp()}`));
      }
      fs.copyFileSync(pick.full, CCTV_INDEX_FILE);
      fs.chmodSync(CCTV_INDEX_FILE, 0o644);
      pruneCctvBackupsIndex();
      return res.json({ ok: true, restoredFrom: pick.name, target: 'index' });
    }

    if (target === 'routes') {
      const backups = listCctvBackupsRoutes();
      if (!backups.length) {
        return res.status(400).json({ ok: false, error: 'routes.json 롤백용 백업이 없습니다.' });
      }
      let pick = backups[0];
      if (rawName !== '') {
        if (!CCTV_BACKUP_RE_ROUTES.test(rawName)) {
          return res.status(400).json({ ok: false, error: '허용되지 않는 백업 파일명입니다.' });
        }
        const hit = backups.find((b) => b.name === rawName);
        if (!hit) return res.status(404).json({ ok: false, error: '백업을 찾을 수 없습니다.' });
        pick = hit;
      }
      ensureCctvDirs();
      if (fs.existsSync(CCTV_ROUTES_FILE)) {
        fs.renameSync(CCTV_ROUTES_FILE, path.join(CCTV_DATA_DIR, `routes.json_${backupStamp()}`));
      }
      fs.copyFileSync(pick.full, CCTV_ROUTES_FILE);
      fs.chmodSync(CCTV_ROUTES_FILE, 0o644);
      pruneCctvBackupsRoutes();
      return res.json({ ok: true, restoredFrom: pick.name, target: 'routes' });
    }
    return res.status(400).json({ ok: false, error: 'target 은 index 또는 routes' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post(`${ADMIN_BASE}/api/cctv/delete-backup`, requireAuth, requireCctvAdmin, (req, res) => {
  try {
    const body = req.body || {};
    const target = String(body.target || '').toLowerCase().trim();
    let names = [];
    if (Array.isArray(body.backupNames)) {
      names = body.backupNames.map((x) => String(x).trim()).filter(Boolean);
    } else if (body.backupName != null && String(body.backupName).trim() !== '') {
      names = [String(body.backupName).trim()];
    }
    names = [...new Set(names)];
    if (!names.length) {
      return res.status(400).json({ ok: false, error: 'target 및 backupName(s)가 필요합니다.' });
    }
    if (names.length > MAX_DELETE_BACKUPS) {
      return res.status(400).json({
        ok: false,
        error: `한 번에 삭제할 수 있는 최대 개수는 ${MAX_DELETE_BACKUPS}개입니다.`,
      });
    }

    const re = target === 'routes' ? CCTV_BACKUP_RE_ROUTES : CCTV_BACKUP_RE_INDEX;
    const baseDir = target === 'routes' ? CCTV_DATA_DIR : CCTV_VIEWER_DIR;

    if (target !== 'index' && target !== 'routes') {
      return res.status(400).json({ ok: false, error: 'target 은 index 또는 routes' });
    }

    const paths = [];
    for (const rawName of names) {
      if (!re.test(rawName)) {
        return res.status(400).json({ ok: false, error: '허용되지 않는 백업 파일명: ' + rawName });
      }
      const full = path.join(baseDir, rawName);
      if (path.basename(full) !== rawName) {
        return res.status(400).json({ ok: false, error: '잘못된 경로입니다.' });
      }
      if (!fs.existsSync(full)) {
        return res.status(404).json({ ok: false, error: '백업 파일이 없습니다: ' + rawName });
      }
      paths.push({ rawName, full });
    }
    for (const p of paths) {
      fs.unlinkSync(p.full);
    }
    res.json({ ok: true, deleted: paths.map((p) => p.rawName), count: paths.length, target });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

const publicDir = path.join(__dirname, 'public');
app.use(ADMIN_BASE, express.static(publicDir, { index: 'index.html' }));

app.use((req, res) => {
  res.status(404).send('Not found');
});

app.listen(PORT, () => {
  console.log(
    `dongin-bus-admin listening on ${PORT}, ADMIN_BASE=${ADMIN_BASE}, DONGIN_BUS_DIR=${DONGIN_BUS_DIR}`
  );
  if (VISIT_TRACKING_DISABLED) {
    console.log('  페이지 통계 비활성화 VISIT_TRACKING_ENABLED=0');
  } else {
    console.log(`  페이지 통계 DB (기본값·미오픈) VISIT_DB_PATH=${VISIT_DB_PATH}`);
  }
  if (CCTV_ADMIN_ENABLED) {
    console.log(`  CCTV_VIEWER_DIR=${CCTV_VIEWER_DIR} (api/cctv/*)`);
  } else {
    console.log('  CCTV admin disabled (CCTV_ADMIN_ENABLED=0)');
  }
});
