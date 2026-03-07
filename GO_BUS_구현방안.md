# GO BUS! 구현 방안 (기술 문서)

## 1. 개요

본 문서는 **GO BUS!** 미니 프로젝트의 기술 스택, 아키텍처, 데이터 구조, API·라이브러리 활용 방안을 정리한 구현 방안 문서이다.  
기존 `alarm.html`(스마트 출발 알람) 샘플을 참고하여, 동일한 패턴으로 GO BUS! 전용 구현 시 적용할 기술 요소를 기술한다.

---

## 2. 기술 스택

| 구분 | 기술 | 용도 |
|------|------|------|
| **프론트엔드** | HTML5 + React 18 (UMD) | SPA 구조, 컴포넌트·상태 관리 |
| **스타일** | Tailwind CSS (CDN) | 반응형·모바일 UI |
| **OCR** | Tesseract.js 5 | 이미지 내 텍스트 → 출발시간 추출 |
| **빌드** | 없음 (단일 HTML + CDN) | 빠른 프로토타입, 배포 단순화 |
| **스크립트 변환** | Babel Standalone | JSX → 브라우저 실행 가능 코드 |

- **선택 사항**: PWA(manifest + Service Worker) 적용 시 오프라인 캐시, 홈 화면 추가 가능.
- **서버 구성**: 화면 잠금/백그라운드 시 알람 보장이 필요하면 **서버 + Web Push** 구성이 필수. 기술 제안은 **§10 추가 요구사항 검토 및 서버 구성 제안** 참고.

---

## 3. 시스템 구성도

