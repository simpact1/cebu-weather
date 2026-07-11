import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ExternalLink from "./components/ExternalLink";
import GdacsSection from "./components/GdacsSection";
import TyphoonBanner from "./components/TyphoonBanner";
import { FORECAST_PLACE, PARTNER_LINKS, WEATHER_PLACES } from "./constants";
import { buildTourRows, tourStatusLabel } from "./tourFeasibility";
import {
  formatTyphoonOverlapDate,
  getPhilippinesTyphoonStatus,
  type TyphoonImpactDetail,
  type TyphoonStatus,
} from "./typhoon";
import { fetchGdacsPhilippineEvents, type GdacsFeature } from "./gdacs";
import {
  fetchCurrentWeather,
  fetchForecast,
  fetchMarineCurrent,
  weatherEmoji,
  weatherLabel,
  type CurrentWeather,
  type ForecastResponse,
  type MarineCurrent,
} from "./weather";

/** 메인(지역 카드)용 — UV 지수 기준 한 줄만 */
function getUvMainLabel(uv: number | null): { emoji: string; label: string } | null {
  if (uv == null || Number.isNaN(uv)) return null;
  if (uv <= 2) return { emoji: "🟢", label: "안전" };
  if (uv <= 5) return { emoji: "🟡", label: "선크림 권장" };
  if (uv <= 7) return { emoji: "🟠", label: "야외활동 주의" };
  if (uv <= 10) return { emoji: "🔴", label: "자외선 매우 강함" };
  return { emoji: "🟣", label: "위험" };
}

function UvGlanceAdvice({ uv }: { uv: number | null }) {
  const brief = getUvMainLabel(uv);
  if (!brief) return null;
  return (
    <div className="g-uv-box">
      <span className="g-uv-emoji" aria-hidden>
        {brief.emoji}
      </span>
      <span className="g-uv-label">{brief.label}</span>
    </div>
  );
}

function placeLoadErrorMessage(e: unknown): string {
  if (e instanceof TypeError && /failed to fetch|networkerror|load failed/i.test(e.message)) {
    return "일시적으로 날씨 서버에 연결하지 못했습니다. 새로고침을 눌러 다시 시도해 주세요.";
  }
  if (e instanceof Error) return e.message;
  return "불러오기 실패";
}

