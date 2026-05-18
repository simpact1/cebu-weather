import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ExternalLink from "./components/ExternalLink";
import GuideBriefingCard from "./components/GuideBriefingCard";
import { FORECAST_PLACE, PARTNER_LINKS, SPOTS, TRAVEL_TIPS, WEATHER_PLACES } from "./constants";
import { buildTourRows, tourStatusLabel } from "./tourFeasibility";
import {
  fetchTropicalCycloneBulletins,
  hasPhilippinesTropicalImpactWithin7Days,
} from "./typhoon";
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
  const [typhoonImpact7d, setTyphoonImpact7d] = useState<boolean | null>(null);
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
      const [placeOutcomes, fc, th] = await Promise.all([
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
        fetchTropicalCycloneBulletins()
          .then((data) => hasPhilippinesTropicalImpactWithin7Days(data))
          .catch(() => false),
      ]);

      setPlaces(placeOutcomes);
      setTyphoonImpact7d(th);
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
  );

  return (
    <>
      <div className="app">
      <header className="hero">
        <p className="eyebrow">Philippines · Cebu</p>
        <h1>세부날씨 여행팁</h1>
        <p className="sub">필리핀 세부 보홀기준 실시간 날씨와 관련 여행팁입니다.</p>
        <button type="button" className="refresh" onClick={() => void load()} disabled={loading}>
          {loading ? "불러오는 중…" : "새로고침"}
        </button>
        <div className="partner">
          <p className="partner-title">세부여행플래너</p>
          <nav className="partner-links" aria-label="세부여행플래너 바로가기">
            <ExternalLink className="plink plink-naver" href={PARTNER_LINKS.naverBlog}>
              세부여행꿀팁들
            </ExternalLink>
            <ExternalLink className="plink plink-kakao" href={PARTNER_LINKS.kakaoChannel}>
              카카오톡 채널
            </ExternalLink>
          </nav>
          <GuideBriefingCard />
        </div>
      </header>

      <main className="grid">
        <section className="card card-places" aria-live="polite" id="today-weather">
          <h2>한눈에 보는 오늘 날씨</h2>
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

        <section className="card card-uv-guide">
          <h2>자외선(UV) 안내</h2>
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

        <section className="card card-typhoon">
          <h2>태풍·열대저압대 정보</h2>
          {loading && typhoonImpact7d === null ? (
            <p className="muted typhoon-one">확인 중…</p>
          ) : (
            <p className="typhoon-one">
              현재 기준 <strong>7일 이내</strong> 필리핀 지역에 영향을 줄 수 있는 태풍·열대저압대는{" "}
              <strong className={typhoonImpact7d ? "typhoon-yes" : "typhoon-no"}>
                {typhoonImpact7d ? "있습니다" : "없습니다"}
              </strong>
              .
            </p>
          )}
        </section>

        <section className="card card-tours">
          <h2>투어 가능 여부(참고)</h2>
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
          <section className="card">
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

        <section className="card">
          <h2>지역별 추천 동선</h2>
          <ul className="spots">
            {SPOTS.map((s) => (
              <li key={s.name}>
                <strong>{s.name}</strong>
                <span>{s.note}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card tips" id="travel-tips">
          <h2>날씨관련 여행팁</h2>
          <ul>
            {TRAVEL_TIPS.map((tip) => (
              <li key={tip.title}>
                <h3>{tip.title}</h3>
                <p>{tip.body}</p>
              </li>
            ))}
          </ul>
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
          padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
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
        .typhoon-yes {
          color: #fecaca;
        }
        .typhoon-no {
          color: #a7f3d0;
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
          margin: 0 auto 1.25rem;
          padding: 0.75rem 0.85rem;
          font-size: 0.72rem;
          line-height: 1.55;
          color: rgba(165, 243, 252, 0.9);
          background: rgba(0, 0, 0, 0.2);
          border-radius: 0.5rem;
          border: 1px solid rgba(236, 254, 255, 0.1);
        }
        .foot-sources p {
          margin: 0 0 0.5rem;
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
          margin-top: 1rem;
          color: rgba(236, 254, 255, 0.55);
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
