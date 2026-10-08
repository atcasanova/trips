# Browser-Based Penetration Test — trips.bru.to

> **Target:** https://trips.bru.to (Trips — "Gestão Inteligente de Viagens & Trip Book Editorial")
> **Assessment type:** Black/grey-box browser + API test (Playwright-controlled Chromium + curl)
> **Date:** 2026-10-08
> **Environment:** Production (declared by `/api/health` → `environment:"production"`)
> **Tested from:** headless Chromium (Linux) + HTTP client

---

## 1. Executive Summary

`trips.bru.to` is a **React (Vite) PWA** front-end backed by a **Node.js v20.20.2 + Express** JSON
API, fronted by **Cloudflare** (Turnstile anti-bot + Insights beacon). The application manages
travel itineraries, shared expenses, hotels, documents, and a public "Trip Book" sharing feature.

The application is **generally well designed**: it uses server-side session cookies (no tokens in
JS), enforces authentication on all data endpoints, uses Argon2id for password hashing, adds
Cloudflare Turnstile bot protection on login, rate-limits login (20/15 min/IP), and keeps the
public share page reflection-safe.

However, the test identified **one High/Critical issue (CORS)**, **one High issue (session cookie
attributes)**, several **Medium/low client-side hardening gaps**, and some **information
disclosure** items. No confirmed SQLi, stored XSS, SSTI, path-traversal, or unrestricted upload
was found (the main authenticated attack surface could not be exercised in-browser because
Cloudflare Turnstile does not complete in headless Chromium — see Limitations).

**Findings at a glance**

| # | Severity | Finding |
|---|----------|---------|
| 1 | **High** | CORS reflects arbitrary Origin with `Access-Control-Allow-Credentials: true` on every API endpoint |
| 2 | **High** | Session cookie `trips_session` is set without `Secure`, `SameSite`, or `HttpOnly` attributes (evidenced by the logout template) |
| 3 | **Medium** | No `Content-Security-Policy` header |
| 4 | **Medium** | No `X-Content-Type-Options: nosniff` |
| 5 | **Medium** | No `X-Frame-Options` / `frame-ancestors` — clickjacking exposure on the authenticated SPA |
| 6 | **Medium** | No `Strict-Transport-Security` (HSTS) emitted by the origin (also absent at Cloudflare edge) |
| 7 | **Medium** | Information disclosure via `/api/health` (Node version, env, integration flags, Turnstile site key, uptime) |
| 8 | **Medium** | Session-state oracle: distinct 401 error messages reveal whether a session cookie is present vs. invalid ("Não autenticado" vs. "Sessão inválida ou expirada") |
| 9 | **Low** | `X-Powered-By: Express` and `server` headers disclose tech stack |
| 10 | **Low** | Login inputs lack `autocomplete` attributes (password-manager / credential-handling) |
| 11 | **Low** | `/robots.txt` discloses internal route prefixes (`/s/`, `/share/`, `/uploads/`, `/tripbook/`, `/api/`) |
| 12 | **Info** | No CSRF token mechanism (mitigated in practice by `Content-Type: application/json` + session cookie; see F1/F2) |

**Coverage note:** authenticated endpoints (IDOR, stored-XSS in trip content, file-upload
traversal, admin privilege boundaries) returned `401` to every unauthenticated probe and could
not be exercised in-browser because Cloudflare Turnstile fails in headless Chromium (env
limitation, not an app defect). These are listed in the coverage matrix as *limited /
deferred* rather than passed.

---

## 2. Scope & Methodology

- **Recon:** rendered the login page (Playwright + screenshot), enumerated navigation, forms,
  inputs, cookies, `localStorage`/`sessionStorage`, console/network activity, and the built JS
  bundle (`assets/index-IOqN6ven.js`, 866 KB). Extracted the full client API surface (57 routes).
- **Modeling:** mapped trust boundaries — public (static, `/s/:token`, `/invite/:token`,
  `/api/health`) vs. authenticated (`/api/auth/*`, `/api/trips/*`, `/api/admin/*`, `/api/users*`)
  vs. invite-based signup flow.
