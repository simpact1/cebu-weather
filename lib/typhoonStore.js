import { get, put } from "@vercel/blob";

export const TYPHOON_BLOB_PATH = "typhoon/status.json";

/** @param {object} payload */
export async function saveTyphoonStatus(payload) {
  await put(TYPHOON_BLOB_PATH, JSON.stringify(payload), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

/** @returns {Promise<object | null>} */
export async function loadTyphoonStatus() {
  try {
    const result = await get(TYPHOON_BLOB_PATH, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;

    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}
