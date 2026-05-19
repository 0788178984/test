# Uganda Supermarket — Testing, Requirements, and Hosting

This document matches the **current repository** (not every line of the aspirational root `README.md`). Use it for laptop testing, LAN testing, and deployment.

---

## 1. Ports and base URLs

| Service | Default port | Purpose |
|--------|---------------|--------|
| **API (Express)** | `4000` | REST API, SQLite DB, production static UI when `NODE_ENV=production` |
| **Web UI (Vite dev)** | `5173` (or next free port, e.g. `5174`) | React app in development |

**Laptop (same machine):**

- UI: `http://localhost:5173` (or the port Vite prints in the terminal)
- API health: `http://localhost:4000/health`
- API base: `http://localhost:4000`

**Other devices on your Wi‑Fi/LAN** (replace `YOUR_LAN_IP` with the PC’s IPv4, e.g. `192.168.18.145`):

- UI: `http://YOUR_LAN_IP:5173`
- API: `http://YOUR_LAN_IP:4000/health`

**Important for LAN / phones:** The browser loads JavaScript that calls the API. By default the client uses `VITE_API_URL` or **`http://localhost:4000`**. On a **phone**, `localhost` is the phone itself, not your PC.

- For **dev** on the network: create `client/.env` (or `client/.env.local`) with:
  ```env
  VITE_API_URL=http://YOUR_LAN_IP:4000
  ```
  Then restart `npm run client:dev` (or full `npm run dev`).

- For **production** build: set `VITE_API_URL` to the **public** API URL (e.g. `https://api.yourdomain.com`) **before** `npm run client:build`.

**Vite** is configured with `server.host: true`, so the dev server listens on all interfaces when you use `--host` (Vite does this when `host: true`).

---

## 2. Functional requirements (from product scope + code)

Legend: **Yes** = implemented in this repo and wired to API/UI; **Partial** = needs keys/env or external service; **Manual** = verify by hand in browser.

| ID | Requirement | Status | How to verify |
|----|--------------|--------|----------------|
| FR-01 | PIN login (admin/manager/cashier) | Yes | `POST /api/auth/login`, Login → PIN tab |
| FR-02 | Web login (email/password) | Yes | `POST /api/auth/login-web`, Login → Web tab |
| FR-03 | JWT session | Yes | After login, API calls include `Authorization` |
| FR-04 | Role-based routes (admin/manager/cashier) | Yes | `App.jsx`, `RoleRoute`, server `roleCheck` |
| FR-05 | Dashboard + today summary | Yes | `/dashboard`, `GET /api/sales/today-summary` |
| FR-06 | POS cart, barcode field, checkout | Yes | `/pos` — complete a cash sale |
| FR-07 | Sales list / void (permissions) | Partial | Void: manager/admin; test `GET /api/sales` |
| FR-08 | Products CRUD | Yes | `/products` (admin/manager) |
| FR-09 | Customers CRUD | Yes | `/customers`; delete admin-only on API |
| FR-10 | Suppliers CRUD | Yes | `/suppliers` (admin/manager) |
| FR-11 | Inventory low stock / expiring / adjustments | Yes | `/inventory`; API under `/api/inventory` |
| FR-12 | Reports (daily/monthly/profit/etc.) | Yes | `/reports`; `/api/reports/*` |
| FR-13 | Users CRUD (admin) | Yes | `/users` |
| FR-14 | Settings (admin) | Yes | `/settings` |
| FR-15 | Notifications (in-app / SSE) | Partial | Depends on notification usage |
| FR-16 | Sync push/pull/status | Partial | Needs `CLOUD_API_URL` + cloud stack |
| FR-17 | MTN MoMo / Airtel payment | Partial | Sandbox URLs in settings; real keys in `.env` |
| FR-18 | SMS / WhatsApp receipts | Partial | Africa’s Talking / WhatsApp tokens in `.env` |
| FR-19 | PDF/Excel export | Partial | Services exist; confirm from Reports UI |
| FR-20 | PWA / offline shell | Partial | SW active in **production** build; disabled in Vite dev |

**Automated smoke (optional):**

```bash
# From repo root — DB PIN check (no server)
npm run validate:auth

# With API already running on port 4000
npm run validate:auth:http
```