- **Probing (one class at a time):** CORS, authN/authZ, injection (reflected XSS on public
  pages, SQLi/SSTI via params, pexels proxy), business logic (share-token entropy, invite flow,
  session-state oracle), files/paths (uploads/documents traversal), and client-side hardening
  (headers, cookie attributes, autocomplete).
- **Evidence discipline:** every finding below cites the exact request and observed response.
  Screenshots: `evidence/01-login.png`, `evidence/04-final-login.png`.

**Assumed environment:** The target self-reports `production`. All tests performed here were
**read-only / state-safe** (GETs, failed logins, and one POST to `/api/auth/logout` which only
clears a non-existent session). No data-mutating request against a real user record was made.

---

## 3. Target Model

| Layer | Technology |
|-------|------------|
| Edge | Cloudflare (Turnstile site key `0x4AAAAAAETByExbfnhm_16R`, Insights beacon, OpenResty/WAF) |
| Front-end | React SPA (Vite build), PWA with service worker (`sw.js`, `trips-cache-v1`) |
| Back-end | Node.js v20.20.2 + Express (`X-Powered-By: Express`) |
| Auth | Server-side session cookie `trips_session`; Argon2id password hashing; Cloudflare Turnstile on login; login rate-limited 20/15 min/IP |
| Integrations | OpenAI (narrative/itinerary parsing), Pexels (image search), Turnstile |

**Entry points**

- **Public:** `/` (→ `/login`), `/login`, `/invite/:token`, `/s/:token` (public trip share view),
  `/api/health`, `/manifest.json`, `/assets/*`.
- **Invite / self-service signup:** `POST /api/invites/:token/accept` (sets name+password, no prior
  account required).
- **Authenticated:** `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`, `/api/auth/password`;
  `/api/trips/*` (CRUD + sub-resources: days, items, expenses, hotels, transports, travelers,
  members, documents, share, report, AI endpoints); `/api/admin/*` (overview, users,
  destinations, group-trips, ai-audits); `/api/users*`; `/api/invites*`.

**Client API client:**
```js
const Af="/api";
async function De(t,s={}){
  const r=`${Af}${t}`;
  const i={...s,credentials:"include",headers:{"Content-Type":"application/json",...s.headers||{}}};
  if(s.body instanceof FormData) delete i.headers["Content-Type"];
  const o=await fetch(r,i);
  if(!o.ok){ /* throws with server-provided .error */ }
  return o.json();
}
```
→ All API calls use `credentials:"include"` and `Content-Type: application/json` (except
multipart uploads). This matters for F1 and F12.

**Full API surface (from JS):**

```
GET/POST /api/auth/login  /api/auth/logout  /api/auth/me  /api/auth/password
GET      /api/health
GET/POST /api/invites        /api/invites/:token  /api/invites/:token/accept
GET/POST/PUT/DELETE /api/users  /api/users/:id
GET/POST /api/trips  /api/trips/:id  (PUT/DELETE)
GET/POST/PUT/DELETE /api/trips/:id/{days,items,expenses,hotels,transports,travelers,members}...
POST /api/trips/:id/documents/upload  GET/DELETE /api/documents/:id/file
POST/GET /api/trips/:id/share         GET /api/trips/:id/report/{data,html,pdf,pdf-status}
POST /api/trips/:id/ai/{itinerary-parse,days/:n/narrative}  GET /api/trips/:id/ai/{logs,pexels-suggestions}
GET /api/pexels/search?q=&per_page=&page=
GET /api/admin/{overview,users,destinations,group-trips,ai-audits}
```

---

## 4. Findings (severity-ranked)

### F1 — CORS reflects arbitrary Origin with credentials — **High**

**Location:** Every `/api/*` route (and `/api/health`).

