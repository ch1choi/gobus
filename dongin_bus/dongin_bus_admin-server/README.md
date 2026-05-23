# dongin_bus (ditransfer)

정적 앱 **단일 파일 `index.html`**(노선·정류장 데이터 포함) + 관리자 **업로드 · 롤백 · 다운로드 · 백업 삭제(다중 선택)** 서비스입니다.

## 운영 전체 구성 (DMZ 예시)

다음은 **`dmz-web-svr`** 에 동일 호스트 디렉터리를 두 컨테이너가 공유할 때의 정리입니다. nginx 용어의 **docRoot**(=`root` 디렉터리)와 Node 의 **`DONGIN_BUS_DIR`** 은 **같은 호스트 경로를 서로 다른 방식으로 가리키는 것**입니다.

| 구분 | 역할 | 디렉터리·설정 |
|------|------|----------------|
| **nginx 컨테이너** | `ditransfer.choicho.co.kr` — 사용자에게 환승 안내 **`index.html`** 정적 서빙, `/api/` 공공데이터 프록시, 통계 비콘 역프록시 (`/dit-collect/` → `dongin-bus-admin`) | 호스트 `…/public/dongin_bus` 를 컨테이너의 `root`(등)로 마운트 → 여기 있는 **`index.html`** 이 사용자 응답 |
| **Node(admin-server) 컨테이너** | `dit-admin.choicho.co.kr` — 업로드·롤백·다운로드, 페이지 호출 집계(SQLite) | **동일** 호스트 `…/public/dongin_bus` 를 `DONGIN_BUS_DIR`(예: `/srv/dongin_bus`) 로 마운트 읽기/쓰기 |

**데이터 흐름:** 관리자가 Node 에 파일을 올리거나 롤백하면, 공유 디렉터리 안의 **`index.html`** 이 바뀝니다. DMZ 예에서는 호스트 경로 **`dmz-web-svr:/project2/gimmeQUIZ2.0/public/dongin_bus/index.html`** 한 개를 nginx 가 서빙하고 Node 가 수정합니다. **같은 볼륨·같은 inode** 이므로 별도 복사 없이 반영됩니다. 백업 파일(`index.html_YYYYMMDD_HHmmss`)도 같은 디렉터리에 쌓입니다.

**통계 파일:** 페이지 호출 집계는 기본 **`{DONGIN_BUS_DIR}/_metrics/pageviews.sqlite`** 에 저장됩니다. nginx [`conf.d/dit.conf`](../../nginx/conf.d/dit.conf) 에서 **`/_metrics/` 직링크 접근 차단**(deny)·**`/dit-collect/`** 역프록시가 설정되어 있습니다.

**요청 흐름:**

1. 사용자 → `https://ditransfer.…/` → nginx `try_files` / 정적 → 해당 디렉터리의 `index.html`.
2. 사용자 앱 → **`POST …/dit-collect/pageview`** (`connect-src` 동일 출처 제약 때문에 ditransfer 호스트에만 게시) → nginx 가 **`dongin-bus-admin`** 으로 `POST …/dit-admin/api/collect/pageview` 전달.
3. 관리자 → `https://dit-admin.…/` → (**보통 같은 nginx 컨테이너**에서 `dit-admin.conf` 로 TLS 종료 후) **`proxy_pass` 로 Node 컨테이너**(예: `http://dongin-bus-admin:3000`). 브라우저와 통신하는 것은 계속 nginx 이고, Node 는 백엔드로만 동작합니다.

Compose 예에서 **`dit-admin.conf` 의 `proxy_pass`** 는 `127.0.0.1` 이 아니라 **Docker 네트워크상의 Node 서비스 이름·포트**로 두는 것이 일반적입니다.

## 경로

| 용도 | 저장소 |
|------|--------|
| 공개 페이지(노선 데이터 포함) | [../index.html](../index.html) |
| 사용자용 nginx | [../../nginx/conf.d/dit.conf](../../nginx/conf.d/dit.conf) |
| 관리자 전용 nginx | [../../nginx/conf.d/dit-admin.conf](../../nginx/conf.d/dit-admin.conf) |
| 관리 서버 소스 | [admin-server/](admin-server/) |
| (선택, 추후 분리용) | [data/](data/), [scripts/extract-allBusData.mjs](scripts/extract-allBusData.mjs) |

