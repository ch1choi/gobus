/**
 * Netlify Function: CCTV 캐시 갱신 (관리자/Cron용)
 * GET /api/cctv-refresh
 */
const { invalidateAll, getCachedOrFetchCCTVs } = require('./cctv-cache');

/** 대전 전역 — cron/수동 갱신 시 ITS·대전 풀 선(先)적재 */
const WARM_BBOX = {
  minX: 127.3,
  maxX: 127.5,
  minY: 36.2,
  maxY: 36.4,
};

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
  };

  try {
    invalidateAll();

    const { data, cacheAge } = await getCachedOrFetchCCTVs(WARM_BBOX, {
      forceRefresh: true,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        cacheAge,
        counts: {
          its: data.filter((c) => c.source === 'ITS').length,
          daejeon: data.filter((c) => c.source === 'Daejeon').length,
          total: data.length,
        },
        message: 'CCTV 캐시를 갱신했습니다.',
      }),
    };
  } catch (error) {
    console.error('[cctv-refresh Error]', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
};
