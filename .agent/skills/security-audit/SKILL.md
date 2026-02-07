---
name: security-audit
description: Security audit checklist and known vulnerabilities for the pinokiod codebase. Covers hardcoded secrets, CORS, session management, command injection, path traversal, WebSocket security, and more.
---

# Security Audit Skill — Pinokiod

This skill documents all known security concerns, attack surfaces, and remediation guidance for the pinokiod codebase. Use this as a checklist before any deployment or when reviewing pull requests.

---

## 🔴 CRITICAL — Hardcoded Secrets

### 1. Session Secret — `server/index.js:4446`

```javascript
this.app.use(
  session({
    secret: "secret", // ⚠️ HARDCODED
    resave: false,
    saveUninitialized: false,
  }),
);
```

**Risk:** Session cookies can be forged by anyone who knows the secret (which is literally `"secret"`). This allows session hijacking and replay attacks.

**Remediation:**

```javascript
const crypto = require("crypto");
const SESSION_SECRET =
  process.env.PINOKIO_SESSION_SECRET || crypto.randomBytes(32).toString("hex");
this.app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.PINOKIO_HTTPS_ACTIVE === "1",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);
```

**Files:** `server/index.js` (line ~4446)

---

### 2. Pipe Session Secret — `pipe/index.js:34`

```javascript
app.use(
  session({
    secret: "oikonip", // ⚠️ HARDCODED (reversed "pinokio")
    resave: false,
    saveUninitialized: false,
  }),
);
```

**Risk:** The pipe proxy server uses a trivially guessable secret (`"oikonip"` is just `"pinokio"` reversed). Any shared app exposed via Cloudflare tunnel or LAN is vulnerable.

**Remediation:** Same as above — use environment variable or crypto-random secret.

**Files:** `pipe/index.js` (line ~34)

---

## 🔴 CRITICAL — Wide-Open CORS

### 3. Global CORS `origin: '*'` — Multiple Files

Every server endpoint accepts requests from **any origin**:

| File                                     | Line   | Context                                             |
| ---------------------------------------- | ------ | --------------------------------------------------- |
| `server/index.js`                        | 4376   | Main Express app: `cors({ origin: '*' })`           |
| `pipe/index.js`                          | 28     | Pipe proxy: `cors({ origin: '*' })`                 |
| `server/socket.js`                       | 277    | WebSocket upgrade: `Access-Control-Allow-Origin: *` |
| `kernel/router/common.js`                | 25     | Router proxy responses                              |
| `kernel/router/connector.js`             | 32, 76 | Connector proxy responses                           |
| `kernel/router/localhost_home_router.js` | 36, 69 | Localhost routing                                   |
| `kernel/router/pinokio_domain_router.js` | 61     | Pinokio domain routing                              |
| `kernel/router/rewriter.js`              | 26     | URL rewriting proxy                                 |

**Risk:** Any website visited in a browser can make authenticated requests to the local Pinokio server at `localhost:42000`. This means:

- A malicious website could trigger AI app installations
- Read/modify files on the host system via the FS API
- Execute arbitrary shell commands via the shell API
- Exfiltrate data from the user's machine

**Remediation:**

```javascript
const ALLOWED_ORIGINS = [
  "http://localhost:42000",
  "https://pinokio.localhost",
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/localhost(:\d+)?$/,
];

this.app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // same-origin requests
      const allowed = ALLOWED_ORIGINS.some((o) =>
        o instanceof RegExp ? o.test(origin) : o === origin,
      );
      callback(null, allowed);
    },
    credentials: true,
  }),
);
```

**Files:** All files listed above.

---

## 🔴 CRITICAL — Command Injection Surface

### 4. Shell Command Execution — `kernel/shell.js`

The shell system accepts commands from scripts and WebSocket messages and executes them directly via PTY:

```javascript
// kernel/shell.js - exec() method spawns PTY and writes commands directly
this.ptyProcess = pty.spawn(this.shell, this.args, config);
// ... later:
this.ptyProcess.write(message); // message comes from user/script input
```