---

## 3. Non-functional requirements

| NFR | Intent | In this codebase |
|-----|--------|-------------------|
| Security | JWT, bcrypt PIN/password | Yes — set strong `JWT_SECRET` in production |
| CORS | Browser → API | `cors()` enabled; restrict origins in production if needed |
| SQLite local DB | Offline-first store | Yes — `server` + `data/supermarket.db` |
| Performance / scale | High load | Not load-tested; suitable for single-store SQLite |
| Accessibility | WCAG | Best-effort only; not formally audited |
| Multi-tenant cloud | PostgreSQL sync | `cloud/` workspace exists; full deploy separate |

---

## 4. Quick start (development)

```bash
cd uganda-supermarket

# Install everything + seed demo data (SQLite + sample users/products)
npm run setup

# Terminal 1 — or use a single terminal:
npm run dev
```

- Open the **Vite URL** printed in the console (often `http://localhost:5173`).
- Seeded **PIN** logins: Admin `1234`, Manager `5678`, Cashier `9012`.
- Seeded **web** password (all seeded users): `SuperMkt2024!` (emails like `admin@supermarket.ug` — see `server/src/db/seed.js`).

**Scripts that exist today (root `package.json`):**  
`dev`, `server:dev`, `client:dev`, `desktop:dev`, `build`, `client:build`, `desktop:build`, `start`, `install:all`, `setup`, `validate:auth`, `validate:auth:http`, `reinstall:sqlite`, `postinstall`.

There is **no** `docker-compose.yml` or `npm run test` in this repo root as of now; ignore those in the old README if they are missing.

---

## Multi-store isolation (store codes)

Each **store code** (business code) is a separate tenant in the database:

- Login (PIN or web) resolves the code to one `business_id`.
- Sales, products, customers, expenses, reports, MoMo float, and dashboard totals always filter by that `business_id` from your session — never mixed with another store.
- Receipt numbers (e.g. `INV-20260519-000001`) are numbered **per store, per day**; two stores can share the same receipt pattern without conflict.

Staff must enter the correct **store code** at login when more than one store exists on the platform.

---

## Mobile money agent — float & balancing (reference)

This guide is kept in documentation only so the POS and **Mobile money** screens stay uncluttered.

**Roles**

- **Admin or manager:** Choose which cashier receives the opening cash and MoMo float, open the business day, and run end-of-day reconciliation.
- **Cashiers:** Record agent transactions (withdrawals, deposits, airtime, bills, send money) once the float is open.

**Important:** Agent float and balancing are **separate** from customer MoMo payments at checkout (those are normal POS sales).

**Where to use it in the app**

- **Mobile money** in the sidebar — full float screen.
- **POS** — the same float controls appear at the bottom for convenience during checkout.

---

## POS checkout flow & keyboard shortcuts (reference)

This text was removed from the in-app POS banner to keep the UI clean on phones; behaviour is unchanged.

**Suggested flow:** scan or type barcode (or search) → add to cart → adjust quantities → optionally attach a customer → **Proceed to checkout** → choose payment / enter cash received → confirm → next sale.

**Shortcuts (when payment/receipt modals are closed):**

| Key | Action |
|-----|--------|
| **F2** | Focus the barcode / scan field |
| **F9** | Open pay / checkout if the cart is valid |

---

## 5. Production deployment (single Node server)

The server serves the **built** React app when `NODE_ENV=production`.

1. **Build the client** (set API URL for where browsers will reach the API):

   ```bash
   set VITE_API_URL=https://your-public-api-host.example.com
   cd client
   npm run build
   cd ..
   ```

   On Linux/macOS use `export VITE_API_URL=...`.

2. **Configure server** — copy `.env.example` to `server/.env` or root `.env` (dotenv loads from server cwd). Minimum:

   ```env
   NODE_ENV=production
   PORT=4000
   JWT_SECRET=long-random-secret
   DB_PATH=./data/supermarket.db
   ```

3. **Start:**

   ```bash
   npm run start
   ```

4. Open **`http://your-server:4000/`** — static files from `client/dist` and API under `/api/*`.