운영 서버(DMZ) 예: `/project2/gimmeQUIZ2.0/public/dongin_bus/` — **`index.html`** 이 사용자에게 서빙되는 경로와 관리 서버의 `DONGIN_BUS_DIR` 가 동일 디렉터리를 가리키도록 마운트합니다.

## URL

- 사용자: `https://ditransfer.choicho.co.kr/?route=108`
- 관리(전용 호스트): `https://dit-admin.choicho.co.kr/` → `/dit-admin/` 로 안내, UI·API 는 `/dit-admin/...` 경로 유지

## 노선 데이터 수정

운영 반영은 **`index.html` 한 파일**이 기준입니다. 로컬에서 고친 뒤 관리 화면에서 업로드하거나, 관리 화면에서 **다운로드 → 수정 → 업로드** 순으로 작업할 수 있습니다.

개발 시 Embedded `allBusData` 에서 JSON 으로 뽑아 두려면(선택):

```bash
cd docs/nginx/dongin_bus
# HTML 에 allBusData 블록이 있을 때만 의미 있음.
node scripts/extract-allBusData.mjs
```

## 관리자 서버 (admin-server)

### 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `PORT` | 리스닝 포트 | `3000` |
| `DONGIN_BUS_DIR` | `index.html` 이 있는 디렉터리 | 상위 `dongin_bus/` |
| `ADMIN_USER` | 로그인 아이디 | `dongin-admin` |
| `ADMIN_PASS` | 로그인 비밀번호 | `change-me-on-deploy` (**반드시 변경**) |
| `SESSION_KEYS` | cookie-session 키, 쉼표 구분 | 개발용 문자열 (**운영 시 긴 랜덤 문자열**) |
| `COOKIE_SECURE` | `1` 이면 Secure 쿠키 | 미설정 |
| `MAX_UPLOAD_BYTES` | 업로드 최대 크기 | `3145728` |
| `MAX_BACKUPS` | 보관 백업 파일 개수 | `30` |
| `ADMIN_BASE_PATH` | 앱 URL 접두사(관리 UI·API 공통) | `/dit-admin` |
| `MAX_DELETE_BACKUPS` | `delete-backup` API 한 요청당 삭제 상한 | `100` |
| `CCTV_ADMIN_ENABLED` | `0` 이면 CCTV 파일 관리 API·UI 비활성 | `1` (기본) |
| `CCTV_VIEWER_DIR` | CCTV 정적 루트 (생략 시 `{DONGIN_BUS_DIR}/cctv_viewer`) | — |
| `VISIT_DB_PATH` | 페이지 호출 통계 SQLite 경로 | `{DONGIN_BUS_DIR}/_metrics/pageviews.sqlite` |
| `VISIT_TRACKING_ENABLED` | `0` 이면 수집 API 는 204 무기록(no-op)·관리 UI 안내 표시만 | 설정 없음(켜짐) |
| `COLLECT_RATE_LIMIT_PER_MINUTE` | IP 단위 분당 허용 수집 요청 상한 (`/api/collect/pageview`) | `120` |

### 페이지 통계 수집 (`ditransfer` 비콘, 인증 없음)

| 메서드·경로 | 설명 |
|-------------|------|
| `POST /dit-admin/api/collect/pageview` | `application/x-www-form-urlencoded`. **`kind=total`(생략 시 동일)** KST 오늘 **전체 페이지 로드** 카운터 +1. **`kind=route&route=108`** — `108`|`501`|`511`|`513` 만 **노선별** 카운터 +1. 사용자 브라우저에서는 [`dit.conf`](../../nginx/conf.d/dit.conf) 경유 **`POST /dit-collect/pageview`** 로 동일 본문을 보냄. |

### 관리 API (로그인 후)

