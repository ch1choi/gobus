#!/usr/bin/env bash
# CCTV Viewer — 이미지 빌드 + AP 서버 업로드 한 번에 실행
#
# 사용 예:
#   ./docker/build-and-upload-image-cctv.sh
#   IMAGE_TAG=v1.0.0 DEPLOY_SERVER=quizadm@192.168.219.196 ./docker/build-and-upload-image-cctv.sh
#
# 환경변수:
#   IMAGE_NAME    이미지 이름  (기본: choicho/dongin-bus-cctv-viewer)
#   IMAGE_TAG     이미지 태그  (기본: latest)
#   PLATFORM      빌드 플랫폼  (기본: linux/amd64)
#   DEPLOY_SERVER 배포 대상    (기본: quizadm@192.168.219.196)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export IMAGE_NAME="${IMAGE_NAME:-choicho/dongin-bus-cctv-viewer}"
export IMAGE_TAG="${IMAGE_TAG:-latest}"
export PLATFORM="${PLATFORM:-linux/amd64}"
export DEPLOY_SERVER="${DEPLOY_SERVER:-quizadm@192.168.219.196}"

echo ""
echo "▶ [1/2] 이미지 빌드"
"${SCRIPT_DIR}/build-image-cctv.sh"

echo ""
echo "▶ [2/2] 서버 업로드"
"${SCRIPT_DIR}/upload-image-to-server-cctv.sh"

echo ""
echo "================================================================"
echo "  모든 단계 완료"
echo "  이미지 : ${IMAGE_NAME}:${IMAGE_TAG}"
echo "  서버   : ${DEPLOY_SERVER}"
echo "================================================================"
echo ""
echo "다음 단계 — 서버에서 컨테이너 실행:"
echo "  ssh ${DEPLOY_SERVER}"
echo "  docker run -d -p 8888:8888 --name cctv-viewer \\"
echo "    -e ITS_API_KEY=\$ITS_API_KEY \\"
echo "    -e DAEJEON_API_KEY=\$DAEJEON_API_KEY \\"
echo "    -e CACHE_TTL=3600 \\"
echo "    -e MAX_DISTANCE=500 \\"
echo "    ${IMAGE_NAME}:${IMAGE_TAG}"
echo ""
echo "또는 Docker Compose/Swarm Stack 사용"
