import booleanIntersects from "@turf/boolean-intersects";
import { polygon } from "@turf/helpers";
import {
  fetchActiveTropicalCyclones,
  fetchTyphoonGeometry,
} from "./gdacsFetch.js";
import { findTyphoonBlogPostUrl } from "./typhoonBlogRss.js";

const PH_BBOX = { minLng: 116, maxLng: 128, minLat: 4, maxLat: 20 };
const TRACK_TIME_LABEL_RE = /^(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?:\s+UTC)?$/;
const WIND_SPEED_LABEL_RE = /^(\d+)\s*km\/h$/i;

const PHILIPPINES_BBOX_POLYGON = polygon([
  [
    [PH_BBOX.minLng, PH_BBOX.minLat],
    [PH_BBOX.maxLng, PH_BBOX.minLat],
    [PH_BBOX.maxLng, PH_BBOX.maxLat],
    [PH_BBOX.minLng, PH_BBOX.maxLat],
    [PH_BBOX.minLng, PH_BBOX.minLat],
  ],
]);

function manilaTodayRange() {
  const todayStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Manila" });
  const start = Date.parse(`${todayStr}T00:00:00+08:00`);
  const end = start + 8 * 24 * 60 * 60 * 1000 - 1;
  return { start, end };
}

function parseTrackTimeLabel(label) {
  const match = TRACK_TIME_LABEL_RE.exec(String(label).trim());
  if (!match) return null;
  const [, day, month, hour, minute] = match;
  const year = new Date().getUTCFullYear();
  const ts = Date.UTC(year, Number(month) - 1, Number(day), Number(hour), Number(minute));
  return Number.isNaN(ts) ? null : ts;
}

function parseIsoTimestamp(value) {
  if (value == null || value === "") return null;
  const ts = Date.parse(String(value));
  return Number.isNaN(ts) ? null : ts;
}

function episodeRangeOverlapsWindow(feature, start, end) {
  const p = feature.properties ?? {};
  const from = parseIsoTimestamp(p.fromdate);
  const to = parseIsoTimestamp(p.todate);
  if (from == null || to == null) return false;
  return from <= end && to >= start;
}

function isWithinWindow(at, start, end) {
  return at >= start && at <= end;
}

function intersectsPhilippines(feature) {
  return booleanIntersects(feature, PHILIPPINES_BBOX_POLYGON);
}

function earliestIntersectingTrackTime(features, start, end) {
  let earliest = null;

  for (const feature of features) {
    const geomType = feature.geometry?.type;
    if (geomType !== "Polygon" && geomType !== "MultiPolygon") continue;

    const label = String(feature.properties?.polygonlabel ?? "");
    const at = parseTrackTimeLabel(label);
    if (at == null || !isWithinWindow(at, start, end)) continue;
    if (!intersectsPhilippines(feature)) continue;

    if (earliest == null || at < earliest) earliest = at;
  }

  return earliest;
}

function classifyFeature(feature) {
  const props = feature.properties ?? {};
  const label = String(props.polygonlabel ?? "").trim();
  const geomType = feature.geometry?.type;

  if (geomType === "LineString" && props.forecast === true) {
    const at = parseTrackTimeLabel(label);
    return { tier: "direct", category: "track-line", at: at ?? 0, feature };
  }

  if (geomType !== "Polygon" && geomType !== "MultiPolygon") return null;

  if (label === "Uncertainty Cones" || label.includes("Uncertainty")) {
    return { tier: "direct", category: "cone", at: 0, feature };
  }

  const windMatch = WIND_SPEED_LABEL_RE.exec(label);
  if (windMatch) {
    const windKmh = Number(windMatch[1]);
    if (!Number.isFinite(windKmh) || windKmh < 60) return null;
    const at =
      parseIsoTimestamp(props.polygondate) ??
      parseIsoTimestamp(props.todate) ??
      parseIsoTimestamp(props.fromdate);
    if (at == null) return null;
    return { tier: "indirect", category: "wind-zone", at, feature, windKmh };
  }

  const trackAt = parseTrackTimeLabel(label);
  if (trackAt != null) {
    return { tier: "direct", category: "track-time", at: trackAt, feature };
  }

  return null;
}

function classifyTyphoonFeatures(features) {
  const out = [];
  for (const feature of features) {
    const classified = classifyFeature(feature);
    if (classified) out.push(classified);
  }
  return out;
}

function isFeatureActiveInWindow(item, start, end, allFeatures) {
  if (item.category === "cone") {
    if (!intersectsPhilippines(item.feature)) return false;
    if (episodeRangeOverlapsWindow(item.feature, start, end)) return true;
    return earliestIntersectingTrackTime(allFeatures, start, end) != null;
  }

  if (item.category === "track-line") {
    if (!intersectsPhilippines(item.feature)) return false;
    return earliestIntersectingTrackTime(allFeatures, start, end) != null;
  }

  if (isWithinWindow(item.at, start, end)) return true;

  if (item.category === "wind-zone") {
    return episodeRangeOverlapsWindow(item.feature, start, end);
  }

  return false;
}

