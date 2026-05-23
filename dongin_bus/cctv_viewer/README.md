# 대전 버스 노선별 CCTV 뷰어

동인여객 버스 노선의 실시간 CCTV 영상을 제공하는 웹 애플리케이션입니다.

## 기능

- **노선별 CCTV 조회**: 108, 501, 511, 513번 노선별 정류장 근처 CCTV 목록
- **거리 기반 매칭**: 정류장 반경 500m 내 CCTV 자동 검색
- **실시간 스트리밍**: HLS.js를 통한 영상 재생
- **다중 소스**: ITS 국가교통정보센터 + 대전시 공공데이터 통합
- **설정 가능**: 재생 가능(스트림 URL 포함) 장비만 반환(`PLAYABLE_ONLY`), ITS 조회 bbox 추가 확장(`ITS_BBOX_EXTRA_PADDING`)

## 기술 스택

- **Frontend**: Vanilla JS + HLS.js
- **Backend**: Netlify Functions (서버리스)
- **APIs**:
  - [ITS 국가교통정보센터 CCTV](https://www.its.go.kr/opendata/opendataList?service=cctv) — `cctvInfo` (국도 `its`·고속도로 `ex`, HLS)
  - 대전시 교통 CCTV API — 기본적으로는 위치·관리번호 위주이나, 응답에 HTTPS 스트림 필드가 있으면 매핑해 재생 가능

## ITS CCTV 연동 참고

- 공개 서비스·신청: [ITS 교통정보 / CCTV](https://www.its.go.kr/opendata/opendataList?service=cctv)
- 앱에서는 bbox 기준으로 **국도·고속도로** API를 각각 호출해 HLS 목록을 넓힌 뒤 정류장과 매칭합니다.
- `cctvType`: 실시간 스트리밍 HLS(1), 동영상(2), … HTTPS가 필요하면 공식 문서의 **4·5** 유형 검토(혼합 콘텐츠 시 브라우저 차단 가능).

## 영상 재생 오류 (HTTPS 사이트)

- 페이지가 **HTTPS**인데 ITS 스트림 URL이 **`http://`** 이면 브라우저 **혼합 콘텐츠**로 m3u8·세그먼트 요청이 막혀 HLS 오류가 납니다.
- 서버에서 **`ITS_CCTV_TYPE=4`**(HTTPS HLS, [ITS 안내](https://www.its.go.kr/opendata/opendataList?service=cctv))를 사용하면 `https` URL을 받는 경우가 많습니다. 코드 기본값도 **4**입니다.
- 배포 후에도 개별 카메라만 실패하면 **현지 스트림 장애** 또는 **CORS** 가능성이 있습니다.

## 로컬 개발

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 설정

`.env.example`을 `.env`로 복사하고 API 키 입력:

```bash
cp .env.example .env
```

`.env` 내용:
```
ITS_API_KEY=your_its_api_key
DAEJEON_API_KEY=your_daejeon_api_key
CACHE_TTL=3600
MAX_DISTANCE=500
# 선택: 재생 가능 URL이 있는 장비만 표시 (1 권장)
PLAYABLE_ONLY=1
# 선택: 노선 bbox 대비 ITS 조회 영역 추가 확장(도 단위). 국도 CCTV가 많이 들어오게 함
ITS_BBOX_EXTRA_PADDING=0.02
```

### 3. 개발 서버 실행

```bash
npm run dev
```

`http://localhost:8888`에서 접속

## 배포 (Netlify)

### 1. Netlify CLI 설치 (전역)

```bash
npm install -g netlify-cli
```

### 2. Netlify 로그인

```bash
netlify login
```

### 3. 사이트 초기화

```bash
netlify init
```

### 4. 환경 변수 설정

Netlify 대시보드 → Site settings → Environment variables 에서 추가:

- `ITS_API_KEY`
- `DAEJEON_API_KEY`
- `CACHE_TTL`
- `MAX_DISTANCE`

또는 CLI로:

```bash
netlify env:set ITS_API_KEY "your_key"
netlify env:set DAEJEON_API_KEY "your_key"
```

### 5. 배포

```bash
netlify deploy --prod
```

## API 엔드포인트

### GET `/api/cctv-route`

노선별 CCTV 목록 조회

**Parameters:**
- `route` (required): 노선 번호 (108, 501, 511, 513)

**Response:**
```json
{
  "route": "108",
  "cctvCount": 12,
  "data": [
    {
      "name": "[국도 4호선] 대전 비룡삼거리",
      "lat": 36.33013,
      "lng": 127.47449,
      "streamUrl": "http://...",
      "format": "HLS",
      "source": "ITS",
      "nearestStop": "대성삼거리",
      "distance": 280
    }
  ]
}
```

### GET `/api/cctv-refresh`

CCTV 캐시 강제 갱신 (관리자용)

## 디렉토리 구조

```
cctv_viewer/
├── index.html              # 클라이언트 앱
├── netlify.toml            # Netlify 설정
├── package.json
├── .env                    # 환경 변수 (gitignore)
├── .env.example            # 환경 변수 템플릿
├── data/
│   └── routes.json         # 정류장 데이터
├── netlify/
│   └── functions/
│       ├── cctv-route.js   # 노선별 CCTV 조회 API
│       ├── cctv-refresh.js # 캐시 갱신 API
│       ├── api-client.js   # ITS/대전시 API 클라이언트
│       └── utils.js        # 거리 계산 등 유틸리티
└── scripts/
    └── extract-routes.js   # 정류장 데이터 추출 스크립트 (TODO)
```

## 주요 로직

### 1. 거리 기반 매칭

```javascript
// 각 정류장 반경 500m 내 CCTV 검색
stops.forEach(stop => {
  cctvs.forEach(cctv => {
    const dist = haversine(stop.lat, stop.lng, cctv.lat, cctv.lng);
    if (dist <= 500) matched.push({ ...cctv, nearestStop: stop.name, distance: dist });
  });
});
```

### 2. 캐시 전략

- **메모리 캐시**: 1시간 (기본)
- **API 호출**: ITS + 대전시 병렬 조회
- **갱신 주기**: `/api/cctv-refresh` 호출 또는 캐시 만료 시

### 3. Bounding Box 계산

```javascript
// 노선 정류장 좌표 범위 + 0.02도 패딩
const bbox = {
  minX: Math.min(...lngs) - 0.02,
  maxX: Math.max(...lngs) + 0.02,
  minY: Math.min(...lats) - 0.02,
  maxY: Math.max(...lats) + 0.02,
};
```

## 문제 해결

### CORS 오류

Netlify Functions를 통해 우회 (브라우저 직접 호출 불가)

### 영상 재생 안됨

- ITS API의 HLS URL만 재생 가능
- 대전시 API는 위치 정보만 제공 (스트림 없음)
- 브라우저 자동재생 정책 확인 (`muted` 속성 필수)

### API 키 인증 실패

`.env` 파일 확인 및 Netlify 환경 변수 재설정

## TODO

- [ ] `scripts/extract-routes.js` 구현 (index.html → routes.json 자동 추출)
- [ ] Netlify Blobs로 캐시 영구 저장
- [ ] Netlify Scheduled Functions로 자동 갱신 (매시 0분)
- [ ] 511, 513번 노선 정류장 데이터 추가
- [ ] CCTV 건강 상태 체크 (스트림 가용성)
- [ ] 지도 뷰 (Leaflet.js) 추가

## 라이선스

MIT

## 문의

동인여객 기사님 전용 내부 도구
