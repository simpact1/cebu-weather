import type { Connect } from "vite";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import {
  fetchActiveTropicalCyclones,
  fetchPhilippineGdacsEvents,
  fetchTyphoonGeometry,
} from "./lib/gdacsFetch.js";
import { getDevTyphoonStatus, setDevTyphoonStatus } from "./lib/typhoonDevStore.js";
import { runPhilippinesTyphoonCheck } from "./lib/typhoonCheck.js";

function jsonResponse(
  res: Connect.ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  for (const [key, value] of Object.entries(headers ?? {})) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(body));
}

function typhoonApiMiddleware(refreshSecret: string | undefined) {
  return (
    req: Connect.IncomingMessage,
    res: Connect.ServerResponse,
    next: Connect.NextFunction,
  ) => {
    const path = req.url?.split("?")[0];
    if (path !== "/api/typhoon" && path !== "/api/typhoon-refresh") {
      next();
      return;
    }

    if (path === "/api/typhoon") {
      if (req.method !== "GET" && req.method !== "HEAD") {
        jsonResponse(res, 405, { error: "Method not allowed" });
        return;
      }
      const data = getDevTyphoonStatus();
      if (!data) {
        jsonResponse(
          res,
          200,
          { status: "error", lastChecked: null },
          { "Cache-Control": "s-maxage=60, stale-while-revalidate=300" },
        );
        return;
      }
      jsonResponse(res, 200, data, {
        "Cache-Control": "s-maxage=60, stale-while-revalidate=300",
      });
      return;
    }

    if (req.method !== "POST") {
      jsonResponse(res, 405, { error: "Method not allowed" });
      return;
    }

    const auth = req.headers.authorization ?? req.headers.Authorization;
    if (!refreshSecret || auth !== `Bearer ${refreshSecret}`) {
      jsonResponse(res, 401, { error: "Unauthorized" });
      return;
    }

    void runPhilippinesTyphoonCheck()
      .then((payload) => {
        setDevTyphoonStatus(payload);
        jsonResponse(res, 200, payload);
      })
      .catch((err) => {
        console.error("typhoon-refresh failed:", err);
        jsonResponse(res, 500, { error: "Typhoon refresh failed" });
      });
  };
}

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
  const params = new URLSearchParams(req.url?.split("?")[1] ?? "");
  const eventtype = params.get("eventtype");
  const eventid = params.get("eventid");
  const episodeid = params.get("episodeid");

  const run =
    eventtype === "TC" && eventid != null && episodeid != null
      ? fetchTyphoonGeometry(eventid, episodeid)
      : eventtype === "TC"
        ? fetchActiveTropicalCyclones()
        : fetchPhilippineGdacsEvents();

  void run
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
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [
      {
        name: "gdacs-api-dev",
        enforce: "pre",
        configureServer(server) {
          server.middlewares.stack.unshift({
            route: "",
            handle: typhoonApiMiddleware(env.REFRESH_SECRET),
          });
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
  };
});
