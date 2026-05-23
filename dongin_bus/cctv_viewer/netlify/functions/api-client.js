const axios = require('axios');
const { normalizeArray } = require('./utils');
const { debug, info, warn, error, redactUrl, summarizeCctvPool } = require('./logger');

/**
 * ITS 국가교통정보센터 CCTV API
 * 공개 안내: https://www.its.go.kr/opendata/opendataList?service=cctv
 * 엔드포인트: https://openapi.its.go.kr:9443/cctvInfo
 *
 * @param {Object} bbox - { minX, maxX, minY, maxY }
 * @param {'its'|'ex'} roadType - its=국도, ex=고속도로 (도심 노선은 둘 다 조회하면 스트림 확보에 유리)
 */
async function fetchITSCCTV(bbox, roadType = 'its') {
  const apiKey = process.env.ITS_API_KEY;
  if (!apiKey) {
    throw new Error('ITS_API_KEY not configured');
  }

  const url = 'https://openapi.its.go.kr:9443/cctvInfo';

  // HTTPS 사이트에서 http 스트림은 브라우저 혼합 콘텐츠로 차단됨 → 공개 안내 cctvType 4(HTTPS HLS) 기본값
  const cctvType = (() => {
    const raw = process.env.ITS_CCTV_TYPE;
    if (raw === undefined || raw === '') return 4;
    const n = parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : 4;
  })();

  debug('its-api', '요청', { roadType, cctvType, bbox, url });

  try {
    const response = await axios.get(url, {
      params: {
        apiKey,
        type: roadType,
        cctvType,
        getType: 'json',
        ...bbox,
      },
      timeout: 8000,
    });

    const root = response.data?.response;
    const data = root?.data;
    if (!data) {
      warn('its-api', '응답 data 없음', {
        roadType,
        cctvType,
        status: response.status,
        datacount: root?.datacount,
        coordtype: root?.coordtype,
        topKeys: response.data ? Object.keys(response.data) : [],
        responseKeys: root ? Object.keys(root) : [],
      });
      return [];
    }

    const cctvList = normalizeArray(data);
    const mapped = cctvList.map((cctv) => {
      const streamUrl = cctv.cctvurl;
      const item = {
        name: (cctv.cctvname || '이름 없음').replace(/;+$/, '').trim(),
        lat: parseFloat(String(cctv.coordy).replace(/;+$/, '')),
        lng: parseFloat(String(cctv.coordx).replace(/;+$/, '')),
        streamUrl,
        format: cctv.cctvformat || 'HLS',
        source: 'ITS',
        type: roadType,
      };
      if (!streamUrl || !String(streamUrl).trim()) {
        debug('its-api', 'cctvurl 없음', {
          roadType,
          name: item.name,
          cctvformat: cctv.cctvformat,
          rawKeys: Object.keys(cctv),
        });
      } else if (/^http:\/\//i.test(String(streamUrl))) {
        warn('its-api', 'HTTP 스트림 URL (HTTPS 사이트에서 차단 가능)', {
          roadType,
          name: item.name,
          streamUrlPreview: redactUrl(streamUrl),
        });
      }
      return item;
    });

    const summary = summarizeCctvPool(mapped, `ITS-${roadType}`);
    info('its-api', '조회 완료', { roadType, cctvType, ...summary });

    return mapped;
  } catch (err) {
    const meta = {
      roadType,
      cctvType,
      bbox,
      message: err.message,
      code: err.code,
    };
    if (err.response) {
      meta.httpStatus = err.response.status;
      meta.responseSnippet =
        typeof err.response.data === 'string'
          ? err.response.data.slice(0, 300)
          : JSON.stringify(err.response.data)?.slice(0, 300);
    }
    error('its-api', 'API 호출 실패', meta);
    return [];
  }
}

