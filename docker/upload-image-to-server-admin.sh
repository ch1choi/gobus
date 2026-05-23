#!/usr/bin/env bash
# 빌드한 dongin-bus-admin 이미지를 서버로 전달 (docker save | ssh docker load)
#
# 사용 예:
#   ./docker/upload-image-to-server-admin.sh
#   DEPLOY_SERVER=quizadm@192.168.219.196 IMAGE_TAG=v1.0.0 ./docker/upload-image-to-server-admin.sh
#
# 환경변수:
#   IMAGE_NAME    기본: dongin-bus-admin  (스택의 DONGIN_BUS_ADMIN_IMAGE 와 맞출 것)
#   IMAGE_TAG     기본: latest
#   DEPLOY_SERVER 기본: quizadm@192.168.219.166  (dmz-web; Swarm 워커)
#
# Swarm 다중 노드: dongin-bus-admin 이 뜨는 모든 노드에 이미지 필요 시 노드별로 반복 실행하거나
# 레지스트리 push/pull 권장.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

IMAGE_NAME="${IMAGE_NAME:-dongin-bus-admin}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_FULL="${IMAGE_NAME}:${IMAGE_TAG}"
DEPLOY_SERVER="${DEPLOY_SERVER:-quizadm@192.168.219.166}"

echo "================================================================"
echo "  dongin-bus-admin — 이미지 업로드"
echo "  이미지 : ${IMAGE_FULL}"
echo "  대상   : ${DEPLOY_SERVER}"
echo "================================================================"
echo ""
echo "📦 docker save → ssh docker load …"

docker save "${IMAGE_FULL}" | ssh "${DEPLOY_SERVER}" 'docker load'

echo ""
echo "✅ 업로드 완료"
echo "   확인: ssh ${DEPLOY_SERVER} 'docker images ${IMAGE_NAME}'"
