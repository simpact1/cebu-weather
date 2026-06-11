const GDACS_SEARCH_URL =
  "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";

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