function formatTimeManila(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

function weekdayShort(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00+08:00");
  return new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(d);
}

function formatFetchedAtManila(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function TyphoonImpactList({
  impacts,
  stale,
}: {
  impacts: TyphoonImpactDetail[];
  stale: boolean;
}) {
  return (
    <div className="typhoon-impacts">
      {impacts.map((impact) => {
        const tier = impact.tier ?? "direct";
        return (
          <div
            key={`${impact.eventId ?? impact.eventname}-${impact.episodeId ?? impact.overlapAt}`}
            className="typhoon-impact-item"
          >
            <p className="typhoon-one">
              {tier === "direct" ? (
                <>
                  태풍 <strong className="typhoon-yes">{impact.eventname}</strong>(
                  {impact.alertlevel})가{" "}
                  <strong>{formatTyphoonOverlapDate(impact.overlapAt)}</strong> 경 필리핀을 직접 통과할 것으로
                  예상됩니다.
                </>
              ) : (
                <>
                  태풍 <strong className="typhoon-yes">{impact.eventname}</strong>(
                  {impact.alertlevel})가 필리핀을 직접 통과하지 않지만,{" "}
                  <strong>{formatTyphoonOverlapDate(impact.overlapAt)}</strong> 경 강풍·너울 등 간접 영향이
                  예상됩니다.
                </>
              )}
            </p>
            {impact.maxWindKmh != null || impact.severityText ? (
              <p className="muted typhoon-meta">
                {impact.maxWindKmh != null ? (
                  <>
                    최대 풍속 약 <strong>{impact.maxWindKmh} km/h</strong>
                  </>
                ) : null}
                {impact.maxWindKmh != null && impact.severityText ? " · " : null}
                {impact.severityText ?? null}
              </p>
            ) : null}
            {impact.reportUrl ? (
              <p className="typhoon-meta">
                <ExternalLink href={impact.reportUrl} className="typhoon-report-link">
                  GDACS 상세 리포트
                </ExternalLink>
              </p>
            ) : null}
          </div>
        );
      })}
      {stale ? (
        <p className="muted typhoon-one">(최신 정보 확인 중 지연 — 이전 확인 결과 기준)</p>
      ) : null}
    </div>
  );
}

type PlaceOk = {
  ok: true;
  id: string;
  name: string;
  current: CurrentWeather;
  marine: MarineCurrent | null;
};
type PlaceFail = { ok: false; id: string; name: string; message: string };
type PlaceResult = PlaceOk | PlaceFail;

export function WeatherPage() {
  const [places, setPlaces] = useState<PlaceResult[]>([]);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [typhoonStatus, setTyphoonStatus] = useState<TyphoonStatus>("loading");
  const [typhoonImpacts, setTyphoonImpacts] = useState<TyphoonImpactDetail[]>([]);
  const [typhoonStale, setTyphoonStale] = useState(false);
  const [gdacsData, setGdacsData] = useState<GdacsFeature[]>([]);
  const [gdacsLoading, setGdacsLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const tourRows = useMemo(() => {
    const map = new Map<string, { current: CurrentWeather; marine: MarineCurrent | null }>();
    for (const p of places) {
      if (p.ok) map.set(p.id, { current: p.current, marine: p.marine });
    }
    return buildTourRows(map);
  }, [places]);

  const load = useCallback(async () => {
    setLoading(true);
    setForecastError(null);
    try {
      const [placeOutcomes, fc] = await Promise.all([
        Promise.all(
          WEATHER_PLACES.map(async (p, placeIdx): Promise<PlaceResult> => {
            await new Promise<void>((r) => setTimeout(r, placeIdx * 140));
            try {
              const [cw, mResult] = await Promise.allSettled([
                fetchCurrentWeather(p.lat, p.lon),
                fetchMarineCurrent(p.lat, p.lon),
              ]);
              if (cw.status === "rejected") throw cw.reason;
              const marine =
                mResult.status === "fulfilled" ? mResult.value : null;
              return {
                ok: true,
                id: p.id,
                name: p.name,
                current: cw.value.current,
                marine,
              };
            } catch (e) {
              return {
                ok: false,
                id: p.id,
                name: p.name,
                message: placeLoadErrorMessage(e),
              };
            }
          }),
        ),
        fetchForecast(FORECAST_PLACE.lat, FORECAST_PLACE.lon).catch((e: unknown) => ({
          error: e instanceof Error ? e.message : "예보를 불러오지 못했습니다.",
        })),
      ]);

      setPlaces(placeOutcomes);
      if ("error" in fc) {
        setForecast(null);
        setForecastError(fc.error);
      } else {
        setForecast(fc);
        setForecastError(null);
      }
    } finally {
      setLastLoadedAt(new Date().toISOString());
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setTyphoonStatus("loading");
    setTyphoonImpacts([]);
    getPhilippinesTyphoonStatus()
      .then((result) => {
        setTyphoonStatus(result.status);
        setTyphoonImpacts(result.impacts ?? (result.impact ? [result.impact] : []));
        setTyphoonStale(result.stale === true);
      })
      .catch((e) => {
        console.error(e);
        setTyphoonStatus("error");
        setTyphoonImpacts([]);
        setTyphoonStale(false);
      });
  }, []);

  useEffect(() => {
    setGdacsLoading(true);
    fetchGdacsPhilippineEvents()
      .then((features) => {
        setGdacsData(features);
      })
      .catch(() => {
        setGdacsData([]);
      })
      .finally(() => {
        setGdacsLoading(false);
      });
  }, []);

  /** iframe·누락된 target 등으로 같은 창 이동하는 외부 링크를 새 탭으로 엽니다. */
  useEffect(() => {
    const root = document.querySelector(".app");
    if (!root) return;

    const onClick = (e: Event) => {
      const anchor = (e.target as HTMLElement | null)?.closest("a");
      if (!anchor || !root.contains(anchor)) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const external = /^https?:/i.test(href) || href.startsWith("//");
      if (!external || anchor.target === "_blank") return;

      e.preventDefault();
      window.open(anchor.href, "_blank", "noopener,noreferrer");
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, []);

  const footerSlot =
    typeof document !== "undefined" ? document.getElementById("footer-portal-root") : null;

  const footerNode = (
    <>
      <nav className="app-shortcuts" aria-label="세부 여행 앱 바로가기">
        {[
          { icon: "📍", label: "가볼만한곳", href: "https://activity.cebuplanner.com", color: "linear-gradient(135deg, #FF2D55, #FF6B8A)" },
          { icon: "🏨", label: "세부숙소", href: "https://hotel.cebuplanner.com/", color: "linear-gradient(135deg, #f472b6, #db2777)" },
          { icon: "🚌", label: "교통", href: "https://transport.cebuplanner.com/", color: "linear-gradient(135deg, #00C7BE, #30D5C8)" },
          { icon: "🗓️", label: "여행일정", href: "https://cebu-travel-schedule.vercel.app/", color: "linear-gradient(135deg, #5856D6, #7B79F7)" },
        ].map((item) => (
          <ExternalLink key={item.label} href={item.href} className="app-shortcut">
            <span className="app-shortcut__ico" style={{ background: item.color }} aria-hidden>
              {item.icon}
            </span>
            <span className="app-shortcut__label">{item.label}</span>
          </ExternalLink>
        ))}
      </nav>
      <footer className="foot">
      <section className="foot-sources" aria-label="데이터 출처">
        <p>
          <strong>데이터 출처</strong> — 기온·습도·풍속·강수 확률·7일 예보:{" "}
          <span>Open-Meteo</span> 예보 API. 파도·해수 온도:{" "}
          <span>Open-Meteo Marine API</span>
          . 열대성 저기압·태풍 관련 공지 목록은 제3자 캐시 API를 통해 필리핀국립기상청 관련 특보 제목을 참고합니다. 실제 관측·공식 특보와 차이가 날 수 있습니다. 공식 특보는 기관 발표를 확인하세요.
        </p>
        <p>
          <strong>페이지 수치 갱신</strong> — 브라우저에서 마지막으로 불러온 시각(마닐라):{" "}
          {lastLoadedAt ? formatFetchedAtManila(lastLoadedAt) : "—"} · <span>정식 URL(공유·색인용)</span>
        </p>
      </section>
      <p className="foot-partner">
        <span className="foot-partner-label">세부여행플래너</span>
        <ExternalLink href={PARTNER_LINKS.naverBlog}>세부여행꿀팁들</ExternalLink>
        <span className="foot-dot" aria-hidden>
          ·
        </span>
        <ExternalLink href={PARTNER_LINKS.kakaoChannel}>카카오톡 채널</ExternalLink>
      </p>
    </footer>
    </>
  );

  return (
    <>
      <TyphoonBanner status={typhoonStatus} typhoonName={typhoonImpacts[0]?.eventname} />
      <div className="app">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: [
              {
                "@type": "Question",
                name: "세부·보홀 우기는 언제인가요?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "대체로 6~11월에 태풍·열대 저기압의 영향이 잦고, 스콜이 비교적 자주 옵니다. 일기예보와 해상 특보를 함께 보는 것이 좋습니다.",
                },
              },
              {
                "@type": "Question",
                name: "세부 몇 월에 가면 좋나요?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "건기(대략 12~5월)는 비가 적은 날이 많아 해변·섬 투어에 유리한 경우가 많습니다. 우기(6~11월)는 비가 잦을 수 있으나 가격·혼잡도는 상대적으로 나을 수 있습니다.",
                },
              },
              {
                "@type": "Question",
                name: "호핑은 날씨가 어떨 때 비추천인가요?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "강한 바람·높은 파도·태풍·저기압이 가까울 때는 출항이 제한되거나 위험할 수 있습니다. 풍속·유효파고 안내와 현지 업체 판단을 따르세요.",
                },
              },
              {
                "@type": "Question",
                name: "보홀 페리 결항되기 쉬운 기간은 언제인가요?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "몬순·태풍 외곽·강풍 예보가 발생하는 우기(6~11월)에 결항·지연이 발생할 수 있습니다. 날씨가 안 좋을 때는 전화나 페이스북 등을 통해 결항 여부를 확인하세요.",
                },
              },
              {
                "@type": "Question",
                name: "세부 자외선은 언제 가장 강한가요?",
                acceptedAnswer: {
                  "@type": "Answer",
                  text: "적도에 가까워 연중 UV 지수가 높게 나오는 날이 많습니다. 하늘이 흐려도 UV는 남을 수 있어 모자·선크림·한낮 회피를 권장합니다.",
                },
              },
            ],
          }),
        }}
      />
      <header className="hero">
        <p className="eyebrow">Philippines · Cebu</p>
        <h1>세부·보홀 실시간 날씨·예보 정보</h1>
        <p className="sub">필리핀 세부·보홀 기준 실시간 날씨와 관련 여행팁입니다. 태풍·지진 정보, 투어 가능 여부, 월별 날씨, 자주 묻는 질문을 한눈에 확인하세요.</p>
        <button type="button" className="refresh" onClick={() => void load()} disabled={loading}>
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
      </header>

      <main className="grid">
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px",
          marginBottom: "20px",
          gridColumn: "1 / -1",
        }}>
          {[
            { icon: "📅", title: "7일 예보", desc: "주간 날씨 흐름", color: "linear-gradient(135deg, #007AFF, #5AC8FA)", targetId: "week-forecast" },
            { icon: "🌀", title: "태풍 정보", desc: "열대저압대 안내", color: "linear-gradient(135deg, #5856D6, #7B79F7)", targetId: "typhoon" },
            { icon: "🌋", title: "화산·지진", desc: "GDACS 실시간", color: "linear-gradient(135deg, #FF3B30, #FF6B6B)", targetId: "gdacs" },
            { icon: "🚤", title: "투어 가능 여부", desc: "호핑·투어 참고", color: "linear-gradient(135deg, #00C7BE, #30D5C8)", targetId: "tour-feasibility" },
            { icon: "💡", title: "날씨 관련 팁", desc: "여행 날씨 꿀팁", color: "linear-gradient(135deg, #FF9500, #FFCC00)", targetId: "weather-tips" },
            { icon: "❓", title: "자주 묻는 질문", desc: "날씨 FAQ", color: "linear-gradient(135deg, #34C759, #30D158)", targetId: "faq" },
          ].map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={
                item.title === "자주 묻는 질문"
                  ? () => document.getElementById("faq")?.scrollIntoView({ behavior: "smooth" })
                  : item.title === "날씨 관련 팁"
                    ? () => document.getElementById("weather-tips")?.scrollIntoView({ behavior: "smooth" })
                    : () => document.getElementById(item.targetId)?.scrollIntoView({ behavior: "smooth" })
              }
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "16px",
                padding: "16px 8px 14px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                color: "#ffffff",
                fontFamily: "'Noto Sans KR', sans-serif",
                WebkitAppearance: "none",
                appearance: "none",
                boxShadow: "none",
                outline: "none",
              }}
            >
              <span style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: item.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "26px",
                marginBottom: "10px",
                flexShrink: 0,
              }}>
                {item.icon}
              </span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff", marginBottom: "4px", lineHeight: 1.3, textAlign: "center" }}>
                {item.title}
              </span>
              <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", lineHeight: 1.4, textAlign: "center" }}>
                {item.desc}
              </span>
            </button>
          ))}
        </div>
        <section className="card card-places" aria-live="polite" id="today-weather">
          <h2>세부·보홀 오늘 실시간 날씨</h2>
          <p className="muted lead">
            지역별 <strong>기온</strong>, <strong>풍속</strong>, <strong>자외선</strong>, <strong>파도</strong>(유효파고)를 표시합니다. 자외선
            구간별 안내는 각 카드와 아래 <strong>자외선(UV) 안내</strong> 기준을 함께 참고하세요. 파도·해수 온도·UV는 모델 기준이라 실제와 차이가 날 수 있습니다.
          </p>
          {loading && places.length === 0 && <p className="muted">실시간 날씨를 불러오는 중입니다…</p>}
          <ul className="places-grid">
            {places.map((row) => (
              <li key={row.id} className="place-card">
                <h3 className="place-name">{row.name}</h3>
                {!row.ok && <p className="place-err">{row.message}</p>}
                {row.ok && (
                  <>
                    <div className="place-glance" aria-label={`${row.name} 기온 풍속 자외선 파도`}>
                      <div className="glance-cell">
                        <span className="g-lab">기온</span>
                        <span className="g-val">{Math.round(row.current.temperature_2m)}°</span>
                        {row.marine?.sea_surface_temperature_c != null && (
                          <span className="g-sub">
                            해수 {Math.round(row.marine.sea_surface_temperature_c)}°
                          </span>
                        )}
                      </div>
                      <div className="glance-cell">
                        <span className="g-lab">풍속</span>
                        <span className="g-val">
                          {Math.round(row.current.wind_speed_10m)}
                          <span className="g-unit">km/h</span>
                        </span>
                      </div>
                      <div className="glance-cell glance-cell-uv">
                        <span className="g-lab">자외선</span>
                        <span className="g-val">
                          {row.current.uv_index != null ? row.current.uv_index.toFixed(1) : "—"}
                        </span>
                        <UvGlanceAdvice uv={row.current.uv_index} />
                      </div>
                      <div className="glance-cell">
                        <span className="g-lab">파도</span>
                        <span className="g-val">
                          {row.marine?.wave_height_m != null ? (
                            <>
                              {row.marine.wave_height_m.toFixed(1)}
                              <span className="g-unit">m</span>
                            </>
                          ) : (
                            "—"
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="place-now">
                      <span className="place-emoji" aria-hidden>
                        {weatherEmoji(row.current.weather_code)}
                      </span>
                      <div>
                        <p className="place-cond">{weatherLabel(row.current.weather_code)}</p>
                        <p className="place-time">관측: {formatTimeManila(row.current.time)}</p>
                      </div>
                    </div>
                    <ul className="place-stats">
                      <li>
                        <span>체감</span>
                        <strong>{Math.round(row.current.apparent_temperature)}°</strong>
                      </li>
                      <li>
                        <span>습도</span>
                        <strong>{row.current.relative_humidity_2m}%</strong>
                      </li>
                      <li>
                        <span>강수</span>
                        <strong>{row.current.precipitation} mm</strong>
                      </li>
                    </ul>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="card card-uv-guide" id="uv-guide">
          <h2>세부 자외선(UV) 안내</h2>
          <div className="hopping-legend uv-legend" role="region" aria-label="UV 지수 기준">
            <p className="hopping-legend-title">UV 지수 기준</p>
            <ul>
              <li>
                <span className="leg-ico" aria-hidden>
                  🟢
                </span>
                <span>
                  <strong>UV 0~2</strong> — 안전
                </span>
              </li>
              <li>
                <span className="leg-ico" aria-hidden>
                  🟡
                </span>
                <span>
                  <strong>UV 3~5</strong> — 선크림 권장
                </span>
              </li>
              <li>
                <span className="leg-ico" aria-hidden>
                  🟠
                </span>
                <span>
                  <strong>UV 6~7</strong> — 장시간 야외활동 주의
                </span>
              </li>
              <li>
                <span className="leg-ico" aria-hidden>
                  🔴
                </span>
                <div className="uv-leg-col">
                  <p className="uv-leg-main">
                    <strong>UV 8~10</strong> — 자외선 매우 강함
                  </p>
                  <p className="uv-nested-line">래쉬가드 추천, 선크림 필수, 오후 야외활동 주의</p>
                </div>
              </li>
              <li>
                <span className="leg-ico" aria-hidden>
                  🟣
                </span>
                <span>
                  <strong>UV 11+</strong> — 위험
                </span>
                <ul className="uv-nested">
                  <li>피부 화상 가능성 높음</li>
                </ul>
              </li>
            </ul>
          </div>
        </section>

        {forecast && (
          <section className="card" aria-label="세부 7일 예보" id="week-forecast">
            <h2>세부 7일 예보</h2>
            <ul className="forecast">
              {forecast.daily.time.map((t, i) => (
                <li key={t} className={i === 0 ? "forecast-today" : undefined}>
                  <span className="fw-day">
                    {i === 0 ? "오늘 · " : ""}
                    {weekdayShort(t)} · {t.slice(5).replace("-", "/")}
                  </span>
                  <span className="fw-emoji" title={weatherLabel(forecast.daily.weather_code[i] ?? 0)}>
                    {weatherEmoji(forecast.daily.weather_code[i] ?? 0)}
                  </span>
                  <span className="fw-temps">
                    {Math.round(forecast.daily.temperature_2m_min[i] ?? 0)}° /{" "}
                    <strong>{Math.round(forecast.daily.temperature_2m_max[i] ?? 0)}°</strong>
                  </span>
                  <span className="fw-rain">
                    비 올 확률 최대 {forecast.daily.precipitation_probability_max[i] ?? 0}%
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {forecastError && !forecast && (
          <section className="card" id="week-forecast">
            <h2>세부 7일 예보</h2>
            <p className="err">{forecastError}</p>
          </section>
        )}

        <div className="forecast-scall-note" role="note">
          <p>필리핀 세부 보홀 지역은 우기 시즌에 스콜성 비가 자주 내립니다.</p>
          <p>
            스콜은 굵고 강하게 쏟아지지만 짧게 지나가는 비로, 주로 밤이나 새벽 시간대에 내리는 경우가 많습니다.
          </p>
          <p>
            그래서 일기예보에는 비 오는 확률이 높게 표시되는 날이 많지만, 그렇다고 하루 종일 비가 계속 내리는 것은
            아닙니다.
          </p>
          <p>
            예를 들어 24시간 중 잠깐 5~10분 정도만 비가 내려도 ‘비가 온 날’로 집계되기 때문에, 비올 확률이 높게
            표시되는 것입니다.
          </p>
        </div>

        <section className="card card-typhoon" id="typhoon">
          <h2>세부·필리핀 태풍·열대저압대 정보</h2>
          {typhoonStatus === "loading" ? (
            <p className="muted typhoon-one">확인 중…</p>
          ) : (typhoonStatus === "direct" || typhoonStatus === "indirect") &&
            typhoonImpacts.length > 0 ? (
            <TyphoonImpactList impacts={typhoonImpacts} stale={typhoonStale} />
          ) : typhoonStatus === "error" ? (
            <p className="muted typhoon-one">
              태풍 정보를 확인할 수 없습니다.{" "}
              <ExternalLink href="https://bagong.pagasa.dost.gov.ph/">PAGASA</ExternalLink> 공식 사이트에서 직접 확인해
              주세요.
            </p>
          ) : (
            <p className="typhoon-one">
              현재 기준 <strong>7일 이내</strong> 필리핀 지역에 영향을 줄 수 있는 태풍·열대저압대는{" "}
              <strong className="typhoon-no">없습니다</strong>.
              {typhoonStale ? (
                <span className="muted"> (최신 정보 확인 중 지연 — 이전 확인 결과 기준)</span>
              ) : null}
            </p>
          )}
        </section>

        <GdacsSection events={gdacsData} loading={gdacsLoading} />

        <section className="card card-tours" id="tour-feasibility">
          <h2>세부 투어 가능 여부 (호핑·보홀 참고)</h2>
          <p className="muted lead tour-lead">
            <strong>호핑</strong>·<strong>보홀 호핑</strong>은 아래 풍속·파도 구간으로 표시하고, 그 외 투어는 기존
            가능·주의·어려움으로 분류합니다. 실제 운항·안전은 업체·현지 안내가 우선입니다.
          </p>
          <div className="hopping-legend" role="region" aria-label="호핑 판단 기준">
            <p className="hopping-legend-title">호핑 판단 기준 (막탄·보홀 관측값)</p>
            <ul>
              <li>
                <span className="leg-ico" aria-hidden>
                  🟢
                </span>
                <span>
                  <strong>추천</strong> — 풍속 20km/h 이하 · 파도 1m 이하
                </span>
              </li>
              <li>
                <span className="leg-ico" aria-hidden>
                  🟡
                </span>
                <span>
                  <strong>주의</strong> — 풍속 20~30km/h · 파도 1~1.5m (해당 구간)
                </span>
              </li>
              <li>
                <span className="leg-ico" aria-hidden>
                  🔴
                </span>
                <span>
                  <strong>비추천</strong> — 풍속 30km/h 이상 · 파도 1.5m 이상 (또는 뇌우)
                </span>
              </li>
            </ul>
          </div>
          <p className="tour-canyon-note" role="note">
            협곡(캐녀닝) 지역은 지형 특성상 기상 변화가 매우 유동적이니 업체의 기상안내를 따르세요.
          </p>
          <ul className="tour-list">
            {tourRows.map((row) => (
              <li key={row.id} className="tour-row">
                <div className="tour-name">
                  <strong>{row.name}</strong>
                  <span className="tour-ref">{row.refPlace}</span>
                </div>
                <span className={`tour-badge tour-${row.status}`}>
                  {row.useHoppingBands && row.status !== "unknown" && (
                    <span className="tour-light" aria-hidden>
                      {row.status === "good" ? "🟢 " : row.status === "caution" ? "🟡 " : "🔴 "}
                    </span>
                  )}
                  {tourStatusLabel(row)}
                </span>
                <p className="tour-hint">{row.hint}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className="tour-canyon-note tour-backup-post-note" role="note">
          날씨가 안 좋아 호핑이나 오슬롭·모알보알 투어를 할 수 없는 경우에는{" "}
          <ExternalLink href={PARTNER_LINKS.naverBlogTyphoonTourAlternatives}>요기</ExternalLink>
          를 참고하세요.
        </p>

        <section className="card" style={{ gridColumn: "1 / -1" }} id="weather-tips">
            <h2>날씨 관련 팁</h2>

            <div style={{ marginBottom: "1rem" }}>
              {[
                { title: "태풍·우기 시즌", body: "6~11월은 태풍과 소나기가 잦습니다. 날씨 정보를 확인하는 것이 중요합니다." },
                { title: "자외선·더위", body: "필리핀은 열대 기후라서 자외선이 매우 강합니다. 선크림·모자·선글라스 등을 준비해 오시고 수분 보충은 필수입니다. 피부가 약한 경우 얇은 긴팔을 입는 것도 좋습니다." },
                { title: "집중호우", body: "갑작스럽게 비가 많이 오는 경우 저지대 지역 침수가 되는 경우도 있습니다. 가급적 외부 활동을 자제하고 이동해야 하는 경우에는 구글 맵 등을 이용해 도로 상태를 확인하는 것이 좋습니다." },
              ].map((item) => (
                <div key={item.title} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "0.75rem 0" }}>
                  <p style={{ fontWeight: 700, fontSize: "0.88rem", color: "#fef9c3", margin: "0 0 0.35rem" }}>
                    · {item.title}
                  </p>
                  <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <h3 style={{ fontSize: "0.95rem", fontWeight: 700, color: "#ccfbf1", margin: "1rem 0 0.5rem" }}>
              월별 날씨 느낌 (참고, 세부·보홀 일대)
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", margin: "0 0 0.85rem", lineHeight: 1.5 }}>
              연중 고온 다습이 기본이며, 아래는 일반적인 경향입니다. 연도·태풍 경로에 따라 달라질 수 있으니 출발 전 예보를 확인하세요.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.5rem" }}>
              {[
                { month: "1월", body: "건기에 가깝고 상대적으로 건조한 날이 많은 편. 아침·저녁은 선선할 수 있음." },
                { month: "2월", body: "건기, 해변·섬 투어에 유리한 날이 많은 경우가 많음." },
                { month: "3월", body: "건기 후반, 낮 더위가 뚜렷해지기 시작. 자외선·수분 보충 유의." },
                { month: "4월", body: "건기, 습도는 상대적으로 낮은 편이라 체감 더위가 강하게 느껴질 수 있음." },
                { month: "5월", body: "건기 말엽, 소나기가 늘기 시작할 수 있음. 호핑 전 당일 바람 확인." },
                { month: "6월", body: "우기 시작, 스콜·소나기 빈도 증가. 태풍 시즌 진입에 가까움." },
                { month: "7월", body: "우기, 강한 소나기·바람 구간이 잦을 수 있음. 페리·항공 지연 여지." },
                { month: "8월", body: "우기, 태풍 외곽 영향 가능성. 해상 특보·파고 확인 필수." },
                { month: "9월", body: "우기, 태풍·저기압 통로에 따라 편차 큼. 일정 여유 권장." },
                { month: "10월", body: "우기 후반까지 이어질 수 있음. 강우·바람 변동에 유의." },
                { month: "11월", body: "우기 말엽, 태풍 잔향·스콜 가능. 건기 전환기 느낌이 들 수 있음." },
                { month: "12월", body: "건기로 접어드는 경우가 많아 해변 일정이 무난한 날이 늘어나는 편." },
              ].map((item) => (
                <div key={item.month} style={{
                  background: "rgba(0,0,0,0.18)",
                  borderRadius: "0.55rem",
                  padding: "0.55rem 0.65rem",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}>
                  <p style={{ fontWeight: 700, fontSize: "0.82rem", color: "#fef9c3", margin: "0 0 0.25rem" }}>
                    {item.month}
                  </p>
                  <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </section>
        <section className="card" style={{ gridColumn: "1 / -1", marginTop: "0" }} id="faq">
            <h2>자주 묻는 질문</h2>
            {[
              { q: "세부·보홀 우기는 언제인가요?", a: "대체로 6~11월에 태풍·열대 저기압의 영향이 잦고, 스콜(짧고 굵은 소나기)이 비교적 자주 옵니다. 일기예보와 해상 특보를 함께 보는 것이 좋습니다." },
              { q: "고래상어(오슬롭) 투어는 몇 월이 무난한가요?", a: "운영 정책·바다 상태는 매년 달라질 수 있습니다. 일반적으로 건기(12~5월 전후)에는 파도가 잔잔한 날이 많은 편이나, 당일 풍속·파고를 반드시 확인하세요." },
              { q: "호핑은 날씨가 어떨 때 비추천인가요?", a: "비 보다는 강한 바람·높은 파도·태풍·저기압이 가까울 때는 출항이 제한되거나 위험할 수 있습니다. 풍속·유효파고 안내와 현지 업체 판단을 따르세요." },
              { q: "세부 몇 월에 가면 좋나요?", a: "건기(대략 12~5월)는 비가 적은 날이 많아 해변·섬 투어에 유리한 경우가 많습니다. 우기(6~11월)는 비가 잦을 수 있으나 가격·혼잡도는 상대적으로 나을 수 있어 취향에 따라 선택하면 됩니다." },
              { q: "세부 몇 월이 제일 더워요?", a: "연중 낮 기온이 30°C 전후에 머무는 날이 많습니다. 건기인 3~5월 전후는 습도가 상대적으로 낮아 체감상 더 뜨겁게 느껴질 수 있고, 6~11월은 습도가 높아 후덥지근한 느낌입니다." },
              { q: "모알보알 날씨의 특징은 무엇인가요?", a: "남쪽 해안으로 바람이 직접 닿는 날이 많아 세부 시티보다 파도·풍속에 더 민감할 수 있습니다. 캐녀닝·바다거북·정어리떼 스노클링 일정은 풍속·파고 안내가 특히 중요합니다." },
              { q: "자외선(UV)은 세부에서 언제 가장 강한가요?", a: "적도에 가까워 연중 UV 지수가 높게 나오는 날이 많습니다. 하늘이 흐려도 UV는 남을 수 있어 모자·선크림·한낮 회피를 권장합니다." },
              { q: "보홀 페리·결항되기 쉬운 기간은 언제인가요?", a: "몬순·태풍 외곽·강풍 예보가 발생하는 우기(6~11월)에 결항·지연이 발생할 수 있습니다. 날씨가 안 좋을 때는 곧바로 항구로 가지 마시고 전화나 페이스북 등을 통해 결항 여부를 확인하세요." },
              { q: "막탄·세부 시티와 모알보알의 날씨 차이가 나나요?", a: "같은 날에도 해안 방향·지형에 따라 바람·파도·소나기 강도가 다를 수 있습니다. 목적지별로 예보를 나누어 보는 것이 좋습니다." },
              { q: "건기에도 호핑이 취소될 수 있나요?", a: "가능합니다. 너울·숨은 파도(swell), 현지 해경·업체 판단으로 운항이 제한될 수 있습니다. 예보의 바람·파고와 현장 안내를 함께 따르세요." },
              { q: "세부 8월 날씨는 어떤가요?", a: "8월은 우기 한복판으로 태풍 외곽 영향을 받을 수 있습니다. 강한 소나기·바람이 잦고 해상 특보를 꼭 확인하세요." },
              { q: "세부 9월에 호핑 가능한가요?", a: "9월은 우기로 태풍·저기압 통로에 따라 편차가 큽니다. 당일 풍속·파고를 반드시 확인하고 업체 안내를 따르세요." },
              { q: "세부 12월 날씨는 어떤가요?", a: "12월은 건기로 접어드는 시기로 비가 적은 날이 많아 여행하기 좋습니다. 아침저녁은 상대적으로 선선할 수 있습니다." },
              { q: "세부 1월 날씨는 어떤가요?", a: "1월은 건기로 맑은 날이 많고 해변·호핑 투어에 유리합니다. 연중 가장 여행하기 좋은 시기 중 하나입니다." },
              { q: "세부 우기에 여행 가도 되나요?", a: "우기(6~11월)에도 여행은 가능합니다. 스콜은 짧고 굵게 지나가는 경우가 많아 하루 종일 비가 오는 것은 아닙니다. 다만 태풍 시즌임을 감안해 일정에 여유를 두세요." },
              { q: "세부 태풍은 얼마나 자주 오나요?", a: "필리핀은 연간 20개 내외의 태풍이 발생하며 세부·보홀 지역도 영향을 받을 수 있습니다. 특히 7~10월에 집중되므로 여행 전 기상청 특보를 확인하세요." },
              { q: "세부 3박5일 여행하기 좋은 계절은?", a: "건기인 12~5월이 가장 무난합니다. 특히 1~4월은 맑은 날이 많아 호핑·오슬롭·보홀 투어 모두 유리합니다." },
              { q: "보홀 페리는 비 오면 취소되나요?", a: "비 자체보다는 강풍·높은 파도가 결항의 주요 원인입니다. 태풍·저기압 접근 시 결항 가능성이 높아지므로 출발 전 페리 회사에 확인하세요." },
              { q: "세부 스쿠버다이빙 시즌은 언제인가요?", a: "연중 다이빙이 가능하지만 건기(12~5월)에 시야가 좋은 날이 많습니다. 막탄·모알보알·보홀 모두 인기 다이빙 포인트입니다." },
              { q: "막탄 공항 날씨와 세부 시티 날씨가 다른가요?", a: "거리가 가깝지만 소나기는 지역별로 차이가 날 수 있습니다. 공항 날씨가 맑아도 시내는 비가 오거나 그 반대일 수 있습니다." },
              { q: "세부 반타얀 섬 날씨는 어떤가요?", a: "반타얀 섬은 세부 북쪽에 위치해 건기(12~5월)에 방문하면 맑은 날이 많습니다." },
              { q: "세부 말라파스쿠아 날씨는 어떤가요?", a: "세부 최북단에 위치해 태풍 영향을 비교적 직접 받을 수 있습니다. 건기에 방문하면 환도상어·다이빙을 즐기기 좋습니다." },
              { q: "세부 모알보알 정어리떼 시즌은 언제인가요?", a: "연중 볼 수 있지만 바다 상태가 좋은 건기(12~5월)에 더 쾌적하게 즐길 수 있습니다. 당일 파고·풍속을 확인하세요." },
              { q: "세부 오슬롭 날씨가 흐려도 고래상어 투어 가능한가요?", a: "날씨가 흐려도 파도가 잔잔하면 투어가 가능한 경우가 많습니다. 다만 강풍·높은 파고 시에는 취소될 수 있으니 업체에 확인하세요." },
              { q: "세부 카모테스 섬 가는 방법과 날씨는?", a: "다나오 또는 막탄 세부에서 이동이 가능합니다. 다만 막탄과 세부에서는 손님들의 없는 경우 스케줄이 없어지는 경우가 많으니 가급적 다나오항으로 가는 것이 좋고 건기(12~5월)에 날씨가 안정적이고 투명한 바다를 즐기기 좋습니다." },
              { q: "세부 여행 중 태풍이 오면 어떻게 하나요?", a: "PAGASA(필리핀 기상청) 특보를 확인하고 숙소 안내를 따르세요. 시그널 1~2 수준이면 실내 활동 위주로 일정을 조정하는 것이 좋습니다." },
              { q: "세부 바디안 캐녀닝 날씨 주의사항은?", a: "산악 지형 특성상 기상 변화가 빠릅니다. 상류 강수량에 따라 급류 위험이 있어 업체의 기상 안내를 반드시 따르세요." },
              { q: "세부 알레그리아 캐녀닝 날씨는?", a: "남부 지역으로 바디안과 유사한 기상 패턴입니다. 우기에는 수위가 높아질 수 있어 업체 안내가 특히 중요합니다." },
              { q: "세부에서 선크림은 어떤 SPF를 써야 하나요?", a: "적도에 가까워 UV 지수가 높으므로 SPF 50+ PA+++ 이상을 권장합니다. 흐린 날에도 자외선은 강하게 내리쬘 수 있습니다." },
              { q: "세부 여행 중 비가 올 때 실내 활동은?", a: "SM 몰·아얄라 몰 쇼핑, 세부 시티 역사 투어, 스파·마사지, 현지 레스토랑 탐방 등을 즐길 수 있습니다. 실내 활동으로 일정을 유연하게 조정하세요." },
            ].map((item) => (
              <div key={item.q} style={{
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                padding: "0.75rem 0",
              }}>
                <p style={{ fontWeight: 700, fontSize: "0.88rem", color: "#fef9c3", margin: "0 0 0.35rem" }}>
                  Q. {item.q}
                </p>
                <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                  {item.a}
                </p>
              </div>
            ))}
          </section>
      </main>

      <style>{`
        .app {
          width: 100%;
          max-width: 52rem;
          min-width: 0;
          margin: 0 auto;
          padding: 1.25rem max(0.75rem, env(safe-area-inset-left)) 1.25rem
            max(0.75rem, env(safe-area-inset-right));
          padding-bottom: 0.75rem;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .hero {
          text-align: center;
          margin-bottom: 1.75rem;
        }
        .eyebrow {
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-size: 0.7rem;
          color: var(--text-muted);
          margin: 0 0 0.35rem;
        }
        h1 {
          font-size: clamp(1.6rem, 5vw, 2.1rem);
          font-weight: 700;
          margin: 0 0 0.5rem;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
        }
        .sub {
          color: var(--text-muted);
          font-size: 0.9rem;
          line-height: 1.55;
          margin: 0 auto 1rem;
          max-width: 36rem;
          overflow-wrap: anywhere;
        }
        .refresh {
          border: 1px solid rgba(236, 254, 255, 0.35);
          background: rgba(6, 78, 59, 0.45);
          color: var(--text);
          padding: 0.55rem 1.1rem;
          border-radius: 999px;
          font-weight: 600;
        }
        .refresh:disabled {
          opacity: 0.65;
          cursor: wait;
        }
        .partner {
          margin-top: 1.1rem;
          padding-top: 1rem;
          border-top: 1px solid rgba(236, 254, 255, 0.12);
        }
        .partner-title {
          margin: 0 0 0.55rem;
          font-size: 0.8rem;
          font-weight: 600;
          color: #fef9c3;
        }
        .partner-links {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: center;
        }
        .plink {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.5rem 0.95rem;
          border-radius: 0.55rem;
          font-size: 0.85rem;
          font-weight: 600;
          text-decoration: none;
          color: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }
        .plink-naver {
          background: #03c75a;
          color: #fff;
        }
        .plink-kakao {
          background: #fee500;
          color: #191919;
        }
        .plink:focus-visible {
          outline: 2px solid #fef08a;
          outline-offset: 2px;
        }
        .grid {
          display: grid;
          gap: 1rem;
          width: 100%;
          min-width: 0;
        }
        @media (min-width: 640px) {
          .grid {
            grid-template-columns: 1fr 1fr;
          }
          .card-places {
            grid-column: 1 / -1;
          }
          .card-uv-guide {
            grid-column: 1 / -1;
          }
          .card-typhoon {
            grid-column: 1 / -1;
          }
          .card-gdacs {
            grid-column: 1 / -1;
          }
          .card-tours {
            grid-column: 1 / -1;
          }
          .tips {
            grid-column: 1 / -1;
          }
        }
        .card {
          background: var(--bg-card);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(236, 254, 255, 0.12);
          border-radius: var(--radius);
          padding: 1.15rem 1.2rem;
          min-width: 0;
          max-width: 100%;
        }
        .card h2 {
          font-size: 1rem;
          font-weight: 600;
          margin: 0 0 0.85rem;
          color: #ccfbf1;
        }
        .err {
          color: #fecdd3;
          margin: 0;
        }
        .muted {
          color: var(--text-muted);
          margin: 0 0 0.75rem;
        }
        .muted.lead {
          font-size: 0.82rem;
          line-height: 1.5;
          margin: -0.2rem 0 0.9rem;
        }
        .muted.lead strong {
          color: #fef9c3;
          font-weight: 600;
        }
        .forecast-scall-note {
          margin: 0.35rem 0 0.85rem;
          padding: 0.55rem 0.65rem;
          font-size: 0.78rem;
          font-weight: 600;
          line-height: 1.55;
          color: #fef9c3;
          background: rgba(6, 95, 70, 0.28);
          border-radius: 0.55rem;
          border: 1px solid rgba(254, 243, 199, 0.12);
        }
        .forecast-scall-note p {
          margin: 0 0 0.45rem;
        }
        .forecast-scall-note p:last-child {
          margin-bottom: 0;
        }
        .typhoon-one {
          margin: 0;
          font-size: 0.92rem;
          line-height: 1.55;
          color: #ecfeff;
        }
        .typhoon-impacts {
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .typhoon-impact-item {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .typhoon-meta {
          margin: 0;
          font-size: 0.8rem;
          line-height: 1.45;
          color: rgba(236, 254, 255, 0.78);
        }
        #typhoon .typhoon-report-link {
          color: #fde68a;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        #typhoon .typhoon-report-link:hover {
          color: #fff9c4;
        }
        .typhoon-yes {
          color: #fecaca;
        }
        .typhoon-no {
          color: #a7f3d0;
        }
        .gdacs-section-title {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin: 0 0 0.35rem;
        }
        .gdacs-section-badge {
          font-size: 0.62rem;
          font-weight: 600;
          color: #fff;
          background: #5856d6;
          padding: 0.12rem 0.45rem;
          border-radius: 999px;
          letter-spacing: 0.03em;
        }
        .gdacs-section-sub {
          font-size: 0.75rem;
          color: var(--text-muted);
          margin: 0 0 0.85rem;
        }
        .gdacs-distance-row {
          white-space: nowrap;
          font-size: 0.75rem;
          color: inherit;
          margin: 2px 0;
        }
        .gdacs-loading,
        .gdacs-empty {
          margin: 0;
          font-size: 0.88rem;
          line-height: 1.5;
          color: var(--text-muted);
          text-align: center;
          padding: 0.75rem 0;
        }
        .gdacs-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .gdacs-card {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          background: rgba(0, 0, 0, 0.22);
          border: 1px solid rgba(236, 254, 255, 0.1);
          border-radius: 0.85rem;
          padding: 0.75rem 0.85rem;
        }
        .gdacs-icon {
          font-size: 1.65rem;
          line-height: 1;
          flex-shrink: 0;
        }
        .gdacs-card-body {
          flex: 1;
          min-width: 0;
        }
        .gdacs-card-header {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          margin-bottom: 0.15rem;
        }
        .gdacs-type {
          font-size: 0.72rem;
          font-weight: 700;
          color: #ccfbf1;
        }
        .gdacs-alert {
          font-size: 0.62rem;
          font-weight: 600;
          color: #fff;
          padding: 0.1rem 0.45rem;
          border-radius: 999px;
        }
        .gdacs-alert-legend {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.4);
          white-space: nowrap;
        }
        .gdacs-title {
          font-size: 0.82rem;
          font-weight: 600;
          color: #ecfeff;
          margin: 0 0 0.1rem;
          line-height: 1.4;
        }
        .gdacs-direction {
          font-size: 0.68rem;
          font-weight: 400;
          color: rgba(153, 246, 228, 0.75);
        }
        .gdacs-meta {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin: 0.1rem 0;
          flex-wrap: wrap;
        }
        .gdacs-mag {
          font-size: 0.75rem;
          color: #fecaca;
          font-weight: 700;
        }
        .gdacs-date {
          font-size: 0.68rem;
          color: rgba(153, 246, 228, 0.65);
          margin: 0;
        }
        .uv-legend .hopping-legend-title {
          margin-bottom: 0.5rem;
        }
        .uv-nested {
          margin: 0.25rem 0 0.15rem;
          padding-left: 1.5rem;
          list-style: disc;
          font-size: 0.72rem;
          line-height: 1.45;
          color: rgba(165, 243, 252, 0.95);
        }
        .uv-nested li {
          margin: 0.1rem 0;
        }
        .hopping-legend {
          margin: 0 0 1rem;
          padding: 0.65rem 0.75rem;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 0.55rem;
          border: 1px solid rgba(254, 243, 199, 0.12);
        }
        .hopping-legend-title {
          margin: 0 0 0.45rem;
          font-size: 0.78rem;
          font-weight: 600;
          color: #fef9c3;
        }
        .hopping-legend ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .hopping-legend li {
          display: flex;
          gap: 0.35rem;
          align-items: flex-start;
          font-size: 0.78rem;
          line-height: 1.45;
          color: var(--text-muted);
          overflow-wrap: anywhere;
        }
        .uv-legend > ul > li {
          flex-wrap: wrap;
        }
        .uv-leg-col {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 0.2rem;
          min-width: 0;
          flex: 1;
        }
        .uv-leg-main {
          margin: 0;
          font-size: inherit;
          line-height: inherit;
          color: inherit;
        }
        .uv-legend .uv-nested {
          flex-basis: 100%;
          margin-left: 1.45rem;
        }
        .uv-nested-line {
          margin: 0;
          padding: 0;
          font-size: 0.72rem;
          line-height: 1.45;
          color: rgba(165, 243, 252, 0.95);
        }
        .leg-ico {
          flex-shrink: 0;
          line-height: 1.4;
        }
        .tour-light {
          margin-right: 0.1rem;
        }
        .tour-lead {
          margin-bottom: 0.75rem;
        }
        .tour-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .tour-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.25rem 0.65rem;
          align-items: start;
          padding: 0.55rem 0.55rem;
          background: rgba(0, 0, 0, 0.16);
          border-radius: 0.55rem;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }
        @media (max-width: 420px) {
          .tour-row {
            grid-template-columns: 1fr;
          }
          .tour-badge {
            justify-self: start;
            align-self: start;
            margin-top: 0.2rem;
          }
        }
        .tour-name {
          min-width: 0;
        }
        .tour-name strong {
          display: block;
          font-size: 0.9rem;
          font-weight: 700;
        }
        .tour-ref {
          font-size: 0.72rem;
          color: var(--text-muted);
        }
        .tour-badge {
          font-size: 0.74rem;
          font-weight: 700;
          padding: 0.28rem 0.55rem;
          border-radius: 999px;
          white-space: nowrap;
          align-self: center;
        }
        .tour-good {
          background: rgba(34, 197, 94, 0.35);
          color: #dcfce7;
        }
        .tour-caution {
          background: rgba(234, 179, 8, 0.38);
          color: #fef9c3;
        }
        .tour-bad {
          background: rgba(244, 63, 94, 0.38);
          color: #ffe4e6;
        }
        .tour-unknown {
          background: rgba(148, 163, 184, 0.28);
          color: #e2e8f0;
        }
        .tour-hint {
          grid-column: 1 / -1;
          margin: 0.15rem 0 0;
          font-size: 0.76rem;
          line-height: 1.45;
          color: rgba(165, 243, 252, 0.92);
        }
        .tour-canyon-note {
          margin: 0.75rem 0 0.85rem;
          padding: 0.65rem 0.75rem;
          font-size: 0.78rem;
          line-height: 1.55;
          color: rgba(254, 243, 199, 0.95);
          background: rgba(0, 0, 0, 0.2);
          border-radius: 0.5rem;
          border: 1px solid rgba(254, 243, 199, 0.12);
        }
        p.tour-canyon-note.tour-backup-post-note {
          margin: 0.5rem 0 0.85rem;
        }
        .tour-backup-post-note a {
          color: #b91c1c;
          font-weight: 700;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .tour-backup-post-note a:hover {
          color: #991b1b;
        }
        .places-grid {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 0.75rem;
          grid-template-columns: 1fr;
        }
        @media (min-width: 420px) {
          .places-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 720px) {
          .places-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        @media (min-width: 960px) {
          .places-grid {
            grid-template-columns: repeat(5, 1fr);
          }
        }
        .place-card {
          background: rgba(0, 0, 0, 0.18);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.75rem;
          padding: 0.75rem 0.8rem;
          min-height: 13.5rem;
        }
        .place-glance {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.45rem;
          margin-bottom: 0.65rem;
          padding: 0.55rem 0.4rem;
          background: rgba(6, 95, 70, 0.42);
          border-radius: 0.6rem;
          border: 1px solid rgba(254, 243, 199, 0.18);
        }
        @media (min-width: 400px) {
          .place-glance {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        .glance-cell {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 0.12rem;
          min-width: 0;
        }
        .g-lab {
          font-size: 0.65rem;
          letter-spacing: 0.05em;
          color: #fde68a;
          font-weight: 600;
        }
        .g-val {
          font-size: clamp(1.1rem, 4vw, 1.35rem);
          font-weight: 800;
          line-height: 1.15;
          color: #fff;
        }
        .g-val .g-unit {
          font-size: calc(clamp(1.05rem, 3.8vw, 1.32rem) / 3);
          font-weight: 600;
          margin-left: 0.08em;
          vertical-align: baseline;
        }
        .g-sub {
          font-size: 0.62rem;
          color: rgba(165, 243, 252, 0.95);
        }
        .glance-cell-uv {
          align-items: center;
          text-align: center;
        }
        .glance-cell-uv .g-lab,
        .glance-cell-uv .g-val {
          text-align: center;
        }
        .g-uv-box {
          margin-top: 0.2rem;
          padding: 0.35rem 0.4rem;
          background: rgba(0, 0, 0, 0.22);
          border-radius: 0.45rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.12rem;
          width: 100%;
          text-align: center;
          box-sizing: border-box;
        }
        .g-uv-emoji {
          display: block;
          font-size: 0.9rem;
          line-height: 1;
        }
        .g-uv-label {
          display: block;
          font-size: 0.58rem;
          line-height: 1.25;
          color: rgba(254, 252, 232, 0.95);
          font-weight: 600;
          overflow-wrap: anywhere;
          text-align: center;
          white-space: pre-line;
        }
        .g-uv-details {
          margin: 0;
          padding: 0;
          list-style: none;
          font-size: 0.58rem;
          line-height: 1.4;
          color: rgba(165, 243, 252, 0.95);
          text-align: center;
        }
        .g-uv-details li {
          margin: 0.08rem 0;
          text-align: center;
        }
        .place-name {
          margin: 0 0 0.5rem;
          font-size: 0.95rem;
          font-weight: 700;
          color: #fef3c7;
        }
        .place-err {
          margin: 0;
          font-size: 0.82rem;
          color: #fecdd3;
        }
        .place-now {
          display: flex;
          gap: 0.5rem;
          align-items: center;
          margin-bottom: 0.45rem;
        }
        .place-emoji {
          font-size: 1.75rem;
          line-height: 1;
        }
        .place-cond {
          margin: 0;
          font-size: 0.85rem;
          font-weight: 600;
          color: #ecfeff;
        }
        .place-time {
          margin: 0.15rem 0 0;
          font-size: 0.68rem;
          color: rgba(165, 243, 252, 0.85);
        }
        .place-stats {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.35rem;
        }
        .place-stats li {
          background: rgba(0, 0, 0, 0.2);
          border-radius: 0.45rem;
          padding: 0.35rem 0.4rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 0.1rem;
        }
        .place-stats span {
          font-size: 0.65rem;
          color: var(--text-muted);
        }
        .place-stats strong {
          font-size: 0.8rem;
        }
        .forecast {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .forecast li {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          grid-template-rows: auto auto;
          gap: 0.15rem 0.75rem;
          padding: 0.5rem 0.35rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          min-width: 0;
        }
        .forecast li.forecast-today {
          background: rgba(254, 243, 199, 0.08);
          border-radius: 0.5rem;
          margin: 0 -0.2rem;
          padding-left: 0.55rem;
          padding-right: 0.55rem;
          border-bottom-color: transparent;
        }
        .forecast li:last-child {
          border-bottom: none;
        }
        .fw-day {
          font-size: 0.88rem;
          font-weight: 500;
          min-width: 0;
        }
        .fw-emoji {
          grid-row: 1 / 3;
          grid-column: 2;
          align-self: center;
          font-size: 1.35rem;
        }
        .fw-temps {
          font-size: 0.82rem;
          color: var(--text-muted);
          min-width: 0;
        }
        .fw-rain {
          font-size: 0.78rem;
          color: #a5f3fc;
          min-width: 0;
        }
        .spots {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
        }
        .spots li {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          padding: 0.5rem 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .spots li:last-child {
          border-bottom: none;
        }
        .spots strong {
          font-size: 0.95rem;
        }
        .spots span {
          font-size: 0.85rem;
          color: var(--text-muted);
        }
        .tips ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 1rem;
        }
        @media (min-width: 768px) {
          .tips ul {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        .tips h3 {
          font-size: 0.9rem;
          margin: 0 0 0.35rem;
          color: var(--accent);
        }
        .tips p {
          margin: 0;
          font-size: 0.88rem;
          line-height: 1.55;
          color: var(--text-muted);
        }
        .foot-sources {
          text-align: left;
          max-width: 40rem;
          margin: 0 auto 0.3rem;
          padding: 0.75rem 0.85rem calc(0.75rem + 96px);
          font-size: 0.72rem;
          line-height: 1.55;
          color: rgba(165, 243, 252, 0.9);
          background: rgba(0, 0, 0, 0.2);
          border-radius: 0.5rem;
          border: 1px solid rgba(236, 254, 255, 0.1);
        }
        .foot-sources p {
          margin: 0 0 0.15rem;
        }
        .foot-sources p:last-child {
          margin-bottom: 0;
        }
        .foot-sources strong {
          color: #fef9c3;
          font-weight: 600;
        }
        .foot-sources a {
          color: #a5f3fc;
          text-decoration: underline;
          text-underline-offset: 2px;
          word-break: break-all;
        }
        .foot-sources a:hover {
          color: #ecfeff;
        }
        .foot {
          text-align: center;
          margin-top: 0.125rem;
          color: rgba(236, 254, 255, 0.55);
        }
        .app-shortcuts {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          width: 100%;
          z-index: 100;
          grid-column: 1 / -1;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0;
          width: 100%;
          max-width: 52rem;
          margin: 0 auto;
          padding: 8px 0 max(8px, env(safe-area-inset-bottom));
          background: rgba(4, 47, 46, 0.97);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          box-sizing: border-box;
        }
        .app-shortcut {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0;
          padding: 10px 4px;
          text-decoration: none;
          color: #ffffff;
          font-family: "Noto Sans KR", sans-serif;
          border-radius: 0;
          background: transparent;
          border: none;
          border-right: 1px solid rgba(255, 255, 255, 0.12);
          transition: background 0.15s ease;
        }
        .app-shortcut:last-child {
          border-right: none;
        }
        .app-shortcut:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        .app-shortcut:focus-visible {
          outline: 2px solid #fef08a;
          outline-offset: -2px;
        }
        .app-shortcut__ico {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          line-height: 1;
          margin-bottom: 4px;
          flex-shrink: 0;
        }
        .app-shortcut__label {
          font-size: 12px;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.25;
          letter-spacing: -0.02em;
        }
        .foot-partner {
          margin: 0 0 0.5rem;
          font-size: 0.84rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
          align-items: center;
          justify-content: center;
        }
        .foot-partner-label {
          color: rgba(254, 243, 199, 0.95);
          font-weight: 600;
          margin-right: 0.15rem;
        }
        .foot-partner a {
          color: #a5f3fc;
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .foot-partner a:hover {
          color: #ecfeff;
        }
        .foot-dot {
          color: rgba(236, 254, 255, 0.45);
          user-select: none;
        }
        .foot small {
          font-size: 0.72rem;
        }
      `}</style>
    </div>
    {footerSlot ? createPortal(footerNode, footerSlot) : null}
    </>
  );
}