function resolveOverlapAt(item, start, end, allFeatures) {
  if (item.category === "cone" || item.category === "track-line") {
    return (
      earliestIntersectingTrackTime(allFeatures, start, end) ??
      (item.category === "cone"
        ? parseIsoTimestamp(item.feature.properties?.fromdate) ??
          parseIsoTimestamp(item.feature.properties?.todate)
        : null)
    );
  }

  return item.at;
}

export async function getActiveTropicalCyclones() {
  const data = await fetchActiveTropicalCyclones();
  const features = Array.isArray(data.features) ? data.features : [];

  return features
    .map((f) => {
      const p = f.properties ?? {};
      return {
        eventid: Number(p.eventid),
        episodeid: Number(p.episodeid),
        eventname: String(p.eventname ?? p.name ?? "Unknown"),
        name: String(p.name ?? p.eventname ?? "Unknown"),
        alertlevel: String(p.alertlevel ?? ""),
        severitydata: p.severitydata,
        url: p.url,
      };
    })
    .filter((c) => Number.isFinite(c.eventid) && Number.isFinite(c.episodeid));
}

function buildImpactDetail(cyclone, tier, overlapAt) {
  const severity = cyclone.severitydata ?? {};
  const maxWindRaw = severity.severity;
  const maxWindKmh =
    typeof maxWindRaw === "number" && Number.isFinite(maxWindRaw)
      ? Math.round(maxWindRaw)
      : undefined;

  return {
    tier,
    eventname: cyclone.eventname,
    alertlevel: cyclone.alertlevel,
    overlapAt: new Date(overlapAt).toISOString(),
    maxWindKmh,
    severityText:
      severity.severitytext != null && severity.severitytext !== ""
        ? String(severity.severitytext)
        : undefined,
    reportUrl:
      cyclone.url?.report != null && cyclone.url.report !== ""
        ? String(cyclone.url.report)
        : undefined,
    eventId: cyclone.eventid,
    episodeId: cyclone.episodeid,
  };
}

async function fetchTyphoonGeometryRaw(eventid, episodeid) {
  const data = await fetchTyphoonGeometry(eventid, episodeid);
  return Array.isArray(data.features) ? data.features : [];
}

/** @returns {Promise<{ status: string, impact?: object, impacts?: object[] }>} */
export async function checkPhilippinesImpactWithin7Days(cyclones) {
  if (cyclones.length === 0) return { status: "no-impact" };

  const { start, end } = manilaTodayRange();
  const impacts = [];

  for (const cyclone of cyclones) {
    const features = await fetchTyphoonGeometryRaw(cyclone.eventid, cyclone.episodeid);
    const classified = classifyTyphoonFeatures(features);

    let bestDirect = null;
    for (const item of classified) {
      if (item.tier !== "direct") continue;
      if (!isFeatureActiveInWindow(item, start, end, features)) continue;

      const overlapAt = resolveOverlapAt(item, start, end, features);
      if (overlapAt == null || !isWithinWindow(overlapAt, start, end)) continue;

      if (item.category !== "cone" && !intersectsPhilippines(item.feature)) continue;
      if (item.category === "cone" && !intersectsPhilippines(item.feature)) continue;

      if (!bestDirect || overlapAt < bestDirect.overlapAt) {
        bestDirect = { overlapAt };
      }
    }

    let bestIndirect = null;
    if (!bestDirect) {
      for (const item of classified) {
        if (item.tier !== "indirect") continue;
        if (!isFeatureActiveInWindow(item, start, end, features)) continue;
        if (!intersectsPhilippines(item.feature)) continue;

        const overlapAt = resolveOverlapAt(item, start, end, features);
        if (overlapAt == null) continue;

        if (!bestIndirect || overlapAt < bestIndirect.overlapAt) {
          bestIndirect = { overlapAt };
        }
      }
    }

    const hit = bestDirect ?? bestIndirect;
    if (!hit) continue;

    impacts.push(
      buildImpactDetail(cyclone, bestDirect ? "direct" : "indirect", hit.overlapAt),
    );
  }

  if (impacts.length === 0) return { status: "no-impact" };

  impacts.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "direct" ? -1 : 1;
    return Date.parse(a.overlapAt) - Date.parse(b.overlapAt);
  });

  const status = impacts.some((item) => item.tier === "direct") ? "direct" : "indirect";

  return {
    status,
    impacts,
    impact: impacts[0],
  };
}

/** @returns {Promise<{ status: string, impact?: object, lastChecked: string }>} */
export async function runPhilippinesTyphoonCheck() {
  const cyclones = await getActiveTropicalCyclones();
  const result = await checkPhilippinesImpactWithin7Days(cyclones);
  const payload = {
    ...result,
    lastChecked: new Date().toISOString(),
  };

  if (payload.status === "direct" && payload.impacts?.length) {
    try {
      const postUrl = await findTyphoonBlogPostUrl(payload.impacts);
      if (postUrl) {
        payload.impacts[0] = { ...payload.impacts[0], postUrl };
        if (payload.impact) {
          payload.impact = payload.impacts[0];
        }
      }
    } catch {
      // RSS 실패 시 postUrl 없이 진행
    }
  }

  return payload;
}
