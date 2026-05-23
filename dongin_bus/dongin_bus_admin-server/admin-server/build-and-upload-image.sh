#!/usr/bin/env bash
# linux/amd64 이미지 빌드 후 지정 서버로 업로드(docker load)
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"${SCRIPT_DIR}/build-image.sh"
"${SCRIPT_DIR}/upload-image-to-server.sh"