| 메서드·경로 | 설명 |
|-------------|------|
| `GET /dit-admin/api/status` | 디렉터리, `index.html` 존재 여부, 백업 목록·개수, **`cctv`** (CCTV 요약) |
| `GET /dit-admin/api/visit-stats` | 최근 접속 현황. 쿼리 `days`(기본 30, 최대 366). 응답 `series[]`: `{ date, total, byRoute }`(노선 `108`,`501`,`511`,`513`) 및 `dbDisabled`·`dbUnreachable` 플래그 |
| `POST /dit-admin/api/upload` | `multipart/form-data`, 필드명 `file` — 적용 전 현재 파일 백업 |
| `GET /dit-admin/api/download` | 현재 `index.html` 을 `attachment` 로 내려받기 |
| `POST /dit-admin/api/rollback` | 본문 JSON `{ "backupName": "index.html_YYYYMMDD_HHmmss" }` — 생략 시 가장 최근 백업과 동일(목록에서 선택 권장) |
| `POST /dit-admin/api/delete-backup` | 본문 JSON `{ "backupNames": ["…", "…"] }` 일괄 삭제, 또는 `{ "backupName": "…" }` 단일 삭제. 디스크에서만 제거 (`index.html` 제외). 기본 최대 100개(`MAX_DELETE_BACKUPS`) |

### CCTV 뷰어 소스 (같은 컨테이너, `/srv/dongin_bus/cctv_viewer`)

별도 볼륨 없이 **`DONGIN_BUS_DIR` 와 동일 마운트** 아래 `cctv_viewer/` 를 둡니다. 기본 경로는 **`{DONGIN_BUS_DIR}/cctv_viewer`** (예: `/srv/dongin_bus/cctv_viewer`). 끄려면 환경변수 **`CCTV_ADMIN_ENABLED=0`**. 다른 경로를 쓰려면 **`CCTV_VIEWER_DIR`** 설정.

| 메서드·경로 | 설명 |
|-------------|------|
| `GET /dit-admin/api/status` 응답의 `cctv` | `enabled`, `cctvViewerDir`, `indexExists`, `routesExists`, `backupsIndex`, `backupsRoutes` 등 |
| `GET /dit-admin/api/cctv/download?target=index` | `cctv_viewer/index.html` 다운로드 |
| `GET /dit-admin/api/cctv/download?target=routes` | `data/routes.json` 다운로드 |
| `POST /dit-admin/api/cctv/upload` | `multipart`: 필드 `file`, `target` (`index` \| `routes`). 적용 전 현재 파일 백업 (`index.html_*`, `data/routes.json_*`) |
| `POST /dit-admin/api/cctv/rollback` | JSON `{ "target": "index"\|"routes", "backupName": "…" }` (선택). 생략 시 최신 백업 |
| `POST /dit-admin/api/cctv/delete-backup` | JSON `{ "target": "index"\|"routes", "backupNames": ["…"] }` |

백업 파일명: `cctv_viewer/` 안의 `index.html_YYYYMMDD_HHmmss`, `data/` 안의 `routes.json_YYYYMMDD_HHmmss`. 보관 개수는 기존 `MAX_BACKUPS` 와 동일 규칙(파일 종류별).

**업로드 후 Docker 재시작:** **`cctv_viewer/index.html`** 은 nginx 정적 경로와 동일 디렉터리에 저장되므로 **컨테이너 재시작 없이** 새로고침만으로 반영됩니다. **`data/routes.json`** 은 `cctv-viewer` Node 프로세스가 디스크에서 다시 읽고(`routes.json` 변경 시 CCTV API 메모리 캐시도 무효화), 별도 재시작 없이 다음 요청부터 적용되도록 되어 있습니다. (구버전 이미지는 `require()` 캐시 때문에 재시작이 필요했을 수 있음 → 최신 `cctv-route.js` 배포 권장.)

굳이 컨테이너를 다시 올리고 싶다면 Manager에서 예: `docker service update --force quiz_cctv-viewer` — 기능상 필수는 아닙니다.

### 백업 파일명·충돌 (ditransfer `index.html`)

