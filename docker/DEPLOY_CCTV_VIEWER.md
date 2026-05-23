# Docker Swarm Stack 배포 가이드 - CCTV Viewer

## 개요

이 문서는 swarm-stack-proxmox.yml에 추가된 cctv-viewer 서비스를 배포하는 방법을 설명합니다.

## 사전 준비

### 1. Docker 이미지 준비
```bash
# 로컬에서 이미지 빌드 및 서버 업로드
cd /Volumes/CHOICHOUSB/project/gobus
./docker/build-and-upload-image-cctv.sh

# 또는 특정 버전 태그로 빌드
IMAGE_TAG=v1.0.0 ./docker/build-and-upload-image-cctv.sh
```

### 2. 서버 파일 준비

서버 (quizadm@192.168.219.196)에 필요한 파일들을 복사합니다:

```bash
# 1. docker 디렉토리 전체 복사 (최초 1회)
scp -r docker/ quizadm@192.168.219.196:~/

# 2. nginx 설정 파일 복사
scp nginx/conf.d/dit-viewer.conf quizadm@192.168.219.196:~/nginx/conf.d/

# 3. 환경 변수 파일 설정
# 서버에 SSH 접속
ssh quizadm@192.168.219.196

# env 파일 복사 및 수정
cd ~/docker/env
cp cctv-viewer.env.example cctv-viewer.env
vi cctv-viewer.env  # API 키 등 실제 값 입력
```

### 3. 정적 파일 배포

CCTV Viewer의 정적 파일(index.html 등)을 nginx root 경로에 배치:

```bash
# 서버에서 실행
mkdir -p /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer

# 로컬에서 파일 복사
scp -r dongin_bus/cctv_viewer/* quizadm@192.168.219.196:/project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer/

# server.js, node_modules 등 서버 파일은 제외 (Docker 이미지에 포함됨)
```

### 4. DNS 및 SSL 인증서 설정

```bash
# 서버에서 실행
ssh quizadm@192.168.219.196

# SSL 인증서에 ditcctv.choicho.co.kr 추가
sudo certbot --expand \
  -d choicho.co.kr \
  -d ditransfer.choicho.co.kr \
  -d ditcctv.choicho.co.kr

# nginx 설정 테스트 및 재로드
sudo nginx -t
sudo systemctl reload nginx
```

## 배포 방법

### 방법 1: 전체 스택 재배포

```bash
ssh quizadm@192.168.219.196
cd ~/docker

# 스택 배포 (전체 서비스)
docker stack deploy -c swarm-stack-proxmox.yml quiz

# 배포 상태 확인
docker stack ps quiz
docker service ls | grep cctv
```

### 방법 2: cctv-viewer 서비스만 업데이트

기존 스택이 실행 중일 때 cctv-viewer만 업데이트:

```bash
ssh quizadm@192.168.219.196

# 이미지 업데이트
docker pull choicho/dongin-bus-cctv-viewer:latest

# 서비스 업데이트
docker service update \
  --image choicho/dongin-bus-cctv-viewer:latest \
  quiz_cctv-viewer

# 또는 전체 스택 재배포 (다른 서비스는 변경 없음)
cd ~/docker
docker stack deploy -c swarm-stack-proxmox.yml quiz
```

### 방법 3: 환경 변수만 변경

```bash
ssh quizadm@192.168.219.196
cd ~/docker

# 1. env/cctv-viewer.env 파일 수정
vi env/cctv-viewer.env

# 2. 스택 재배포 (환경 변수 반영)
docker stack deploy -c swarm-stack-proxmox.yml quiz

# 3. 서비스 재시작 (강제)
docker service update --force quiz_cctv-viewer
```

## 배포 확인

### 1. 서비스 상태 확인
```bash
# 서비스 목록
docker service ls | grep cctv

# 컨테이너 상태 (2개 replicas 확인)
docker service ps quiz_cctv-viewer

# 로그 확인
docker service logs -f quiz_cctv-viewer
```

### 2. 네트워크 연결 확인
```bash
# nginx-proxy에서 cctv-viewer로 연결 테스트
docker exec $(docker ps -q -f name=quiz_nginx-proxy) \
  wget -O- http://cctv-viewer:8888/api/cctv-route?route=108
```

### 3. 외부 접속 테스트
```bash
# HTTP → HTTPS 리다이렉트
curl -I http://ditcctv.choicho.co.kr

# HTTPS 접속
curl https://ditcctv.choicho.co.kr

# API 테스트
curl "https://ditcctv.choicho.co.kr/api/cctv-route?route=108"
curl "https://ditcctv.choicho.co.kr/api/cctv-refresh"
```

## swarm-stack-proxmox.yml 설정 상세

### cctv-viewer 서비스 주요 설정

```yaml
cctv-viewer:
  image: ${CCTV_VIEWER_IMAGE:-choicho/dongin-bus-cctv-viewer:latest}
  environment:
    - NODE_ENV=production
    - TZ=Asia/Seoul
    - PORT=8888
    - CACHE_TTL=3600
    - MAX_DISTANCE=500
  env_file:
    - env/cctv-viewer.env  # API 키 등 민감 정보
  networks:
    - quiz-network
  deploy:
    replicas: 2              # 고가용성 (2개 인스턴스)
    placement:
      constraints:
        - node.labels.zone == dmz-web  # dmz-web 존에 배포
    resources:
      limits:
        memory: 256M
      reservations:
        memory: 128M
    update_config:
      parallelism: 1         # 순차 업데이트 (무중단)
      delay: 10s
    restart_policy:
      condition: on-failure
      delay: 5s
      max_attempts: 3
```

