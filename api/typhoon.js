import { loadTyphoonStatus } from "../lib/typhoonStore.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

  const data = await loadTyphoonStatus();
  if (!data) {
    return res.status(200).json({ status: "error", lastChecked: null });
  }

  return res.status(200).json(data);
}
