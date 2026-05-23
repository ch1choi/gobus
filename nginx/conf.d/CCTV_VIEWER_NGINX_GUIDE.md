# Nginx 설정 가이드 - CCTV Viewer

## 개요

이 문서는 CCTV Viewer를 위한 nginx 리버스 프록시 설정 방법을 설명합니다.

## 설정 파일

### dit-viewer.conf
- **도메인**: ditcctv.choicho.co.kr
- **SSL**: Let's Encrypt (choicho.co.kr 와일드카드 또는 SAN)
- **백엔드**: cctv_viewer Docker 컨테이너 (포트 8888)
- **정적 파일**: /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer

## 배포 전 확인사항

### 1. Docker 컨테이너 실행 확인
```bash
# cctv_viewer 컨테이너가 8888 포트로 실행 중인지 확인
docker ps | grep cctv-viewer

# 또는 curl로 직접 확인
curl http://localhost:8888/api/cctv-route?route=108
```

### 2. 정적 파일 배포
```bash
# cctv_viewer의 정적 파일을 nginx root 경로에 배치
sudo mkdir -p /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer
sudo cp -r /path/to/cctv_viewer/* /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer/

# 또는 심볼릭 링크 생성
sudo ln -s /path/to/cctv_viewer /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer
```

### 3. SSL 인증서 확인 및 추가
```bash
# 현재 인증서의 SAN 확인
sudo openssl x509 -in /etc/letsencrypt/live/choicho.co.kr/fullchain.pem -noout -text | grep DNS

# ditcctv.choicho.co.kr 이 없으면 certbot으로 추가
sudo certbot certonly --nginx -d ditcctv.choicho.co.kr

# 또는 기존 인증서 확장
sudo certbot --expand -d choicho.co.kr -d ditransfer.choicho.co.kr -d ditcctv.choicho.co.kr
```

### 4. DNS 레코드 설정
```
# A 레코드 또는 CNAME 추가
ditcctv.choicho.co.kr  →  서버 IP 주소

# 예시 (Cloudflare, Route53, 등)
Type: A
Name: ditcctv
Value: xxx.xxx.xxx.xxx (서버 IP)
TTL: Auto
Proxy: No (또는 Yes, 필요에 따라)
```

## 설치 및 적용

### 1. 설정 파일 복사
```bash
# 파일 복사
sudo cp nginx/conf.d/dit-viewer.conf /etc/nginx/conf.d/

# 또는 심볼릭 링크
sudo ln -s /path/to/project/nginx/conf.d/dit-viewer.conf /etc/nginx/conf.d/
```

### 2. Nginx 설정 테스트
```bash
sudo nginx -t
```

오류가 있으면 수정 후 다시 테스트합니다.

### 3. Nginx 재시작
```bash
# systemd
sudo systemctl reload nginx

# 또는 완전 재시작
sudo systemctl restart nginx

# Docker Compose 환경
docker-compose restart nginx
```

## 환경별 설정 조정

### A. Docker Compose 환경
dit-viewer.conf의 proxy_pass 설정:
```nginx
location /api/ {
    # 서비스명으로 자동 DNS 해석
    proxy_pass http://cctv-viewer:8888/api/;
    ...
}
```

docker-compose.yml 예시:
```yaml
services:
  nginx:
    image: nginx:alpine
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d
    networks:
      - dongin-bus-network
    depends_on:
      - cctv-viewer

  cctv-viewer:
    image: choicho/dongin-bus-cctv-viewer:latest
    networks:
      - dongin-bus-network
```

### B. 단일 컨테이너 환경 (호스트 네트워크)
dit-viewer.conf의 proxy_pass 수정:
```nginx
location /api/ {
    # localhost 또는 127.0.0.1 사용
    proxy_pass http://127.0.0.1:8888/api/;
    ...
}
```

### C. Docker Swarm 환경
```nginx
location /api/ {
    # Swarm 서비스명 사용
    resolver 127.0.0.11 valid=10s;
    proxy_pass http://cctv-viewer:8888/api/;
    ...
}
```

### D. 원격 서버 (외부 호스트)
```nginx
location /api/ {
    proxy_pass http://cctv-server.internal:8888/api/;
    ...
}
```

## 접속 테스트

### 1. HTTP → HTTPS 리다이렉트 확인
```bash
curl -I http://ditcctv.choicho.co.kr
# 301 Moved Permanently
# Location: https://ditcctv.choicho.co.kr/
```

### 2. HTTPS 접속 확인
```bash
curl -k https://ditcctv.choicho.co.kr
# HTML 응답이 반환되어야 함
```

