const fs = require('fs');
const path = require('path');
const { calculateBBox } = require('./api-client');
const {
  getAllStopsForRoute,
  matchCCTVsToStops,
} = require('./utils');
const {
  info,
  warn,
  summarizeCctvPool,
  summarizeMatched,
} = require('./logger');
const {
  invalidateAll,
  getCachedOrFetchCCTVs,
  STREAM_URL_MAX_AGE,
  CACHE_TTL,
} = require('./cctv-cache');

/** admin 업로드로 routes.json 이 바뀌면 require 캐시가 아니라 디스크 기준으로 다시 읽기 */
let routesJsonSig = null;

function routesJsonPath() {
  return path.join(__dirname, '../../data/routes.json');
}

function loadRoutesData() {
  const p = routesJsonPath();
  const stat = fs.statSync(p);
  const sig = `${stat.mtimeMs}:${stat.size}`;
  if (sig !== routesJsonSig) {
    routesJsonSig = sig;
    invalidateAll();
    console.log('[cctv-route] routes.json 변경 감지 → CCTV API 메모리 캐시 초기화');
  }
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

const MAX_DISTANCE = parseInt(process.env.MAX_DISTANCE) || 500; // 500m

function wantsForceRefresh(query) {
  const v = query?.refresh;
  return v === '1' || v === 'true' || v === 'yes';
}

/** 재생 스트림 URL이 있는 장비만 API 응답에 포함 (메타만 있는 카드 숨김). 미설정 시 기존과 동일하게 전체 반환 */
function playableOnlyEnabled() {
  const v = process.env.PLAYABLE_ONLY;
  if (v === undefined || v === '') return false;
  return v === '1' || /^true$/i.test(v) || /^yes$/i.test(v);
}

function hasPlayableStreamUrl(c) {
  const u = c.streamUrl && String(c.streamUrl).trim();
  return !!(u && /^https?:\/\//i.test(u));
}

/** 클라이언트 응답 — 내부 진단 필드 제거, URL은 유지 */
function sanitizeCctvForClient(c) {
  const { rawKeys, streamMatchedKey, ...rest } = c;
  return rest;
}

/**
 * Netlify Function: 노선별 CCTV 조회
 * GET /.netlify/functions/cctv-route?route=108
 */
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  // OPTIONS 요청 (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const routeNo = event.queryStringParameters?.route;
    const debugMode =
      event.queryStringParameters?.debug === '1' ||
      event.queryStringParameters?.debug === 'true';

    if (!routeNo) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'route 파라미터가 필요합니다.' }),
      };
    }

    // routes.json — 디스크 기준 로드(admin 업로드 반영, Node require 캐시 없음)
    const routesData = loadRoutesData();

    if (!routesData[routeNo]) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `노선 ${routeNo}를 찾을 수 없습니다.` }),
      };
    }

    // 노선의 전체 정류장 목록 (상행+하행 합침)
    const stops = getAllStopsForRoute(routesData, routeNo);

    if (stops.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          route: routeNo,
          cctvCount: 0,
          data: [],
          message: '정류장 데이터가 없습니다.',
        }),
      };
    }

    // Bounding Box 계산
    const bbox = calculateBBox(stops, 0.02);
    info('cctv-route', '노선 조회 시작', {
      route: routeNo,
      stops: stops.length,
      bbox,
      maxDistance: MAX_DISTANCE,
      playableOnly: playableOnlyEnabled(),
    });

    const forceRefresh = wantsForceRefresh(event.queryStringParameters);

    // CCTV 데이터 조회 (캐시 or API). refresh=1 이면 ITS에서 streamUrl 재발급
    const { data: allCCTVs, cacheAge, refreshed } = await getCachedOrFetchCCTVs(bbox, {
      forceRefresh,
    });

    // 정류장 반경 내 CCTV 매칭
    const matched = matchCCTVsToStops(allCCTVs, stops, MAX_DISTANCE);
    const matchStats = summarizeMatched(matched, routeNo);
    info('cctv-route', '매칭 결과', matchStats);

    if (matchStats.noStreamCount > 0) {
      warn('cctv-route', '스트림 URL 없는 매칭 CCTV', {
        route: routeNo,
        count: matchStats.noStreamCount,
        items: matchStats.noStreamItems,
      });
    }

    const playableOnly = playableOnlyEnabled();
    const data = playableOnly ? matched.filter(hasPlayableStreamUrl) : matched;
    if (playableOnly && matched.length > data.length) {
      warn('cctv-route', 'PLAYABLE_ONLY로 제외됨', {
        route: routeNo,
        dropped: matched.length - data.length,
        kept: data.length,
      });
    }

    const responseBody = {
      route: routeNo,
      cctvCount: data.length,
      bbox,
      playableOnly,
      cacheAge,
      streamUrlMaxAge: STREAM_URL_MAX_AGE,
      poolCacheTtl: CACHE_TTL,
      refreshed,
      ...(playableOnly && matched.length > 0 && data.length === 0
        ? {
            hint:
              '반경 안에 CCTV 정보는 있으나 스트림 URL이 없습니다. ITS 영상을 넓히려면 ITS_BBOX_EXTRA_PADDING 또는 MAX_DISTANCE를 조정하고, HTTPS 배포에서는 ITS_CCTV_TYPE=4를 확인하세요.',
          }
        : {}),
      data: data.map(sanitizeCctvForClient),
    };

    if (debugMode) {
      responseBody._debug = {
        poolSummary: summarizeCctvPool(allCCTVs, 'cached-pool'),
        matchSummary: matchStats,
        diagnosticsUrl: `/api/cctv-diagnostics?route=${routeNo}`,
      };
    }

    info('cctv-route', '응답', {
      route: routeNo,
      cctvCount: data.length,
      playableInResponse: data.filter(hasPlayableStreamUrl).length,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(responseBody),
    };
  } catch (error) {
    console.error('[cctv-route Error]', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
      }),
    };
  }
};
