/** 필리핀국립기상청(PAGASA) 관련 특보 목록 — 제3자 캐시 API. 빈 배열일 수 있음 */

const BULLETINS_URL = "https://sdnpdrrmo.inno.ph/public/weather/pagasa-bulletins";

export type TropicalBulletinItem = {
  name: string;
  date?: string;
  file?: string;
  count?: number;
  final?: boolean;
};

export type TyphoonFetchResult = {
  updated_at: string;
  tropical: TropicalBulletinItem[];
  rawCount: number;
};

function isTropicalRelated(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("tropical") ||
    n.includes("typhoon") ||
    n.includes("cyclone") ||
    n.includes("열대") ||
    n.includes("태풍")
  );
}

export async function fetchTropicalCycloneBulletins(): Promise<TyphoonFetchResult> {
  const res = await fetch(BULLETINS_URL);
  if (!res.ok) throw new Error(`특보 목록 API (${res.status})`);
  const json = (await res.json()) as {
    success?: boolean;
    data?: TropicalBulletinItem[];
    updated_at?: string;
  };
  const data = Array.isArray(json.data) ? json.data : [];
  const tropical = data.filter((d) => d?.name && isTropicalRelated(d.name));
  return {
    updated_at: json.updated_at ?? "",
    tropical,
    rawCount: data.length,
  };
}

/**
 * 특보 항목의 날짜가 마닐라 기준 '오늘부터 7일 이내'에 들어오면 영향 있음.
 * 날짜가 없거나 파싱 불가인 항목이 있으면 보수적으로 영향 있음으로 처리.
 */
export function hasPhilippinesTropicalImpactWithin7Days(data: TyphoonFetchResult): boolean {
  if (data.tropical.length === 0) return false;

  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Manila" });
  const todayMid = Date.parse(`${todayStr}T12:00:00+08:00`);
  const windowStart = todayMid - 86400000;
  const windowEnd = todayMid + 7 * 86400000;

  let undated = false;
  for (const t of data.tropical) {
    if (!t.date) {
      undated = true;
      continue;
    }
    const raw = t.date.trim();
    const ts = Date.parse(raw.length <= 10 ? `${raw}T12:00:00+08:00` : raw);
    if (Number.isNaN(ts)) {
      undated = true;
      continue;
    }
    if (ts >= windowStart && ts <= windowEnd) return true;
  }
  return undated;
}