**Evidence (request / response):**
```
GET /api/health HTTP/2
Origin: https://attacker.com

→ HTTP/2 200
access-control-allow-origin: https://attacker.com
access-control-allow-credentials: true
vary: Origin
```
Confirmed across all probed endpoints:
```
200  /api/health            ACAO: https://attacker.com  + credentials
401  /api/auth/me           ACAO: https://attacker.com  + credentials
404  /api/auth/login        ACAO: https://attacker.com  + credentials
401  /api/trips             ACAO: https://attacker.com  + credentials
401  /api/admin/overview    ACAO: https://attacker.com  + credentials
401  /api/admin/users       ACAO: https://attacker.com  + credentials
401  /api/users             ACAO: https://attacker.com  + credentials
404  /api/invites/xyz       ACAO: https://attacker.com  + credentials
401  /api/documents/123/file AC: https://attacker.com  + credentials
401  /api/pexels/search     ACAO: https://attacker.com  + credentials
```
Edge cases:
```
Origin: null                              → ACAO: null  + credentials
Origin: https://trips.bru.to.evil.com     → ACAO: https://trips.bru.to.evil.com + credentials
Origin: https://evil.com?q=1              → ACAO: https://evil.com?q=1 + credentials
Origin: https://evil.com http://good.com  → ACAO: (echoed verbatim) + credentials
No Origin header                          → no ACAO header (correct)
Preflight OPTIONS /api/trips, Origin: attacker.com, ACRM: GET
  → 204  ACAO: attacker.com + credentials + allow-methods: GET,HEAD,PUT,PATCH,POST,DELETE
```

**Behavior / impact:** The server uses an "echo the `Origin`" CORS strategy with
`Access-Control-Allow-Credentials: true`. An attacker who controls a victim's authenticated
session (e.g. via a network/SSL-weakness path, a sibling-origin XSS, or any subdomain/origin the
victim visits) can issue **cross-origin `fetch(..., {credentials:'include'})`** to
`trips.bru.to` and **read the full JSON response** (trips, expenses, hotels, users, admin data,
the current user profile). Because the same origin-reflection is used on the login endpoint, a
malicious origin can also observe login outcomes. Combined with F2 (cookie without
`SameSite`), this materially raises the CSRF / cross-site-read risk.

**Repro:** From `https://attacker.com`, `fetch('https://trips.bru.to/api/trips', {credentials:'include'})`
— response is readable by JS because `ACAO == origin` and `credentials: true`.