- 업로드 또는 롤백 전 현재 `index.html` 은 **`index.html_YYYYMMDD_HHmmss`** 형식으로 이름을 바꿔 보관합니다.
- 하루에 여러 번 올려도 **시각까지 포함**되어 파일명이 겹치지 않습니다.
- 롤백: 관리 화면에서 백업 파일을 고르거나, API 에서 `backupName` 으로 지정합니다.
- 백업은 최대 `MAX_BACKUPS` 개만 유지하고 오래된 것은 삭제합니다.

### 로컬 실행

```bash
cd docs/nginx/dongin_bus/admin-server
export ADMIN_PASS='your-secret'
export SESSION_KEYS='랜덤긴문자열1,랜덤긴문자열2'
npm start
```

브라우저에서 `http://127.0.0.1:3000/dit-admin/` (직접 접속 시 프록시 없음).

### Docker / Swarm

이미지 빌드(DMZ 등 **linux/amd64** 대상): `admin-server/build-image.sh`.

**저장소 루트(`gobus/`)에서 통일된 경로로 실행하려면** [docker/build-image-admin.sh](../../docker/build-image-admin.sh) · [docker/upload-image-to-server-admin.sh](../../docker/upload-image-to-server-admin.sh) · [docker/build-and-upload-image-admin.sh](../../docker/build-and-upload-image-admin.sh) 를 사용할 수 있습니다 (`DEPLOY_SERVER` 등 환경변수 동일).

서버로 이미지 전달(`docker save` → SSH → `docker load`), 기본 대상 **`quizadm@192.168.219.166`**:

```bash
cd docs/nginx/dongin_bus/admin-server
./upload-image-to-server.sh
# 빌드까지 한 번에: ./build-and-upload-image.sh
# 다른 호스트: DEPLOY_SERVER=quizadm@다른IP ./upload-image-to-server.sh
```

스택 예시는 [admin-server/swarm-stack-proxmox.yml](admin-server/swarm-stack-proxmox.yml) 의 **`dongin-bus-admin`** 서비스(dmz-web 존). 배포 전 서버에 `admin-server/env/dongin-bus-admin.env` 생성: `env/dongin-bus-admin.example.env` 참고(실파일은 `.gitignore`).

이미지 빌드 후 `DONGIN_BUS_DIR` 에 호스트 `dongin_bus` 를 마운트합니다. 스택에서는 `/project2/gimmeQUIZ2.0/public/dongin_bus:/srv/dongin_bus` 로 nginx 정적 경로와 동일합니다.

HTTPS 관리 도메인에서는 **`COOKIE_SECURE=1`** (스택에 반영됨). **`nginx-proxy` 가 컨테이너인 경우** [dit-admin.conf](../conf.d/dit-admin.conf) 의 `proxy_pass` 는 **`http://dongin-bus-admin:3000`** 으로 두어 오버레이 DNS 로 Node 에 연결합니다.

### nginx

- 사용자 페이지·공공 API 프록시: [dit.conf](../conf.d/dit.conf) (`ditransfer.choicho.co.kr`).
- 관리자(Node 프록시): [dit-admin.conf](../conf.d/dit-admin.conf) (`dit-admin.choicho.co.kr`). TLS SAN 에 관리 호스트명을 포함하세요.
- `dit-admin.conf` 의 `proxy_pass`(예: `127.0.0.1:3000`)는 배포 환경에 맞게 수정합니다.
- `limit_req zone=api` 는 상위 `nginx.conf` 에 `limit_req_zone` 이 있어야 합니다. 없으면 해당 줄만 제거하면 됩니다.
- **`ADMIN_BASE_PATH` 를 바꾼 경우** `dit-admin.conf` 안의 `/dit-admin` 리다이렉트·`location = /dit-admin` 블록도 같은 접두사로 맞춰야 합니다.

## 보안

- 기본 계정/비밀번호는 **배포 즉시 변경**하세요.
- 레포에 비밀번호를 커밋하지 말고 환경변수로 주입하세요.
- `SESSION_KEYS` 는 운영에서 최소 32바이트 이상 난수를 사용하세요.
