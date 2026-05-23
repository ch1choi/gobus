# CCTV Viewer 500 에러 긴급 수정 가이드

## 문제 상황
- API는 정상 작동: https://ditcctv.choicho.co.kr/api/cctv-route?route=108 ✅
- 메인 페이지 500 에러: https://ditcctv.choicho.co.kr ❌

## 원인
Express 서버(server.js)에서 index.html을 서빙할 때 에러 핸들링 부족

## 해결 방법

### 1. 빠른 재배포 (자동 스크립트)

```bash
cd /Volumes/CHOICHOUSB/project/gobus
./docker/hotfix-cctv-viewer.sh
```

이 스크립트는:
1. 수정된 server.js로 새 이미지 빌드
2. 서버에 업로드
3. Docker 서비스 자동 업데이트
4. 로그 확인

### 2. 수동 재배포

```bash
# 1. 이미지 빌드 및 업로드
cd /Volumes/CHOICHOUSB/project/gobus
./docker/build-and-upload-image-cctv.sh

# 2. 서버에서 서비스 업데이트
ssh quizadm@192.168.219.196
docker service update --image choicho/dongin-bus-cctv-viewer:latest quiz_cctv-viewer

# 3. 상태 확인
docker service ps quiz_cctv-viewer
docker service logs -f quiz_cctv-viewer
```

## 수정 내용

### server.js 개선사항

1. **파일 존재 확인 로깅**
   - 서버 시작 시 index.html 파일 존재 여부 확인
   - 경로 정보 출력

2. **에러 핸들링 강화**
   - try-catch로 모든 라우트 보호
   - 파일이 없을 때 명확한 에러 메시지
   - 전역 에러 핸들러 추가

3. **요청 로깅**
   - 모든 요청 기록 (디버깅 용이)
   - 404 요청도 로그에 기록

4. **정적 파일 서빙 개선**
   - Content-Type 헤더 명시
   - index.html 자동 서빙 비활성화 (명시적 라우트 사용)

### nginx 설정 개선

dit-viewer.conf:
- 정적 파일이 있으면 nginx에서 직접 서빙
- 없으면 백엔드(Express)로 프록시
- 에러 인터셉트 활성화

## 배포 후 확인

### 1. 서비스 상태
```bash
ssh quizadm@192.168.219.196
docker service ps quiz_cctv-viewer
```

### 2. 로그 확인
```bash
# 실시간 로그
docker service logs -f quiz_cctv-viewer

# 최근 로그
docker service logs --tail 100 quiz_cctv-viewer

# 시작 로그에서 확인할 내용:
# - "Index.html exists: true"
# - 에러 메시지 없음
```

### 3. 접속 테스트
```bash
# 메인 페이지
curl -v https://ditcctv.choicho.co.kr

# API
curl "https://ditcctv.choicho.co.kr/api/cctv-route?route=108"

# 브라우저 테스트
# https://ditcctv.choicho.co.kr
```

## 추가 디버깅

### 컨테이너 내부 파일 확인
```bash
ssh quizadm@192.168.219.196

# 컨테이너 ID 확인
CONTAINER_ID=$(docker ps -q -f name=quiz_cctv-viewer | head -1)

# 컨테이너 내부 접속
docker exec -it $CONTAINER_ID sh

# 파일 확인
ls -la /app/
cat /app/index.html | head -20
exit
```

### 직접 컨테이너 테스트
```bash
# 컨테이너 내부에서 직접 curl
docker exec $(docker ps -q -f name=quiz_cctv-viewer | head -1) \
  wget -O- http://localhost:8888
```

## 여전히 문제가 있다면

### 옵션 1: 정적 파일을 nginx에 배포

```bash
# 서버에서 실행
ssh quizadm@192.168.219.196

# 정적 파일 디렉토리 생성
sudo mkdir -p /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer

# 컨테이너에서 파일 복사
CONTAINER_ID=$(docker ps -q -f name=quiz_cctv-viewer | head -1)
docker cp $CONTAINER_ID:/app/index.html /tmp/
docker cp $CONTAINER_ID:/app/data /tmp/

# nginx root로 이동
sudo cp /tmp/index.html /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer/
sudo cp -r /tmp/data /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer/

# nginx 재로드
sudo systemctl reload nginx
```

### 옵션 2: 임시 디버깅 모드 실행

```bash
# 환경 변수로 디버깅 활성화
docker service update \
  --env-add NODE_ENV=development \
  quiz_cctv-viewer

# 로그에서 자세한 스택 트레이스 확인
docker service logs -f quiz_cctv-viewer
```

### 옵션 3: 서비스 재생성

```bash
ssh quizadm@192.168.219.196
cd ~/docker

# 서비스 완전 제거 후 재배포
docker service rm quiz_cctv-viewer
docker stack deploy -c swarm-stack-proxmox.yml quiz

# 상태 확인
docker service ps quiz_cctv-viewer
```

## 예상 소요 시간

- 자동 스크립트 사용: **5-10분**
- 수동 배포: **10-15분**
- 추가 디버깅: **상황에 따라**

## 배포 완료 체크리스트

- [ ] 이미지 빌드 성공
- [ ] 서버 업로드 완료
- [ ] Docker 서비스 업데이트 완료
- [ ] 로그에 "Index.html exists: true" 확인
- [ ] 메인 페이지 접속 성공 (200 OK)
- [ ] API 정상 작동 확인
- [ ] 브라우저에서 UI 정상 표시

## 참고

- 수정된 파일: `dongin_bus/cctv_viewer/server.js`
- nginx 설정: `nginx/conf.d/dit-viewer.conf`
- 자동 스크립트: `docker/hotfix-cctv-viewer.sh`
