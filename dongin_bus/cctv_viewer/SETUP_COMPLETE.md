# cctv_viewer 프로젝트 구성 완료

## 📁 생성된 파일 구조

```
cctv_viewer/
├── index.html                    ✅ 클라이언트 (Functions 호출)
├── package.json                  ✅ 의존성 (axios, netlify-cli)
├── netlify.toml                  ✅ Netlify 설정
├── .env                          ✅ 환경 변수 (ITS/대전 API 키)
├── .env.example                  ✅ 환경 변수 템플릿
├── .gitignore                    ✅
├── README.md                     ✅ 사용법 문서
├── data/
│   └── routes.json               ✅ 정류장 데이터 (4개 노선)
├── netlify/functions/
│   ├── cctv-route.js             ✅ 노선별 CCTV 조회 API
│   ├── cctv-refresh.js           ✅ 캐시 갱신 API
│   ├── api-client.js             ✅ ITS/대전 API 클라이언트
│   └── utils.js                  ✅ 거리 계산 유틸리티
└── scripts/
    └── extract-routes.js         ✅ 정류장 데이터 추출 스크립트
```

## ✅ 테스트 결과

### 1. npm 설치
```
✅ axios@1.6.8 설치 완료
✅ netlify-cli@17.23.0 설치 완료
```

### 2. routes.json 생성
```
✅ 108번: 상행 46개, 하행 43개 정류장
✅ 501번: 상행 58개, 하행 58개 정류장
✅ 511번: 상행 37개, 하행 33개 정류장
✅ 513번: 상행 41개, 하행 40개 정류장
```

### 3. API 테스트 (108번 노선)
```
✅ 13개 CCTV 매칭 성공
✅ 거리순 정렬 (122m ~ 472m)
✅ 캐시 정상 작동 (1초 경과)
✅ 정류장 매핑: "남선공원네거리", "선화동천주교회" 등
```

### 4. 로컬 서버
```
✅ http://localhost:8888 구동 중
✅ Functions 로드 완료 (cctv-route, cctv-refresh)
```

## 🚀 사용법

### 로컬 개발
```bash
cd /Volumes/UnitySSD/project/goCat/scripts/dongin_bus/cctv_viewer
npm run dev
# → http://localhost:8888 접속
```

### 노선 CCTV 조회
- 브라우저: http://localhost:8888
- API 직접: http://localhost:8888/api/cctv-route?route=108

### 캐시 갱신
```bash
curl http://localhost:8888/api/cctv-refresh
```

### 정류장 데이터 재추출
```bash
npm run extract-routes
```

## 📊 주요 기능

### 1. 거리 기반 매칭
- 각 정류장 반경 500m 내 CCTV 검색
- Haversine 공식 사용
- 거리순 자동 정렬

### 2. 다중 소스 통합
- **ITS API**: HLS 스트리밍 URL 제공
- **대전시 API**: 위치 메타데이터 (63개소)

### 3. 캐시 전략
- 메모리 캐시 (기본 1시간)
- 병렬 API 호출 최적화
- 수동 갱신 엔드포인트

### 4. 응답 예시
```json
{
  "route": "108",
  "cctvCount": 13,
  "bbox": {
    "minX": 127.325,
    "maxX": 127.499,
    "minY": 36.247,
    "maxY": 36.389
  },
  "data": [
    {
      "name": "3.(교통 96) 남선공원네거리",
      "lat": 36.344828,
      "lng": 127.401855,
      "nearestStop": "남선공원네거리",
      "distance": 122
    }
  ]
}
```

## ⚠️ 주의사항

### 1. ITS API 응답
- 대전 시내는 대부분 **대전시 API** 데이터
- ITS는 국도/고속도로 중심
- 대전시 API는 **스트림 URL 없음** (위치만 제공)

### 2. 영상 재생
- 현재 구성으로는 **스트림 없음** (대전 API만 응답)
- 영상 재생하려면:
  1. ITS API bbox 확장
  2. 또는 별도 CCTV 스트림 API 필요

### 3. 환경 변수
```bash
# .env 파일 필수
ITS_API_KEY=your_its_api_key_here
DAEJEON_API_KEY=your_daejeon_api_key_here
```

## 🔧 다음 단계

### Phase 1: Netlify 배포
```bash
netlify login
netlify init
netlify env:set ITS_API_KEY "your_key"
netlify env:set DAEJEON_API_KEY "your_key"
netlify deploy --prod
```

### Phase 2: 개선 사항
- [ ] Netlify Blobs로 영구 캐시
- [ ] Scheduled Functions (매시 자동 갱신)
- [ ] 지도 뷰 (Leaflet.js)
- [ ] CCTV 건강 체크 (스트림 가용성)
- [ ] 대전 외 지역 ITS CCTV 추가

### Phase 3: 통합
- [ ] index.html과 링크 연동 (`?route=108`)
- [ ] 공통 헤더/푸터
- [ ] 정류장별 CCTV 보기 (환승 정보에 추가)

## 📝 테스트 명령어

```bash
# 108번 CCTV 조회
curl "http://localhost:8888/api/cctv-route?route=108"

# 501번 CCTV 조회
curl "http://localhost:8888/api/cctv-route?route=501"

# 캐시 갱신
curl "http://localhost:8888/api/cctv-refresh"

# 로컬 서버 중지
pkill -f "netlify dev"
```

## 🎉 구성 완료!

모든 파일이 정상 생성되었고, API가 정상 작동합니다.
브라우저에서 http://localhost:8888 을 열어서 확인해보세요!
