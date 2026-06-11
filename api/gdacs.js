import { fetchPhilippineGdacsEvents } from "../lib/gdacsFetch.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = await fetchPhilippineGdacsEvents();
    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=3600");
    return res.status(200).json(data);
  } catch {
    return res.status(500).json({ error: "GDACS fetch failed" });
  }
}
