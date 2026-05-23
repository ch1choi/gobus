#!/usr/bin/env bash
# 로컬에서 빌드한 dongin-bus-admin 이미지를 DMZ 서버로 전달 (docker save | ssh docker load)
#
# 사용 예:
#   ./upload-image-to-server.sh
#   DEPLOY_SERVER=quizadm@192.168.219.166 IMAGE_TAG=v1 ./upload-image-to-server.sh
#
# Swarm 다중 노드: dongin-bus-admin 이 스케줄되는 각 노드에 이미지가 있어야 합니다.
# 레지스트리를 쓰면 docker push/pull 로 배포하는 편이 안전합니다.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

IMAGE_NAME="${IMAGE_NAME:-dongin-bus-admin}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
IMAGE_FULL="${IMAGE_NAME}:${IMAGE_TAG}"
DEPLOY_SERVER="${DEPLOY_SERVER:-quizadm@192.168.219.166}"

echo "Saving ${IMAGE_FULL} → ssh ${DEPLOY_SERVER} docker load …"
docker save "${IMAGE_FULL}" | ssh "${DEPLOY_SERVER}" 'docker load'

echo "완료. 서버에서 확인: ssh ${DEPLOY_SERVER} 'docker images ${IMAGE_NAME}'"
