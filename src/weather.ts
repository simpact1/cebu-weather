/** Open-Meteo WMO weather code → 한글 요약 */
export function weatherLabel(code: number): string {
  if (code === 0) return "맑음";
  if (code <= 3) return "구름 조금";
  if (code <= 48) return "안개";
  if (code <= 57) return "이슬비·동결성 안개";
  if (code <= 67) return "비";
  if (code <= 77) return "눈";
  if (code <= 82) return "소나기";
  if (code <= 86) return "눈 소나기";
  if (code <= 99) return "뇌우";
  return "알 수 없음";
}

export function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "🌨️";
  if (code <= 99) return "⛈️";
  return "🌤️";
}

export type CurrentWeather = {
  time: string;
  temperature_2m: number;
  apparent_temperature: number;
  relative_humidity_2m: number;
  precipitation: number;
  weather_code: number;
  wind_speed_10m: number;
  /** 시간별 UV를 관측 시각에 맞춰 보간. 없으면 null */
  uv_index: number | null;
};

type HourlyUv = {
  time: string[];
  uv_index: (number | null)[];
};

function uvFromHourly(currentTime: string, hourly: HourlyUv | undefined): number | null {
  if (!hourly?.time?.length || !hourly.uv_index?.length) return null;
  const target = new Date(currentTime).getTime();
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < hourly.time.length; i++) {
    const t = new Date(hourly.time[i]).getTime();
    const diff = Math.abs(t - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  const v = hourly.uv_index[bestIdx];
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

/** UV 지수별 야외·피부 보호 안내 (참고) */
export type UvGuidance = {
  rangeLabel: string;
  emoji: string;
  title: string;
  details: string[];
};

export function getUvGuidance(uv: number | null): UvGuidance | null {
  if (uv == null || Number.isNaN(uv)) return null;
  if (uv <= 2) {
    return { rangeLabel: "0~2", emoji: "🟢", title: "안전", details: [] };
  }
  if (uv <= 5) {
    return { rangeLabel: "3~5", emoji: "🟡", title: "선크림 권장", details: [] };
  }
  if (uv <= 7) {
    return { rangeLabel: "6~7", emoji: "🟠", title: "장시간 야외활동 주의", details: [] };
  }
  if (uv <= 10) {
    return {
      rangeLabel: "8~10",
      emoji: "🔴",
      title: "자외선 매우 강함",
      details: ["래쉬가드 추천", "선크림 필수", "오후 야외활동 주의"],
    };
  }
  return {
    rangeLabel: "11+",
    emoji: "🟣",
    title: "위험",
    details: ["피부 화상 가능성 높음"],
  };
}

export type ForecastResponse = {
  current: CurrentWeather;
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 네트워크 일시 오류 시 재시도 (브라우저 Failed to fetch 완화) */
async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: { attempts?: number; baseDelayMs?: number },
): Promise<Response> {
  const attempts = opts?.attempts ?? 4;
  const base = opts?.baseDelayMs ?? 400;
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      return res;
    } catch (err) {
      last = err;
      if (i < attempts - 1) await sleep(base * (i + 1));
    }
  }
  throw last;
}

const CURRENT_VARS = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "precipitation",
  "weather_code",
  "wind_speed_10m",
].join(",");

function buildCurrentParams(lat: number, lon: number): URLSearchParams {
  return new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: CURRENT_VARS,
    hourly: "uv_index",
    forecast_days: "2",
    timezone: "Asia/Manila",
  });
}

type RawCurrentResponse = {
  current: Omit<CurrentWeather, "uv_index">;
  hourly?: HourlyUv;
};

export type CurrentOnlyResponse = {
  current: CurrentWeather;
};

export async function fetchCurrentWeather(lat: number, lon: number): Promise<CurrentOnlyResponse> {
  const url = `https://api.open-meteo.com/v1/forecast?${buildCurrentParams(lat, lon).toString()}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`날씨 API 오류 (${res.status})`);
  const json = (await res.json()) as RawCurrentResponse;
  const uv = uvFromHourly(json.current.time, json.hourly);
  const current: CurrentWeather = { ...json.current, uv_index: uv };
  return { current };
}

export async function fetchForecast(lat: number, lon: number): Promise<ForecastResponse> {
  const p = buildCurrentParams(lat, lon);
  p.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
    ].join(","),
  );
  p.set("forecast_days", "7");
  const url = `https://api.open-meteo.com/v1/forecast?${p.toString()}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`날씨 API 오류 (${res.status})`);
  const json = (await res.json()) as RawCurrentResponse & { daily: ForecastResponse["daily"] };
  const uv = uvFromHourly(json.current.time, json.hourly);
  const current: CurrentWeather = { ...json.current, uv_index: uv };
  return { current, daily: json.daily };
}

/** 해양 격자(파도·SST). 연안은 모델 한계가 있을 수 있음 */
export type MarineCurrent = {
  wave_height_m: number | null;
  wave_period_s: number | null;
  sea_surface_temperature_c: number | null;
};

type MarineApiCurrent = {
  time: string;
  wave_height?: number;
  wave_period?: number;
  sea_surface_temperature?: number;
};

export async function fetchMarineCurrent(lat: number, lon: number): Promise<MarineCurrent> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: "wave_height,wave_period,sea_surface_temperature",
    timezone: "Asia/Manila",
    length_unit: "metric",
    cell_selection: "sea",
  });
  const url = `https://marine-api.open-meteo.com/v1/marine?${params.toString()}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`해양 API 오류 (${res.status})`);
  const json = (await res.json()) as { current?: MarineApiCurrent };
  const c = json.current;
  if (!c) {
    return { wave_height_m: null, wave_period_s: null, sea_surface_temperature_c: null };
  }
  return {
    wave_height_m: typeof c.wave_height === "number" ? c.wave_height : null,
    wave_period_s: typeof c.wave_period === "number" ? c.wave_period : null,
    sea_surface_temperature_c:
      typeof c.sea_surface_temperature === "number" ? c.sea_surface_temperature : null,
  };
}
