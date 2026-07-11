const STALE_AFTER_MS = 40 * 60 * 1000;

export type TyphoonStatus = "loading" | "direct" | "indirect" | "no-impact" | "error";

export type TyphoonImpactDetail = {
  tier?: "direct" | "indirect";
  eventname: string;
  alertlevel: string;
  overlapAt: string;
  maxWindKmh?: number;
  severityText?: string;
  reportUrl?: string;
  postUrl?: string;
  eventId?: number;
  episodeId?: number;
};

export type TyphoonResult = {
  status: "direct" | "indirect" | "no-impact" | "error";
  impact?: TyphoonImpactDetail;
  impacts?: TyphoonImpactDetail[];
  stale?: boolean;
  lastChecked?: string | null;
};

type TyphoonApiResponse = {
  status: TyphoonResult["status"];
  impact?: TyphoonImpactDetail;
  impacts?: TyphoonImpactDetail[];
  lastChecked?: string | null;
};

export async function getPhilippinesTyphoonStatus(): Promise<TyphoonResult> {
  const res = await fetch("/api/typhoon");
  if (!res.ok) throw new Error(`Typhoon API (${res.status})`);

  const data = (await res.json()) as TyphoonApiResponse;
  const impacts = data.impacts ?? (data.impact ? [data.impact] : undefined);
  const result: TyphoonResult = {
    status: data.status,
    impact: data.impact ?? impacts?.[0],
    impacts,
    lastChecked: data.lastChecked ?? null,
  };

  if (data.lastChecked) {
    const age = Date.now() - Date.parse(data.lastChecked);
    if (!Number.isNaN(age) && age > STALE_AFTER_MS) {
      result.stale = true;
    }
  }

  return result;
}

export function formatTyphoonOverlapDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}
