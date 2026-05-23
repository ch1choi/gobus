#!/usr/bin/env bash
# dongin-bus-admin Docker 이미지 빌드
# 실행 예 (DMZ 등 linux/amd64): ./build-image.sh
# Apple Silicon 등에서 amd64 서버용으로 올릴 때도 PLATFORM 기본값이 linux/amd64.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

IMAGE_NAME="${IMAGE_NAME:-dongin-bus-admin}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
# dmz-web-svr: Linux x86_64 → linux/amd64
PLATFORM="${PLATFORM:-linux/amd64}"

echo "Building ${IMAGE_NAME}:${IMAGE_TAG} (platform=${PLATFORM})"

docker build \
  --platform "${PLATFORM}" \
  -t "${IMAGE_NAME}:${IMAGE_TAG}" \
  -f "${SCRIPT_DIR}/Dockerfile" \
  "${SCRIPT_DIR}"

echo "Done: ${IMAGE_NAME}:${IMAGE_TAG}"
