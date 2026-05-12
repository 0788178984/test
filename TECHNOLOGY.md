# Technology overview — Uganda Supermarket Management System

This document describes the technologies, libraries, and patterns used across the project. It is intended for developers, technical stakeholders, and anyone preparing to host or extend the system.

---

## 1. High-level architecture

The product is a **multi-tenant supermarket management** stack: one **Node.js** backend exposes a **REST JSON API**, a **React** single-page application (SPA) talks to that API, and optional scripts support seeding and validation. In **production**, the same Node process can serve the built SPA from `client/dist` while handling `/api/*` routes.

Conceptually:

- **Client (`client/`)** — Browser UI: POS, inventory, users, developer console, notifications, etc.
- **Server (`server/`)** — Business logic, authentication, SQLite persistence, scheduled jobs, file generation (PDF/Excel), and integrations (SMS, printing, etc.).
- **Data** — SQLite database file under `data/` at the repository root (created and migrated on server startup).

The root `package.json` defines **npm workspaces** and scripts that coordinate `server`, `client`, and (where present) `desktop` / `cloud` packages.

---

## 2. Core runtime and languages

| Technology | Role |
|------------|------|
| **Node.js** (≥ 18) | JavaScript runtime for the API server and tooling. |
| **JavaScript (ES modules on client)** | Client uses `"type": "module"` and Vite; server uses CommonJS `require` typical of Express apps. |
| **JSX** | React components in the client. |

There is no TypeScript application code in the main server/client paths described here; the stack is primarily **JavaScript + JSX**.

---

## 3. Monorepo and package management

| Technology | Role |
|------------|------|
| **npm** | Package manager and script runner. |
| **npm workspaces** | Root `package.json` lists `server`, `client`, `desktop`, `cloud` as workspaces (actual folders may vary by checkout). |
| **concurrently** (root devDependency) | Runs API and Vite dev servers together (`npm run dev`). |

---

## 4. Backend (`server/`)

### 4.1 Web framework and HTTP

| Technology | Role |
|------------|------|
| **Express 5** (`express`) | HTTP server, routing, JSON body parsing, middleware pipeline. |
| **CORS** (`cors`) | Cross-origin configuration; production can restrict origins via `ALLOWED_ORIGINS`. |
| **Helmet** (`helmet`) | Security-related HTTP headers (e.g. resource policies tuned for APIs and SSE). |
| **express-rate-limit** | Global and stricter limits on authentication routes to reduce abuse. |

### 4.2 Configuration and process

| Technology | Role |
|------------|------|
| **dotenv** | Loads environment variables from `.env` (typically when the process cwd is `server/`). |

### 4.3 Authentication and authorization

| Technology | Role |
|------------|------|
| **jsonwebtoken** | Issues and verifies **JWT** bearer tokens after PIN or web login. |
| **bcryptjs** | Password and PIN hashing and comparison (no native bcrypt compile requirement). |

Access control is implemented in application middleware (e.g. authenticate, role checks, tenant scoping by `business_id`).

### 4.4 Data layer

| Technology | Role |
|------------|------|
| **better-sqlite3** | **SQLite** access from Node; synchronous API, high performance for embedded DB; **native addon** (must match OS/arch at install time). |
| **SQL migrations** | `001_init.sql` plus programmatic migrations in `multiTenantMigrate.js` (businesses, tenant columns, indexes, data repairs). |

### 4.5 Scheduling and background work

| Technology | Role |
|------------|------|
| **node-cron** | Scheduled tasks (e.g. daily licence/subscription reminder jobs). |

### 4.6 File uploads, documents, and exports

| Technology | Role |
|------------|------|
| **multer** | Multipart form handling for file uploads. |
| **pdfkit** | PDF generation (e.g. receipts or reports). |
| **exceljs** | Spreadsheet generation and manipulation. |

### 4.7 Integrations and utilities

| Technology | Role |
|------------|------|
| **africastalking** | SMS / messaging integration (Africa’s Talking). |
| **node-fetch** | HTTP client from Node (fetch-style API for outbound calls). |
| **uuid** | Generation of unique string identifiers (e.g. business and user ids). |
| **node-escpos** | ESC/POS–oriented printing helpers for thermal receipt printers. |

### 4.8 Development experience (server)

| Technology | Role |
|------------|------|
| **nodemon** | Restarts the Node server on file changes during development. |

### 4.9 Logging

Custom **logger** module (e.g. `server/src/logger.js`) supports leveled logging controlled by environment (such as `LOG_LEVEL`), used alongside `console` in some routes.

---

## 5. Frontend (`client/`)

### 5.1 UI framework and routing

| Technology | Role |
|------------|------|
| **React 18** | Component model, concurrent features available in the React 18 line. |
| **react-dom** | DOM rendering and `createRoot`. |
| **React Router v6** (`react-router-dom`) | Client-side routing, nested routes, protected routes, role-based route segments. |

### 5.2 State and data fetching

| Technology | Role |
|------------|------|
| **Zustand** | Lightweight global state (e.g. auth store with `persist` middleware to `localStorage`). |
| **Axios** | HTTP client for REST calls; interceptors attach JWT and handle session expiry (e.g. 401 → redirect to login). |
| **TanStack React Query v5** (`@tanstack/react-query`) | Declared dependency for server-state caching patterns (usage may vary by page). |

### 5.3 Styling and design

