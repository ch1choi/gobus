# Nginx 설정 파일 목록

이 디렉토리는 동인여객 관련 서비스들의 nginx 설정 파일을 포함합니다.

## 설정 파일

| 파일 | 서비스 | 도메인 | 백엔드 |
|------|--------|--------|--------|
| `dit.conf` | 실시간 환승 도우미 | ditransfer.choicho.co.kr | 정적 파일 + 공공데이터 API 프록시 |
| `dit-viewer.conf` | 버스 CCTV 뷰어 | ditcctv.choicho.co.kr | cctv_viewer 컨테이너 (포트 8888) |

## 공통 설정

### SSL 인증서
모든 서비스는 동일한 SSL 인증서를 사용합니다:
- 경로: `/etc/letsencrypt/live/choicho.co.kr/`
- 인증서: `fullchain.pem`
- 개인키: `privkey.pem`

### HTTP → HTTPS 리다이렉트
모든 서비스는 HTTP(80) 요청을 HTTPS(443)로 자동 리다이렉트합니다.

### Let's Encrypt ACME Challenge
인증서 갱신을 위한 `.well-known/acme-challenge/` 경로가 모든 서비스에 설정되어 있습니다.

## 배포 방법

### 1. 설정 파일 복사
```bash
# 단일 파일
sudo cp nginx/conf.d/dit-viewer.conf /etc/nginx/conf.d/

# 전체 디렉토리
sudo cp nginx/conf.d/*.conf /etc/nginx/conf.d/
```

### 2. 문법 검사
```bash
sudo nginx -t
```

### 3. 적용
```bash
sudo systemctl reload nginx
```

## 서비스별 가이드

- **CCTV Viewer**: [CCTV_VIEWER_NGINX_GUIDE.md](./CCTV_VIEWER_NGINX_GUIDE.md)

## 문제 해결

### 설정 충돌 확인
```bash
# 중복 server_name 확인
sudo nginx -T | grep server_name
```

### 포트 사용 확인
```bash
# 443 포트 사용 중인 프로세스
sudo lsof -i :443

# 80 포트 사용 중인 프로세스
sudo lsof -i :80
```

### 로그 확인
```bash
# 메인 에러 로그
sudo tail -f /var/log/nginx/error.log

# 서비스별 로그
sudo tail -f /var/log/nginx/ditcctv-error.log
```

## 유지보수

### SSL 인증서 갱신
```bash
# 자동 갱신 테스트
sudo certbot renew --dry-run

# 실제 갱신
sudo certbot renew

# nginx 재로드
sudo systemctl reload nginx
```

### 로그 로테이션
nginx 로그는 기본적으로 `/etc/logrotate.d/nginx` 설정에 따라 자동 로테이션됩니다.

## 참고

- nginx 공식 문서: https://nginx.org/en/docs/
- Let's Encrypt: https://letsencrypt.org/