```
[사용자]
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│  브라우저 (모바일 웹)                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ 카메라/     │  │ Tesseract.js│  │ 알람 체크 루프   │  │
│  │ 파일 업로드  │→ │ (OCR)       │→ │ (setInterval)   │  │
│  └─────────────┘  └─────────────┘  └────────┬────────┘  │
│         │                  │                 │          │
│         └──────────────────┴─────────────────┘          │
│                            │                             │
│  ┌─────────────────────────▼─────────────────────────┐  │
│  │ React 상태: extractedTimes, selectedTimes, alarms  │  │
│  └─────────────────────────┬─────────────────────────┘  │
│                            │                             │
│  ┌─────────────────────────▼─────────────────────────┐  │
│  │ localStorage (알람 목록 영속화)                      │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Web API: Wake Lock, Notification, Vibration,       │  │
│  │         MediaDevices, AudioContext                 │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

- **클라이언트 전용**: 위 구성은 서버 없이 동작. 촬영·업로드·OCR·알람 등록은 클라이언트에서 수행. 알람 발생은 **탭이 포그라운드일 때**만 신뢰 가능.
- **데이터 저장**: `localStorage`에 알람 목록만 저장하여 재방문 시 복원.
- **서버 구성 시**: 화면 잠금/백그라운드에서도 알람을 보장하려면 §10의 서버·Web Push 구성을 적용한다.

---

## 4. 핵심 구현 요소

### 4.1 이미지 입력 (F-01 대응)

| 방식 | 기술 | 비고 |
|------|------|------|
| **카메라 촬영** | `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })` | 후면 카메라 선호(시간표 촬영). |
| **캡처** | `<video>` + `<canvas>` 로 현재 프레임을 그려 `canvas.toDataURL('image/jpeg')` 로 데이터 URL 생성. | 촬영 후 한 장만 전달. |
| **갤러리 업로드** | `<input type="file" accept="image/*">` + `FileReader.readAsDataURL()` | 사진첩에서 이미지 선택. |

- 촬영/업로드 전에 **오디오 컨텍스트 초기화**(`AudioContext.resume()`)를 한 번 호출해 두면, 이후 알람 소리 재생 시 모바일에서 차단되는 문제를 줄일 수 있음(사용자 제스처 직후 호출 권장).

---

### 4.2 출발시간 추출 (F-02 대응)

**OCR**

- **Tesseract.js** (`tesseract.js@5`): 브라우저에서 동작하는 OCR. 워커로 실행하여 메인 스레드 블로킹을 줄인다.
- **언어**: `createWorker('kor+eng')` — 한글·숫자·영문 시간표 대응.

**이미지 전처리(선택)**

- `Canvas 2D`: `ctx.filter = 'grayscale(100%) contrast(150%) brightness(1.2)'` 등으로 대비를 높여 인식률 개선(기존 alarm.html과 동일).

**시간 패턴 정규식**

- 예: `/(?:^|\s|[^0-9])([01]?[0-9]|2[0-3])\s*[:.시]\s*([0-5][0-9])(?:분)?(?:\s|$|[^0-9])/g`
- 매칭된 `(시, 분)`을 `HH:MM` 문자열로 정규화 후, **현재 시각 이후**만 필터링.
- “도착”, “소요”, “걸리는”, “종점” 등이 포함된 줄은 제외하여 출발시간만 남기기(선택 로직).

**결과 처리**

- `Set`으로 중복 제거 후 정렬하여 `extractedTimes` 상태에 저장.

---

### 4.3 알람 선택·등록·목록 (F-03, F-04 대응)

**상태 설계**

- `extractedTimes`: OCR로 추출된 출발시간 문자열 배열 (`['09:00', '09:30', ...]`).
- `selectedTimes`: 사용자가 선택한 출발시간 배열.
- `alarms`: 등록된 알람 객체 배열.  
  - 예: `{ id, date, originalTime, alarmTime, offset, active }`  
  - `originalTime`: 출발 시각, `alarmTime`: 알람이 울리는 시각(출발 − N분), `offset`: N분.

**알람 시각 계산**

- `alarmTime = originalTime - offsetMinutes` (분 단위로 계산 후 다시 `HH:MM` 문자열로 저장).

**영속화**

- `useEffect`에서 `alarms` 변경 시 `localStorage.setItem('smartAlarms', JSON.stringify(alarms))` 실행.
- 초기 로드 시 `localStorage.getItem('smartAlarms')` 로 복원하고, **당일 날짜**만 필터링하여 사용(선택 사항).

---

### 4.4 출발 N분 전 알람 발생 (F-05 대응)

**알람 체크**

- `setInterval(..., 5000)` 또는 `60000`(1분) 주기로 현재 시각 `HH:MM`과 각 `alarm.alarmTime`을 비교.
- 일치하고 `alarm.active === true` 이면 알람 트리거 후 해당 알람을 `active: false` 로 변경.

**알람 발생 시 동작**

1. **소리**: Web Audio API (`OscillatorNode` + `GainNode`)로 비프 패턴 재생, `setInterval`로 반복 + `navigator.vibrate([400, 200, 400])` (지원 시).
2. **브라우저 알림**: `Notification.requestPermission()` 후, 알람 시 `new Notification("출발 알람!", { body: "...", requireInteraction: true })` — 앱이 백그라운드일 때 사용자 인지에 유리.
3. **화면 꺼짐 방지**: Screen Wake Lock API (`navigator.wakeLock.request('screen')`) — 알람 화면이 보이는 동안 화면 유지. 탭이 다시 보일 때 `visibilitychange`에서 재요청.

**알람 해제**

- 사용자가 “알람 끄기” 버튼 클릭 시 `clearInterval`로 반복 소리 중단, `setRingingAlarm(null)` 등으로 모달/UI 닫기.

---

## 5. 데이터 구조

### 5.1 알람 객체 (Alarm)

```ts
interface Alarm {
  id: string;           // 고유 ID (예: random string)
  date: string;         // 날짜 문자열 (예: toDateString())
  originalTime: string;  // 출발시간 "HH:MM"
  alarmTime: string;    // 알람 울리는 시각 "HH:MM"
  offset: number;       // 출발 N분 전 (기본 5)
  active: boolean;      // 아직 알람이 안 울렸으면 true
}
```

### 5.2 localStorage 키

| 키 | 용도 |
|----|------|
| `smartAlarms` | 알람 배열 JSON. 앱 로드 시 복원. |

---

## 6. 브라우저 API 요약

| API | 용도 |
|-----|------|
| **MediaDevices.getUserMedia** | 카메라 스트림 |
| **Canvas 2D** | 비디오 프레임 캡처, 이미지 전처리 |
| **FileReader** | 로컬 이미지 파일 → Data URL |
| **Tesseract.js** | OCR (WASM/Worker 기반) |
| **localStorage** | 알람 목록 저장 |
| **AudioContext** | 알람 비프음 |
| **Notification** | 푸시 알림(백그라운드 시) |
| **Vibration** | 진동 |
| **Wake Lock** | 화면 꺼짐 방지 |
| **Page Visibility** | 탭 전환 시 Wake Lock 재요청 |

---

## 7. 디렉터리/파일 구성

```
smartAlarm/
├── gobus.md                 # 프로젝트 요약
├── GO_BUS_기능정의서.md     # 기능정의서
├── GO_BUS_구현방안.md       # 본 기술 문서
├── alarm.html               # 참고 샘플 (스마트 출발 알람)
├── gobus.html               # GO BUS! 프론트 (Web Push 연동)
├── sw.js                    # Service Worker (푸시 수신·알림 표시)
├── manifest.json            # PWA manifest (iOS 홈화면 추가 대응)
├── img/
│   ├── time_table01.jpeg
│   └── time_table02.jpeg
├── server/                  # 백엔드
│   ├── package.json
│   ├── index.js             # Express + 정적 + API + 스케줄러
│   ├── db.js                # SQLite 스키마·CRUD
│   ├── push.js              # VAPID·web-push 발송
│   └── scheduler.js         # 1분마다 알람 시각 체크 후 푸시
├── Dockerfile               # 단일 이미지 (Node + server + 정적)
└── .env.example             # VAPID 키, PORT 등
```

- **자체 구현 시 VAPID 키**: `npx web-push generate-vapid-keys`로 키 쌍 생성 후, public key는 서버가 `/api/vapid-public`로 제공하고, private key는 `.env`의 `VAPID_PRIVATE_KEY`로 설정. `.env.example` 참고.

---

## 8. 주의사항 및 제약

- **백그라운드/화면 잠금 알람**: 브라우저는 탭 비활성·백그라운드·화면 꺼짐 시 `setInterval`을 throttling·중단함. **클라이언트만으로는 이 상황에서의 알람을 보장할 수 없으며**, 보장이 필요하면 §10의 **서버 + Web Push** 구성이 필수.
- **포그라운드 한정**: 서버를 쓰지 않을 때는 알림(Notification)·Wake Lock로 보완 가능하나, 탭이 활성일 때만 신뢰할 수 있음.
- **iOS Safari**: Wake Lock, 일부 Notification·Web Push 동작이 제한적일 수 있음. 테스트 필요.
- **OCR 품질**: 촬영 각도·해상도·조명에 따라 인식률이 달라짐. 전처리(그레이스케일·대비)와 정규식 튜닝으로 보완.
- **데이터**: 서버 미사용 시 모든 데이터는 기기 내부에만 존재. 서버 구성 시 알람·구독은 서버 저장소에 보관.

---

## 9. 참조

- **기능정의서**: `GO_BUS_기능정의서.md`
- **샘플 코드**: `smartAlarm/alarm.html`
- **Tesseract.js**: https://tesseract.projectnaptha.com/
- **Wake Lock API**: MDN – Screen Wake Lock API
- **Web Notifications**: MDN – Notifications API

---

## 10. 추가 요구사항 검토 및 서버 구성 제안

### 10.1 추가 요구사항 검토

| 요구사항 | 내용 | 검토 |
|----------|------|------|
| **도메인** | `http://gobus.choicho.co.kr:8080` | 서비스 접속 주소. 리버스 프록시(nginx 등)에서 8080으로 전달하거나, 앱이 8080에서 직접 서빙. |
| **서버 환경** | 리눅스 + Docker 컨테이너, 웹 포트 8080 | 컨테이너 내부에서 웹/API 서버를 8080으로 바인딩하면 됨. 호스트 포트 매핑은 `-p 8080:8080` 등으로 처리. |
| **화면 잠금/백그라운드 시 알람** | 가장 중요한 기능 | **클라이언트만으로는 보장 불가**. 브라우저는 탭 비활성·화면 잠금 시 JS 실행을 강하게 제한하므로, **서버에서 시각에 맞춰 푸시를 보내는 방식**이 필수. |

