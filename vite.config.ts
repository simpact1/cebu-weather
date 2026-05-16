import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** 세부가볼만한곳(Vite 기본 5173)과 겹치지 않게 별도 포트 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 8787,
    strictPort: false,
    /** 반드시 IPv4 로 고정 — localhost 가 ::1 로만 붙으면 연결 실패하는 경우 방지 */
    host: "127.0.0.1",
    open: false,
  },
  preview: {
    port: 8788,
    strictPort: false,
    host: "127.0.0.1",
  },
});
