export type GdacsEventProperties = {
  eventtype: string;
  alertlevel: string;
  country?: string;
  name?: string;
  eventname?: string;
  eventid: number;
  fromdate: string;
  severitydata?: {
    severity?: number;
    mag?: number;
    severitytext?: string;
  };
};

export type GdacsFeature = {
  type: string;
  properties: GdacsEventProperties;
  geometry?: {
    coordinates?: [number, number];
  };
  _parsed?: GdacsLocationInfo;
};

export type GdacsResponse = {
  features?: GdacsFeature[];
  error?: string;
};

export type GdacsLocationInfo = {
  place: string;
  direction: string | null;
};

export async function fetchGdacsPhilippineEvents(): Promise<GdacsFeature[]> {
  const res = await fetch("/api/gdacs");
  if (!res.ok) throw new Error(`GDACS proxy (${res.status})`);
  const data = (await res.json()) as GdacsResponse;
  if (data.error) throw new Error(data.error);
  return data.features ?? [];
}

export function gdacsEventTypeLabel(eventtype: string): string {
  return eventtype === "EQ" ? "지진" : eventtype === "VO" ? "화산" : eventtype;
}

export function gdacsEventTypeIcon(eventtype: string): string {
  return eventtype === "EQ" ? "🔴" : eventtype === "VO" ? "🌋" : "⚠️";
}

export function gdacsAlertColor(alertlevel: string): string {
  const level = alertlevel.toLowerCase();
  if (level === "red") return "#FF3B30";
  if (level === "orange") return "#FF9500";
  return "#34C759";
}

export function gdacsEarthquakeMagnitude(p: GdacsEventProperties): number | null {
  const raw = p.severitydata?.mag ?? p.severitydata?.severity;
  if (typeof raw !== "number" || Number.isNaN(raw)) return null;
  return raw;
}

export function formatGdacsEventDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Manila" });
}