/** 국도+고속도로 병렬 조회 후 URL·좌표 기준 중복 제거 */
function dedupeItCctvs(items) {
  const seen = new Set();
  const out = [];
  for (const c of items) {
    const urlKey = c.streamUrl && String(c.streamUrl).trim() ? String(c.streamUrl).trim() : '';
    const k = urlKey || `${c.lat}|${c.lng}|${c.name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/**
 * bbox 내 ITS CCTV (국도·고속도로) 통합 — 스트림 URL 확보율 향상
 */
async function fetchAllITSCCTVForBBox(bbox) {
  const [itsList, exList] = await Promise.all([
    fetchITSCCTV(bbox, 'its'),
    fetchITSCCTV(bbox, 'ex'),
  ]);
  const merged = dedupeItCctvs([...itsList, ...exList]);
  info('its-api', '국도+고속 병합', {
    its: itsList.length,
    ex: exList.length,
    merged: merged.length,
    ...summarizeCctvPool(merged, 'ITS-merged'),
  });
  return merged;
}

/**
 * 노선 bbox보다 살짝 넓게 ITS를 조회해 국도 CCTV가 노선 근처에 있지만 bbox 밖이었을 때 포함되도록 한다.
 */
function expandBBox(bbox, extraDegrees) {
  const e = parseFloat(extraDegrees);
  if (!bbox || !Number.isFinite(e) || e <= 0) return bbox;
  return {
    minX: bbox.minX - e,
    maxX: bbox.maxX + e,
    minY: bbox.minY - e,
    maxY: bbox.maxY + e,
  };
}

/** 공공데이터 응답 키가 버전별로 달라질 수 있어, 브라우저에서 바로 재생 가능한 HTTPS(또는 http) 스트림 URL 후보만 고른다. */
function pickDaejeonStreamUrl(item) {
  if (!item || typeof item !== 'object') return { url: undefined, matchedKey: null };
  const knownKeys = [
    'strmAddr',
    'strm_url',
    'cctvUrl',
    'cctvurl',
    'streamUrl',
    'videoUrl',
    'hlsAddr',
    'm3u8Addr',
    'liveUrl',
  ];
  for (const k of knownKeys) {
    const v = item[k];
    if (typeof v === 'string') {
      const s = v.trim();
      if (/^https?:\/\/\S+/i.test(s) && !/\.(jpe?g|png)(\?|$)/i.test(s)) {
        return { url: s, matchedKey: k };
      }
    }
  }
  for (const [k, v] of Object.entries(item)) {
    if (typeof v !== 'string') continue;
    const s = v.trim();
    if (!/^https?:\/\/\S+/i.test(s)) continue;
    if (/\.(jpe?g|png)(\?|$)/i.test(s)) continue;
    if (/(stream|cctv|video|strm|hls|m3u8|vod|live)/i.test(k)) {
      return { url: s, matchedKey: k };
    }
    if (/\.m3u8(\?|$)/i.test(s)) return { url: s, matchedKey: k };
  }
  return { url: undefined, matchedKey: null };
}

/**
 * 대전시 교통 CCTV 목록 조회 (응답에 스트림 필드가 있으면 매핑)
 */
async function fetchDaejeonCCTV() {
  const apiKey = process.env.DAEJEON_API_KEY;
  if (!apiKey) {
    throw new Error('DAEJEON_API_KEY not configured');
  }

  const url =
    'https://apis.data.go.kr/6300000/openapi2022/trafficCCTV/gettrafficCCTV';

  debug('daejeon-api', '요청', { url, pageNo: 1, numOfRows: 500 });

  try {
    const response = await axios.get(url, {
      params: {
        serviceKey: apiKey,
        pageNo: 1,
        numOfRows: 500,
        _type: 'json',
      },
      timeout: 8000,
    });

    const result = response.data?.response;
    if (!result || result.header?.resultCode !== 'C00') {
      warn('daejeon-api', '비정상 응답', {
        resultCode: result?.header?.resultCode,
        resultMsg: result?.header?.resultMsg,
        httpStatus: response.status,
      });
      return [];
    }

    const items = normalizeArray(result.body?.items);
    let streamKeyHits = {};
    let noStreamSamples = [];

    const mapped = items.map((cctv) => {
      const { url: streamUrl, matchedKey } = pickDaejeonStreamUrl(cctv);
      const rawKeys = Object.keys(cctv);
      if (matchedKey) {
        streamKeyHits[matchedKey] = (streamKeyHits[matchedKey] || 0) + 1;
      } else if (noStreamSamples.length < 5) {
        noStreamSamples.push({
          name: cctv.manageNo || cctv.cctvNm,
          rawKeys,
          stringFields: rawKeys
            .filter((k) => typeof cctv[k] === 'string')
            .map((k) => ({
              key: k,
              preview: String(cctv[k]).slice(0, 80),
            })),
        });
      }
      return {
        name: cctv.manageNo || cctv.cctvNm || '이름 없음',
        lat: parseFloat(cctv.crdntY),
        lng: parseFloat(cctv.crdntX),
        address: cctv.lnmAdres || cctv.rdnmadr,
        source: 'Daejeon',
        type: 'daejeon',
        rawKeys,
        streamMatchedKey: matchedKey,
        ...(streamUrl ? { streamUrl, format: 'HLS' } : {}),
      };
    });

    const summary = summarizeCctvPool(mapped, 'Daejeon');
    info('daejeon-api', '조회 완료', {
      itemCount: items.length,
      streamKeyHits,
      noStreamSamples,
      ...summary,
    });

    return mapped;
  } catch (err) {
    const meta = { message: err.message, code: err.code };
    if (err.response) {
      meta.httpStatus = err.response.status;
      meta.responseSnippet =
        typeof err.response.data === 'string'
          ? err.response.data.slice(0, 300)
          : JSON.stringify(err.response.data)?.slice(0, 300);
    }
    error('daejeon-api', 'API 호출 실패', meta);
    return [];
  }
}

/**
 * 정류장 목록에서 Bounding Box 계산
 */
function calculateBBox(stops, padding = 0.02) {
  if (!stops || stops.length === 0) {
    // 대전 전역 기본값
    return {
      minX: 127.3,
      maxX: 127.5,
      minY: 36.2,
      maxY: 36.4,
    };
  }

  const lats = stops.map((s) => s.lat);
  const lngs = stops.map((s) => s.lng);

  return {
    minX: Math.min(...lngs) - padding,
    maxX: Math.max(...lngs) + padding,
    minY: Math.min(...lats) - padding,
    maxY: Math.max(...lats) + padding,
  };
}

module.exports = {
  fetchITSCCTV,
  fetchAllITSCCTVForBBox,
  fetchDaejeonCCTV,
  calculateBBox,
  expandBBox,
};