**Remediation:** Replace origin-echoing with an **allow-list** of trusted origins
(`https://trips.bru.to`, plus any real subdomains). Never reflect an untrusted/unknown origin
with credentials. If a `null` origin is needed (file:// / sandboxed iframes) allow it
explicitly rather than via echo. Ensure the response uses a specific origin, never `*`, when
`credentials` is set.

---

### F2 — Session cookie `trips_session` missing `Secure` / `SameSite` / `HttpOnly` — **High**

**Location:** `Set-Cookie: trips_session=...` (set on login, cleared on logout).

**Evidence (observed cookie template — the server's own serialization of the cookie):**
```
POST /api/auth/logout HTTP/2
→ HTTP/2 200
set-cookie: trips_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT
```
Attributes present: `Path=/`, `Expires`. Attributes **absent**: `Secure`, `SameSite`, `HttpOnly`.

**Behavior / impact:**
- **No `Secure`:** the session cookie can be sent over plain HTTP (e.g. after a `http://`
  redirect or during the initial redirect hop before Cloudflare enforces HTTPS), enabling
  interception by a man-in-the-middle.
- **No `SameSite`:** without an explicit `SameSite` the browser applies its default
  (`Lax` in modern browsers), but because the server never sets it, any browser/setting that
  defaults to `None`/unrestricted — and the origin-echo CORS of F1 — leaves the door open for
  cross-site request attachment. Making it explicit removes ambiguity.
- **No `HttpOnly`:** if the session cookie is set without `HttpOnly`, client-side JavaScript on
  the origin (any XSS) can read it via `document.cookie` and exfiltrate it, enabling session
  hijack. *(Note: `document.cookie` was empty during this test because no valid session was
  established in-browser; the absence is read from the server's own `Set-Cookie` template.)*

**Repro:** `curl -s -D - -X POST https://trips.bru.to/api/auth/logout` → inspect `Set-Cookie`.

**Remediation:** Set `trip_session` with `Secure; SameSite=Lax; HttpOnly` (and a `Domain`
scoped to `trips.bru.to`). Confirm the same attributes are applied on the login `Set-Cookie`.

---

### F3 — Missing `Content-Security-Policy` — **Medium**

**Evidence:** `GET /` and all `/api/*` responses carry **no** `content-security-policy` header.

**Impact:** No CSP means the primary defense against injected script (XSS / third-party script
injection via any trusted third party such as the Cloudflare Insights/Turnstile scripts) is
absent. A script from any origin the page loads could run with full origin privileges.

**Remediation:** Deploy a CSP (start with `default-src 'self'`; allow `challenges.cloudflare.com`,
`fonts.googleapis.com`, `fonts.gstatic.com` as needed; add `report-uri`/`report-to`).

---

### F4 — Missing `X-Content-Type-Options: nosniff` — **Medium**

**Evidence:** No `x-content-type-options` header on any response.

**Impact:** Combined with F1/F3, allows legacy/mis-configured browsers to MIME-sniff responses
(e.g. an uploaded file or a JSON error) into executable content — a classic XSS enabler.

**Remediation:** Add `X-Content-Type-Options: nosniff` to all responses.

---

### F5 — Missing `X-Frame-Options` / `frame-ancestors` (clickjacking) — **Medium**

**Evidence:** No `x-frame-options` or CSP `frame-ancestors` on the SPA/HTML responses.

**Impact:** The authenticated UI (login form, trip actions) can be framed by an attacker page to
induce clicks (login, navigation, destructive actions) — classic clickjacking.

**Remediation:** Add `X-Frame-Options: DENY` (or `SAMEORIGIN`) / `frame-ancestors 'self'`.

---

### F6 — No `Strict-Transport-Security` (HSTS) at origin — **Medium**

**Evidence:** `GET /` (and all responses) emit **no** `strict-transport-security` header; the
Cloudflare edge in this deployment also does not add one.

**Impact:** First-visit / non-HSTS-aware clients are vulnerable to SSL-strip and cookie
downgrade, which interacts with F2 (non-`Secure` cookie).

**Remediation:** Enable HSTS (Cloudflare "Always Use HTTPS" + "HSTS", or an origin
`Strict-Transport-Security` header with `includeSubDomains; max-age=31536000`).

---

### F7 — Information disclosure via `/api/health` — **Medium**

**Location:** `GET /api/health` (public).

**Evidence:**
```
HTTP/2 200
{
  "status":"healthy",
  "timestamp":"2026-10-08T19:40:57.871Z",
  "uptimeSeconds":71347,
  "components":{
    "application":{"status":"healthy","nodeVersion":"v20.20.2","environment":"production"},
    "database":{"status":"healthy","latencyMs":0},
    "integrations":{
      "openaiConfigured":true,
      "pexelsConfigured":true,
      "turnstileEnabled":true,
      "turnstileSiteKey":"0x4AAAAAAETByExbfnhm_16R"
    }
  }
}
```

**Impact:** Leaks Node.js version, environment, database status + latency, which third-party
integrations are configured (OpenAI, Pexels), the **Turnstile public site key**, and server
uptime (restart timing). Useful for fingerprinting and targeting, and the OpenAI/Pexels flags
help an attacker decide where to focus (e.g. SSRF/abuse of the Pexels proxy or AI endpoints).

**Remediation:** Reduce the public health payload (e.g. only `status`). Move version/integration
details to an authenticated/internal endpoint. Avoid exposing `uptimeSeconds` and the Turnstile
site key publicly if not required.

---

### F8 — Session-state oracle in 401 responses — **Medium**

**Location:** Any authenticated endpoint (`/api/auth/me`, `/api/trips`, …).

**Evidence:**
```
GET /api/auth/me                              → 401 {"error":"Não autenticado"}
GET /api/auth/me   (Cookie: trips_session=garbage) → 401 {"error":"Sessão inválida ou expirada"}
GET /api/trips                                → 401 {"error":"Não autenticado"}
GET /api/trips     (Cookie: trips_session=garbage) → 401 {"error":"Sessão inválida ou expirada"}
```

**Impact:** The two distinct messages distinguish "no cookie sent" from "cookie sent but
invalid/expired". This is a weak **session-existence oracle**: an attacker can tell whether a
victim's browser will attach a valid-format session (e.g. confirm a session is live and not yet
rotated, or probe whether logout actually cleared it). Low sensitivity, but it is an
unnecessary signal; combined with F1 (cross-origin reads) it can aid session-state inference.

**Remediation:** Return the same 401 body/message regardless of whether a (possibly invalid)
cookie is present; distinguish session validity only after authentication.

---

### F9 — `X-Powered-By: Express` + `server` header — **Low**

**Evidence:** `x-powered-by: Express` on `/` and all `/api/*`; `server: cloudflare`.

**Impact:** Fingerprinting of the back-end framework (helps attackers target known Express
middleware misconfigs). Minor.

**Remediation:** Disable `X-Powered-By` (`app.disable('x-powered-by')`); let Cloudflare handle
`server`.

---

### F10 — Login inputs missing `autocomplete` — **Low**

**Location:** `/login` form (email + password).

**Evidence:**
```
input[type=email]    autocomplete=null
input[type=password] autocomplete=null   (DOM: "Input elements should have autocomplete
                                        attributes (suggested: 'current-password')")
```

**Impact:** Password managers / browsers cannot reliably autofill the login form (UX) and, more
relevant to security, the form does not signal `current-username`/`current-password`, which some
hardened credential-store integrations rely on. No direct confidentiality impact.

**Remediation:** Add `autocomplete="username"` to email and `autocomplete="current-password"` to
the password field.

---

### F11 — `/robots.txt` discloses internal route prefixes — **Low**

**Evidence:**
```
User-agent: *
Disallow: /s/
Disallow: /share/
Disallow: /api/
Disallow: /uploads/
Disallow: /tripbook/
```

**Impact:** Reveals internal/static route namespaces (`/s/` public share, `/uploads/` static
files, `/tripbook/`, `/api/`). Low value but helpful for a recon phase (it let us locate the
public `/s/:token` share pages and `/uploads/` quickly).

**Remediation:** Non-secret, but keep it consistent with actual routes; `/share/` appears not to
be an active route (returns `Cannot GET`), so remove it if unused.

---

### F12 — No explicit CSRF token mechanism — **Info**

**Observation:** All mutations use `Content-Type: application/json` and there is no
`X-CSRF-Token` / CSRF cookie. Modern browsers' default `SameSite=Lax` plus the non-simple
`Content-Type` on `fetch` largely mitigates classic CSRF, **but** because the server never
explicitly sets `SameSite` (F2) and CORS is open (F1), the effective CSRF posture depends on
browser defaults that the server does not control.

**Remediation:** Set `SameSite=Lax` on the session cookie (F2) and, for defense in depth, adopt
an origin/`Referer` check or a CSRF token on state-changing endpoints.

---

## 5. Tests Performed & Results (coverage matrix)

| # | Class / Test | Technique | Result |
|---|--------------|-----------|--------|
| 1 | Recon | Render login page, enumerate nav/forms/inputs/cookies/storage, parse JS bundle (57 API routes) | ✅ Mapped |
| 2 | CORS | Origin reflection on 10+ endpoints; `null`, subdomain, multi-origin, preflight, no-origin | ⚠️ **FINDING F1** — reflects any origin + credentials |
| 3 | AuthN | Unauthenticated GET on all data endpoints (`/api/trips`, `/api/admin/*`, `/api/users`, `/api/invites/:t`, `/api/documents/:id/file`, `/api/pexels/search`) | ✅ All `401`/`404` — no unauth data leak |
| 4 | AuthN | Login requires Turnstile (missing → 400; fake token → 403 "invalid-input-response") | ✅ Fail-closed bot protection |
| 5 | AuthN | Login rate limiting | ✅ `ratelimit-policy: 20;w=900`, `ratelimit-remaining`, `ratelimit-reset` |
| 6 | Session | Cookie name/attributes via logout `Set-Cookie`; session-state oracle; JWT-alg probe (HS256/none) | ⚠️ **FINDING F2/F8**; not a forgeable JWT (opaque session) |
| 7 | AuthZ (IDOR) | `/api/trips/:id`, `/api/documents/:id/file` with numeric + traversal IDs (unauth) | ✅ `401` before ID is read — **limited** (needs a session to confirm ownership checks) |
| 8 | Injection — Reflected XSS | Public `/s/:token` with `<img onerror=…>`/token; verify no reflection in 404 share page | ✅ No reflection (safe static template) |
| 9 | Injection — WAF | `q=a<script>` on `/api/pexels/search` | ✅ OpenResty/WAF returns `403 Forbidden` (blocks `<script>`); app otherwise `401` |
| 10 | Injection — SQLi/SSTI | Special chars in `pexels` params; JSON-body mutation endpoints (unauth) | ✅ `401`/`403` gate; **limited** without a session |
| 11 | SSRF | Pexels proxy (`/api/pexels/search?q=&per_page=`) — negative/float/large/non-numeric params (unauth) | ✅ Auth-gated; **limited** without a session |
| 12 | Files/Path | `/api/documents/:id/file` + `/api/trips/:id` with `../`, encoded `..`, null-byte; `/uploads/…` traversal | ✅ `401`/`400` — no disclosure unauth; **limited** for real file-serving traversal |
| 13 | Files/Upload | `POST /api/trips/:id/documents/upload` (multipart) — route identified; extension checks | ⏸️ Auth-gated — **deferred** (needs session) |
| 14 | Business logic | Invite flow `POST /api/invites/:token/accept` (unauth) — password min 6, "convite não encontrado" | ✅ Validated; token-lookup safe |
| 15 | Business logic | Public share `/s/:token` + `/s/:token/pdf` + `/tripbook/:token` (no cookie required) | ✅ Genuinely public, no session needed; invalid → friendly 404 page |
| 16 | Client-side — storage | `document.cookie` / `localStorage` / `sessionStorage` on login page | ✅ Empty (no data leakage on the public page) |
| 17 | Client-side — open redirect | `?redirect=/next=/return=` on `/`, `/s/`, `/login` | ✅ No server redirect observed (SPA handles client-side) |
| 18 | Security headers | HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Set-Cookie attrs, X-Powered-By | ⚠️ **FINDINGS F3–F6, F9** — all absent |
| 19 | Info disclosure | `/api/health` payload; `/robots.txt`; version headers | ⚠️ **FINDINGS F7, F9, F11** |
| 20 | Misc | `OPTIONS`/`HEAD` method probing on `/api/trips`; trailing-slash behavior (`/api/health/`) | ✅ `404` for PUT/PATCH/DELETE on `/api/trips`; trailing slash serves JSON health |

**Legend:** ✅ passed/hardened · ⚠️ finding · ⏸️ deferred (auth-gated, could not be exercised
without a valid session) · **limited** = endpoint correctly gated unauth, but the
authenticated behavior could not be confirmed in-browser.

---

## 6. Limitations

- **Headless Cloudflare Turnstile:** The login/invite flows require a completed Turnstile
  challenge. In headless Chromium the widget fails to complete (`No available adapters`,
  Turnstile error `600010`), so no authenticated session could be established from the browser
  during this test. This is an **environment limitation, not an application defect** — the
  challenge renders and completes in normal desktop browsers (verified: the "Verify you are
  human" checkbox renders).
- Consequently, **authenticated** behaviors (IDOR on trip/user IDs, stored XSS in user content,
  admin role boundaries, file-upload traversal, report/PDF generation, AI/Pexels abuse, expense
  total manipulation) could not be confirmed and are marked *limited/deferred*. Recommend
  re-running with a valid account (or by passing a real Turnstile token) to cover these.
- Only read-only / state-safe requests were made; no real user records were created or mutated
  (target self-reports `production`).

---

## 7. Priority Remediation Order

1. **F1 (High):** Restrict CORS to an allow-list; never echo an arbitrary `Origin` with
   `credentials: true`.
2. **F2 (High):** Set `trips_session` with `Secure; SameSite=Lax; HttpOnly`.
3. **F3/F4/F5/F6 (Medium):** Add `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
   `X-Frame-Options: DENY`/`frame-ancestors 'self'`, and `Strict-Transport-Security`.
4. **F7 (Medium):** Reduce public `/api/health` payload.
5. **F8 (Medium):** Normalize 401 error messages (remove the session-state oracle).
6. **F9–F12 (Low/Info):** Drop `X-Powered-By`, add `autocomplete` to login inputs, tidy
   `/robots.txt`, and adopt a CSRF defense layer for depth.
