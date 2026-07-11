/**
 * 네이버 블로그 RSS에서 태풍 관련 글 URL을 찾습니다.
 */

const RSS_URL = "https://rss.blog.naver.com/aalove0902.xml";
const RSS_USER_AGENT = "CebuWeatherApp/1.0";
const RSS_TIMEOUT_MS = 5000;
const TARGET_CATEGORY = "세부날씨";

/**
 * TYPHOON_KO_NAMES — 태풍위원회 140개 공식 이름의 기상청(KMA) 한글 표기
 * 출처: 기상청 날씨누리 「태풍의 이름」(2018년 개정 목록, 2026.3.30. 현재)
 * https://www.weather.go.kr/w/hazard/typhoon/basic/info2.do
 *
 * 영문 키는 표에 기재된 표기 그대로(하이픈 포함). 확실하지 않은 별칭·추측 표기는 넣지 않음.
 * 표 영문란 "TIROU"는 기상청 페이지 표기를 그대로 사용(타이포 여부는 기상청 표 기준).
 */
const TYPHOON_KO_NAMES = {
  DAMREY: "담레이",
  KOKI: "코키",
  NAKRI: "나크리",
  KROVANH: "크로반",
  TRASES: "트라세",
  TIANMA: "톈마",
  YINXING: "인싱",
  FENGSHEN: "펑선",
  DUJUAN: "두쥐안",
  MULAN: "무란",
  KIROGI: "기러기",
  GAEGURI: "개구리",
  KALMAEGI: "갈매기",
  SURIGAE: "수리개",
  MEARI: "메아리",
  "YUN-YEUNG": "윈욍",
  "DIM-SUM": "딤섬",
  "FUNG-WONG": "풍웡",
  "CHOI-WAN": "초이완",
  "TSING-MA": "칭마",
  KOINU: "고이누",
  HEBI: "헤비",
  KOTO: "고토",
  KOGUMA: "고구마",
  TOKAGE: "도카게",
  BOLAVEN: "볼라벤",
  PABUK: "파북",
  NOKAEN: "노카엔",
  CHAMPI: "참피",
  "ONG-MANG": "옹망",
  SANBA: "산바",
  WUTIP: "우딥",
  PENHA: "페냐",
  "IN-FA": "인파",
  MUIFA: "무이파",
  JELAWAT: "즐라왓",
  SEPAT: "스팟",
  NURI: "누리",
  CEMPAKA: "츰파카",
  MERBOK: "므르복",
  TIROU: "티로우",
  MUN: "문",
  SINLAKU: "실라코",
  NEPARTAK: "네파탁",
  NANMADOL: "난마돌",
  MALIKSI: "말릭시",
  DANAS: "다나스",
  HAGUPIT: "하구핏",
  LUPIT: "루핏",
  TALAS: "탈라스",
  GAEMI: "개미",
  NARI: "나리",
  JANGMI: "장미",
  MIRINAE: "미리내",
  HODU: "호두",
  PRAPIROON: "프라피룬",
  WIPHA: "위파",
  MEKKHALA: "메칼라",
  NIDA: "니다",
  KULAP: "꿀랍",
  MARIA: "마리아",
  FRANCISCO: "프란시스코",
  HIGOS: "히고스",
  OMAIS: "오마이스",
  ROKE: "로키",
  "SON-TINH": "손띤",
  "CO-MAY": "꼬마이",
  BAVI: "바비",
  "LUC-BINH": "룩빈",
  SONCA: "선까",
  AMPIL: "암필",
  KROSA: "크로사",
  MAYSAK: "마이삭",
  CHANTHU: "찬투",
  NESAT: "네삿",
  WUKONG: "우쿵",
  BAILU: "바이루",
  HAISHEN: "하이선",
  DIANMU: "뎬무",
  HAITANG: "하이탕",
  JONGDARI: "종다리",
  PODUL: "버들",
  NOUL: "노을",
  MINDULLE: "민들레",
  JAMJARI: "잠자리",
  SHANSHAN: "산산",
  LINGLING: "링링",
  DOLPHIN: "돌핀",
  LIONROCK: "라이언록",
  BANYAN: "바냔",
  TOMO: "도모",
  KAJIKI: "가지키",
  KUJIRA: "구지라",
  TOKEI: "도케이",
  YAMANEKO: "야마네코",
  LEEPI: "리피",
  NONGFA: "농파",
  "CHAN-HOM": "찬홈",
  NAMTHEUN: "남테운",
  PAKHAR: "파카르",
  BEBINCA: "버빙카",
  PEIPAH: "페이파",
  PEILOU: "페이러우",
  MALOU: "말로",
  SANVU: "상우",
  PULASAN: "풀라산",
  TAPAH: "타파",
  NANGKA: "낭카",
  NYATOH: "냐토",
  MAWAR: "마와르",
  SOULIK: "솔릭",
  MITAG: "미탁",
  SAUDEL: "사우델",
  SARBUL: "사르불",
  GUCHOL: "구촐",
  CIMARON: "시마론",
  RAGASA: "라가사",
  NARRA: "나라",
  AMUYAO: "아무야오",
  TALIM: "탈림",
  NARAE: "나래",
  NEOGURI: "너구리",
  GAENARI: "개나리",
  GOSARI: "고사리",
  BORI: "보리",
  BURAPHA: "부라파",
  BUALOI: "부알로이",
  ATSANI: "앗사니",
  CHABA: "차바",
  KHANUN: "카눈",
  BARIJAT: "바리자트",
  MATMO: "마트모",
  ETAU: "아타우",
  AERE: "에어리",
  LAN: "란",
  HOABAN: "호아반",
  HALONG: "할롱",
  "BANG-LANG": "방랑",
  SONGDA: "송다",
  SAOBIEN: "사오비엔",
};