**Risk:** Any command passed to `shell.run` is executed with the full privileges of the Node.js process. There is no sandboxing, no command allowlisting, and no user confirmation for dangerous operations.

**Attack vectors:**

- Malicious Pinokio scripts (installed via `git clone`) can run **any** command
- WebSocket `emit` messages write directly to the PTY
- The `sudo` module (`sudo-prompt-programfiles-x86`) elevates to admin/root

**Affected files:**

- `kernel/shell.js` — `exec()`, `emit2()`, `request()`
- `kernel/bin/vs.js` — `sudo: true` for Visual Studio Build Tools
- `kernel/bin/brew.js` — `sudo: true` for Xcode removal
- `kernel/bin/registry.js` — `sudo: true` for Windows registry

**Remediation (partial):**

- Implement a command allowlist for system setup operations
- Add user confirmation dialogs for `sudo` operations
- Log all executed commands to an audit log
- Consider sandboxing via containers or `seccomp` for untrusted scripts

---

### 5. `child_process.exec()` with unsanitized input — `kernel/util.js`

```javascript
// kernel/util.js - multiple occurrences
child_process.exec(command); // Lines 415, 432, 462, 479, 502, 539
```

**Risk:** `child_process.exec()` spawns a shell and is vulnerable to command injection if `command` contains user input. Multiple calls in `util.js` are used for opening files/folders in the OS, which may include user-controlled paths.

**Remediation:**

```javascript
// Use execFile instead of exec (avoids shell interpretation)
const { execFile } = require("child_process");
execFile(program, [argument], callback);
```

**Files:** `kernel/util.js` (lines 415, 432, 462, 479, 502, 539)

---

## 🟠 HIGH — No Authentication on API Endpoints

### 6. Express Server Has No Auth Middleware

The Express app at `server/index.js` has **zero authentication** on any route. All endpoints are publicly accessible to anyone who can reach the port:

- `GET /tools` — System tools and installed packages
- `POST /pinokio/api` — Execute arbitrary API calls
- `GET /asset/*` — Browse the entire Pinokio home directory
- `GET /files/*` — Browse and download any file
- WebSocket — Full terminal access, shell execution

**Risk:** On a shared network or when port-forwarded, anyone can:

- Execute arbitrary commands on the host
- Browse the file system
- Install/uninstall applications
- Access API keys and environment variables

**Remediation:**

```javascript
// Add auth middleware before routes
const authMiddleware = (req, res, next) => {
  // Skip for health checks
  if (req.path === "/health") return next();

  const token = req.headers["x-pinokio-token"] || req.query.token;
  if (!token || token !== process.env.PINOKIO_API_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
};

// Apply to all API routes
this.app.use("/pinokio", authMiddleware);
```

**Files:** `server/index.js` — needs new middleware

---

## 🟠 HIGH — WebSocket Security

### 7. No WebSocket Authentication — `server/socket.js`

WebSocket connections are accepted without authentication:

```javascript
const wss = new WebSocket.Server({ server: this.parent.server });
wss.on("connection", (ws, req) => {
  // No auth check here
  // Any connected client can:
  //   - Subscribe to terminal output
  //   - Send input to shells
  //   - Execute API methods
});
```

**Risk:** Any client that can connect to the WebSocket can:

- Watch all terminal output (may contain secrets, API keys, passwords)
- Type commands into active shells
- Trigger script execution

**Remediation:**

- Validate a session token or API key on WebSocket `connection` event
- Reject connections without valid credentials
- Consider using `wss://` (WebSocket over TLS) when HTTPS is active

**Files:** `server/socket.js`

---

## 🟠 HIGH — Path Traversal

### 8. File Serving with Traversal Risk — `server/index.js`

```javascript
// Serves the entire PINOKIO_HOME directory
let serve = express.static(this.kernel.homedir, { fallthrough: true })
this.app.use('/asset', serve, serveIndex(...))
this.app.use('/files', serve2, serveIndex(...))
```