### 환경 변수 우선순위

1. `environment` 섹션의 변수 (기본값)
2. `env_file`의 변수 (실제 값, 덮어쓰기)
3. 환경 변수 치환 `${VAR:-default}`

### 네트워크 구성

```
quiz-network (overlay)
  ├─ nginx-proxy (80, 443)
  ├─ cctv-viewer (8888) × 2 replicas
  └─ 기타 서비스들...
```

- nginx-proxy가 dit-viewer.conf 설정에 따라 `http://cctv-viewer:8888`로 프록시
- Swarm 오버레이 네트워크의 DNS 자동 로드밸런싱 (2개 replica 간)

## 이미지 버전 관리

### 환경 변수로 버전 지정

```bash
# 배포 시 특정 버전 사용
export CCTV_VIEWER_IMAGE=choicho/dongin-bus-cctv-viewer:v1.0.0
docker stack deploy -c swarm-stack-proxmox.yml quiz

# 또는 .env 파일 생성
echo "CCTV_VIEWER_IMAGE=choicho/dongin-bus-cctv-viewer:v1.0.0" > .env
docker stack deploy -c swarm-stack-proxmox.yml quiz
```

### 롤백

```bash
# 이전 버전으로 롤백
docker service update \
  --image choicho/dongin-bus-cctv-viewer:v0.9.0 \
  quiz_cctv-viewer

# 또는 마지막 성공 버전으로 자동 롤백
docker service rollback quiz_cctv-viewer
```

## 모니터링

### 리소스 사용량
```bash
# 서비스별 리소스
docker stats --no-stream $(docker ps -q -f name=quiz_cctv-viewer)

# 전체 서비스
docker service ls
```

### 로그 수집
```bash
# 실시간 로그
docker service logs -f quiz_cctv-viewer

# 최근 100줄
docker service logs --tail 100 quiz_cctv-viewer

# 특정 시간 이후
docker service logs --since 1h quiz_cctv-viewer
```

### Health Check (추가 권장)

swarm-stack-proxmox.yml에 healthcheck 추가:

```yaml
cctv-viewer:
  ...
  healthcheck:
    test: ["CMD", "wget", "-q", "--spider", "http://localhost:8888/api/cctv-route?route=108"]
    interval: 30s
    timeout: 10s
    retries: 3
    start_period: 40s
```

## 문제 해결

### 서비스가 시작되지 않음
```bash
# 서비스 상태 확인
docker service ps quiz_cctv-viewer --no-trunc

# 이벤트 로그
docker events --filter service=quiz_cctv-viewer

# 이미지 확인
docker images | grep cctv-viewer
```

### API 호출 실패 (500 에러)
```bash
# 환경 변수 확인
docker service inspect quiz_cctv-viewer --format '{{json .Spec.TaskTemplate.ContainerSpec.Env}}' | jq

# 컨테이너 접속하여 디버깅
docker exec -it $(docker ps -q -f name=quiz_cctv-viewer) sh
wget -O- http://localhost:8888/api/cctv-route?route=108
```

### nginx 502 Bad Gateway
```bash
# nginx에서 cctv-viewer DNS 해석 확인
docker exec $(docker ps -q -f name=quiz_nginx-proxy) nslookup cctv-viewer

# 네트워크 연결 확인
docker network inspect quiz-network | grep -A 5 cctv-viewer
```

### 메모리 부족
```bash
# 리소스 제한 증가
docker service update \
  --limit-memory 512M \
  --reserve-memory 256M \
  quiz_cctv-viewer
```

## 스케일링

### Replica 수 조정
```bash
# 3개로 증가
docker service scale quiz_cctv-viewer=3

# 1개로 축소 (유지보수 시)
docker service scale quiz_cctv-viewer=1

# 완전 중지 (배포는 유지)
docker service scale quiz_cctv-viewer=0
```

## 유지보수

### 정기 업데이트
```bash
#!/bin/bash
# update-cctv-viewer.sh

# 1. 최신 이미지 빌드 (로컬)
cd /path/to/gobus
IMAGE_TAG=$(date +%Y%m%d-%H%M%S) ./docker/build-and-upload-image-cctv.sh

# 2. 서버에서 배포
ssh quizadm@192.168.219.196 << 'EOF'
  cd ~/docker
  docker service update \
    --image choicho/dongin-bus-cctv-viewer:latest \
    quiz_cctv-viewer
EOF
```

### 로그 정리
```bash
# 오래된 로그 삭제 (서버 디스크 관리)
docker system prune -a --volumes --filter "until=168h"
```

## 참고 문서

- CCTV Viewer Docker 배포: `dongin_bus/cctv_viewer/DOCKER_DEPLOYMENT.md`
- Nginx 설정: `nginx/conf.d/CCTV_VIEWER_NGINX_GUIDE.md`
- 전체 Swarm Stack: `docker/swarm-stack-proxmox.yml`
