#!/usr/bin/env bash
# CCTV Viewer 정적 파일 직접 배포 (nginx 서빙)
# Express 서버 문제를 우회하는 긴급 수정
#
# 실행: 저장소 루트나 docker/ 등 어디서든
#   ./docker/deploy-static-files.sh
#
# Worker(166)의 /project2/... 배포는 sudo 필요 → ssh -t 로 비밀번호 1회 입력

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# gobus/ 루트 (docker/ 의 상위)
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Worker(166): 정적 파일 + nginx volume 호스트 경로
WORKER="quizadm@192.168.219.166"

LOCAL_DIR="${PROJECT_ROOT}/dongin_bus/cctv_viewer"
REMOTE_DIR="/project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer"
DIT_VIEWER_CONF="${PROJECT_ROOT}/nginx/conf.d/dit-viewer.conf"

echo "=== CCTV Viewer 정적 파일 배포 ==="
echo "  PROJECT_ROOT: ${PROJECT_ROOT}"
echo "  Worker:       ${WORKER}"
echo ""

if [[ ! -f "${LOCAL_DIR}/index.html" ]]; then
  echo "오류: ${LOCAL_DIR}/index.html 없음" >&2
  exit 1
fi
if [[ ! -f "${DIT_VIEWER_CONF}" ]]; then
  echo "오류: ${DIT_VIEWER_CONF} 없음 (경로 확인)" >&2
  exit 1
fi

echo "▶ [1/4] Worker에 임시 경로로 파일 복사..."
scp "${LOCAL_DIR}/index.html" "${WORKER}:/tmp/cctv-index.html"
scp -r "${LOCAL_DIR}/data" "${WORKER}:/tmp/cctv-data"

echo ""
echo "▶ [2/4] Worker에서 sudo로 ${REMOTE_DIR} 에 반영 (비밀번호 입력 가능하도록 -t)"
ssh -t "${WORKER}" "REMOTE_DIR='${REMOTE_DIR}' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail
mkdir -p "${REMOTE_DIR}"
if [[ -f "${REMOTE_DIR}/index.html" ]]; then
  mv "${REMOTE_DIR}/index.html" "${REMOTE_DIR}/index.html.bak.$(date +%Y%m%d%H%M%S)" || true
fi
mv /tmp/cctv-index.html "${REMOTE_DIR}/index.html"
rm -rf "${REMOTE_DIR}/data"
mv /tmp/cctv-data "${REMOTE_DIR}/data"
chmod -R a+rX "${REMOTE_DIR}"
echo "파일 배포 완료:"
ls -lh "${REMOTE_DIR}"
REMOTE_SCRIPT

echo ""
echo "▶ [3/4] Worker 홈의 nginx conf.d 에 dit-viewer.conf 반영 후 컨테이너 reload"
# swarm-stack: /home/quizadm/nginx/conf.d → nginx-proxy 컨테이너 마운트 (호스트 /etc/nginx 가 아님)
ssh "${WORKER}" 'mkdir -p ~/nginx/conf.d'
scp "${DIT_VIEWER_CONF}" "${WORKER}:nginx/conf.d/dit-viewer.conf"

ssh "${WORKER}" bash -s <<'REMOTE_NGINX'
set -euo pipefail
CONF_DIR="${HOME}/nginx/conf.d"
mkdir -p "${CONF_DIR}"
# scp 대상 경로와 동일하게 유지 (필요 시 상위에서 한 번에 복사했을 수 있음)

NGINX_CID="$(docker ps -q -f name=nginx-proxy | head -1)"
if [[ -z "${NGINX_CID}" ]]; then
  echo "경고: nginx-proxy 컨테이너를 찾지 못했습니다. 서비스 이름을 확인하세요." >&2
  echo "  docker ps | grep nginx" >&2
  exit 1
fi

docker exec "${NGINX_CID}" nginx -t
docker exec "${NGINX_CID}" nginx -s reload
echo "✅ 컨테이너 nginx reload 완료 (${NGINX_CID})"
REMOTE_NGINX

echo ""
echo "▶ [4/4] 접속 테스트..."
sleep 2

echo "메인 페이지:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" https://ditcctv.choicho.co.kr || true

echo ""
echo "API:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "https://ditcctv.choicho.co.kr/api/cctv-route?route=108" || true

echo ""
echo "================================================================"
echo "  배포 스크립트 종료"
echo "  정적: ${REMOTE_DIR}"
echo "  conf : ~/nginx/conf.d/dit-viewer.conf → nginx-proxy 컨테이너"
echo "================================================================"
