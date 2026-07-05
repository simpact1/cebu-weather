const GDACS_SEARCH_URL =
  "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const GDACS_GEOMETRY_URL =
  "https://www.gdacs.org/gdacsapi/api/polygons/getgeometry";

const TC_FETCH_TIMEOUT_MS = 15_000;
const TC_MAX_RETRIES = 2;
const TC_BACKOFF_MS = [2000, 4000];

async function fetchGdacsWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt <= TC_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TC_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`GDACS API (${response.status})`);
      return await response.json();
    } catch (err) {
      lastError = err;
      if (attempt < TC_MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, TC_BACKOFF_MS[attempt]));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function formatDateOnly(date) {
  return date.toISOString().split("T")[0];
}

function isPhilippinesCountry(country) {
  if (!country) return false;
  const c = country.toLowerCase();
  return c.includes("philippine") || c.includes("filipin");
}

function isPhilippinesCoords(coords) {
  if (!coords || coords.length < 2) return false;
  const [lng, lat] = coords;
  return lat >= 4.5 && lat <= 21.5 && lng >= 116 && lng <= 127;
}

/** @returns {Promise<{ features: object[] }>} */
export async function fetchPhilippineGdacsEvents() {
  const toDate = formatDateOnly(new Date());
  const fromDate = formatDateOnly(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  const url =
    `${GDACS_SEARCH_URL}?eventlist=EQ;VO` +
    `&fromdate=${fromDate}&todate=${toDate}&alertlevel=red;orange;green`;

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) throw new Error(`GDACS API (${response.status})`);

  const data = await response.json();
  const events = (data.features ?? [])
    .filter(
      (f) =>
        isPhilippinesCountry(f.properties?.country) &&
        isPhilippinesCoords(f.geometry?.coordinates),
    )
    .sort(
      (a, b) =>
        Date.parse(b.properties?.fromdate ?? "") -
        Date.parse(a.properties?.fromdate ?? ""),
    )
    .slice(0, 5)
    .map((f) => ({
      ...f,
      _parsed: { place: "필리핀", direction: null },
    }));

  return { features: events };
}

/** @returns {Promise<{ features: object[] }>} */
export async function fetchActiveTropicalCyclones() {
  const url = `${GDACS_SEARCH_URL}?eventtype=TC`;
  const data = await fetchGdacsWithRetry(url);
  const events = (data.features ?? []).filter((f) => {
    const p = f.properties ?? {};
    return p.eventtype === "TC" && p.iscurrent === "true";
  });

  return { features: events };
}

/** @returns {Promise<{ features: object[] }>} */
export async function fetchTyphoonGeometry(eventid, episodeid) {
  const url =
    `${GDACS_GEOMETRY_URL}?eventtype=TC` +
    `&eventid=${encodeURIComponent(String(eventid))}` +
    `&episodeid=${encodeURIComponent(String(episodeid))}`;

  const data = await fetchGdacsWithRetry(url);
  return { features: data.features ?? [] };
}