**결론**: “화면 잠금 / 백그라운드 전환 시에도 알람 발생”을 보장하려면 **서버 구성이 필수**이며, **Web Push**를 이용해 OS 수준 알림으로 전달하는 구조를 권장한다.

---

### 10.2 서버가 필요한 이유 (백그라운드/잠금 시 알람)

- **클라이언트 한계**: 모바일 브라우저는 탭이 백그라운드이거나 화면이 꺼지면 `setInterval`/`setTimeout`을 throttling·중단한다. 따라서 “N분 후에 정확히 알람”을 **클라이언트 타이머만으로는 보장할 수 없다**.
- **Web Push**: 서버가 **알람 시각에 맞춰** Web Push를 보내면, OS가 화면 잠금/백그라운드 상태에서도 **푸시 알림**을 표시하고, 사용자가 탭을 열면 포그라운드 알람(소리·진동)과 연계할 수 있다.

---

### 10.3 서버 구성 시 기술 제안

#### 10.3.1 전체 스택 제안

| 구분 | 기술 | 용도 |
|------|------|------|
| **컨테이너** | Docker | 리눅스 서버에서 서비스 단일 이미지로 기동. |
| **웹/정적** | Nginx (또는 Node 서버) | 정적 파일(HTML/JS/CSS) 서빙, 리버스 프록시. 포트 8080 리스닝. |
| **API 서버** | Node.js (Express/Fastify) 또는 Python (FastAPI) | 알람 등록·조회·삭제, 푸시 구독 등록 API. |
| **푸시 알림** | Web Push (VAPID) | 구독 저장 후 알람 시각에 서버에서 푸시 발송. |
| **스케줄러** | Node `node-cron` / `agenda` 또는 별도 cron + 스크립트 | 1분 단위(또는 적절 주기)로 “지금 울려야 할 알람” 조회 후 푸시 발송. |
| **저장소** | SQLite 또는 Redis 또는 PostgreSQL | 푸시 구독 정보, 알람 예정 시각 저장. 규모가 작으면 SQLite로 충분. |

