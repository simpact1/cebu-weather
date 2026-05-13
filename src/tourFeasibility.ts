import type { MarineCurrent } from "./weather";

export type Feasibility = "good" | "caution" | "bad";

export type TourRow = {
  id: string;
  name: string;
  /** 참고로 쓰는 관측 지역 */
  refPlace: string;
  placeId: string;
  status: Feasibility | "unknown";
  hint: string;
  /** 호핑·보홀 호핑: 추천/주의/비추천 구간 적용 */
  useHoppingBands: boolean;
};

const TOURS = [
  {
    id: "hopping",
    name: "호핑",
    placeId: "mactan",
    refPlace: "막탄",
    kind: "hoppingBand" as const,
  },
  { id: "oslob", name: "오슬롭 투어", placeId: "oslob", refPlace: "오슬롭", kind: "boat" as const },
  { id: "moalboal", name: "모알보알", placeId: "moalboal", refPlace: "모알보알", kind: "sea" as const },
  {
    id: "canyoning",
    name: "캐녀닝(협곡)",
    placeId: "moalboal",
    refPlace: "모알보알(카와산 인근)",
    kind: "canyon" as const,
  },
  {
    id: "bohol_hop",
    name: "보홀 호핑",
    placeId: "bohol",
    refPlace: "보홀",
    kind: "hoppingBand" as const,
  },
];

type WeatherCtx = {
  weather_code: number;
  wind_speed_10m: number;
  precipitation: number;
};

/**
 * 호핑 판단 기준
 * 🟢 추천: 풍속 20km/h 이하 · 파도 1m 이하
 * 🟡 주의: 풍속 20~30km/h · 파도 1~1.5m (둘 중 하나라도 해당 구간이면 주의 이상)
 * 🔴 비추천: 풍속 30km/h 이상 · 파도 1.5m 이상
 */
function scoreHoppingBand(w: WeatherCtx, marine: MarineCurrent | null): { s: Feasibility; hint: string } {
  const code = w.weather_code;
  const wind = w.wind_speed_10m;
  const wave = marine?.wave_height_m ?? null;

  if (code >= 95) {
    return { s: "bad", hint: "뇌우 예보 — 해상 비추천" };
  }

  const badWind = wind >= 30;
  const badWave = wave != null && wave >= 1.5;
  if (badWind || badWave) {
    const parts: string[] = [];
    if (badWind) parts.push(`풍속 ${Math.round(wind)} km/h (30 이상)`);
    if (badWave) parts.push(`파도 ${wave!.toFixed(1)} m (1.5 이상)`);
    return { s: "bad", hint: `${parts.join(" · ")} — 비추천 구간` };
  }

  const goodWind = wind <= 20;
  const goodWave = wave == null || wave <= 1;
  if (goodWind && goodWave) {
    return {
      s: "good",
      hint:
        wave == null
          ? `풍속 ${Math.round(wind)} km/h — 추천 구간(파도 데이터 없음)`
          : `풍속 ${Math.round(wind)} km/h · 파도 ${wave.toFixed(1)} m — 추천 구간`,
    };
  }

  const parts: string[] = [];
  if (wind > 20) parts.push(`풍속 ${Math.round(wind)} km/h (20~30 구간)`);
  if (wave != null && wave > 1) parts.push(`파도 ${wave.toFixed(1)} m (1~1.5 구간)`);
  if (parts.length === 0 && (code >= 51 || w.precipitation >= 1)) {
    parts.push("비·소나기 가능");
  }
  return {
    s: "caution",
    hint: parts.length ? `${parts.join(" · ")} — 주의 구간` : "날씨 변동 가능 — 주의 구간",
  };
}

function scoreBoatSea(w: WeatherCtx, marine: MarineCurrent | null): { s: Feasibility; hint: string } {
  const code = w.weather_code;
  const wind = w.wind_speed_10m;
  const precip = w.precipitation;
  const wave = marine?.wave_height_m ?? null;

  if (code >= 95) return { s: "bad", hint: "뇌우 예보 — 출항·해상 활동 위험" };
  if (wind >= 52) return { s: "bad", hint: "강풍 — 보트·해상에 부담" };
  if (wave != null && wave >= 2.3) return { s: "bad", hint: "파도 높음 — 해상 투어에 부담" };

  const hints: string[] = [];
  let s: Feasibility = "good";

  if (wind >= 34) {
    s = "caution";
    hints.push("풍 다소 강함");
  }
  if (wave != null && wave >= 1.25) {
    s = "caution";
    hints.push("파도 다소 있음");
  }
  if ((code >= 51 && code <= 67) || code === 80 || code === 81) {
    s = "caution";
    hints.push("비·소나기 가능");
  }
  if (precip >= 2) {
    s = "caution";
    hints.push("강수 있음");
  }

  return {
    s,
    hint: hints.length ? hints.join(" · ") : "해상 조건 무난(참고)",
  };
}

function scoreCanyon(w: WeatherCtx): { s: Feasibility; hint: string } {
  const code = w.weather_code;
  const precip = w.precipitation;

  if (code >= 95) return { s: "bad", hint: "뇌우 — 협곡·급류 위험" };
  if (code >= 82 || precip >= 6) return { s: "bad", hint: "강한 비 — 수위·미끄럼 위험" };
  if ((code >= 61 && code <= 67) || code === 80 || precip >= 1) {
    return { s: "caution", hint: "비 가능 — 장비·안전 확인" };
  }
  return { s: "good", hint: "비교적 무난(현지 안내 우선)" };
}

export function feasibilityLabel(s: Feasibility | "unknown"): string {
  if (s === "good") return "가능";
  if (s === "caution") return "주의";
  if (s === "bad") return "어려움";
  return "판단 불가";
}

/** 호핑·보홀 호핑 전용 라벨 */
export function hoppingFeasibilityLabel(s: Feasibility | "unknown"): string {
  if (s === "good") return "추천";
  if (s === "caution") return "주의";
  if (s === "bad") return "비추천";
  return "판단 불가";
}

export function tourStatusLabel(row: TourRow): string {
  return row.useHoppingBands ? hoppingFeasibilityLabel(row.status) : feasibilityLabel(row.status);
}

export function buildTourRows(
  placeById: Map<string, { current: WeatherCtx; marine: MarineCurrent | null }>,
): TourRow[] {
  return TOURS.map((t) => {
    const ctx = placeById.get(t.placeId);
    const useHoppingBands = t.kind === "hoppingBand";
    if (!ctx) {
      return {
        id: t.id,
        name: t.name,
        refPlace: t.refPlace,
        placeId: t.placeId,
        status: "unknown",
        hint: "해당 지역 날씨를 불러오지 못했습니다.",
        useHoppingBands,
      };
    }
    if (t.kind === "canyon") {
      const { s, hint } = scoreCanyon(ctx.current);
      return {
        id: t.id,
        name: t.name,
        refPlace: t.refPlace,
        placeId: t.placeId,
        status: s,
        hint,
        useHoppingBands,
      };
    }
    if (t.kind === "hoppingBand") {
      const { s, hint } = scoreHoppingBand(ctx.current, ctx.marine);
      return {
        id: t.id,
        name: t.name,
        refPlace: t.refPlace,
        placeId: t.placeId,
        status: s,
        hint,
        useHoppingBands,
      };
    }
    const { s, hint } = scoreBoatSea(ctx.current, ctx.marine);
    return {
      id: t.id,
      name: t.name,
      refPlace: t.refPlace,
      placeId: t.placeId,
      status: s,
      hint,
      useHoppingBands,
    };
  });
}
