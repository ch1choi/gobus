const cron = require('node-cron');
const db = require('./db');
const push = require('./push');

function runOnce() {
  const due = db.getDueAlarms();
  if (due.length === 0) return;
  due.forEach(async (row) => {
    try {
      await push.sendAlarmPush(row);
      db.deactivateAlarm(row.id);
    } catch (e) {
      console.error('Scheduler alarm error:', row.id, e);
    }
  });
}

function start() {
  // Every minute at 0 seconds
  cron.schedule('* * * * *', runOnce);
  console.log('Alarm scheduler started (every minute)');
}

module.exports = { start, runOnce };
