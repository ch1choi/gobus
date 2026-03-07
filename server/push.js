const webpush = require('web-push');
const db = require('./db');

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(
    'mailto:gobus@example.com',
    vapidPublicKey,
    vapidPrivateKey
  );
}

function getVapidPublic() {
  return vapidPublicKey || null;
}

function subscriptionFromRow(row) {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.keys_p256dh,
      auth: row.keys_auth,
    },
  };
}

async function sendPush(subscription, payload) {
  if (!vapidPrivateKey) {
    console.warn('VAPID keys not set, skip push');
    return;
  }
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify(payload),
      { TTL: 60 }
    );
  } catch (err) {
    console.error('Web Push send error:', err.statusCode || err.message);
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired or invalid - could remove from DB here
    }
  }
}

async function sendAlarmPush(alarmRow) {
  const subscription = subscriptionFromRow(alarmRow);
  const body = alarmRow.offset_minutes === 0
    ? `${alarmRow.original_time} 출발 버스가 지금 출발합니다!`
    : `${alarmRow.original_time} 출발 버스 출발 ${alarmRow.offset_minutes}분 전입니다.`;
  await sendPush(subscription, {
    title: 'GO BUS! 출발 알람',
    body,
  });
}

module.exports = {
  getVapidPublic,
  sendPush,
  sendAlarmPush,
};
