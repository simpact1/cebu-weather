import type { Connect } from "vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fetchPhilippineGdacsEvents } from "./lib/gdacsFetch.js";

function gdacsApiMiddleware(
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
  next: Connect.NextFunction,
) {
  const path = req.url?.split("?")[0];
  if (path !== "/api/gdacs") {
    next();
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Method not allowed" }));
    return;
  }
  void fetchPhilippineGdacsEvents()
    .then((data) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    })
    .catch(() => {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "GDACS fetch failed" }));
    });
}

/** 세부가볼만한곳(Vite 기본 5173)과 겹치지 않게 별도 포트 */
export default defineConfig({
  plugins: [
    {
      name: "gdacs-api-dev",
      enforce: "pre",
      configureServer(server) {
        server.middlewares.stack.unshift({ route: "", handle: gdacsApiMiddleware });
      },
    },
    react(),
  ],
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
