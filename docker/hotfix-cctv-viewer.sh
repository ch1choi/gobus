#!/usr/bin/env bash
# CCTV Viewer 긴급 수정 및 재배포 스크립트

set -e

MANAGER="quizadm@192.168.219.196"
WORKER="quizadm@192.168.219.166"

echo "=== CCTV Viewer 긴급 수정 및 재배포 ==="
echo ""
echo "📌 서버 구조:"
echo "  - Manager: 192.168.219.196 (Swarm 명령)"
echo "  - Worker:  192.168.219.166 (컨테이너 실행)"
echo ""

# 1. 이미지 빌드
echo "▶ [1/4] Docker 이미지 빌드 중..."
cd /Volumes/CHOICHOUSB/project/gobus
IMAGE_TAG="fix-$(date +%Y%m%d-%H%M%S)"
IMAGE_TAG=$IMAGE_TAG ./docker/build-image-cctv.sh

echo ""
echo "▶ [2/4] 이미지 Manager 서버 업로드 중..."
IMAGE_TAG=$IMAGE_TAG IMAGE_NAME=choicho/dongin-bus-cctv-viewer DEPLOY_SERVER=$MANAGER ./docker/upload-image-to-server-cctv.sh

echo ""
echo "▶ [3/4] Manager에서 서비스 업데이트 중..."
ssh $MANAGER << EOF
  echo "서비스 업데이트 중..."
  docker service update \
    --image choicho/dongin-bus-cctv-viewer:$IMAGE_TAG \
    quiz_cctv-viewer
  
  echo "서비스 상태 확인 중..."
  sleep 5
  docker service ps quiz_cctv-viewer
EOF

echo ""
echo "▶ [4/4] Manager에서 로그 확인..."
ssh $MANAGER "docker service logs --tail 50 quiz_cctv-viewer"

echo ""
echo "================================================================"
echo "  재배포 완료!"
echo "  이미지: choicho/dongin-bus-cctv-viewer:$IMAGE_TAG"
echo "  Manager: 192.168.219.196"
echo "  Worker: 192.168.219.166"
echo "================================================================"
echo ""
echo "테스트:"
echo "  curl https://ditcctv.choicho.co.kr"
echo "  curl https://ditcctv.choicho.co.kr/api/cctv-route?route=108"