function fieldCdata(block, name) {
  const cdata = block.match(new RegExp(`<${name}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]>`));
  if (cdata) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${name}>([^<]*)</${name}>`));
  return plain ? plain[1].trim() : "";
}

function parseRssItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => {
    const block = match[1];
    return {
      title: fieldCdata(block, "title"),
      link: fieldCdata(block, "link"),
      guid: fieldCdata(block, "guid"),
      category: fieldCdata(block, "category"),
      tag: fieldCdata(block, "tag"),
      pubDate: fieldCdata(block, "pubDate"),
    };
  });
}

function parsePubDateMs(pubDate) {
  const ms = Date.parse(pubDate);
  return Number.isNaN(ms) ? 0 : ms;
}

function toMobileBlogUrl(url) {
  if (!url) return "";
  return url.replace(/^https?:\/\/blog\.naver\.com/i, "https://m.blog.naver.com");
}

/** @param {string} eventname */
function getEnglishSearchTerms(eventname) {
  const terms = new Set();
  const raw = String(eventname ?? "").trim();
  const prefix = /^([A-Za-z]+)/.exec(raw);
  if (prefix) terms.add(prefix[1].toUpperCase());
  const withoutYear = raw.replace(/-\d+$/, "").trim().toUpperCase();
  if (withoutYear && /^[A-Z-]+$/.test(withoutYear)) terms.add(withoutYear);
  return [...terms];
}

/** @param {string} eventname */
function getKoreanName(eventname) {
  const raw = String(eventname ?? "").trim();
  const withoutYear = raw.replace(/-\d+$/, "").trim().toUpperCase();
  if (TYPHOON_KO_NAMES[withoutYear]) return TYPHOON_KO_NAMES[withoutYear];
  const prefix = /^([A-Za-z]+)/.exec(raw);
  if (prefix) {
    const key = prefix[1].toUpperCase();
    if (TYPHOON_KO_NAMES[key]) return TYPHOON_KO_NAMES[key];
  }
  return null;
}

function matchesEnglish(title, tag, terms) {
  const haystack = `${title} ${tag}`.toUpperCase();
  return terms.some((term) => haystack.includes(term));
}

function matchesKorean(title, tag, koName) {
  if (!koName) return false;
  const haystack = `${title} ${tag}`;
  return haystack.includes(koName);
}

async function fetchRssXml() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RSS_TIMEOUT_MS);
  try {
    const res = await fetch(RSS_URL, {
      headers: { "User-Agent": RSS_USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {Array<{ eventname?: string }> | undefined} impacts
 * @returns {Promise<string | null>}
 */
export async function findTyphoonBlogPostUrl(impacts) {
  try {
    const eventname = impacts?.[0]?.eventname;
    if (!eventname) return null;

    const xml = await fetchRssXml();
    if (!xml) return null;

    const items = parseRssItems(xml).filter((item) => item.category === TARGET_CATEGORY);
    if (items.length === 0) return null;

    const englishTerms = getEnglishSearchTerms(eventname);
    const koreanName = getKoreanName(eventname);

    let englishMatches = items.filter((item) =>
      matchesEnglish(item.title, item.tag, englishTerms),
    );
    if (englishMatches.length === 0 && koreanName) {
      englishMatches = items.filter((item) => matchesKorean(item.title, item.tag, koreanName));
    }

    if (englishMatches.length === 0) return null;

    englishMatches.sort((a, b) => parsePubDateMs(b.pubDate) - parsePubDateMs(a.pubDate));
    const best = englishMatches[0];
    const cleanUrl = best.guid || best.link.replace(/\?fromRss.*/, "");
    return toMobileBlogUrl(cleanUrl) || null;
  } catch {
    return null;
  }
}
