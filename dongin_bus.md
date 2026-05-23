
## URL
https://ditransfer.choicho.co.kr/

## 소스경로
/project2/gimmeQUIZ2.0/public/dongin_bus/index.html

## nginx 설정
```
quizadm@dmz-web-svr:~/nginx$ cat nginx.conf
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
    use epoll;
    multi_accept on;
}

http {
    # Docker Swarm 내부 DNS resolver 설정
    # 동적 DNS 해석을 위해 resolver 추가
    resolver 127.0.0.11 valid=10s;
    resolver_timeout 5s;
    
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 보안 헤더 제거
    server_tokens off;

    # 로그 포맷
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;

    # 기본 성능 설정
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 30;
    types_hash_max_size 2048;
    client_max_body_size 100M;
    client_body_timeout 60;
    client_header_timeout 60;
    send_timeout 60;

    # Gzip 압축
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # 보안 설정 - Rate Limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
    limit_conn_zone $binary_remote_addr zone=conn_limit_per_ip:10m;

    # SSL 설정
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_session_tickets off;
    ssl_stapling on;
    ssl_stapling_verify on;

    # 보안 헤더 (기본)
    add_header Access-Control-Allow-Origin * always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    #add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://generativelanguage.googleapis.com; frame-ancestors 'self';";
    #add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "0" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header X-Permitted-Cross-Domain-Policies "none" always;
    add_header Permissions-Policy "accelerometer=(), autoplay=(), camera=(), cross-origin-isolated=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), keyboard-map=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-get=(), screen-wake-lock=(), sync-xhr=(self), usb=(), web-share=(), xr-spatial-tracking=()" always;

    # 가상 호스트 설정 포함
    include /etc/nginx/conf.d/*.conf;
} 
```
```
quizadm@dmz-web-svr:~/nginx/conf.d$ cat default.conf
# HTTP 서버 블록
server {
    listen 80;
    listen [::]:80;
    server_name gimmequiz.choicho.store gimmequiz.choicho.co.kr;

    # Let's Encrypt 인증서 갱신을 위한 설정
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # HTTP를 HTTPS로 리다이렉트
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS 서버 블록
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name gimmequiz.choicho.store gimmequiz.choicho.co.kr;

    # SSL 인증서 설정
    ssl_certificate /etc/letsencrypt/live/choicho.co.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/choicho.co.kr/privkey.pem;

    error_page 400 401 403 404 405 500 502 503 504 /error/error.html;

    # 루트 경로 설정
    location / {
        root /project2/gimmeQUIZ2.0/public;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 이미지 파일 접근 허용
    location /images/ {
        root /project2/gimmeQUIZ2.0/public;
        try_files $uri $uri/ =404;
        add_header Access-Control-Allow-Origin "*";
    }

    # 딥링크를 위한 .well-known 디렉토리 설정
    location /.well-known/ {
        root /project2/gimmeQUIZ2.0/public;
        default_type application/json;
    }

    # apple-app-site-association 파일 설정 (/.well-known 외에도 루트에서도 접근 가능하게)
    location = /apple-app-site-association {
        root /project2/gimmeQUIZ2.0/public/.well-known;
        default_type application/json;
    }

    # 초대 링크 처리를 위한 설정
    location /invite {
        root /project2/gimmeQUIZ2.0/public;
        try_files $uri $uri/ /invite.html;
    }

    # 계정 삭제 가이드 페이지
    location = /withdrawal-guide {
        root /project2/gimmeQUIZ2.0/public;
        try_files /withdrawal-guide.html =404;
    }

    location = /app-ads.txt {
        root /project2/gimmeQUIZ2.0/public;
    }

    location ^~ /error/ {
        root /project2/gimmeQUIZ2.0/public;
        location ~* \.(jpg|jpeg|png|gif|ico)$ {
            root /project2/gimmeQUIZ2.0/public;
        }
    }

    location /public {
        internal;
        root /project2/gimmeQUIZ2.0/;
    }

    # 이미지 업로드 경로 프록시 설정
    location /uploads/ {
        # 동적 DNS 해석을 위한 변수 사용
        set $event_service "event-service:3003";
        proxy_pass http://$event_service/uploads/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 이미지 캐싱 설정
        expires 1y;
        add_header Cache-Control "public, immutable";
        
        # 타임아웃 설정
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # 대용량 파일 처리를 위한 버퍼 설정
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }

    # 프록시 설정
    location /api {
        # 동적 DNS 해석을 위한 변수 사용
        set $api_gateway "api-gateway:3000";
        proxy_pass http://$api_gateway;
        proxy_http_version 1.1;
        
        # WebSocket 지원을 위한 헤더 설정
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 프록시 헤더 설정
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# ----- SFC (숏폼 웹/API) https://sfc.choicho.co.kr -----
# HTTP → HTTPS 리다이렉트
server {
    listen 80;
    listen [::]:80;
    server_name sfc.choicho.co.kr;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

# SFC HTTPS
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name sfc.choicho.co.kr;

    ssl_certificate /etc/letsencrypt/live/choicho.co.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/choicho.co.kr/privkey.pem;

    access_log /var/log/nginx/sfc-access.log main;
    error_log /var/log/nginx/sfc-error.log warn;

    client_max_body_size 100M;

    # SFC 전용 CSP: Tailwind·Google Fonts·Material Icons CDN 허용 (전역 CSP 덮어씀)
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self';" always;

    # 웹(SPA) + API 모두 sfc-api-gw 경유 (api-gw가 sfc-svr로 프록시)
    location / {
        set $sfc_api_gw sfc-api-gw:3000;
        proxy_pass http://$sfc_api_gw;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 120s;
        proxy_send_timeout 900s;
        proxy_read_timeout 900s;
    }

    location /sfc-api {
        set $sfc_api_gw sfc-api-gw:3000;
        proxy_pass http://$sfc_api_gw;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 120s;
        proxy_send_timeout 900s;
        proxy_read_timeout 900s;
    }

    location /downloads/ {
        set $sfc_api_gw sfc-api-gw:3000;
        proxy_pass http://$sfc_api_gw;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 120s;
        proxy_send_timeout 900s;
        proxy_read_timeout 900s;
    }
}

# ----- goCat https://gocat.choicho.co.kr -----
# HTTP → HTTPS 리다이렉트
server {
    listen 80;
    listen [::]:80;
    server_name gocat.choicho.co.kr;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name gocat.choicho.co.kr;

    ssl_certificate /etc/letsencrypt/live/choicho.co.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/choicho.co.kr/privkey.pem;

    location = /health {
        proxy_pass http://gocat-ranking-service:3000/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /api/v1/ranking/ {
        proxy_pass http://gocat-ranking-service:3000/api/v1/ranking/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Device-Id $http_x_device_id;
        proxy_set_header X-App-Version $http_x_app_version;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 15s;
    }
}
quizadm@dmz-web-svr:~/nginx/conf.d$ cat n8n.conf 
# n8n HTTP 서버 블록 (HTTPS 리다이렉트용)
server {
    listen 80;
    listen [::]:80;
    server_name n8n.choicho.co.kr;

    # Let's Encrypt 인증서 갱신을 위한 설정
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # HTTP를 HTTPS로 리다이렉트
    location / {
        return 301 https://$host$request_uri;
    }
}

# n8n HTTPS 서버 블록
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name n8n.choicho.co.kr;

    # SSL 인증서 설정 (기존 와일드카드 인증서 사용)
    ssl_certificate /etc/letsencrypt/live/choicho.co.kr/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/choicho.co.kr/privkey.pem;

    # 로그 설정
    access_log /var/log/nginx/n8n-access.log;
    error_log /var/log/nginx/n8n-error.log;

    # 클라이언트 최대 업로드 크기
    client_max_body_size 50M;

    # n8n 프록시 설정
    location / {
        # 방법 1: Docker Swarm 네트워크에 연결된 경우 (n8n이 quiz-network에 연결된 경우, 권장)
        set $n8n_service "n8n:5678";
        proxy_pass http://$n8n_service;
        
        # 방법 2: 호스트 포트로 접근 (Docker Compose로 독립 실행 시)
        # Linux 환경에서 Docker 기본 브리지 IP 사용
        # proxy_pass http://172.17.0.1:5678;
        
        # 방법 3: 호스트 네트워크 모드 사용 (nginx가 host 네트워크 모드인 경우)
        # proxy_pass http://localhost:5678;
        
        proxy_http_version 1.1;
        
        # WebSocket 지원
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # 프록시 헤더 설정
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
	proxy_set_header Origin "https://n8n.choicho.co.kr";
        
        # 타임아웃 설정 (n8n 워크플로우 실행 시간 고려)
        proxy_connect_timeout 600s;
        proxy_send_timeout 600s;
        proxy_read_timeout 600s;
        
        # 버퍼 설정
        proxy_buffering off;
    }
}
```



