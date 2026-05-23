/**
 * 거리 계산 유틸리티
 * Haversine 공식을 사용하여 두 좌표 간 거리(미터) 계산
 */
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371e3; // 지구 반경 (미터)
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c); // 미터 단위, 반올림
}

/**
 * 배열 정규화 헬퍼
 * 공공 API가 단일 항목일 때 객체로 반환하는 경우 대응
 */
function normalizeArray(data) {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

/**
 * CCTV와 정류장 매칭
 */
function matchCCTVsToStops(cctvs, stops, maxDistance = 500) {
  const matched = [];
  const seen = new Set();

  stops.forEach((stop) => {
    cctvs.forEach((cctv) => {
      const distance = getDistance(stop.lat, stop.lng, cctv.lat, cctv.lng);

      if (distance <= maxDistance) {
        // 중복 제거 (같은 CCTV가 여러 정류장에 매칭될 수 있음)
        const key = `${cctv.name}-${cctv.lat}-${cctv.lng}`;
        if (!seen.has(key)) {
          seen.add(key);
          matched.push({
            ...cctv,
            nearestStop: stop.name,
            stopSid: stop.sid,
            distance,
          });
        }
      }
    });
  });

  // 1) 영상 URL 있는 CCTV 우선, 2) 거리 가까운 순
  return matched.sort((a, b) => {
    const ua = a.streamUrl ? 0 : 1;
    const ub = b.streamUrl ? 0 : 1;
    if (ua !== ub) return ua - ub;
    return a.distance - b.distance;
  });
}

/**
 * 노선의 전체 정류장 목록 가져오기 (상행+하행 합침)
 */
function getAllStopsForRoute(routeData, routeNo) {
  const route = routeData[routeNo];
  if (!route) return [];

  const allStops = [];
  if (route.up) allStops.push(...route.up);
  if (route.down) allStops.push(...route.down);

  // 중복 제거 (sid 기준)
  const uniqueStops = [];
  const seen = new Set();
  allStops.forEach((stop) => {
    if (!seen.has(stop.sid)) {
      seen.add(stop.sid);
      uniqueStops.push(stop);
    }
  });

  return uniqueStops;
}

module.exports = {
  getDistance,
  normalizeArray,
  matchCCTVsToStops,
  getAllStopsForRoute,
};
