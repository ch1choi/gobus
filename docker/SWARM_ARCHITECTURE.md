# Docker Swarm 구조별 서버 가이드

## 서버 구조

### 192.168.219.196 - Swarm Manager 🎯
**역할:**
- Docker Swarm 명령 실행
- 서비스 배포/업데이트
- 스택 관리
- 서비스 로그 조회

**주요 명령:**
```bash
# 서비스 상태 확인
docker service ls
docker service ps quiz_cctv-viewer

# 서비스 업데이트
docker service update --image choicho/dongin-bus-cctv-viewer:latest quiz_cctv-viewer

# 스택 배포
cd ~/docker
docker stack deploy -c swarm-stack-proxmox.yml quiz

# 로그 확인
docker service logs -f quiz_cctv-viewer
```

### 192.168.219.166 - Worker 노드 🐳
**역할:**
- 실제 컨테이너 실행
- nginx 서버 (정적 파일 서빙)
- 파일 배포 대상

**주요 명령:**
```bash
# 실행 중인 컨테이너 확인
docker ps | grep cctv

# 컨테이너 접속
docker exec -it $(docker ps -q -f name=cctv-viewer | head -1) sh

# nginx 설정 확인
sudo nginx -t
sudo systemctl reload nginx

# 정적 파일 확인
ls -la /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer/
```

## 배포 플로우

### 1. 이미지 빌드 (로컬)
```
로컬 Mac
  ↓ docker build
Docker 이미지 생성
```

### 2. 이미지 업로드 (→ Manager)
```
로컬 Mac
  ↓ docker save | ssh docker load
Manager (196번)
```

### 3. 서비스 배포 (Manager)
```
Manager (196번)
  ↓ docker service update
Swarm 오케스트레이션
  ↓ 컨테이너 스케줄링
Worker (166번)
```

### 4. 컨테이너 실행 (Worker)
```
Worker (166번)
  - cctv-viewer 컨테이너 실행
  - nginx 프록시
```

## 네트워크 흐름

```
사용자
  ↓ HTTPS
Worker (166번) - nginx
  ↓ 정적 파일: 직접 서빙
  ↓ API: proxy_pass
Worker (166번) - cctv-viewer 컨테이너 (quiz-network)
  ↓ HTTP API 호출
외부 API (ITS, 대전시)
```

## 스크립트별 서버 연결

### deploy-static-files.sh
```bash
WORKER="quizadm@192.168.219.166"  # 정적 파일 배포
```
- index.html, data/ → Worker의 nginx root
- nginx 설정 업데이트 → Worker

### diagnose-cctv-viewer.sh
```bash
MANAGER="quizadm@192.168.219.196"  # Swarm 상태 조회
WORKER="quizadm@192.168.219.166"   # 컨테이너 확인
```
- Manager: 서비스 상태, 로그
- Worker: 컨테이너 내부 파일, nginx 설정

### hotfix-cctv-viewer.sh
```bash
MANAGER="quizadm@192.168.219.196"  # 배포 명령
```
- 이미지 업로드 → Manager
- 서비스 업데이트 → Manager
- Swarm이 자동으로 Worker에 배포

## 트러블슈팅

### "컨테이너가 없습니다" 에러
**원인:** Worker 노드에 컨테이너가 스케줄링되지 않음

**확인:**
```bash
# Manager에서
ssh quizadm@192.168.219.196
docker service ps quiz_cctv-viewer

# 어느 노드에 배포되었는지 확인
docker service ps quiz_cctv-viewer --format "table {{.Name}}\t{{.Node}}\t{{.CurrentState}}"
```

**해결:**
```bash
# 서비스 재시작
docker service update --force quiz_cctv-viewer
```

### nginx 502 Bad Gateway
**원인:** Worker의 nginx가 Worker의 컨테이너를 찾지 못함

**확인:**
```bash
# Worker에서
ssh quizadm@192.168.219.166

# 컨테이너 실행 확인
docker ps | grep cctv

# nginx에서 DNS 확인
docker exec $(docker ps -q -f name=nginx-proxy) nslookup cctv-viewer
```

### 정적 파일 404
**원인:** Worker에 정적 파일이 배포되지 않음

**확인:**
```bash
# Worker에서
ssh quizadm@192.168.219.166
ls -la /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer/
```

**해결:**
```bash
# 로컬에서
./docker/deploy-static-files.sh
```

## 체크리스트

### 배포 전
- [ ] Manager(196) SSH 접속 가능
- [ ] Worker(166) SSH 접속 가능
- [ ] Docker 이미지 빌드 완료
- [ ] nginx 설정 파일 준비

### 배포 후
- [ ] Manager: `docker service ls` - 서비스 확인
- [ ] Manager: `docker service ps quiz_cctv-viewer` - 배포 상태
- [ ] Worker: `docker ps | grep cctv` - 컨테이너 실행
- [ ] Worker: `ls /project2/.../cctv_viewer/` - 정적 파일 확인
- [ ] 외부: `curl https://ditcctv.choicho.co.kr` - 200 OK

## 빠른 명령 참조

### Manager (196번)
```bash
# 서비스 상태
ssh quizadm@192.168.219.196 "docker service ps quiz_cctv-viewer"

# 로그 확인
ssh quizadm@192.168.219.196 "docker service logs --tail 50 quiz_cctv-viewer"

# 서비스 재시작
ssh quizadm@192.168.219.196 "docker service update --force quiz_cctv-viewer"
```

### Worker (166번)
```bash
# 컨테이너 상태
ssh quizadm@192.168.219.166 "docker ps | grep cctv"

# nginx 로그
ssh quizadm@192.168.219.166 "sudo tail -50 /var/log/nginx/ditcctv-error.log"

# 정적 파일 확인
ssh quizadm@192.168.219.166 "ls -la /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer/"
```

## 정리

| 작업 | Manager (196) | Worker (166) |
|------|---------------|--------------|
| Swarm 명령 | ✅ | ❌ |
| 컨테이너 실행 | ❌ | ✅ |
| nginx 서버 | ❌ | ✅ |
| 정적 파일 배포 | ❌ | ✅ |
| 서비스 로그 조회 | ✅ | ⚠️ (컨테이너 로그만) |
| 스택 배포 | ✅ | ❌ |
