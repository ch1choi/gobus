#!/usr/bin/env bash
# 로컬에서 빌드한 cctv-viewer 이미지를 AP 서버로 전달 (docker save | ssh docker load)
#
# 사용 예:
#   ./docker/upload-image-to-server-cctv.sh
#   DEPLOY_SERVER=quizadm@192.168.219.196 IMAGE_TAG=v1.0.0 ./docker/upload-image-to-server-cctv.sh
#
# 주의:
#   - Swarm 다중 노드 구성 시 cctv-viewer 가 스케줄되는 모든 노드에
#     이미지가 있어야 합니다. 현재는 int-ap(192.168.219.196) 단일 노드.
#   - 이미지가 크면 시간이 걸립니다. 레지스트리(docker push/pull) 방식이
#     더 빠를 수 있습니다.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

IMAGE_NAME="${IMAGE_NAME:-choicho/dongin-bus-cctv-viewer}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_FULL="${IMAGE_NAME}:${IMAGE_TAG}"
DEPLOY_SERVER="${DEPLOY_SERVER:-quizadm@192.168.219.166}"

echo "================================================================"
echo "  CCTV Viewer — 이미지 업로드"
echo "  이미지 : ${IMAGE_FULL}"
echo "  대상   : ${DEPLOY_SERVER}"
echo "================================================================"
echo ""
echo "📦 docker save → ssh docker load 전송 중 ..."
echo "   (이미지 크기에 따라 수 분 소요될 수 있습니다)"
echo ""

docker save "${IMAGE_FULL}" | ssh "${DEPLOY_SERVER}" 'docker load'

echo ""
echo "✅ 업로드 완료"
echo "   서버 이미지 확인: ssh ${DEPLOY_SERVER} 'docker images ${IMAGE_NAME}'"