**Risk:** While `express.static` has some built-in protections, the `serveIndex` middleware combined with no auth means the entire Pinokio home directory is browsable, including:

- `ENVIRONMENT` files (contain API keys, tokens)
- `.git` directories (commit history, credentials)
- Cache directories (model files, downloaded content)

**Partial mitigation exists:** `server/routes/files.js` has `sanitizeSegments()` which strips `..` and absolute paths. However, the `/asset` route uses raw `express.static` without this protection.

**Remediation:**

- Add authentication to `/asset` and `/files` routes
- Implement a file access allowlist
- Never serve `ENVIRONMENT` files or `.git` directories via HTTP

**Files:** `server/index.js` (lines ~4409-4436), `server/routes/files.js`

---

## 🟠 HIGH — Sudo Execution

### 9. Elevated Privilege Operations — `kernel/shell.js`, `kernel/bin/*.js`

```javascript
// kernel/shell.js:365-385
if (params.sudo) {
  // Executes command with elevated privileges using sudo-prompt
  sudo.exec(params.message, options, (err, stdout, stderr) => { ... })
}
```

Used in:

- `kernel/bin/vs.js` — Visual Studio Build Tools installation
- `kernel/bin/brew.js` — Xcode CLT removal (`rm -rf /Library/Developer/CommandLineTools`)
- `kernel/bin/registry.js` — Windows registry modifications

**Risk:** No user confirmation dialog — the script can silently request admin/root access. If the OS UAC prompt is auto-approved (enterprise settings), arbitrary code runs as admin.

**Remediation:**

- Always show a confirmation dialog before sudo operations
- Log all sudo commands to an audit file
- Implement a sudo command allowlist

**Files:** `kernel/shell.js`, `kernel/bin/vs.js`, `kernel/bin/brew.js`, `kernel/bin/registry.js`

---

## 🟡 MEDIUM — XSS via EJS Templates

### 10. Unescaped Output in EJS Templates — `server/views/*.ejs`

EJS uses `<%= ... %>` for escaped output and `<%- ... %>` for **unescaped** (raw HTML) output. Multiple templates use `<%- ... %>` extensively:

```ejs
<!-- server/views/bookmarklet.ejs -->
<a href="<%- bookmarkletHref %>">Pinokio Create</a>

<!-- server/views/agents.ejs -->
<script type="application/json" id="plugin-data"><%- JSON.stringify(serializedPlugins) %></script>

<!-- server/views/app.ejs -->
var workspace = <%- JSON.stringify(name || "") %>

<!-- server/views/registry_checkin.ejs -->
const data = <%- dataJson %>;

<!-- server/views/net.ejs -->
const dnsCwd = "<%- typeof cwd !== 'undefined' ? JSON.stringify(cwd).slice(1, -1) : '' %>"
```

**Risk:** If any server-side variable contains user-controlled content (e.g., app names from `pinokio.json`, git commit messages, file names), it can inject arbitrary HTML/JavaScript into the page.

**Most concerning patterns:**

- `<%- dataJson %>` — If `dataJson` isn't properly serialized, script injection is possible
- `<%- bookmarkletHref %>` — If the href can be manipulated
- `<%- JSON.stringify(name) %>` — `JSON.stringify` is generally safe but can break out of `<script>` tags if the string contains `</script>`

**Remediation:**

```ejs
<!-- Use escaped output where possible -->
<%= variable %>

<!-- For JSON in script tags, use a safe serializer -->
<script type="application/json">
  <%- JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') %>
</script>
```

**Files:** `server/views/bookmarklet.ejs`, `server/views/agents.ejs`, `server/views/app.ejs`, `server/views/registry_checkin.ejs`, `server/views/net.ejs`, `server/views/checkpoints.ejs`, and more.

---

## 🟡 MEDIUM — Missing Security Headers

### 11. No Helmet / CSP / Security Headers

The Express app does not use:

- **`helmet`** — Standard security header middleware
- **Content-Security-Policy (CSP)** — Prevents XSS and data injection
- **X-Frame-Options** — Prevents clickjacking
- **X-Content-Type-Options** — Prevents MIME-sniffing attacks
- **Strict-Transport-Security** — Forces HTTPS

**Remediation:**

```bash
npm install helmet
```

```javascript
const helmet = require("helmet");
this.app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // needed for EJS inline scripts
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws://localhost:*", "wss://localhost:*"],
      },
    },
  }),
);
```

**Files:** `server/index.js` — needs new dependency and middleware

---

## 🟡 MEDIUM — No Rate Limiting

### 12. No Rate Limiting on Any Endpoint

There is no rate limiting on:

- Login/passcode attempts (`pipe/index.js`)
- API endpoints (`server/index.js`)
- WebSocket connections (`server/socket.js`)
- File uploads (`multer` endpoints)

**Risk:** Brute-force attacks on passcodes, DoS via rapid API calls, resource exhaustion via file uploads.

**Remediation:**

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require("express-rate-limit");
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit per IP
  standardHeaders: true,
  legacyHeaders: false,
});
this.app.use("/pinokio", limiter);
```

**Files:** `server/index.js`, `pipe/index.js`

---

## 🟡 MEDIUM — Dynamic Module Loading

### 13. `clear-module` and Dynamic `require()` — `kernel/loader.js`

```javascript
const clearModule = require("clear-module");
// Used to clear cached modules and re-require them
```

**Risk:** If any module path is derived from user input, this could be used to load and execute arbitrary JavaScript files.

**Files:** `kernel/loader.js`

---

## 🟢 LOW — Information Disclosure

### 14. Verbose Error Messages

Error messages in multiple places expose internal paths and stack traces:

```javascript
console.log("getPlugin ERROR", e); // server/index.js
res.status(404).send(e.message); // Various routes
```

**Remediation:** In production, return generic error messages and log details server-side only.

### 15. Directory Listing Enabled

`serveIndex` middleware is enabled for `/asset` and `/files` routes, allowing full directory browsing.

### 16. Process Environment Exposure

The `ENVIRONMENT` file for each app contains sensitive variables (API keys, model tokens). These are readable through the file serving routes.

---

## 🔵 INFORMATIONAL — Defense-in-Depth Opportunities

### 17. Cookie Security Flags

Neither session middleware sets `httpOnly`, `secure`, or `sameSite` cookie flags. Add them:

```javascript
cookie: {
  httpOnly: true,      // Prevent XSS cookie theft
  secure: isHTTPS,     // Only send over HTTPS
  sameSite: 'lax',     // Prevent CSRF
  maxAge: 86400000     // 24h expiry
}
```

### 18. Input Validation

No schema validation library (e.g., `joi`, `zod`, `ajv`) is used. All request bodies and query parameters are trusted as-is.

### 19. Dependency Audit

Run regular dependency audits:

```bash
npm audit
npm audit fix
```

The project has ~70 dependencies — many are likely outdated and may have known CVEs.

### 20. Logging & Audit Trail

No structured audit logging exists for:

- Shell commands executed
- Files accessed/modified
- Apps installed/uninstalled
- Authentication attempts
- Sudo operations

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

---

## Priority Remediation Order

1. **🔴 Hardcoded session secrets** — Quick fix, high impact
2. **🔴 CORS `origin: '*'`** — Quick fix, prevents cross-origin attacks
3. **🟠 API authentication** — Medium effort, prevents unauthorized access
4. **🟠 WebSocket authentication** — Medium effort, prevents shell hijacking
5. **🟡 Security headers (helmet)** — Quick fix, defense-in-depth
6. **🟡 Rate limiting** — Quick fix, prevents brute-force
7. **🟡 XSS in EJS templates** — Ongoing effort, template-by-template
8. **🟠 Path traversal hardening** — Medium effort, restrict file access
9. **🔴 Command injection hardening** — Long-term, requires architecture changes
10. **🟢 Audit logging** — Medium effort, enables incident response