**Windows Firewall:** allow inbound TCP on `4000` (and `5173` only for dev).

---

## 6. Hosting options (short)

| Option | What you run | Notes |
|--------|----------------|--------|
| **VPS (Ubuntu, etc.)** | Node 18+, `npm run setup` once, `npm run build` + `npm run start` | Use **PM2** or **systemd** to keep process alive; put **Nginx** reverse proxy + HTTPS in front |
| **PaaS (Railway, Render, Fly)** | Node start command `npm run start` | Build step must run `client:build` first; set `VITE_API_URL` to the service URL |
| **Split hosting** | Static UI on Netlify/Vercel + API on VPS | Set `VITE_API_URL` to API origin; enable CORS for that origin on API |

**Database:** SQLite file must live on **persistent disk** on the server (not ephemeral-only storage).

### Supabase (PostgreSQL) — copy data, then point Render at it

**Production (Render):** set **`DATABASE_URL`** to your Supabase **Session pooler** URI. The API uses **PostgreSQL only** — you do not need `DB_PATH` or a Render disk for the database. Code, API, and frontend still deploy from GitHub to Render as before.

**Local dev:** leave `DATABASE_URL` unset; the app uses **SQLite** at `DB_PATH`.

#### A. Create schema in Supabase

1. Supabase → **SQL Editor** → run `server/src/db/migrations/001_init_postgres.sql`.

#### B. Copy your SQLite data into Supabase

Your PC may block Postgres ports (`ENOTFOUND` / timeout). Use **Render Shell** if local migrate fails.

**Windows PowerShell** (not `set` — that is CMD only):

```powershell
cd C:\Users\SAFIQ\Desktop\uganda-supermarket\server
$env:SUPABASE_DB_PASSWORD = "your_database_password"
.\scripts\migrate-to-supabase.ps1
```

**CMD:**

```cmd
cd server
set SUPABASE_DB_PASSWORD=your_database_password
scripts\migrate-to-supabase.cmd
```

**Render Shell** (recommended if you have live data on disk):

```sh
cd server
export SUPABASE_DB_PASSWORD='your_password'
export DB_PATH=/var/data/supermarket.db
sh scripts/render-migrate-supabase.sh
```

Use the **Session pooler** URI from Supabase → **Connect** → **Pooler settings** (not the direct host that says “Not IPv4 compatible”).

#### C. Render environment (after data is in Supabase)

| Variable | Value |
|----------|--------|
| `DATABASE_URL` | Session pooler URI from Supabase (with real password) |
| `DB_PATH` | Keep until app uses Postgres only — e.g. `/var/data/supermarket.db` |

Save → redeploy. Keep-alive runs every 6 days.

#### D. Later: app uses Supabase only

When the Postgres backend is enabled in code, remove `DB_PATH` / persistent disk and rely on `DATABASE_URL` only.

---

## 7. Useful API links (replace host)

After auth, use `Authorization: Bearer <token>`.

- `GET http://HOST:4000/health`
- `POST http://HOST:4000/api/auth/login` — body `{ "pin": "9012", "role": "cashier" }`
- `POST http://HOST:4000/api/auth/login-web` — body `{ "email": "...", "password": "..." }`
- `GET http://HOST:4000/api/products`
- `GET http://HOST:4000/api/sales/today-summary`
- (Full list: see root `README.md` “API Endpoints” — most routes match.)

**UI routes (React Router, after login):**

- `/login`
- `/dashboard`, `/pos`, `/inventory`, `/customers`
- `/products`, `/suppliers`, `/reports` — admin & manager  
- `/users`, `/settings` — admin only  

---

## 8. Troubleshooting

| Symptom | Check |
|--------|--------|
| Phone cannot login | `VITE_API_URL` must be PC’s LAN IP or public API URL, not `localhost` |
| `better-sqlite3` errors on Windows | `npm run reinstall:sqlite` from repo root |
| Blank page in production | Run `client:build` before `start`; `NODE_ENV=production` |
| 401 on API | Token expired (8h JWT); login again |

---

## 9. Disclaimer

No automated E2E suite was run to certify “100% working.” Use the table above plus manual smoke tests on POS, reports, and any integration you enable (MoMo, SMS, cloud).
