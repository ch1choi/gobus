/**
 * CCTV 진단 API — 영상 미표시 근본 원인 파악용
 * GET /api/cctv-diagnostics?route=501
 */
const fs = require('fs');
const path = require('path');
const {
  fetchAllITSCCTVForBBox,
  fetchDaejeonCCTV,
  calculateBBox,
  expandBBox,
} = require('./api-client');
const {
  getAllStopsForRoute,
  matchCCTVsToStops,
} = require('./utils');
const {
  info,
  summarizeCctvPool,
  summarizeMatched,
} = require('./logger');

function routesJsonPath() {
  return path.join(__dirname, '../../data/routes.json');
}

function loadRoutesData() {
  const raw = fs.readFileSync(routesJsonPath(), 'utf8');
  return JSON.parse(raw);
}

function envStatus() {
  const itsKey = process.env.ITS_API_KEY;
  const daejeonKey = process.env.DAEJEON_API_KEY;
  return {
    ITS_API_KEY: itsKey ? `set(len=${itsKey.length})` : 'MISSING',
    DAEJEON_API_KEY: daejeonKey ? `set(len=${daejeonKey.length})` : 'MISSING',
    ITS_CCTV_TYPE: process.env.ITS_CCTV_TYPE ?? '4(default)',
    CACHE_TTL: process.env.CACHE_TTL ?? '900(default)',
    STREAM_URL_MAX_AGE: process.env.STREAM_URL_MAX_AGE ?? '180(default)',
    MAX_DISTANCE: process.env.MAX_DISTANCE ?? '500(default)',
    PLAYABLE_ONLY: process.env.PLAYABLE_ONLY ?? 'unset',
    ITS_BBOX_EXTRA_PADDING: process.env.ITS_BBOX_EXTRA_PADDING ?? 'unset',
    LOG_LEVEL: process.env.LOG_LEVEL ?? 'info(default)',
    NODE_ENV: process.env.NODE_ENV ?? 'unset',
  };
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const routeNo = event.queryStringParameters?.route || '501';
    const routesData = loadRoutesData();

    if (!routesData[routeNo]) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `노선 ${routeNo} 없음` }),
      };
    }

    const stops = getAllStopsForRoute(routesData, routeNo);
    const bbox = calculateBBox(stops, 0.02);
    const rawExtra = process.env.ITS_BBOX_EXTRA_PADDING;
    const bboxForIts =
      rawExtra !== undefined && String(rawExtra).trim() !== ''
        ? expandBBox(bbox, rawExtra)
        : bbox;

    info('cctv-diagnostics', '진단 시작', { route: routeNo, stops: stops.length, bbox, bboxForIts });

    const [itsMerged, daejeonCCTVs] = await Promise.all([
      fetchAllITSCCTVForBBox(bboxForIts),
      fetchDaejeonCCTV(),
    ]);

    const allCCTVs = [...itsMerged, ...daejeonCCTVs];
    const matched = matchCCTVsToStops(
      allCCTVs,
      stops,
      parseInt(process.env.MAX_DISTANCE, 10) || 500
    );

    const poolSummary = summarizeCctvPool(allCCTVs, 'all-apis');
    const itsSummary = summarizeCctvPool(itsMerged, 'its-only');
    const daejeonSummary = summarizeCctvPool(daejeonCCTVs, 'daejeon-only');
    const matchSummary = summarizeMatched(matched, routeNo);

    // 대전 API 샘플 — 스트림 URL 필드 유무 확인
    const daejeonSampleKeys =
      daejeonCCTVs.length > 0
        ? Object.keys(
            daejeonCCTVs[0].rawKeys ||
              {}
          )
        : [];
    const daejeonRawSample = daejeonCCTVs.slice(0, 2).map((c) => ({
      name: c.name,
      hasStreamUrl: !!c.streamUrl,
      rawFieldKeys: c.rawKeys,
    }));

    const body = {
      timestamp: new Date().toISOString(),
      route: routeNo,
      env: envStatus(),
      bbox,
      bboxForIts,
      stopsCount: stops.length,
      apiCounts: {
        its: itsMerged.length,
        daejeon: daejeonCCTVs.length,
        total: allCCTVs.length,
      },
      poolSummary,
      itsSummary,
      daejeonSummary,
      matchSummary,
      daejeonSampleKeys,
      daejeonRawSample,
      hints: buildHints(poolSummary, matchSummary, envStatus()),
    };

    info('cctv-diagnostics', '진단 완료', {
      route: routeNo,
      matched: matchSummary.matchedTotal,
      playable: matchSummary.playableCount,
      noStream: matchSummary.noStreamCount,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(body, null, 2),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: err.message,
        env: envStatus(),
      }),
    };
  }
};

function buildHints(pool, match, env) {
  const hints = [];

  if (env.ITS_API_KEY === 'MISSING') {
    hints.push('ITS_API_KEY 미설정 → ITS(국도/고속) CCTV 조회 불가');
  }
  if (env.DAEJEON_API_KEY === 'MISSING') {
    hints.push('DAEJEON_API_KEY 미설정 → 대전시 CCTV 조회 불가');
  }
  if (match.noStreamCount > 0 && match.bySource?.Daejeon?.noStream > 0) {
    hints.push(
      '대전 공공데이터 API 응답에 스트림 URL 필드가 없을 수 있음 → daejeonRawSample의 rawFieldKeys 확인'
    );
  }
  if (pool.bySource?.ITS && pool.bySource.ITS.withoutUrl > 0) {
    hints.push(
      'ITS CCTV 중 streamUrl 없음 → cctvType/ bbox / API 키·만료 확인 (ITS_CCTV_TYPE=4 권장)'
    );
  }
  if (match.playableCount === 0 && match.matchedTotal > 0) {
    hints.push(
      '매칭된 CCTV는 있으나 재생 URL 없음 → PLAYABLE_ONLY=1 이면 화면에 0개 표시'
    );
  }
  if (match.playableCount > 0) {
    hints.push(
      'streamUrl은 있으나 재생 실패 시 → 브라우저 콘솔 [CCTV-HLS] 로그, CORS/혼합콘텐츠/스트림 만료 확인'
    );
  }

  return hints;
}
