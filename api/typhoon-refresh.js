import { runPhilippinesTyphoonCheck } from "../lib/typhoonCheck.js";
import { saveTyphoonStatus } from "../lib/typhoonStore.js";

function isAuthorized(req) {
  const secret = process.env.REFRESH_SECRET;
  const auth = req.headers.authorization ?? req.headers.Authorization;
  console.log("[typhoon-refresh debug]", {
    hasSecret: !!secret,
    secretLength: secret?.length,
    authHeaderLength: auth?.length,
    authHeaderPrefix: auth?.slice(0, 10),
  });
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = await runPhilippinesTyphoonCheck();
    await saveTyphoonStatus(payload);
    return res.status(200).json(payload);
  } catch (err) {
    console.error("typhoon-refresh failed:", err);
    return res.status(500).json({ error: "Typhoon refresh failed" });
  }
}
