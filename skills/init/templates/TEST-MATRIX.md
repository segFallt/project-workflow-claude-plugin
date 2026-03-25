<!-- pw-version: 1.1.0 -->
# Integration Test Matrix

This file contains all project-specific test checks and startup procedures for integration testing. The testing prompts reference this file rather than hardcoding checks inline.

## Docker Compose Startup Sequence

Run these steps in order from the deployment directory (see `PROJECT.md § Local Development` for the path):

| Step | Command | Wait for |
|------|---------|----------|
| 0a. Tear down existing stack | `docker compose --profile app down -v` | All containers stopped, volumes removed |
| 0b. Pull latest images | `docker compose --profile app pull` | All images pulled |
| 1. Load env | Verify `.env` exists (copy from `.env.example` if missing, fill required values) | File exists |
| 2. Start infrastructure | `cd <WORKTREES_BASE>/<DEPLOY_REPO>/ && docker compose up -d` | All infrastructure containers running |
| 3. Health checks | Verify all infrastructure services are healthy (see Infrastructure Checks below) | All healthy |
| 4. Run migrations | <!-- REPLACE THIS: insert your migration command here --> | Exit code 0 or "no change" |
| 5. Seed data | <!-- REPLACE THIS: insert your seed data command here, or remove if not applicable --> | Exit code 0 |
| 6. (Optional) AI/ML model server | If your stack includes a local AI/ML model server, wait for it to be ready and load any required models. | Model server healthy and models available |
| 7. Start app services | `docker compose --profile app up -d` | App containers running and healthy |

> **Note:** Step 0a (`down -v`) removes named data volumes. This is intentional — each cycle starts from a clean slate.

## Model Selection

**[OPTIONAL]** If your project uses local AI/ML models, document your default model and fallback alternatives here. Remove this section if not applicable.

| Model Name | Role | Notes |
|------------|------|-------|
| <!-- default model --> | <!-- e.g. primary inference, embedding, etc. --> | <!-- size, source, config file --> |
| <!-- fallback model --> | <!-- role --> | <!-- notes --> |

## Infrastructure Checks (Phase 1)

<!-- REPLACE THIS: The rows below are examples showing the check pattern. Replace container names, ports, and conditions with your actual infrastructure. -->

| ID | Check | Command / Method | PASS condition |
|----|-------|-----------------|----------------|
| I-1 | Database accepting connections | `docker exec <DB_CONTAINER> pg_isready -U <db_user> -d <db_name>` | Exit code 0 |
| I-2 | Database migrations applied | Connect to DB, `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'` | Count ≥ expected number of tables |
| I-3 | Database seed data present | `SELECT count(*) FROM <seed_table>` | Count > 0 |
| I-4 | Cache accepting connections | `docker exec <CACHE_CONTAINER> redis-cli -a $REDIS_PASSWORD ping` | Returns `PONG` |
| I-5 | App container healthy | `docker exec <APP_CONTAINER> curl -s http://localhost:<GATEWAY_PORT>/health` | HTTP 200 |
| I-6 | Additional infrastructure service | `curl -s http://localhost:<PORT>/healthz` | HTTP 200 |

## Service Health Checks (Phase 2 — Gateway)

<!-- REPLACE THIS: Replace all endpoints, ports, and response field names with your actual API contract. -->

| ID | Check | Command / Method | PASS condition |
|----|-------|-----------------|----------------|
| G-1 | Gateway health endpoint | `curl -s http://localhost:<GATEWAY_PORT>/health` | HTTP 200 |
| G-2 | Login | `POST /api/auth/login` with test credentials | HTTP 200, response contains auth token |
| G-3 | Token refresh | `POST /api/auth/refresh` with refresh token | HTTP 200, new token returned |
| G-4 | Primary resource list | `GET /api/<primary-resource>` with Bearer token | HTTP 200, valid JSON array |
| G-5 | Secondary resource list | `GET /api/<secondary-resource>` with Bearer token | HTTP 200, valid JSON array |
| G-6 | WebSocket connection | Connect to `ws://localhost:<GATEWAY_PORT>/ws?token=<jwt>` | Connection established, no immediate close |
| G-7 | Invalid auth rejected | `GET /api/<protected-resource>` with no token | HTTP 401 |

## Service Health Checks (Phase 2 — Engine)

<!-- REPLACE THIS: Replace service names, ports, and integration endpoints with your actual backend engine/worker service details. Remove this section if your stack has no separate backend engine. -->

