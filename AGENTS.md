# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

Cebu Weather Travel Tips — a client-side-only React SPA (TypeScript + Vite) showing real-time weather and travel tips for Cebu/Bohol, Philippines. No backend, no database, no Docker.

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Vite dev server | `npm run dev` | 8787 | Only service to run locally. Hot-reloads on file changes. |

### Node version

The project declares Node 20 in `.nvmrc`. Use `source ~/.nvm/nvm.sh && nvm use 20` before running commands. CI uses Node 22; both work.

### Key commands

- **Type-check:** `npx tsc -b`
- **Build:** `npm run build` (runs tsc then vite build)
- **Dev server:** `npm run dev` (Vite on port 8787)
- **Preview prod build:** `npm run preview` (port 8788)

### Notes

- No linter (ESLint) is configured — `tsc -b` is the primary static analysis check.
- No automated test framework is configured.
- All weather data is fetched client-side from public Open-Meteo APIs (no API keys required).
- The PAGASA typhoon API (`sdnpdrrmo.inno.ph`) is external and may occasionally be unreachable; the app handles this gracefully.
