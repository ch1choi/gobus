# CCTV Viewer Docker 배포 가이드

## 개요

이 문서는 CCTV Viewer 애플리케이션을 Docker 이미지로 빌드하고 서버에 배포하는 방법을 설명합니다.

## 사전 준비

### 필수 도구
- Docker Desktop (또는 Docker Engine)
- SSH 접근 권한 (서버 배포 시)

### 환경 변수
다음 환경 변수들이 필요합니다:
- `ITS_API_KEY`: ITS 국가교통정보센터 API 키
- `DAEJEON_API_KEY`: 대전시 공공데이터 API 키
- `CACHE_TTL`: 캐시 유지 시간 (초, 기본값: 3600)
- `MAX_DISTANCE`: CCTV 매칭 최대 거리 (미터, 기본값: 500)
- `PLAYABLE_ONLY`: `1`이면 스트림 URL이 있는 장비만 반환·표시 (빈 재생 카드 방지). 미설정 시 전체 포함
- `ITS_BBOX_EXTRA_PADDING`: 노선 bbox보다 ITS 조회 영역만 추가 확장(도 단위, 예: `0.02`). 국도 CCTV 확보율 향상

## Docker 이미지 빌드

### 1. 이미지만 빌드

```bash
cd /Volumes/CHOICHOUSB/project/gobus
./docker/build-image-cctv.sh
```

태그 지정하여 빌드:
```bash
IMAGE_TAG=v1.0.0 ./docker/build-image-cctv.sh
```

### 2. 이미지 빌드 + 서버 업로드 (한 번에)

```bash
./docker/build-and-upload-image-cctv.sh
```

커스텀 설정:
```bash
IMAGE_TAG=v1.0.0 DEPLOY_SERVER=user@server.com ./docker/build-and-upload-image-cctv.sh
```

### 3. 이미지만 서버로 업로드

이미지가 이미 빌드된 경우:
```bash
./docker/upload-image-to-server-cctv.sh
```

## 로컬 테스트

### Docker Compose 사용

1. 환경 변수 파일 생성:
```bash
cd dongin_bus/cctv_viewer
cp .env.example .env
# .env 파일 편집하여 API 키 입력
```

2. 컨테이너 시작:
```bash
docker-compose up -d
```

3. 로그 확인:
```bash
docker-compose logs -f
```

4. 접속 테스트:
```bash
curl http://localhost:8888
curl "http://localhost:8888/api/cctv-route?route=108"
```

5. 중지 및 삭제:
```bash
docker-compose down
```

### Docker Run 직접 실행

```bash
docker run -d \
  -p 8888:8888 \
  --name cctv-viewer \
  -e ITS_API_KEY=your_its_key \
  -e DAEJEON_API_KEY=your_daejeon_key \
  -e CACHE_TTL=3600 \
  -e MAX_DISTANCE=500 \
  choicho/dongin-bus-cctv-viewer:latest
```

## 서버 배포

### 방법 1: Docker Run (단일 컨테이너)

서버에 SSH 접속 후:

```bash
# 이미지 확인
docker images choicho/dongin-bus-cctv-viewer

# 컨테이너 실행
docker run -d \
  -p 8888:8888 \
  --name cctv-viewer \
  --restart unless-stopped \
  -e ITS_API_KEY=$ITS_API_KEY \
  -e DAEJEON_API_KEY=$DAEJEON_API_KEY \
  -e CACHE_TTL=3600 \
  -e MAX_DISTANCE=500 \
  choicho/dongin-bus-cctv-viewer:latest

# 로그 확인
docker logs -f cctv-viewer
```

### 방법 2: Docker Compose

1. docker-compose.yml 파일을 서버에 복사
2. .env 파일 생성 또는 환경 변수 설정
3. 실행:

```bash
docker-compose up -d
```

### 방법 3: Docker Swarm Stack (프로덕션)

Swarm 환경에서:

```bash
# 환경 변수 설정
export ITS_API_KEY=your_key
export DAEJEON_API_KEY=your_key

# 스택 배포
docker stack deploy -c swarm-stack.yml cctv-viewer

# 상태 확인
docker stack ps cctv-viewer
docker service ls
docker service logs cctv-viewer_cctv-viewer
```

## 빌드 스크립트 환경 변수

