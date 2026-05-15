import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** 세부가볼만한곳(Vite 기본 5173)과 겹치지 않게 별도 포트 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8787,
    strictPort: false,
    allowedHosts: [".serveousercontent.com", ".loca.lt"],
  },
  preview: {
    port: 8788,
    strictPort: false,
    allowedHosts: [".serveousercontent.com", ".loca.lt"],
  },
});
