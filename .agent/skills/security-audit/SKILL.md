---
name: security-audit
description: Security audit checklist and known vulnerabilities for the pinokiod codebase. Covers hardcoded secrets, CORS, session management, command injection, path traversal, WebSocket security, and more.
---

# Security Audit — Scan Report

This document is the **scan** side of the security audit. It identifies vulnerabilities, scores their risk, and tracks fix status. For remediation code and fix instructions, see [`FIX.md`](./FIX.md).

---

## 📊 Security Score Dashboard

### Overall Safety Grade: `22 / 100` — Grade: **F** 🔴

> **The codebase is NOT safe for production or public-facing deployment in its current state.**
> It is designed as a local-only desktop app backend and assumes a trusted localhost environment. Any network exposure (LAN, tunnel, port-forward) significantly increases risk.

### Scoring Methodology

Each finding is scored on two dimensions (0–10 scale):

- **Exploitability (E)** — How easy is it to exploit? (10 = trivially exploitable, no auth needed)
- **Impact (I)** — What's the damage if exploited? (10 = full system compromise)

**Risk Score** = `(E + I) / 2` → normalized to 0–10

**Overall Safety Score** = `100 - (sum of weighted risk scores)` → clamped to 0–100

| Grade  | Score Range | Meaning                             |
| ------ | ----------- | ----------------------------------- |
| **A+** | 95–100      | Production-ready, hardened          |
| **A**  | 85–94       | Strong security posture             |
| **B**  | 70–84       | Acceptable with known risks         |
| **C**  | 50–69       | Needs improvement before deployment |
| **D**  | 30–49       | Significant vulnerabilities         |
| **F**  | 0–29        | Unsafe — do not deploy publicly     |

---

### Per-Finding Scorecard

