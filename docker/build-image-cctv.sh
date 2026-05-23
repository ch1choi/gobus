#!/usr/bin/env bash
# CCTV Viewer Docker 이미지 빌드
#
# 사용 예:
#   ./docker/build-image-cctv.sh
#   IMAGE_TAG=v1.0.0 ./docker/build-image-cctv.sh
#
# Apple Silicon(arm64) 등 로컬에서 AP 서버(linux/amd64)용으로 빌드할 때도
# PLATFORM 기본값이 linux/amd64 이므로 별도 지정 불필요.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../dongin_bus/cctv_viewer" && pwd)"

IMAGE_NAME="${IMAGE_NAME:-choicho/dongin-bus-cctv-viewer}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
PLATFORM="${PLATFORM:-linux/amd64}"

echo "================================================================"
echo "  CCTV Viewer — 이미지 빌드"
echo "  이미지 : ${IMAGE_NAME}:${IMAGE_TAG}"
echo "  플랫폼 : ${PLATFORM}"
echo "  컨텍스트: ${PROJECT_ROOT}"
echo "================================================================"

docker build \
  --platform "${PLATFORM}" \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  -f "${PROJECT_ROOT}/Dockerfile" \
  "${PROJECT_ROOT}"

echo ""
echo "✅ 빌드 완료: ${IMAGE_NAME}:${IMAGE_TAG}"
