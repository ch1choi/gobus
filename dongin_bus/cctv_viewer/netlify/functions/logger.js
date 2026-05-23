/**
 * 구조화된 서버 로그 — docker logs / journal에서 JSON 파싱·필터링 용이
 * LOG_LEVEL: debug | info | warn | error (기본 info)
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel() {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[raw] ?? LEVELS.info;
}

function shouldLog(level) {
  return LEVELS[level] >= currentLevel();
}

function emit(level, tag, message, meta) {
  if (!shouldLog(level)) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    tag,
    message,
  };
  if (meta !== undefined && meta !== null) {
    entry.meta = meta;
  }
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function debug(tag, message, meta) {
  emit('debug', tag, message, meta);
}

function info(tag, message, meta) {
  emit('info', tag, message, meta);
}

function warn(tag, message, meta) {
  emit('warn', tag, message, meta);
}

function error(tag, message, meta) {
  emit('error', tag, message, meta);
}

/** URL·키 등 민감/장문 필드 축약 */
function redactUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const s = url.trim();
  if (s.length <= 80) return s;
  return `${s.slice(0, 48)}…${s.slice(-20)} (len=${s.length})`;
}

function summarizeCctvPool(cctvs, label) {
  const list = Array.isArray(cctvs) ? cctvs : [];
  const bySource = {};
  let withUrl = 0;
  let withoutUrl = 0;
  const noUrlSamples = [];

  for (const c of list) {
    const src = c.source || 'unknown';
    if (!bySource[src]) bySource[src] = { total: 0, withUrl: 0, withoutUrl: 0 };
    bySource[src].total += 1;
    const has = !!(c.streamUrl && String(c.streamUrl).trim());
    if (has) {
      withUrl += 1;
      bySource[src].withUrl += 1;
    } else {
      withoutUrl += 1;
      bySource[src].withoutUrl += 1;
      if (noUrlSamples.length < 5) {
        noUrlSamples.push({
          name: c.name,
          source: src,
          lat: c.lat,
          lng: c.lng,
        });
      }
    }
  }

  return {
    label,
    total: list.length,
    withUrl,
    withoutUrl,
    bySource,
    noUrlSamples,
  };
}

function summarizeMatched(matched, routeNo) {
  const list = Array.isArray(matched) ? matched : [];
  const playable = list.filter(
    (c) => c.streamUrl && /^https?:\/\//i.test(String(c.streamUrl).trim())
  );
  const noStream = list.filter(
    (c) => !c.streamUrl || !String(c.streamUrl).trim()
  );

  return {
    route: routeNo,
    matchedTotal: list.length,
    playableCount: playable.length,
    noStreamCount: noStream.length,
    bySource: list.reduce((acc, c) => {
      const src = c.source || 'unknown';
      if (!acc[src]) acc[src] = { total: 0, playable: 0, noStream: 0 };
      acc[src].total += 1;
      if (c.streamUrl && String(c.streamUrl).trim()) acc[src].playable += 1;
      else acc[src].noStream += 1;
      return acc;
    }, {}),
    noStreamItems: noStream.slice(0, 10).map((c) => ({
      name: c.name,
      source: c.source,
      nearestStop: c.nearestStop,
      distance: c.distance,
      format: c.format,
    })),
    playableItems: playable.slice(0, 5).map((c) => ({
      name: c.name,
      source: c.source,
      streamUrlPreview: redactUrl(c.streamUrl),
      format: c.format,
    })),
  };
}

module.exports = {
  debug,
  info,
  warn,
  error,
  redactUrl,
  summarizeCctvPool,
  summarizeMatched,
};