### 3. API 프록시 확인
```bash
# 노선별 CCTV 조회
curl "https://ditcctv.choicho.co.kr/api/cctv-route?route=108"

# 캐시 갱신
curl "https://ditcctv.choicho.co.kr/api/cctv-refresh"
```

### 4. 브라우저 테스트
```
https://ditcctv.choicho.co.kr
```

## 로그 확인

### 접속 로그
```bash
sudo tail -f /var/log/nginx/ditcctv-access.log
```

### 에러 로그
```bash
sudo tail -f /var/log/nginx/ditcctv-error.log
```

### 실시간 모니터링
```bash
# 접속 + 에러 로그 동시 확인
sudo tail -f /var/log/nginx/ditcctv-access.log /var/log/nginx/ditcctv-error.log
```

## 문제 해결

### 502 Bad Gateway
**원인**: cctv_viewer 컨테이너 미실행 또는 연결 실패

**해결**:
```bash
# 컨테이너 상태 확인
docker ps | grep cctv-viewer

# 로그 확인
docker logs cctv-viewer

# 컨테이너 재시작
docker restart cctv-viewer

# 직접 접속 테스트
curl http://localhost:8888/api/cctv-route?route=108
```

### 504 Gateway Timeout
**원인**: API 응답 시간 초과

**해결**: dit-viewer.conf에서 타임아웃 값 증가
```nginx
proxy_connect_timeout 30s;
proxy_send_timeout 120s;
proxy_read_timeout 120s;
```

### SSL 인증서 오류
**원인**: ditcctv.choicho.co.kr 이 인증서 SAN에 없음

**해결**:
```bash
# 인증서 재발급
sudo certbot --expand -d choicho.co.kr -d ditcctv.choicho.co.kr
```

### CORS 오류
**원인**: CSP 또는 CORS 헤더 설정 문제

**해결**: dit-viewer.conf의 add_header 설정 확인
```nginx
# connect-src에 필요한 도메인 추가
add_header Content-Security-Policy "... connect-src 'self' https://apis.data.go.kr ...";
```

### API 호출 실패 (500, 403)
**원인**: cctv_viewer의 환경 변수 미설정

**해결**:
```bash
# Docker 컨테이너 환경 변수 확인
docker inspect cctv-viewer | grep -A 20 Env

# 환경 변수 설정하여 재시작
docker stop cctv-viewer
docker rm cctv-viewer
docker run -d \
  -p 8888:8888 \
  --name cctv-viewer \
  -e ITS_API_KEY=$ITS_API_KEY \
  -e DAEJEON_API_KEY=$DAEJEON_API_KEY \
  choicho/dongin-bus-cctv-viewer:latest
```

## 모범 사례

### 1. 로그 로테이션
```bash
# /etc/logrotate.d/nginx-cctv-viewer
/var/log/nginx/ditcctv-*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 `cat /var/run/nginx.pid`
    endscript
}
```

### 2. 접속 제한 (필요 시)
```nginx
# dit-viewer.conf에 추가
geo $limit {
    default 1;
    # 화이트리스트 IP
    192.168.1.0/24 0;
}

map $limit $limit_key {
    0 "";
    1 $binary_remote_addr;
}

limit_req_zone $limit_key zone=cctv_api:10m rate=10r/s;

location /api/ {
    limit_req zone=cctv_api burst=20 nodelay;
    ...
}
```

### 3. 캐싱 설정
```nginx
# 정적 리소스 캐싱
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 1h;
    add_header Cache-Control "public, immutable";
}
```

## 유지보수

### 설정 변경 시
```bash
# 1. 설정 파일 수정
sudo vi /etc/nginx/conf.d/dit-viewer.conf

# 2. 문법 검사
sudo nginx -t

# 3. 적용
sudo systemctl reload nginx
```

### 정기 점검
```bash
# nginx 상태 확인
sudo systemctl status nginx

# cctv_viewer 상태 확인
docker ps | grep cctv-viewer

# 로그 확인
sudo tail -100 /var/log/nginx/ditcctv-error.log
```

## 참고

- 메인 설정: `/etc/nginx/nginx.conf`
- 사이트 설정: `/etc/nginx/conf.d/dit-viewer.conf`
- SSL 인증서: `/etc/letsencrypt/live/choicho.co.kr/`
- 로그 파일: `/var/log/nginx/ditcctv-*.log`
- cctv_viewer 문서: `dongin_bus/cctv_viewer/DOCKER_DEPLOYMENT.md`