| #   | Finding                               | Exploitability | Impact | Risk Score | Status     | Fix Effort | Fix Ref                                                              |
| --- | ------------------------------------- | :------------: | :----: | :--------: | ---------- | ---------- | -------------------------------------------------------------------- |
| 1   | Hardcoded session secret `"secret"`   |       9        |   7    | **8.0** 🔴 | ❌ Unfixed | 5 min      | [FIX #1](./FIX.md#1-fix-session-secret--serverindexjs4446)           |
| 2   | Hardcoded pipe secret `"oikonip"`     |       9        |   7    | **8.0** 🔴 | ❌ Unfixed | 5 min      | [FIX #2](./FIX.md#2-fix-pipe-session-secret--pipeindexjs34)          |
| 3   | CORS `origin: '*'` (8 locations)      |       8        |   9    | **8.5** 🔴 | ❌ Unfixed | 30 min     | [FIX #3](./FIX.md#3-fix-cors-origin---multiple-files)                |
| 4   | Unrestricted shell/PTY execution      |       6        |   10   | **8.0** 🔴 | ❌ Unfixed | Weeks      | [FIX #4](./FIX.md#4-harden-shell-command-execution--kernelshelljs)   |
| 5   | `child_process.exec()` unsanitized    |       5        |   9    | **7.0** 🔴 | ❌ Unfixed | 2 hrs      | [FIX #5](./FIX.md#5-fix-child_processexec-usage--kernelutiljs)       |
| 6   | No API endpoint authentication        |       8        |   9    | **8.5** 🔴 | ❌ Unfixed | 1 day      | [FIX #6](./FIX.md#6-add-api-authentication--serverindexjs)           |
| 7   | No WebSocket authentication           |       8        |   8    | **8.0** 🟠 | ❌ Unfixed | 4 hrs      | [FIX #7](./FIX.md#7-add-websocket-authentication--serversocketjs)    |
| 8   | Path traversal via `/asset`, `/files` |       7        |   7    | **7.0** 🟠 | ⚠️ Partial | 4 hrs      | [FIX #8](./FIX.md#8-harden-file-serving-routes--serverindexjs)       |
| 9   | Sudo execution without confirmation   |       4        |   10   | **7.0** 🟠 | ❌ Unfixed | 2 hrs      | [FIX #9](./FIX.md#9-add-sudo-confirmation--kernelshelljs)            |
| 10  | XSS via unescaped EJS `<%- %>`        |       5        |   6    | **5.5** 🟡 | ❌ Unfixed | 1 day      | [FIX #10](./FIX.md#10-fix-xss-in-ejs-templates--serverviewsejs)      |
| 11  | No security headers (helmet/CSP)      |       3        |   5    | **4.0** 🟡 | ❌ Unfixed | 15 min     | [FIX #11](./FIX.md#11-add-security-headers--serverindexjs)           |
| 12  | No rate limiting                      |       6        |   4    | **5.0** 🟡 | ❌ Unfixed | 15 min     | [FIX #12](./FIX.md#12-add-rate-limiting--serverindexjs-pipeindexjs)  |
| 13  | Dynamic module loading risk           |       3        |   7    | **5.0** 🟡 | ❌ Unfixed | 2 hrs      | [FIX #13](./FIX.md#13-harden-dynamic-module-loading--kernelloaderjs) |
| 14  | Verbose error messages                |       2        |   3    | **2.5** 🟢 | ❌ Unfixed | 1 hr       | [FIX #14](./FIX.md#14-fix-verbose-error-messages)                    |
| 15  | Directory listing enabled             |       4        |   4    | **4.0** 🟢 | ❌ Unfixed | 15 min     | [FIX #15](./FIX.md#15-disable-directory-listing)                     |
| 16  | ENVIRONMENT file exposure             |       5        |   6    | **5.5** 🟢 | ❌ Unfixed | 30 min     | [FIX #16](./FIX.md#16-block-environment-file-exposure)               |
| 17  | Missing cookie security flags         |       3        |   4    | **3.5** 🔵 | ❌ Unfixed | 5 min      | [FIX #17](./FIX.md#17-add-cookie-security-flags)                     |
| 18  | No input validation (joi/zod)         |       4        |   5    | **4.5** 🔵 | ❌ Unfixed | 1 day      | [FIX #18](./FIX.md#18-add-input-validation)                          |
| 19  | Dependency audit needed               |       3        |   5    | **4.0** 🔵 | ❌ Unfixed | 30 min     | [FIX #19](./FIX.md#19-run-dependency-audit)                          |
| 20  | No audit logging                      |       1        |   3    | **2.0** 🔵 | ❌ Unfixed | 1 day      | [FIX #20](./FIX.md#20-add-audit-logging)                             |

---

### Score Breakdown by Category

| Category                 |             Findings              | Avg Risk |       Weight        |  Deduction   |
| ------------------------ | :-------------------------------: | :------: | :-----------------: | :----------: |
| **Secrets & Crypto**     |              #1, #2               |   8.0    |         ×3          |     -24      |
| **Access Control**       |            #3, #6, #7             |   8.3    |         ×3          |     -25      |
| **Injection**            |            #4, #5, #10            |   6.8    |         ×2          |     -14      |
| **Data Exposure**        |           #8, #15, #16            |   5.5    |         ×1          |      -6      |
| **Privilege Escalation** |                #9                 |   7.0    |         ×2          |      -7      |
| **Hardening**            | #11, #12, #13, #17, #18, #19, #20 |   4.1    |        ×0.5         |      -2      |
|                          |                                   |          | **Total Deduction** |   **-78**    |
|                          |                                   |          |  **Safety Score**   | **22 / 100** |

---

### Quick-Win Fixes (Raise Score to ~55 in < 2 hours)

| Priority | Fix                                                                                                                                                         | Score Gain |  Time  |
| :------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------: | :----: |
|    ①     | Replace hardcoded session secrets → [FIX #1](./FIX.md#1-fix-session-secret--serverindexjs4446), [FIX #2](./FIX.md#2-fix-pipe-session-secret--pipeindexjs34) |    +12     | 5 min  |
|    ②     | Restrict CORS to localhost origins → [FIX #3](./FIX.md#3-fix-cors-origin---multiple-files)                                                                  |    +13     | 30 min |
|    ③     | Add helmet security headers → [FIX #11](./FIX.md#11-add-security-headers--serverindexjs)                                                                    |     +2     | 15 min |
|    ④     | Add rate limiting → [FIX #12](./FIX.md#12-add-rate-limiting--serverindexjs-pipeindexjs)                                                                     |     +3     | 15 min |
|    ⑤     | Add cookie security flags → [FIX #17](./FIX.md#17-add-cookie-security-flags)                                                                                |     +2     | 5 min  |

### Full Hardening (Raise Score to ~85, Grade A)

| Priority | Fix                                                                                                                                            | Score Gain |  Time  |
| :------: | ---------------------------------------------------------------------------------------------------------------------------------------------- | :--------: | :----: |
|    ⑥     | Add API token auth → [FIX #6](./FIX.md#6-add-api-authentication--serverindexjs)                                                                |    +13     | 1 day  |
|    ⑦     | Add WebSocket auth → [FIX #7](./FIX.md#7-add-websocket-authentication--serversocketjs)                                                         |     +8     | 4 hrs  |
|    ⑧     | Block sensitive files → [FIX #8](./FIX.md#8-harden-file-serving-routes--serverindexjs), [FIX #16](./FIX.md#16-block-environment-file-exposure) |     +6     | 30 min |
|    ⑨     | Replace `exec` with `execFile` → [FIX #5](./FIX.md#5-fix-child_processexec-usage--kernelutiljs)                                                |     +4     | 2 hrs  |
|    ⑩     | Add sudo allowlist → [FIX #9](./FIX.md#9-add-sudo-confirmation--kernelshelljs)                                                                 |     +4     | 2 hrs  |

---

### How to Update Scores

When you fix a finding, update its row in the scorecard above:

1. Change **Status** from `❌ Unfixed` to `✅ Fixed`
2. Set its **Risk Score** to `0.0` (or a reduced value if partially fixed)
3. Recalculate the **Overall Safety Score** by subtracting the improvement
4. Update the **Grade** accordingly

---

## 🔴 CRITICAL Findings

### Finding #1 — Hardcoded Session Secret

- **File:** `server/index.js` (line ~4446)
- **Code:** `session({ secret: "secret" })`
- **Risk:** Session cookies can be forged by anyone who knows the secret (which is literally `"secret"`). Enables session hijacking and replay attacks.
- **Exploitability:** 9 — Secret is publicly visible in source code
- **Impact:** 7 — Complete session impersonation

### Finding #2 — Hardcoded Pipe Secret

- **File:** `pipe/index.js` (line ~34)
- **Code:** `session({ secret: 'oikonip' })`
- **Risk:** The pipe proxy (used for sharing apps via Cloudflare/LAN) uses `"oikonip"` (reversed `"pinokio"`). Trivially guessable.
- **Exploitability:** 9 — Secret is publicly visible and guessable
- **Impact:** 7 — Complete session impersonation on shared apps

### Finding #3 — Wide-Open CORS (`origin: '*'`)

- **Files (8 locations):**

| File                                     | Line   | Context           |
| ---------------------------------------- | ------ | ----------------- |
| `server/index.js`                        | 4376   | Main Express app  |
| `pipe/index.js`                          | 28     | Pipe proxy        |
| `server/socket.js`                       | 277    | WebSocket upgrade |
| `kernel/router/common.js`                | 25     | Router proxy      |
| `kernel/router/connector.js`             | 32, 76 | Connector proxy   |
| `kernel/router/localhost_home_router.js` | 36, 69 | Localhost routing |
| `kernel/router/pinokio_domain_router.js` | 61     | Pinokio domain    |
| `kernel/router/rewriter.js`              | 26     | URL rewriting     |

- **Risk:** Any website can make requests to `localhost:42000`. A malicious site could install apps, execute shell commands, read files, and exfiltrate data.
- **Exploitability:** 8 — Just needs user to visit a malicious webpage
- **Impact:** 9 — Full system access via API

### Finding #4 — Unrestricted Shell/PTY Execution

- **File:** `kernel/shell.js` — `exec()`, `emit2()`, `request()`
- **Code:** PTY spawns with `pty.spawn()` and accepts arbitrary commands via `ptyProcess.write(message)`
- **Risk:** No sandboxing, no allowlist, no confirmation. Scripts from `git clone` can run any command with user's full privileges.
- **Attack vectors:** Malicious Pinokio scripts, WebSocket `emit` messages, `sudo` escalation
- **Exploitability:** 6 — Requires installing a malicious script or network access
- **Impact:** 10 — Full system compromise, arbitrary code execution

### Finding #5 — Unsanitized `child_process.exec()`

- **File:** `kernel/util.js` (lines 415, 432, 462, 479, 502, 539)
- **Code:** `child_process.exec(command)` — 6 occurrences
- **Risk:** `exec()` spawns a shell, allowing injection if `command` contains user-controlled paths/filenames.
- **Exploitability:** 5 — Requires crafted filenames/paths
- **Impact:** 9 — Arbitrary command execution

---

## 🟠 HIGH Findings

### Finding #6 — No API Endpoint Authentication

- **File:** `server/index.js` — ALL routes
- **Risk:** Zero authentication on any route. Anyone who can reach port 42000 has full access.
- **Exposed endpoints:** `GET /tools`, `POST /pinokio/api`, `GET /asset/*`, `GET /files/*`, WebSocket
- **Exploitability:** 8 — Just need network access to the port
- **Impact:** 9 — Execute commands, browse files, install/uninstall apps

### Finding #7 — No WebSocket Authentication

- **File:** `server/socket.js`
- **Code:** `wss.on('connection', (ws, req) => { /* no auth */ })`
- **Risk:** Any WebSocket client can watch terminal output (secrets, API keys), type into shells, trigger scripts.
- **Exploitability:** 8 — Connect to `ws://localhost:42000` from any origin
- **Impact:** 8 — Shell hijacking, secret exfiltration

### Finding #8 — Path Traversal via File Serving

- **File:** `server/index.js` (lines ~4409-4436)
- **Code:** `express.static(this.kernel.homedir)` served on `/asset` and `/files`
- **Risk:** Entire Pinokio home directory is browsable (ENVIRONMENT files, .git dirs, caches)
- **Partial mitigation:** `sanitizeSegments()` in `server/routes/files.js` strips `..` — but `/asset` route bypasses this
- **Exploitability:** 7 — Direct URL access
- **Impact:** 7 — API keys, tokens, model files exposed

### Finding #9 — Sudo Execution Without Confirmation

- **Files:** `kernel/shell.js:365-385`, `kernel/bin/vs.js`, `kernel/bin/brew.js`, `kernel/bin/registry.js`
- **Code:** `sudo.exec(params.message, options, callback)`
- **Risk:** Scripts can silently request admin/root. If UAC is auto-approved, arbitrary code runs elevated.
- **Use cases:** VS Build Tools install, Xcode CLT removal (`rm -rf /Library/Developer/CommandLineTools`), Windows registry mods
- **Exploitability:** 4 — Requires UAC/sudo prompt (usually)
- **Impact:** 10 — Full admin/root access

---

## 🟡 MEDIUM Findings

### Finding #10 — XSS via Unescaped EJS Templates

- **Files:** `server/views/*.ejs` — 40+ occurrences of `<%- %>` (raw output)
- **Concerning patterns:**
  - `<%- dataJson %>` in `registry_checkin.ejs`
  - `<%- bookmarkletHref %>` in `bookmarklet.ejs`
  - `<%- JSON.stringify(name) %>` in multiple templates (can break `</script>` tags)
- **Risk:** If variables contain user-controlled content (app names, git messages, filenames), XSS is possible.
- **Exploitability:** 5 — Requires crafted app metadata
- **Impact:** 6 — Cookie theft, session hijacking, UI manipulation

### Finding #11 — No Security Headers

- **File:** `server/index.js` — no `helmet`, no CSP, no `X-Frame-Options`
- **Missing:** Content-Security-Policy, X-Frame-Options, X-Content-Type-Options, HSTS
- **Exploitability:** 3 — Enables other attacks (clickjacking, MIME sniffing)
- **Impact:** 5 — Defense-in-depth gap

### Finding #12 — No Rate Limiting

- **Files:** `server/index.js`, `pipe/index.js`, `server/socket.js`
- **Risk:** Brute-force passcodes, DoS via rapid API calls, resource exhaustion via uploads.
- **Exploitability:** 6 — Automated tools
- **Impact:** 4 — Service disruption, credential guessing

### Finding #13 — Dynamic Module Loading

- **File:** `kernel/loader.js`
- **Code:** `const clearModule = require('clear-module')` — clears and re-requires modules
- **Risk:** If module paths derive from user input, arbitrary JS execution is possible.
- **Exploitability:** 3 — Requires control over module paths
- **Impact:** 7 — Arbitrary code execution

---

## 🟢 LOW Findings

### Finding #14 — Verbose Error Messages

- **Files:** Multiple — `console.log("ERROR", e)`, `res.status(404).send(e.message)`
- **Risk:** Exposes internal paths and stack traces to clients.

### Finding #15 — Directory Listing Enabled

- **File:** `server/index.js` — `serveIndex` middleware on `/asset` and `/files`
- **Risk:** Full directory browsing of Pinokio home.

### Finding #16 — ENVIRONMENT File Exposure

- **Risk:** Per-app `ENVIRONMENT` files contain API keys, tokens, model paths. Readable via file serving.

---

## 🔵 INFORMATIONAL Findings

### Finding #17 — Missing Cookie Security Flags

- Neither session middleware sets `httpOnly`, `secure`, or `sameSite`.

### Finding #18 — No Input Validation

- No schema validation (joi, zod, ajv). Request bodies and query params are trusted as-is.

### Finding #19 — Dependency Audit Needed

- ~70 npm dependencies, many likely outdated with known CVEs.

### Finding #20 — No Audit Logging

- No structured logging for: shell commands, file access, app installs, auth attempts, sudo operations.

---

## Security Audit Checklist

Use this checklist when reviewing changes:

- [ ] **Secrets** — No hardcoded secrets, tokens, or passwords
- [ ] **CORS** — Origins are restricted to trusted domains
- [ ] **Authentication** — All sensitive endpoints require auth
- [ ] **Authorization** — Users can only access their own resources
- [ ] **Input validation** — All inputs are validated and sanitized
- [ ] **Output encoding** — All template outputs use `<%= %>` (escaped)
- [ ] **Path traversal** — File paths are validated against a root directory
- [ ] **Command injection** — Shell commands use parameterized execution
- [ ] **Dependencies** — `npm audit` shows no critical vulnerabilities
- [ ] **Error handling** — No stack traces or internal paths in responses
- [ ] **Logging** — Security-relevant events are logged
- [ ] **Rate limiting** — Brute-force-sensitive endpoints are rate-limited
- [ ] **HTTPS** — TLS is enforced when `PINOKIO_HTTPS_ACTIVE=1`
- [ ] **Headers** — Security headers (CSP, HSTS, X-Frame-Options) are set