#### 10.3.2 권장 조합 (미니 프로젝트용)

- **옵션 A (단순)**  
  - **Node.js 하나**로 정적 서빙 + API + cron 스타일 스케줄러.  
  - **SQLite**로 구독·알람 저장.  
  - **web-push** 라이브러리로 VAPID 키 생성·푸시 발송.  
  - Docker 이미지: Node 기반, 단일 프로세스.

- **옵션 B (역할 분리)**  
  - **Nginx**: 정적 파일 + 리버스 프록시(8080 → Node API).  
  - **Node.js**: API 전용 + 내부 스케줄러 + web-push.  
  - **SQLite 또는 Redis**: 알람·구독 저장.  
  - Docker: nginx 컨테이너 + node 컨테이너(같은 네트워크).

둘 다 리눅스 서버에서 Docker로 8080 노출 가능하다.

---

### 10.4 서버 구성을 쓸 때의 시스템 구성도

```
[사용자 단말]
    │
    │  HTTPS (gobus.choicho.co.kr:8080)
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Docker Host (Linux)                                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Nginx (또는 Node 정적)  :8080                                ││
│  │  - 정적 파일 (gobus.html, PWA manifest, Service Worker)      ││
│  │  - /api/* → API 서버로 프록시                                 ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  API 서버 (Node/Python)                                       ││
│  │  - POST /api/subscribe   : 푸시 구독 등록                     ││
│  │  - POST /api/alarms      : 알람 등록 (구독 ID + 알람 시각)    ││
│  │  - GET  /api/alarms      : 알람 목록 조회                     ││
│  │  - DELETE /api/alarms/:id: 알람 삭제                         ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  스케줄러 (1분마다 또는 cron)                                 ││
│  │  - alarmTime <= 현재시각 인 알람 조회                         ││
│  │  - 해당 구독에 Web Push 발송 후 알람 비활성/삭제 처리         ││
│  └─────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  저장소 (SQLite / Redis / PostgreSQL)                        ││
│  │  - push_subscriptions, alarms                                ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

- **클라이언트**: 알람 등록 시 기존처럼 `originalTime`, `alarmTime`, `offset`을 계산해 **API로 전송**하고, **Web Push 구독**을 한 번 등록해 서버에 저장한다.
- **서버**: 저장된 알람 중 `alarmTime`이 된 것을 주기적으로 찾아, 해당 구독에 **Web Push**만 보내면 된다. 화면 잠금/백그라운드에서도 OS가 알림을 띄운다.

---

### 10.5 서버 측 데이터·API 요약

**저장 테이블(예시)**

- **push_subscriptions**: `id`, `endpoint`, `keys_p256dh`, `keys_auth`, `created_at` (또는 디바이스/사용자 식별자 추가).
- **alarms**: `id`, `subscription_id`(또는 endpoint), `date`, `original_time`, `alarm_time`, `offset_minutes`, `active`, `created_at`.

**Web Push (VAPID)**

- 서버에서 VAPID 키 쌍 생성: `npx web-push generate-vapid-keys`. public key는 `GET /api/vapid-public`로 노출, private key는 환경변수 `VAPID_PRIVATE_KEY`에 설정(.env 또는 Docker `-e`). 클라이언트가 `PushManager.subscribe(applicationServerKey)` 할 때 public key 사용.
- 알람 시각에 `web-push.sendNotification(subscription, payload)` 호출. payload에 제목·본문(예: "14:30 출발 5분 전") 포함.

**도메인·포트**

- 서비스 URL: `http://gobus.choicho.co.kr:8080` (운영 시 HTTPS 권장. Web Push는 HTTPS 또는 localhost에서만 동작).
- Docker: 컨테이너 내부 8080 → 호스트 8080 매핑. 필요 시 리버스 프록시 앞단에서 HTTPS 종료.