모든 빌드 스크립트는 다음 환경 변수를 지원합니다:

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `IMAGE_NAME` | `choicho/dongin-bus-cctv-viewer` | Docker 이미지 이름 |
| `IMAGE_TAG` | `latest` | Docker 이미지 태그 |
| `PLATFORM` | `linux/amd64` | 빌드 플랫폼 |
| `DEPLOY_SERVER` | `quizadm@192.168.219.196` | 배포 대상 서버 |

예시:
```bash
IMAGE_NAME=myrepo/cctv-viewer \
IMAGE_TAG=prod-v1.0 \
PLATFORM=linux/arm64 \
DEPLOY_SERVER=admin@production.server.com \
./docker/build-and-upload-image-cctv.sh
```

## 프로젝트 구조

```
dongin_bus/cctv_viewer/
├── Dockerfile                      # Docker 이미지 정의
├── .dockerignore                   # Docker 빌드 제외 파일
├── server.js                       # Express 서버 (Netlify Functions 대체)
├── docker-compose.yml              # 로컬/개발 배포
├── swarm-stack.yml                 # 프로덕션 Swarm 배포
├── index.html                      # 클라이언트 앱
├── netlify/functions/              # 원본 Netlify Functions
├── data/routes.json                # 정류장 데이터
└── scripts/                        # 유틸리티 스크립트
```

## 문제 해결

### 빌드 실패
- Docker Desktop이 실행 중인지 확인
- 디스크 공간 확인
- `docker system prune -a` 로 불필요한 이미지 정리

### 업로드 실패
- SSH 접속 확인: `ssh quizadm@192.168.219.196`
- 서버의 Docker 데몬 실행 상태 확인
- 네트워크 연결 확인

### 컨테이너 시작 실패
- 환경 변수 확인: `docker logs cctv-viewer`
- 포트 충돌 확인: `lsof -i :8888`
- API 키 유효성 확인

### API 호출 실패
- `.env` 파일 또는 환경 변수 확인
- 네트워크 연결 확인
- API 키 만료 여부 확인

## 유지보수

### 이미지 업데이트
```bash
# 1. 새 버전 빌드
IMAGE_TAG=v1.1.0 ./docker/build-and-upload-image-cctv.sh

# 2. 서버에서 업데이트
ssh quizadm@192.168.219.196
docker stop cctv-viewer
docker rm cctv-viewer
docker run -d ... choicho/dongin-bus-cctv-viewer:v1.1.0
```

### 로그 확인
```bash
# Docker Run
docker logs -f cctv-viewer

# Docker Compose
docker-compose logs -f

# Docker Swarm
docker service logs -f cctv-viewer_cctv-viewer
```

### 컨테이너 재시작
```bash
docker restart cctv-viewer
```

## 참고

- 기본 포트: 8888
- API 엔드포인트:
  - `GET /api/cctv-route?route={108|501|511|513}`
  - `GET /api/cctv-refresh`
- 상세 API 문서: README.md 참조


## sample 코드
```
<?xml version='1.0' encoding='UTF-8'?>
 <response>
  <coordtype>1</coordtype>
  <datacount>20</datacount>
  <data>
     <roadsectionid/>
     <filecreatetime/>
     <cctvtype>1</cctvtype>
     <cctvurl>http://cctvsec.ktict.co.kr/2/+MAKvmhuhLCng+SmwOzwVRr9ADys3kFBmCW4OGY0XH42/fg2Xx+LaT31c9P6p8B6zeDT2IiT0gnAOHLJlPChPw==</cctvurl>
     <cctvresolution/>
     <coordy>37.42889</coordy>
     <cctvformat>HLS</cctvformat>
     <cctvname>[수도권제1순환선] 성남;</cctvname>
     <coordx>127.12361;</coordx>
  </data>
  <data>
     <roadsectionid/>
     <filecreatetime/>
     <cctvtype>1</cctvtype>
     <cctvurl>http://cctvsec.ktict.co.kr/2/+MAKvmhuhLCng+SmwOzwVRr9ADys3kFBmCW4OGY0XH42/fg2Xx+LaT31c9P6p8B6zeDT2IiT0gnAOHLJlPChPw==</cctvurl>
     <cctvresolution/>
     <coordy>37.42889</coordy>
     <cctvformat>HLS</cctvformat>
     <cctvname>[수도권제1순환선] 성남;</cctvname>
     <coordx>127.12361;</coordx>
  </data>
 </response>
```


curl -sS "https://openapi.its.go.kr:9443/cctvInfo?apiKey=YOUR_ITS_API_KEY&type=its&cctvType=4&minX=127.3&maxX=127.5&minY=36.2&maxY=36.4&getType=json"