#!/usr/bin/env bash
# dongin-bus-admin Docker 이미지 빌드
#
# 사용 예:
#   ./docker/build-image-admin.sh
#   IMAGE_TAG=v1.0.0 ./docker/build-image-admin.sh
#
# Apple Silicon → linux/amd64 서버 배포 시 PLATFORM 기본값 그대로 사용.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADMIN_DIR="$(cd "${SCRIPT_DIR}/../dongin_bus/dongin_bus_admin-server/admin-server" && pwd)"

IMAGE_NAME="${IMAGE_NAME:-dongin-bus-admin}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PLATFORM="${PLATFORM:-linux/amd64}"

echo "================================================================"
echo "  dongin-bus-admin — 이미지 빌드"
echo "  이미지   : ${IMAGE_NAME}:${IMAGE_TAG}"
echo "  플랫폼   : ${PLATFORM}"
echo "  컨텍스트: ${ADMIN_DIR}"
echo "================================================================"

docker build \
  --platform "${PLATFORM}" \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  -f "${ADMIN_DIR}/Dockerfile" \
  "${ADMIN_DIR}"

echo ""
echo "✅ 빌드 완료: ${IMAGE_NAME}:${IMAGE_TAG}"