| Technology | Role |
|------------|------|
| **Tailwind CSS** | Utility-first CSS; layout, spacing, typography, and theme colours. |
| **PostCSS** + **Autoprefixer** | CSS processing pipeline for Tailwind. |
| **lucide-react** | Icon set used across navigation and actions. |

### 5.4 Charts, feedback, and UX helpers

| Technology | Role |
|------------|------|
| **Recharts** | Charting library built on React and SVG (dashboards / reports). |
| **react-hot-toast** | Non-blocking toast notifications for success and error messages. |
| **date-fns** | Date parsing, formatting, and manipulation in the UI. |

### 5.5 Hardware / browser capabilities

| Technology | Role |
|------------|------|
| **Quagga** | Barcode scanning from camera/video stream (POS / product workflows). |

### 5.6 Real-time updates

| Technology | Role |
|------------|------|
| **Server-Sent Events (EventSource)** | Browser API used for notification streams; server pushes events over an HTTP long-lived connection (token may be passed in query string for SSE compatibility). |

### 5.7 Progressive Web App (PWA)

| Technology | Role |
|------------|------|
| **Vite PWA plugin** (`vite-plugin-pwa`) | Web app manifest, service worker, and Workbox-based caching strategies; supports installable behaviour and offline-oriented caching for static assets (with dev-time behaviour tuned to avoid breaking API calls). |

### 5.8 Build tooling and quality (client)

| Technology | Role |
|------------|------|
| **Vite 5** | Dev server (HMR), production bundler (Rollup under the hood), fast ESM-based development. |
| **@vitejs/plugin-react** | React Fast Refresh and JSX transform. |
| **ESLint** + React plugins | Static analysis for React and hooks rules. |

**Vite build options** include manual chunks (vendor, router, charts, utils), source maps, and path alias `@` → `client/src`.

---

## 6. Security model (summary)

Not a separate “product,” but implemented with the libraries above:

- **JWT** session tokens after successful login (PIN or email/password).
- **Helmet** for HTTP security headers.
- **Rate limiting** on sensitive routes.
- **Multi-tenant data** scoped by **business** (`business_id` / store codes).
- **Role-based access** (developer, admin, manager, cashier) enforced in middleware and route handlers.
- **Subscription / licence** checks for tenant businesses on protected API paths.

---

## 7. Production serving model

When **`NODE_ENV=production`**:

- Express serves static files from **`client/dist`**.
- A catch-all route returns **`index.html`** for client-side routing (SPA fallback).
- **Strong `JWT_SECRET`** is enforced at startup (the app exits if misconfigured).

The client’s API base URL is chosen at **build time** via **`VITE_API_URL`** (see `client/src/api/client.js` and notification stream URL construction).

---

## 8. Optional / workspace packages (root scripts)

The root `package.json` references additional workspaces and scripts:

| Area | Typical role |
|------|----------------|
| **`desktop/`** | Often an **Electron**-style shell for offline/desktop distribution (scripts such as `desktop:dev` / `desktop:build` when the package exists). |
| **`cloud/`** | Optional cloud or sync-related Node package referenced by workspace install scripts. |

Availability depends on what is checked into your copy of the repository.

---

## 9. Scripts and automation (repository root)

| Script | Purpose |
|--------|---------|
| `npm run dev` | Runs API + Vite together. |
| `npm run client:build` | Production build of the SPA. |
| `npm start` | Runs the production Node server (`server` package). |
| `npm run setup` | Installs dependencies and runs DB seed (demo data). |
| `validate:auth` / `validate:auth:http` | Helper scripts to validate auth configuration or HTTP behaviour. |

---

## 10. Environment and operations-related concepts

These are not npm packages but are central to how the technologies above behave in production:

- **`JWT_SECRET`** — Secret key for signing tokens.
- **`ALLOWED_ORIGINS`** — CORS allowlist for browser clients.
- **`TRUST_PROXY`** — Correct client IP and secure cookies when behind reverse proxies.
- **`PORT`** — Listen port for Express.
- **`LOG_LEVEL`** — Verbosity of server logging.
- **SQLite file location** — Under `data/` at repo root; backup and migration strategy should treat this as the source of truth.

---

## 11. How the pieces fit together (data flow)

1. The **browser** loads the **React** app (from Vite in dev, or from Express static in prod).
2. The app uses **Axios** to call **`/api/...`** on the Node server, attaching **JWT** when present.
3. **Express** runs **middleware** (security, rate limits, auth, tenant checks), then **route handlers** query or update **SQLite** via **better-sqlite3**.
4. **Cron** jobs may create notifications or run licence reminders; the UI may receive updates via **SSE**.
5. Optional features use **PDF/Excel** libraries, **multer** for uploads, **Africa’s Talking** for SMS, and **ESC/POS** tooling for printers.

---

## 12. Summary table (quick reference)

| Layer | Main technologies |
|-------|-------------------|
| **Runtime** | Node.js 18+ |
| **API** | Express 5, CORS, Helmet, express-rate-limit, JWT, bcryptjs |
| **Database** | SQLite via better-sqlite3, SQL + JS migrations |
| **SPA** | React 18, React Router 6, Vite 5, Tailwind CSS |
| **State / HTTP** | Zustand, Axios, (React Query available) |
| **UX** | Recharts, react-hot-toast, date-fns, lucide-react, Quagga |
| **PWA** | vite-plugin-pwa / Workbox |
| **Ops** | dotenv, node-cron, custom logging |

---

*This document reflects the dependencies and layout of the repository at the time of writing. For exact versions, see each package’s `package.json` and lockfile.*