---

### 10.6 클라이언트 측 변경 요약

- 알람 등록 시 **로컬 상태 + localStorage**에 더해 **서버 API에 알람 등록** 및 **푸시 구독 전송**.
- **Service Worker** 등록 후 `push` 이벤트에서 푸시 수신 시 알림 표시(및 필요 시 클릭 시 앱 열기).
- 포그라운드일 때는 기존처럼 **로컬 타이머 + 소리/진동** 유지 가능(중복 방지를 위해 서버 푸시는 “이미 울린” 알람은 제외하거나, 클라이언트에서 한 번만 재생하도록 처리).

---

### 10.7 Web Push 구현을 위한 3rd 파티 솔루션 제안

직접 VAPID + `web-push` 라이브러리로 구현하지 않고, 푸시 인프라를 위임하고 싶을 때 아래 서비스를 고려할 수 있다.

| 솔루션 | 요약 | 무료 한도 | GO BUS! 적용 시 참고 |
|--------|------|-----------|----------------------|
| **OneSignal** | 이메일·SMS·앱 푸시·**웹 푸시** 통합. 대시보드·세그먼트·A/B 테스트 제공. | 웹 푸시 **무제한** 무료 | 소규모·미니 프로젝트에 유리. SDK로 구독·발송 간단. |
| **Firebase Cloud Messaging (FCM)** | Google 공식. Android 앱 푸시 경유 필수, 웹은 Push API + VAPID 지원. | 무료 (할당량 내) | Google/ Firebase 이미 사용 중이면 선택. 웹만 쓸 때는 설정이 다소 복잡할 수 있음. |
| **Pusher Beams** | 개발자 친화 API·문서. 웹·iOS·Android 푸시. | **2,000 디바이스**까지 무료, 이후 유료 | 디바이스 수 적을 때 적합. 무료 초과 시 비용 발생. |
| **Knock** | 알림 오케스트레이션(웹 푸시·이메일·인앱 등)·워크플로·배치. | 플랜별 | 푸시 외에 이메일 등 다채널 알림이 필요할 때 검토. |
| **Amazon SNS** | AWS 기반 메시지·푸시. 모바일·웹 푸시 지원. | 사용량 기반 과금 | 이미 AWS 인프라 사용 시 선택지. 직접 연동 구현 필요. |

**GO BUS! 권장**

- **서버 없이/최소 서버로 빠르게**: **OneSignal** — 웹 푸시 무제한 무료, SDK로 구독·발송 코드 최소화. 대시보드에서 발송 테스트 가능.
- **이미 Firebase 사용 중**: **FCM** — 웹 클라이언트에 FCM SDK 적용 후 서버에서 FCM HTTP v1 API로 발송.
- **풀 컨트롤·비용 최소화**: **자체 구현 (VAPID + `web-push`)** — §10.3~10.5 구조대로 구현. 3rd 파티 의존성·비용 없음.

---

### 10.8 Web Push 클라이언트 수신 제약사항

