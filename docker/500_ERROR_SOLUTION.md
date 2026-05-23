# CCTV Viewer 500 에러 긴급 해결 가이드

## 상황
- API는 정상: https://ditcctv.choicho.co.kr/api/cctv-route?route=108 ✅
- 메인 페이지 500 에러: https://ditcctv.choicho.co.kr ❌

## 빠른 해결 방법 (권장) ⚡

### 옵션 A: 정적 파일 직접 배포 (가장 빠름, 5분)

nginx가 index.html을 직접 서빙하도록 합니다. Express 서버 문제를 완전히 우회합니다.

```bash
cd /Volumes/CHOICHOUSB/project/gobus
./docker/deploy-static-files.sh
```

**이 스크립트가 하는 일:**
1. index.html과 data/ 폴더를 서버의 nginx root에 복사
2. nginx 설정 업데이트 및 재로드
3. 테스트

**결과:**
- ✅ 메인 페이지: nginx가 직접 서빙 (빠름)
- ✅ API: Express 컨테이너로 프록시 (정상)

---

### 옵션 B: 문제 진단 후 수정 (15-30분)

현재 상태를 상세히 진단합니다.

```bash
cd /Volumes/CHOICHOUSB/project/gobus
./docker/diagnose-cctv-viewer.sh
```

**진단 내용:**
1. Docker 서비스 상태
2. 컨테이너 로그
3. 컨테이너 내부 파일 확인
4. 직접 테스트
5. nginx 설정
6. 외부 접근 테스트

진단 결과를 보고 추가 조치를 결정합니다.

---

## 권장 순서

### 1단계: 빠른 해결 (옵션 A)
```bash
./docker/deploy-static-files.sh
```

### 2단계: 테스트
```bash
curl https://ditcctv.choicho.co.kr
# 또는 브라우저에서 접속
```

### 3단계: 여전히 문제가 있다면
```bash
./docker/diagnose-cctv-viewer.sh
```

---

## 예상되는 문제들

### 문제 1: index.html이 컨테이너에 없음
**증상:** 진단 스크립트에서 "❌ index.html 없음"
**원인:** Dockerfile의 COPY 명령 문제 또는 .dockerignore

**해결:**
```bash
# 정적 파일 직접 배포로 우회
./docker/deploy-static-files.sh
```

### 문제 2: netlify/functions 파일 없음
**증상:** 로그에 "Cannot find module './netlify/functions/cctv-route'"
**원인:** Docker 빌드 시 netlify 폴더 제외됨

**해결:**
```bash
# .dockerignore 확인
cat dongin_bus/cctv_viewer/.dockerignore

# netlify가 제외되어 있으면 삭제
# 그리고 이미지 재빌드
./docker/build-and-upload-image-cctv.sh
ssh quizadm@192.168.219.196
docker service update --image choicho/dongin-bus-cctv-viewer:latest quiz_cctv-viewer
```

### 문제 3: 환경 변수 문제
**증상:** API 키 관련 에러

**해결:**
```bash
ssh quizadm@192.168.219.196
cd ~/docker

# 환경 변수 확인
cat env/cctv-viewer.env

# 문제가 있으면 수정 후 서비스 재시작
docker service update --force quiz_cctv-viewer
```

### 문제 4: nginx proxy 설정 문제
**증상:** nginx 에러 로그에 "upstream not found"

**해결:**
```bash
ssh quizadm@192.168.219.196

# nginx 에러 로그 확인
sudo tail -50 /var/log/nginx/ditcctv-error.log

# cctv-viewer DNS 확인
docker exec $(docker ps -q -f name=nginx-proxy) nslookup cctv-viewer

# 연결 테스트
docker exec $(docker ps -q -f name=nginx-proxy) wget -O- http://cctv-viewer:8888
```

---

## 각 방법의 장단점

### 옵션 A: 정적 파일 직접 배포

**장점:**
- ⚡ 가장 빠름 (5분)
- ✅ 확실한 해결
- 🚀 성능 최적화 (nginx 직접 서빙)
- 🔧 Express 서버 문제 우회

**단점:**
- 📝 파일 두 곳 관리 필요
- 🔄 업데이트 시 두 곳 모두 갱신

### 옵션 B: Docker 이미지 수정

**장점:**
- 📦 한 곳에서 관리
- 🔄 업데이트 편리

**단점:**
- ⏱️ 시간 소요 (15-30분)
- 🐛 디버깅 필요할 수 있음

---

## 최종 권장사항

**지금 당장:**
```bash
./docker/deploy-static-files.sh
```

이렇게 하면 5분 안에 문제가 해결됩니다!

**나중에 여유 있을 때:**
- Docker 이미지 빌드 문제 분석
- 근본 원인 수정
- 통합 관리로 전환

---

## 트러블슈팅 체크리스트

배포 후에도 문제가 있다면:

- [ ] nginx root 디렉토리 존재 확인
  ```bash
  ssh quizadm@192.168.219.196 "ls -la /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer/"
  ```

- [ ] 파일 권한 확인
  ```bash
  ssh quizadm@192.168.219.196 "ls -l /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer/index.html"
  ```

- [ ] nginx 에러 로그 확인
  ```bash
  ssh quizadm@192.168.219.196 "sudo tail -50 /var/log/nginx/ditcctv-error.log"
  ```

- [ ] nginx 설정 테스트
  ```bash
  ssh quizadm@192.168.219.196 "sudo nginx -t"
  ```

- [ ] 브라우저 캐시 클리어
  - Chrome: Cmd+Shift+R (macOS) / Ctrl+Shift+R (Windows)

---

## 연락처

문제가 계속되면 진단 스크립트 결과를 공유해주세요:
```bash
./docker/diagnose-cctv-viewer.sh > diagnosis.txt
```