| ID | Check | Command / Method | PASS condition |
|----|-------|-----------------|----------------|
| E-1 | Backend service health | `curl -s http://localhost:<ENGINE_PORT>/health` | HTTP 200 |
| E-2 | Core service operation | <!-- REPLACE THIS: e.g. a representative API or RPC call that exercises the engine --> | Response received without error |
| E-3 | External integration (e.g. AI/ML or third-party) | <!-- REPLACE THIS: e.g. a call that exercises the integration --> | HTTP 200, expected response shape |
| E-4 | Engine logs clean | `docker logs <APP_CONTAINER> --tail 50` | No unhandled exceptions or tracebacks |
| E-5 | Message queue / stream consumer active | <!-- REPLACE THIS: e.g. check consumer group exists on stream --> | Consumer group or queue worker exists |

## Service Health Checks (Phase 2 — UI)

<!-- REPLACE THIS: Replace port and internal container references with your actual UI service details. -->

| ID | Check | Command / Method | PASS condition |
|----|-------|-----------------|----------------|
| U-1 | UI serving | `curl -s -o /dev/null -w "%{http_code}" http://localhost:<UI_PORT>` | HTTP 200 |
| U-2 | SPA routing | `curl -s -o /dev/null -w "%{http_code}" http://localhost:<UI_PORT>/<main-route>` | HTTP 200 (server returns index.html for all routes) |
| U-3 | Static assets | `curl -s http://localhost:<UI_PORT>` | Response contains `<script` tag |
| U-4 | API connectivity | From UI container: `curl -s http://<APP_CONTAINER>:<GATEWAY_PORT>/health` | HTTP 200 |

## Browser / UI Checks (Phase 2 — Browser)

> **Pre-condition:** U-1 through U-4 must PASS.
> Use Playwright MCP tools: `browser_navigate`, `browser_snapshot`, `browser_click`, `browser_fill_form`, `browser_press_key`, `browser_wait_for`, `browser_evaluate`.
> Test credentials: same email and password used in G-2.

<!-- REPLACE THIS: Replace <APP_NAME>, <PRIMARY_HEADING>, <NAV_ITEMS>, and route paths with your actual application values. -->

| ID | Check | Method | PASS condition |
|----|-------|--------|----------------|
| B-1 | Login page renders | `browser_navigate` to `http://localhost:<UI_PORT>/login`, then `browser_snapshot` | Snapshot shows `<PRIMARY_HEADING>` heading, email input, password input, sign-in button |
| B-2 | Login flow | `browser_fill_form` (email + password), `browser_click` sign-in button, `browser_wait_for` navigation | URL changes to `/`; snapshot shows `<APP_NAME>` brand and sidebar nav |
| B-3 | Sidebar navigation present | `browser_snapshot` after B-2 | Snapshot contains expected `<NAV_ITEMS>` (e.g. Dashboard, <!-- list your nav items here -->, Sign out) |
| B-4 | Navigate to primary section | `browser_click` `<NAV_ITEM_1>`, `browser_wait_for` | URL is `/<route-1>`; page renders content or empty state without crash |
| B-5 | Navigate to secondary section | `browser_click` `<NAV_ITEM_2>`, `browser_wait_for` | URL is `/<route-2>`; page renders content or empty state without crash |
| B-6 | Navigate to settings/config | `browser_click` `<SETTINGS_NAV_ITEM>`, `browser_wait_for` | URL is `/<settings-route>`; page renders settings content |
| B-7 | Main dashboard data display | `browser_click` Dashboard nav item, `browser_wait_for` | Dashboard renders without crash (shows content or empty state, not blank/error) |
| B-8 | Auth guard (unauthenticated) | `browser_evaluate` to run `localStorage.clear()`, then `browser_navigate` to `http://localhost:<UI_PORT>/` | Redirected to `/login` |
| B-9 | Sign out flow | `browser_click` "Sign out", `browser_wait_for` navigation, then `browser_navigate` to `http://localhost:<UI_PORT>/` | First navigation redirects to `/login`; navigating to `/` also redirects to `/login` |
| B-10 | Login error handling | `browser_navigate` to `/login`, `browser_fill_form` with invalid credentials, `browser_click` sign-in button, `browser_wait_for` text | Shows expected error message; stays on `/login` |

## Cross-Service Integration Checks (Phase 2)

<!-- REPLACE THIS: Replace with the actual integration flows that span multiple services in your stack. Examples below show the pattern. -->

| ID | Check | Command / Method | PASS condition |
|----|-------|-----------------|----------------|
| X-1 | Gateway → backend service | Call an API endpoint that internally delegates to the backend service | HTTP 200, no backend errors in gateway logs |
| X-2 | Gateway → message queue | Trigger an action that publishes to the queue, then inspect the queue | Message appears in expected queue/stream |
| X-3 | Backend → external data store | Check backend logs for connection to secondary data store (e.g. search index, vector DB) | No connection errors |
| X-4 | Full end-to-end flow | Trigger the primary user-facing workflow end-to-end | Data flow completes or fails with a clear, actionable error |
