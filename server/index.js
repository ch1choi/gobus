const express = require('express');
const path = require('path');
const db = require('./db');
const push = require('./push');
const scheduler = require('./scheduler');

const app = express();
app.use(express.json());

const publicDir = path.join(__dirname, '..');
app.use(express.static(publicDir));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'gobus.html'));
});

app.get('/api/vapid-public', (req, res) => {
  const key = push.getVapidPublic();
  if (!key) return res.status(503).json({ error: 'VAPID not configured' });
  res.json({ publicKey: key });
});

app.post('/api/subscribe', (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return res.status(400).json({ error: 'endpoint and keys.p256dh, keys.auth required' });
  }
  try {
    const row = db.insertSubscription(endpoint, keys);
    res.status(201).json({ id: row.id });
  } catch (e) {
    console.error('Subscribe error:', e);
    res.status(500).json({ error: 'Subscribe failed' });
  }
});

app.post('/api/alarms', (req, res) => {
  const { alarms, subscription } = req.body;
  if (!Array.isArray(alarms) || alarms.length === 0 || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'alarms array and subscription required' });
  }
  try {
    let subRow = db.getSubscriptionByEndpoint(subscription.endpoint);
    if (!subRow) {
      subRow = db.insertSubscription(subscription.endpoint, subscription.keys || {});
    }
    const date = new Date().toDateString();
    const payload = alarms.map((a) => ({
      id: a.id || require('crypto').randomBytes(4).toString('hex'),
      originalTime: a.originalTime,
      alarmTime: a.alarmTime,
      offset: a.offset ?? 5,
    }));
    db.insertAlarms(subRow.id, date, payload);
    res.status(201).json({ ids: payload.map((p) => p.id) });
  } catch (e) {
    console.error('Alarms create error:', e);
    res.status(500).json({ error: 'Create alarms failed' });
  }
});

app.get('/api/alarms', (req, res) => {
  const endpoint = req.query.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'endpoint query required' });
  try {
    const list = db.getAlarmsByEndpoint(endpoint);
    res.json(list.map((a) => ({
      id: a.id,
      date: a.date,
      originalTime: a.original_time,
      alarmTime: a.alarm_time,
      offset: a.offset_minutes,
      active: !!a.active,
    })));
  } catch (e) {
    console.error('Alarms list error:', e);
    res.status(500).json({ error: 'List failed' });
  }
});

app.delete('/api/alarms/:id', (req, res) => {
  try {
    db.deleteAlarm(req.params.id);
    res.status(204).end();
  } catch (e) {
    console.error('Alarm delete error:', e);
    res.status(500).json({ error: 'Delete failed' });
  }
});

const PORT = process.env.PORT || 8080;

(async () => {
  await db.init();
  app.listen(PORT, () => {
    console.log(`GO BUS! server listening on port ${PORT}`);
  });
  scheduler.start();
})();
