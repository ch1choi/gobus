/**
 * index.html 내 embedded allBusData 를 data/*.json + routes.json 으로 분리 (일회성 유지보수용).
 * 실행: node scripts/extract-allBusData.mjs (dongin_bus 디렉터리에서)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "index.html");
const dataDir = path.join(root, "data");

const html = fs.readFileSync(htmlPath, "utf8");
const m = html.match(/const allBusData = (\{[\s\S]*?\n        \});/);
if (!m) {
  console.error("allBusData 블록을 찾지 못했습니다.");
  process.exit(1);
}
let objSrc = m[1];
objSrc = objSrc.replace(/\/\/[^\n]*/g, "");
let allBusData;
try {
  allBusData = new Function(`return (${objSrc})`)();
} catch (e) {
  console.error("파싱 실패:", e);
  process.exit(1);
}

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const routes = Object.keys(allBusData).sort();
for (const id of routes) {
  const payload = allBusData[id];
  fs.writeFileSync(
    path.join(dataDir, `${id}.json`),
    JSON.stringify({ up: payload.up, down: payload.down }, null, 2),
    "utf8"
  );
}
fs.writeFileSync(
  path.join(dataDir, "routes.json"),
  JSON.stringify({ routes }, null, 2),
  "utf8"
);
console.log("작성 완료:", routes.map((r) => `data/${r}.json`).join(", "), "data/routes.json");
