# Docker 환경 변수 파일

이 디렉토리는 Docker Swarm Stack 배포 시 사용되는 환경 변수 파일들을 포함합니다.

## 파일 목록

| 파일 | 서비스 | 설명 |
|------|--------|------|
| `cctv-viewer.env.example` | cctv-viewer | CCTV Viewer 환경 변수 템플릿 |
| `cctv-viewer.env` | cctv-viewer | 실제 API 키 포함 (gitignore) |

## 사용 방법

### 1. 초기 설정

```bash
# example 파일을 실제 파일로 복사
cp cctv-viewer.env.example cctv-viewer.env

# 실제 값으로 수정
vi cctv-viewer.env
```

### 2. 서버 배포 시

```bash
# 로컬에서 서버로 복사
scp -r docker/env/ quizadm@192.168.219.196:~/docker/

# 또는 서버에서 직접 생성
ssh quizadm@192.168.219.196
cd ~/docker/env
cp cctv-viewer.env.example cctv-viewer.env
vi cctv-viewer.env
```

## 보안 주의사항

- **.env** 파일은 실제 API 키를 포함하므로 **절대 커밋하지 마세요**
- **.env.example** 파일만 버전 관리에 포함됩니다
- 서버 배포 시 적절한 파일 권한 설정: `chmod 600 *.env`

## 환경 변수 설명

### CCTV Viewer (cctv-viewer.env)

```bash
# ITS 국가교통정보센터 인증키
# 발급: https://www.its.go.kr
ITS_API_KEY=your_key

# 대전시 공공데이터 인증키
# 발급: https://www.data.go.kr
DAEJEON_API_KEY=your_key

# CCTV 캐시 유지 시간 (초)
CACHE_TTL=3600

# 정류장 반경 (미터)
MAX_DISTANCE=500
```

## 참고

- 환경 변수는 `swarm-stack-proxmox.yml`의 `env_file` 섹션에서 참조됩니다
- 환경 변수 변경 후 서비스 재시작 필요: `docker service update --force quiz_cctv-viewer`
