#!/usr/bin/env bash
# dongin-bus-admin 이미지 빌드 + 서버 docker load 한 번에 실행
#
# 사용 예:
#   ./docker/build-and-upload-image-admin.sh
#   IMAGE_TAG=20260519 DEPLOY_SERVER=quizadm@192.168.219.196 ./docker/build-and-upload-image-admin.sh
#
# 환경변수:
#   IMAGE_NAME    기본: dongin-bus-admin
#   IMAGE_TAG     기본: latest
#   PLATFORM      기본: linux/amd64
#   DEPLOY_SERVER 기본: quizadm@192.168.219.166

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export IMAGE_NAME="${IMAGE_NAME:-dongin-bus-admin}"
export IMAGE_TAG="${IMAGE_TAG:-latest}"
export PLATFORM="${PLATFORM:-linux/amd64}"
export DEPLOY_SERVER="${DEPLOY_SERVER:-quizadm@192.168.219.166}"

echo ""
echo "▶ [1/2] 이미지 빌드"
"${SCRIPT_DIR}/build-image-admin.sh"

echo ""
echo "▶ [2/2] 서버 업로드"
"${SCRIPT_DIR}/upload-image-to-server-admin.sh"

echo ""
echo "================================================================"
echo "  완료"
echo "  이미지 : ${IMAGE_NAME}:${IMAGE_TAG}"
echo "  서버   : ${DEPLOY_SERVER}"
echo "================================================================"
echo ""
echo "Swarm 반영 예 (Manager에서):"
echo "  docker service update --image ${IMAGE_NAME}:${IMAGE_TAG} quiz_dongin-bus-admin"
echo "  (스택 서비스 이름은 docker service ls 로 확인)"