서버에서 알람 시각에 Web Push를 보내도, **클라이언트(브라우저·OS) 정책** 때문에 아래와 같은 제약이 있다. “화면 잠금/백그라운드에서도 알람”을 목표로 할 때 반드시 고려해야 한다.

#### 10.8.1 플랫폼별 제약

| 구분 | 제약 내용 | 비고 |
|------|-----------|------|
| **iOS (Safari)** | **홈 화면에 추가한 PWA에서만** Web Push 지원. 일반 Safari 탭(인앱 브라우저 포함)에서는 푸시 구독·수신 불가. | iOS 16.4+ 부터 지원. 사용자에게 “홈 화면에 추가” 후 앱처럼 실행하도록 안내 필요. |
| **iOS** | **무음(백그라운드) 푸시 불가**. 모든 푸시는 사용자에게 보이는 알림으로 표시해야 하며, 표시하지 않으면 Safari가 푸시 권한을 회수할 수 있음. | 알람용 푸시는 “표시 필수”로 두면 됨. |
| **iOS** | 푸시 권한 요청은 **사용자 제스처(탭·클릭)** 직후에만 가능. | 구독 버튼 등 명시적 동작 후 요청. |
| **Android** | 브라우저가 **완전 종료(프로세스 터미네이트)** 상태면 푸시 수신 불가. 백그라운드에 있거나 탭만 닫은 상태면 OS가 브라우저를 깨워 푸시 전달 가능. | 대부분 “백그라운드/잠금”에서는 도달 가능. 사용자가 “최근 앱에서 브라우저 제거”하면 당시에는 미도달 가능성 있음. |
| **Android** | PWA 알림의 **소리·진동**은 브라우저·OS 버전에 따라 다름. 일부 환경에서는 소리만 되고 진동이 안 되거나, 반대일 수 있음. | `showNotification` 옵션으로 `sound`, `vibrate` 지정. 동작은 기기 설정·OS에 맡김. |

#### 10.8.2 공통 제약

| 제약 | 설명 |
|------|------|
| **브라우저 완전 종료** | 사용자가 브라우저를 “완전히 종료”(앱 스위처에서 제거 등)한 경우에는 푸시가 도달하지 않음. 백그라운드 또는 탭만 닫은 상태와 구분 필요. |
| **Service Worker 필수** | Web Push 수신은 **Service Worker**의 `push` 이벤트에서 처리. SW 미지원 브라우저에서는 웹 푸시 자체 불가. (iOS 18.4+ Declarative Web Push는 예외적으로 SW 없이 가능.) |
| **HTTPS (또는 localhost)** | 푸시 구독·발송은 **HTTPS** 또는 **localhost** 환경에서만 동작. `https://gobus.choicho.co.kr` 만으로는 푸시 불가 → 운영 시 HTTPS 적용 필요. |
| **사용자 권한** | 알림 권한을 사용자가 “거부”하면 푸시를 보낼 수 없음. 한 번 거부 시 브라우저 설정에서만 해제 가능. |
| **잠금 화면 표시** | 푸시 자체는 **잠금 화면에 표시 가능**(OS 알림으로). 단, 소리·진동은 **기기의 알림 설정**(음소거·방해 금지 모드 등)에 따름. |

#### 10.8.3 GO BUS! 적용 시 정리

- **“포그라운드일 때만 동작”** → 아님. Web Push는 **백그라운드·잠금 화면**에서도 OS가 알림을 띄우므로, 클라이언트 타이머보다 훨씬 안정적.
- **“스마트폰 화면이 잠겨 있으면 알람 발송 불가”** → 아님. 서버가 보낸 푸시는 **잠금 화면에도 표시**되며, 소리·진동은 기기 알림 설정을 따름.
- **실제 제약**: (1) **iOS**는 반드시 **홈 화면 추가 PWA**로 사용해야 푸시 가능. (2) **브라우저 완전 종료** 시에는 당시에는 미도달. (3) **HTTPS** 및 **사용자 알림 허용** 필수.

따라서 서비스 안내에 “iOS는 홈 화면에 추가 후 사용해 주세요”, “알람을 받으려면 알림 권한을 허용해 주세요”를 포함하는 것을 권장한다.

---

*문서 버전: 1.3 | 최종 수정: 2025-03-06 (실제 디렉터리·VAPID 설정 반영)*
