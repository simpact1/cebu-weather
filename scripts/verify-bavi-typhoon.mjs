import booleanIntersects from "@turf/boolean-intersects";
import { polygon } from "@turf/helpers";
import {
  fetchActiveTropicalCyclones,
  fetchTyphoonGeometry,
} from "../lib/gdacsFetch.js";

const PH_BBOX = { minLng: 116, maxLng: 128, minLat: 4, maxLat: 20 };
const TRACK_TIME_LABEL_RE = /^(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?:\s+UTC)?$/;
const WIND_SPEED_LABEL_RE = /^(\d+)\s*km\/h$/i;
const PH = polygon([
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
  return { start, end, todayStr };
}

function parseTrackTimeLabel(label) {
  const match = TRACK_TIME_LABEL_RE.exec(label.trim());
  if (!match) return null;
  const [, day, month, hour, minute] = match;
  const year = new Date().getUTCFullYear();
  return Date.UTC(year, Number(month) - 1, Number(day), Number(hour), Number(minute));
}

function parseIsoTimestamp(value) {
  if (value == null || value === "") return null;
  const ts = Date.parse(String(value));
  return Number.isNaN(ts) ? null : ts;
}

function intersectsPhilippines(feature) {
  return booleanIntersects(feature, PH);
}

function earliestIntersectingTrackTime(features, start, end) {
  let earliest = null;
  for (const feature of features) {
    const geomType = feature.geometry?.type;
    if (geomType !== "Polygon" && geomType !== "MultiPolygon") continue;
    const label = String(feature.properties?.polygonlabel ?? "");
    const at = parseTrackTimeLabel(label);
    if (at == null || at < start || at > end) continue;
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

function episodeRangeOverlapsWindow(feature, start, end) {
  const p = feature.properties ?? {};
  const from = parseIsoTimestamp(p.fromdate);
  const to = parseIsoTimestamp(p.todate);
  if (from == null || to == null) return false;
  return from <= end && to >= start;
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
  if (item.at >= start && item.at <= end) return true;
  if (item.category === "wind-zone") return episodeRangeOverlapsWindow(item.feature, start, end);
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

async function checkBavi() {
  const list = await fetchActiveTropicalCyclones();
  const baviFeature = list.features.find((f) =>
    String(f.properties?.eventname ?? "").includes("BAVI"),
  );
  if (!baviFeature) {
    console.log("BAVI not in active list:", list.features.map((f) => f.properties?.eventname));
    return;
  }

  const cyclone = {
    eventid: Number(baviFeature.properties.eventid),
    episodeid: Number(baviFeature.properties.episodeid),
    eventname: String(baviFeature.properties.eventname),
    alertlevel: String(baviFeature.properties.alertlevel ?? ""),
  };

  const { start, end, todayStr } = manilaTodayRange();
  console.log("Manila today:", todayStr);
  console.log("7-day window:", new Date(start).toISOString(), "~", new Date(end).toISOString());

  const geo = await fetchTyphoonGeometry(cyclone.eventid, cyclone.episodeid);
  const features = geo.features;
  const classified = features.map(classifyFeature).filter(Boolean);

  let earliestDirect = null;
  const directHits = [];

  for (const item of classified) {
    if (item.tier !== "direct") continue;
    if (!isFeatureActiveInWindow(item, start, end, features)) continue;
    const overlapAt = resolveOverlapAt(item, start, end, features);
    if (overlapAt == null || overlapAt < start || overlapAt > end) continue;
    if (!intersectsPhilippines(item.feature)) continue;

    directHits.push({
      category: item.category,
      label: item.feature.properties?.polygonlabel,
      overlapAt: new Date(overlapAt).toISOString(),
    });

    if (!earliestDirect || overlapAt < earliestDirect.overlapAt) {
      earliestDirect = { cyclone, overlapAt };
    }
  }

  console.log("\n=== BAVI-26 판정 결과 ===");
  console.log("status:", earliestDirect ? "direct" : "no-impact");
  if (earliestDirect) {
    console.log("eventname:", cyclone.eventname);
    console.log("alertlevel:", cyclone.alertlevel);
    console.log("overlapAt (ISO):", new Date(earliestDirect.overlapAt).toISOString());
    console.log(
      "overlapAt (Manila):",
      new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Manila",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(earliestDirect.overlapAt)),
    );
  }
  console.log("\nDirect hits detail:");
  console.log(JSON.stringify(directHits, null, 2));
}

await checkBavi();
