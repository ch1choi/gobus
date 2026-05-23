# CCTV Viewer 서버 배포 완료 요약

## 추가된 파일들

### 1. Docker Swarm Stack 설정
- **`docker/swarm-stack-proxmox.yml`** ✏️ 수정됨
  - `cctv-viewer` 서비스 추가
  - dmz-web 존에 배포
  - 2개 replica (고가용성)
  - 256MB 메모리 제한

### 2. 환경 변수 파일
- **`docker/env/cctv-viewer.env.example`** ✨ 생성됨
  - 환경 변수 템플릿
- **`docker/env/cctv-viewer.env`** ✨ 생성됨
  - 실제 API 키 포함 (gitignore)
- **`docker/env/README.md`** ✨ 생성됨
  - 환경 변수 파일 사용 가이드

### 3. Nginx 설정
- **`nginx/conf.d/dit-viewer.conf`** ✨ 생성됨
  - 도메인: ditcctv.choicho.co.kr
  - dit.conf와 동일한 SSL 인증서 사용
  - cctv-viewer 컨테이너로 API 프록시

### 4. 문서
- **`docker/DEPLOY_CCTV_VIEWER.md`** ✨ 생성됨
  - 상세 배포 가이드
  - 문제 해결 방법
  - 모니터링 및 유지보수
- **`nginx/conf.d/CCTV_VIEWER_NGINX_GUIDE.md`** ✨ 생성됨
  - Nginx 설정 가이드
- **`nginx/conf.d/README.md`** ✨ 생성됨
  - 전체 Nginx 설정 파일 목록
- **`.gitignore`** ✨ 생성됨
  - 환경 변수 파일 보안

### 5. CCTV Viewer 애플리케이션 (이전 단계에서 생성)
- `dongin_bus/cctv_viewer/Dockerfile`
- `dongin_bus/cctv_viewer/server.js`
- `dongin_bus/cctv_viewer/.dockerignore`
- `dongin_bus/cctv_viewer/docker-compose.yml`
- `dongin_bus/cctv_viewer/swarm-stack.yml`

## 배포 순서

### 1단계: Docker 이미지 빌드 및 업로드
```bash
cd /Volumes/CHOICHOUSB/project/gobus
./docker/build-and-upload-image-cctv.sh
```

### 2단계: 서버에 파일 복사
```bash
# docker 디렉토리
scp -r docker/ quizadm@192.168.219.196:~/

# nginx 설정
scp nginx/conf.d/dit-viewer.conf quizadm@192.168.219.196:~/nginx/conf.d/

# 정적 파일
scp -r dongin_bus/cctv_viewer/index.html \
     dongin_bus/cctv_viewer/data/ \
     quizadm@192.168.219.196:/project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer/
```

### 3단계: DNS 및 SSL 설정
```bash
ssh quizadm@192.168.219.196

# SSL 인증서에 ditcctv.choicho.co.kr 추가
sudo certbot --expand \
  -d choicho.co.kr \
  -d ditransfer.choicho.co.kr \
  -d ditcctv.choicho.co.kr

# Nginx 재로드
sudo nginx -t
sudo systemctl reload nginx
```

### 4단계: 환경 변수 설정
```bash
ssh quizadm@192.168.219.196
cd ~/docker/env

# 실제 API 키 입력
vi cctv-viewer.env
```

### 5단계: Docker Stack 배포
```bash
ssh quizadm@192.168.219.196
cd ~/docker

# 스택 배포
docker stack deploy -c swarm-stack-proxmox.yml quiz

# 상태 확인
docker service ls | grep cctv
docker service ps quiz_cctv-viewer
docker service logs -f quiz_cctv-viewer
```

### 6단계: 접속 테스트
```bash
# API 테스트
curl "https://ditcctv.choicho.co.kr/api/cctv-route?route=108"
curl "https://ditcctv.choicho.co.kr/api/cctv-refresh"

# 브라우저
https://ditcctv.choicho.co.kr
```

## 서비스 구성

### 아키텍처
```
인터넷
  ↓
nginx-proxy (80, 443)
  ↓ dit-viewer.conf
cctv-viewer:8888 (2 replicas)
  ↓ API 호출
ITS API / 대전시 API
```

### 네트워크
- **네트워크**: quiz-network (overlay)
- **배포 존**: dmz-web
- **도메인**: ditcctv.choicho.co.kr
- **내부 포트**: 8888
- **외부 포트**: 80, 443 (nginx-proxy를 통해)

### 리소스
- **Replicas**: 2개 (고가용성)
- **메모리 제한**: 256MB
- **메모리 예약**: 128MB

## 주요 엔드포인트

| URL | 설명 |
|-----|------|
| `https://ditcctv.choicho.co.kr` | 메인 페이지 |
| `https://ditcctv.choicho.co.kr/api/cctv-route?route=108` | 108번 노선 CCTV 조회 |
| `https://ditcctv.choicho.co.kr/api/cctv-route?route=501` | 501번 노선 CCTV 조회 |
| `https://ditcctv.choicho.co.kr/api/cctv-refresh` | 캐시 갱신 |

## 모니터링 명령어

```bash
# 서비스 상태
docker service ps quiz_cctv-viewer

# 로그 확인
docker service logs -f quiz_cctv-viewer

# 리소스 사용량
docker stats --no-stream $(docker ps -q -f name=quiz_cctv-viewer)

# Nginx 로그
tail -f /var/log/nginx/ditcctv-access.log
tail -f /var/log/nginx/ditcctv-error.log
```

## 업데이트 방법

```bash
# 1. 로컬에서 새 이미지 빌드
IMAGE_TAG=v1.1.0 ./docker/build-and-upload-image-cctv.sh

# 2. 서버에서 서비스 업데이트
ssh quizadm@192.168.219.196
docker service update --image choicho/dongin-bus-cctv-viewer:v1.1.0 quiz_cctv-viewer
```

## 롤백 방법

```bash
# 이전 버전으로 롤백
docker service update --image choicho/dongin-bus-cctv-viewer:v1.0.0 quiz_cctv-viewer

# 또는 자동 롤백
docker service rollback quiz_cctv-viewer
```

## 문제 해결

### 502 Bad Gateway
- cctv-viewer 컨테이너 상태 확인: `docker service ps quiz_cctv-viewer`
- 로그 확인: `docker service logs quiz_cctv-viewer`
- 네트워크 연결 확인: `docker network inspect quiz-network`

### API 호출 실패 (500)
- 환경 변수 확인: `docker service inspect quiz_cctv-viewer`
- API 키 유효성 확인
- 컨테이너 로그 확인

### SSL 인증서 오류
- 인증서 SAN 확인: `sudo openssl x509 -in /etc/letsencrypt/live/choicho.co.kr/fullchain.pem -noout -text | grep DNS`
- ditcctv.choicho.co.kr이 없으면 certbot으로 추가

## 참고 문서

- **배포 가이드**: `docker/DEPLOY_CCTV_VIEWER.md`
- **Nginx 설정**: `nginx/conf.d/CCTV_VIEWER_NGINX_GUIDE.md`
- **Docker 빌드**: `dongin_bus/cctv_viewer/DOCKER_DEPLOYMENT.md`
- **환경 변수**: `docker/env/README.md`

## 다음 단계

1. DNS 레코드 설정 (ditcctv.choicho.co.kr → 서버 IP)
2. SSL 인증서 추가
3. Docker 이미지 빌드 및 업로드
4. 서버에 파일 배포
5. Docker Stack 배포
6. 접속 테스트

모든 준비가 완료되었습니다! 🚀
