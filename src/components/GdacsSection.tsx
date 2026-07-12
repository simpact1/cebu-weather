import { useEffect, useState } from "react";
import {
  formatGdacsEventDate,
  gdacsAlertColor,
  gdacsEarthquakeMagnitude,
  gdacsEventTypeIcon,
  gdacsEventTypeLabel,
  type GdacsFeature,
} from "../gdacs";

const CEBU_LAT = 10.3157;
const CEBU_LNG = 123.8854;

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=en`,
      { headers: { "User-Agent": "CebuWeatherApp/1.0" } },
    );
    const data = await res.json();
    const addr = data.address || {};
    return (
      addr.city ||
      addr.town ||
      addr.municipality ||
      addr.county ||
      addr.province ||
      addr.state ||
      "필리핀"
    );
  } catch {
    return "필리핀";
  }
}

function getDirectionFromCebu(lat: number, lng: number): string {
  const R = 6371;
  const dLat = ((lat - CEBU_LAT) * Math.PI) / 180;
  const dLng = ((lng - CEBU_LNG) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((CEBU_LAT * Math.PI) / 180) *
      Math.cos((lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const dist = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  const dLatDeg = lat - CEBU_LAT;
  const dLngDeg = lng - CEBU_LNG;
  if (Math.abs(dLatDeg) < 0.5 && Math.abs(dLngDeg) < 0.5) return `세부 인근 ${dist}km`;
  if (dLatDeg >= 0 && dLngDeg >= 0) return `세부에서 북동쪽 ${dist}km`;
  if (dLatDeg >= 0 && dLngDeg < 0) return `세부에서 북서쪽 ${dist}km`;
  if (dLatDeg < 0 && dLngDeg >= 0) return `세부에서 남동쪽 ${dist}km`;
  return `세부에서 남서쪽 ${dist}km`;
}

type Props = {
  events: GdacsFeature[];
  loading: boolean;
};

export default function GdacsSection({ events, loading }: Props) {
  const [parsedLocations, setParsedLocations] = useState<
    Record<string, { place: string; direction: string | null }>
  >({});

  useEffect(() => {
    if (!events.length) return;
    events.forEach((event) => {
      const coords = event.geometry?.coordinates;
      if (!coords) return;
      const [lng, lat] = coords;
      const key = `${event.properties.eventtype}-${event.properties.eventid}`;
      reverseGeocode(lat, lng).then((place) => {
        const direction = getDirectionFromCebu(lat, lng);
        setParsedLocations((prev) => ({ ...prev, [key]: { place, direction } }));
      });
    });
  }, [events]);

  return (
    <section
      className="card card-gdacs gdacs-section"
      id="gdacs"
      aria-label="필리핀 화산·지진 정보"
    >
      <h2 className="gdacs-section-title">
        <span aria-hidden>🌋</span> 필리핀 화산 · 지진 정보
        <span className="gdacs-section-badge">GDACS</span>
      </h2>
      <p className="gdacs-section-sub">최근 30일 기준 · 필리핀 지역 · 최대 5건</p>
      <p className="gdacs-distance-row">300km 서울 ↔ 대구 정도 거리 · 400km 서울 ↔ 부산 정도 거리</p>
      <p className="gdacs-distance-row">500km 서울 ↔ 제주시 정도 거리 · 600km 서울 ↔ 후쿠오카 정도 거리</p>

      {loading ? (
        <p className="gdacs-loading muted">데이터 불러오는 중...</p>
      ) : events.length === 0 ? (
        <p className="gdacs-empty">✅ 현재 필리핀 지역 화산·지진 특이사항 없음</p>
      ) : (
        <ul className="gdacs-list">
          {events.map((event) => {
            const p = event.properties;
            const type = gdacsEventTypeLabel(p.eventtype);
            const typeIcon = gdacsEventTypeIcon(p.eventtype);
            const alertColor = gdacsAlertColor(p.alertlevel);
            const date = formatGdacsEventDate(p.fromdate);
            const key = `${p.eventtype}-${p.eventid}`;
            const { place = "필리핀", direction = null } = parsedLocations[key] ?? {};
            const magnitude = gdacsEarthquakeMagnitude(p);

            return (
              <li className="gdacs-card" key={key}>
                <span className="gdacs-icon" aria-hidden>
                  {typeIcon}
                </span>
                <div className="gdacs-card-body">
                  <div className="gdacs-card-header">
                    <span className="gdacs-type">{type}</span>
                    <span className="gdacs-alert" style={{ backgroundColor: alertColor }}>
                      {p.alertlevel}
                    </span>
                    <span className="gdacs-alert-legend">
                      초록=낮은 위험 · 주황=중간 · 빨강=높음
                    </span>
                  </div>
                  <p className="gdacs-title">
                    {place}
                    {direction && <span className="gdacs-direction"> · {direction}</span>}
                  </p>
                  {p.eventtype === "EQ" && magnitude != null && (
                    <div className="gdacs-meta">
                      <span className="gdacs-mag">규모 {magnitude}</span>
                    </div>
                  )}
                  <p className="gdacs-date">{date}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
