import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = join(__dirname, "..", "dist", "index.html");

const WEATHER_PLACES = [
  "세부시티 실시간 날씨",
  "막탄 날씨",
  "오슬롭 날씨",
  "모알보알 날씨",
  "보홀 날씨",
];

const TRAVEL_TIPS = [
  {
    title: "태풍 우기시즌",
    body: "6-11월은 태풍과 소나기가 잦습니다. 날씨 정보를 확인하는 것이 중요합니다.",
  },
  {
    title: "자외선 더위",
    body: "필리핀은 열대 기후라서 자외선이 매우 강합니다. 선크림이나 모자 선글라스 등을 준비해 오시고 수분 보충은 필수입니다.",
  },
  {
    title: "집중호우",
    body: "갑작스럽게 비가 많이 오는 경우에는 저지대 지역 침수가 되는 경우도 있습니다.",
  },
];

const SPOTS = [
  { name: "막탄", note: "공항 리조트 호핑투어 마사지 실탄사격" },
  { name: "세부시티", note: "쇼핑몰 야시장 야경" },
  { name: "모알보알", note: "다이빙 바다거북이 정어리떼 화이트비치 캐녀닝 계곡트래킹" },
  { name: "오슬롭", note: "고래상어 원숭이마을 수밀론섬 투말록폭포" },
  { name: "보홀", note: "다이빙 호핑투어 안경원숭이 초코렛힐스 선상크루즈" },
];

function buildSection() {
  const placeItems = WEATHER_PLACES.map((name) => `    <li>${name}</li>`).join("\n");
  const tipEntries = TRAVEL_TIPS.map(
    (tip) => `    <dt>${tip.title}</dt><dd>${tip.body}</dd>`,
  ).join("\n");
  const spotItems = SPOTS.map((spot) => `    <li>${spot.name} — ${spot.note}</li>`).join(
    "\n",
  );

  return `<section id="weather-seo-content" aria-label="세부 날씨 정보">
  <h2>세부 날씨 — 지역별 실시간 날씨 확인</h2>
  <ul>
${placeItems}
  </ul>
  <h3>세부 여행 날씨 팁</h3>
  <dl>
${tipEntries}
  </dl>
  <h3>세부 주요 여행지</h3>
  <ul>
${spotItems}
  </ul>
</section>`;
}

const html = readFileSync(indexPath, "utf8");
const section = buildSection();

const rootOpenPattern = /(<div id="root">\s*)/;
if (!rootOpenPattern.test(html)) {
  throw new Error('Could not find <div id="root"> in dist/index.html');
}

if (html.includes('id="weather-seo-content"')) {
  const withoutPrevious = html.replace(
    /<section id="weather-seo-content"[\s\S]*?<\/section>\s*/,
    "",
  );
  const updated = withoutPrevious.replace(rootOpenPattern, `$1${section}\n`);
  writeFileSync(indexPath, updated, "utf8");
} else {
  const updated = html.replace(rootOpenPattern, `$1${section}\n`);
  writeFileSync(indexPath, updated, "utf8");
}

console.log("Injected static weather content into #root");
