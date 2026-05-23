#!/bin/bash
# CCTV Viewer 서버 상태 진단 스크립트

set -e

echo "=== CCTV Viewer 서버 진단 ==="
echo ""

MANAGER="quizadm@192.168.219.196"
WORKER="quizadm@192.168.219.166"

echo "📌 Docker Swarm 구조:"
echo "  - Manager: 192.168.219.196 (배포 명령)"
echo "  - Worker:  192.168.219.166 (컨테이너 실행)"
echo ""

echo "▶ [1/7] Manager - Swarm 서비스 상태 확인..."
ssh $MANAGER << 'EOF'
echo "--- Docker 서비스 목록 ---"
docker service ls | grep cctv

echo ""
echo "--- 컨테이너 배포 상태 ---"
docker service ps quiz_cctv-viewer

echo ""
echo "--- 컨테이너가 실행 중인 노드 ---"
docker service ps quiz_cctv-viewer --format "table {{.Name}}\t{{.Node}}\t{{.CurrentState}}"
EOF

echo ""
echo "▶ [2/7] Worker - 실행 중인 컨테이너 확인..."
ssh $WORKER << 'EOF'
echo "--- 실행 중인 cctv-viewer 컨테이너 ---"
docker ps | grep cctv || echo "⚠️ cctv-viewer 컨테이너가 없습니다!"
EOF

echo ""
echo "▶ [3/7] Manager - 서비스 로그 확인..."
ssh $MANAGER "docker service logs --tail 50 quiz_cctv-viewer 2>&1"

echo ""
echo "▶ [4/7] Worker - 컨테이너 내부 파일 확인..."
ssh $WORKER << 'EOF'
CONTAINER_ID=$(docker ps -q -f name=quiz_cctv-viewer | head -1)
if [ -z "$CONTAINER_ID" ]; then
  echo "ERROR: Worker 노드에 실행 중인 컨테이너가 없습니다!"
  exit 1
fi

echo "컨테이너 ID: $CONTAINER_ID"
echo ""
echo "--- /app 디렉토리 내용 ---"
docker exec $CONTAINER_ID ls -la /app/

echo ""
echo "--- index.html 존재 확인 ---"
docker exec $CONTAINER_ID test -f /app/index.html && echo "✅ index.html 존재함" || echo "❌ index.html 없음"

echo ""
echo "--- server.js 존재 확인 ---"
docker exec $CONTAINER_ID test -f /app/server.js && echo "✅ server.js 존재함" || echo "❌ server.js 없음"

echo ""
echo "--- netlify/functions 확인 ---"
docker exec $CONTAINER_ID ls -la /app/netlify/functions/ 2>&1 || echo "❌ netlify/functions 디렉토리 없음"
EOF

echo ""
echo "▶ [5/7] Worker - 컨테이너 내부에서 직접 테스트..."
ssh $WORKER << 'EOF'
CONTAINER_ID=$(docker ps -q -f name=quiz_cctv-viewer | head -1)

echo "--- 로컬호스트 테스트 (메인 페이지) ---"
docker exec $CONTAINER_ID wget -O- http://localhost:8888 2>&1 | head -20

echo ""
echo "--- API 테스트 ---"
docker exec $CONTAINER_ID wget -O- http://localhost:8888/api/cctv-route?route=108 2>&1 | head -5
EOF

echo ""
echo "▶ [6/7] Worker - nginx 설정 및 정적 파일 확인..."
ssh $WORKER << 'EOF'
echo "--- dit-viewer.conf 존재 확인 ---"
test -f ~/nginx/conf.d/dit-viewer.conf && echo "✅ 설정 파일 존재" || echo "❌ 설정 파일 없음"

echo ""
echo "--- 정적 파일 디렉토리 확인 ---"
if [ -d /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer ]; then
  echo "✅ 정적 파일 디렉토리 존재"
  ls -lh /project2/gimmeQUIZ2.0/public/dongin_bus/cctv_viewer/
else
  echo "❌ 정적 파일 디렉토리 없음"
fi

echo ""
echo "--- nginx 프로세스 ---"
docker ps | grep nginx
EOF

echo ""
echo "▶ [7/7] 외부에서 접근 테스트..."
echo "--- 메인 페이지 ---"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" https://ditcctv.choicho.co.kr

echo ""
echo "--- API 엔드포인트 ---"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "https://ditcctv.choicho.co.kr/api/cctv-route?route=108"

echo ""
echo "================================================================"
echo "진단 완료!"
echo ""
echo "✅ 다음 단계:"
echo "  - 500 에러가 계속되면: ./docker/deploy-static-files.sh 실행"
echo "  - 컨테이너가 없으면: Manager(196)에서 서비스 재시작"
echo "================================================================"
