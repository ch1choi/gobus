/**
 * index.html에서 allBusData를 추출하여 routes.json으로 변환하는 스크립트
 * 
 * 실행: node scripts/extract-routes.js
 */
const fs = require('fs');
const path = require('path');

// index.html 경로 (상대 경로)
const indexHtmlPath = path.join(__dirname, '../../index.html');
const outputPath = path.join(__dirname, '../data/routes.json');

// HTML 파일 읽기
const htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');

// allBusData 추출 (정규식)
const match = htmlContent.match(/const allBusData = (\{[\s\S]*?\n        \};)/);

if (!match) {
  console.error('❌ allBusData를 찾을 수 없습니다.');
  process.exit(1);
}

// JavaScript 객체 문자열을 평가 가능한 형태로 변환
let dataStr = match[1];

// 주석 제거
dataStr = dataStr.replace(/\/\/[^\n]*/g, '');

// 객체 평가 (eval 대신 Function 사용)
let allBusData;
try {
  allBusData = new Function(`return ${dataStr}`)();
} catch (error) {
  console.error('❌ 데이터 파싱 오류:', error.message);
  process.exit(1);
}

// 필요한 필드만 추출 (sid 제거 가능, name/lat/lng만 유지)
const routes = {};
for (const [routeNo, directions] of Object.entries(allBusData)) {
  routes[routeNo] = {
    up: directions.up.map(s => ({
      name: s.name,
      sid: s.sid,
      lat: s.lat,
      lng: s.lng,
    })),
    down: directions.down.map(s => ({
      name: s.name,
      sid: s.sid,
      lat: s.lat,
      lng: s.lng,
    })),
  };
}

// JSON 파일로 저장
fs.writeFileSync(outputPath, JSON.stringify(routes, null, 2), 'utf-8');

console.log('✅ routes.json 생성 완료!');
console.log(`   경로: ${outputPath}`);
console.log(`   노선: ${Object.keys(routes).join(', ')}`);
Object.entries(routes).forEach(([no, data]) => {
  console.log(`   ${no}번: 상행 ${data.up.length}개, 하행 ${data.down.length}개`);
});
