/**
 * 배포 도메인(OG·canonical·sitemap과 맞출 때 사용).
 * .env 에 VITE_SITE_URL=https://실제도메인 형태로 넣으면 우선 적용됩니다.
 */
export const SITE_URL = (
  typeof import.meta.env.VITE_SITE_URL === "string" ? import.meta.env.VITE_SITE_URL : ""
)
  .trim()
  .replace(/\/$/, "");

export const SITE_URL_OR_PLACEHOLDER =
  SITE_URL || "https://weather.cebuplanner.com";
