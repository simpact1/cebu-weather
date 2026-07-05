import {
  fetchActiveTropicalCyclones,
  fetchPhilippineGdacsEvents,
  fetchTyphoonGeometry,
} from "../lib/gdacsFetch.js";

function cacheAndJson(res, data) {
  res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
  return res.status(200).json(data);
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { eventtype, eventid, episodeid } = req.query ?? {};

  try {
    if (eventtype === "TC" && eventid != null && episodeid != null) {
      const data = await fetchTyphoonGeometry(eventid, episodeid);
      return cacheAndJson(res, data);
    }

    if (eventtype === "TC") {
      const data = await fetchActiveTropicalCyclones();
      return cacheAndJson(res, data);
    }

    const data = await fetchPhilippineGdacsEvents();
    return cacheAndJson(res, data);
  } catch {
    return res.status(500).json({ error: "GDACS fetch failed" });
  }
}
