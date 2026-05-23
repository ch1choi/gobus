const {
  fetchAllITSCCTVForBBox,
  fetchDaejeonCCTV,
  expandBBox,
} = require('./api-client');
const { info, debug, summarizeCctvPool } = require('./logger');

/** CCTV 목록(위치·이름 등) 최대 보관 시간(초). 기본 15분 */
const CACHE_TTL = parseInt(process.env.CACHE_TTL, 10) || 900;
/** ITS HLS streamUrl 재발급 주기(초). 토큰 만료·재접속 403 방지. 기본 3분 */
const STREAM_URL_MAX_AGE = parseInt(process.env.STREAM_URL_MAX_AGE, 10) || 180;

/** bbox(ITS 조회 영역)별 캐시 */
const entries = new Map();

function bboxCacheKey(bboxForIts) {
  const { minX, minY, maxX, maxY } = bboxForIts;
  return [minX, minY, maxX, maxY].map((n) => Number(n).toFixed(5)).join('|');
}

function resolveBboxForIts(bbox) {
  const rawExtra = process.env.ITS_BBOX_EXTRA_PADDING;
  if (rawExtra !== undefined && String(rawExtra).trim() !== '') {
    return expandBBox(bbox, rawExtra);
  }
  return bbox;
}

function invalidateAll() {
  entries.clear();
  info('cctv-cache', '전체 무효화', {});
}

function getEntryAgeSec(entry) {
  if (!entry?.timestamp) return null;
  return Math.round((Date.now() - entry.timestamp) / 1000);
}

function isEntryFresh(entry, now = Date.now()) {
  if (!entry?.data || !entry.timestamp) return false;
  return now - entry.timestamp < CACHE_TTL * 1000;
}

function needsStreamUrlRefresh(entry, now = Date.now()) {
  if (!entry?.timestamp) return true;
  return now - entry.timestamp >= STREAM_URL_MAX_AGE * 1000;
}

async function fetchCctvPool(bboxForIts) {
  const [itsMerged, daejeonCCTVs] = await Promise.all([
    fetchAllITSCCTVForBBox(bboxForIts),
    fetchDaejeonCCTV(),
  ]);
  return [...itsMerged, ...daejeonCCTVs];
}

/**
 * @param {Object} bbox 노선 bbox
 * @param {{ forceRefresh?: boolean }} options
 */
async function getCachedOrFetchCCTVs(bbox, options = {}) {
  const { forceRefresh = false } = options;
  const now = Date.now();
  const bboxForIts = resolveBboxForIts(bbox);
  const key = bboxCacheKey(bboxForIts);
  let entry = entries.get(key);

  const mustRefresh =
    forceRefresh ||
    !isEntryFresh(entry, now) ||
    needsStreamUrlRefresh(entry, now);

  if (!mustRefresh && entry) {
    debug('cctv-cache', 'HIT', {
      key,
      ageSec: getEntryAgeSec(entry),
      streamUrlMaxAgeSec: STREAM_URL_MAX_AGE,
      count: entry.data.length,
      ...summarizeCctvPool(entry.data, 'cache'),
    });
    return {
      data: entry.data,
      cacheAge: getEntryAgeSec(entry),
      fromCache: true,
      refreshed: false,
    };
  }

  const reason = forceRefresh
    ? 'force'
    : !entry
      ? 'empty'
      : !isEntryFresh(entry, now)
        ? 'pool-ttl'
        : 'stream-url-age';

  info('cctv-cache', 'MISS — API 호출', {
    key,
    reason,
    poolTtlSec: CACHE_TTL,
    streamUrlMaxAgeSec: STREAM_URL_MAX_AGE,
  });

  const allCCTVs = await fetchCctvPool(bboxForIts);
  entry = { data: allCCTVs, timestamp: now, bboxForIts };
  entries.set(key, entry);

  info('cctv-cache', '저장', {
    key,
    total: allCCTVs.length,
    ...summarizeCctvPool(allCCTVs, 'stored'),
  });

  return {
    data: allCCTVs,
    cacheAge: 0,
    fromCache: false,
    refreshed: true,
  };
}

module.exports = {
  CACHE_TTL,
  STREAM_URL_MAX_AGE,
  invalidateAll,
  getCachedOrFetchCCTVs,
  resolveBboxForIts,
};
