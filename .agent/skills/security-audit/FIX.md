# Security Fixes — Pinokiod

This document contains **remediation code and instructions** for each finding in the [Security Scan Report (SKILL.md)](./SKILL.md). Each fix is numbered to match the corresponding finding.

---

## 🔴 CRITICAL Fixes

### 1. Fix Session Secret — `server/index.js:4446`

**Current (vulnerable):**

```javascript
this.app.use(
  session({
    secret: "secret",
    resave: false,
    saveUninitialized: false,
  }),
);
```

**Fixed:**

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

**Steps:**

1. Open `server/index.js`
2. Find line ~4446 containing `secret: "secret"`
3. Replace with the code above
4. This also fixes Finding #17 (cookie security flags)

---

### 2. Fix Pipe Session Secret — `pipe/index.js:34`

**Current (vulnerable):**

```javascript
app.use(
  session({
    secret: "oikonip",
    resave: false,
    saveUninitialized: false,
  }),
);
```

**Fixed:**

```javascript
const crypto = require("crypto");
const PIPE_SECRET =
  process.env.PINOKIO_PIPE_SECRET || crypto.randomBytes(32).toString("hex");
app.use(
  session({
    secret: PIPE_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 12 * 60 * 60 * 1000, // 12 hours
    },
  }),
);
```

**Steps:**

1. Open `pipe/index.js`
2. Find line ~34 containing `secret: 'oikonip'`
3. Replace with the code above

---

### 3. Fix CORS `origin: '*'` — Multiple Files

**Shared helper (create `kernel/cors.js`):**

```javascript
const ALLOWED_ORIGINS = [
  "http://localhost:42000",
  "https://pinokio.localhost",
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/localhost(:\d+)?$/,
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // same-origin requests have no origin header
  return ALLOWED_ORIGINS.some((o) =>
    o instanceof RegExp ? o.test(origin) : o === origin,
  );
}

module.exports = { ALLOWED_ORIGINS, isAllowedOrigin };
```

**Fix `server/index.js` (line ~4376):**

```javascript
const { ALLOWED_ORIGINS } = require("../kernel/cors");

this.app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = ALLOWED_ORIGINS.some((o) =>
        o instanceof RegExp ? o.test(origin) : o === origin,
      );
      callback(null, allowed);
    },
    credentials: true,
  }),
);
```

**Fix `pipe/index.js` (line ~28):**

```javascript
const { ALLOWED_ORIGINS } = require("../kernel/cors");

app.use(
  cors({
    origin: (origin, callback) => {
      // For shared apps, also allow the Cloudflare tunnel origin
      if (!origin) return callback(null, true);
      const allowed = ALLOWED_ORIGINS.some((o) =>
        o instanceof RegExp ? o.test(origin) : o === origin,
      );
      callback(null, allowed);
    },
  }),
);
```

**Fix router files (`kernel/router/*.js`):**

Replace all instances of:

```javascript
"Access-Control-Allow-Origin": ["*"],
```

With:

```javascript
"Access-Control-Allow-Origin": [origin || "*"],  // reflect requested origin
```

**Files to update:**

- `kernel/router/common.js` (line 25)
- `kernel/router/connector.js` (lines 32, 76)
- `kernel/router/localhost_home_router.js` (lines 36, 69)
- `kernel/router/pinokio_domain_router.js` (line 61)
- `kernel/router/rewriter.js` (line 26)

**Fix `server/socket.js` (line 277):**
Replace:

```javascript
headers.push("Access-Control-Allow-Origin: *");
```

With:

```javascript
const { isAllowedOrigin } = require("../kernel/cors");
const reqOrigin = req.headers.origin;
if (isAllowedOrigin(reqOrigin)) {
  headers.push(`Access-Control-Allow-Origin: ${reqOrigin || "*"}`);
}
```

---

### 4. Harden Shell Command Execution — `kernel/shell.js`

> ⚠️ This is an **architecture-level** fix that requires careful planning. The shell system is core to Pinokio's functionality.

**Phase 1 — Audit Logging (immediate, low risk):**

```javascript
// Add to kernel/shell.js, in the exec() method before spawning
const auditLog = require('./audit-log')  // create this module

async exec(params) {
  // Log every command
  auditLog.log({
    type: 'shell.exec',
    command: params.message,
    cwd: params.path,
    sudo: !!params.sudo,
    timestamp: new Date().toISOString(),
    source: params._source || 'unknown'  // track where the command came from
  })

  // ... existing exec code ...
}
```

**Phase 2 — Command Allowlist for System Setup (medium effort):**

```javascript
// kernel/bin/sudo-allowlist.js
const ALLOWED_SUDO_COMMANDS = [
  /^icacls\s/, // Windows permissions
  /^reg\s/, // Windows registry
  /^rm -rf \/Library\/Developer\//, // Xcode CLT removal
  /^xcode-select\s/, // Xcode tools
];

function isSudoAllowed(command) {
  return ALLOWED_SUDO_COMMANDS.some((pattern) => pattern.test(command));
}

module.exports = { isSudoAllowed };
```

**Phase 3 — Sandboxing (long-term):**

- Run untrusted scripts in Docker containers
- Use `seccomp` profiles to restrict kernel syscalls
- Implement a script review/approval workflow

---

### 5. Fix `child_process.exec()` Usage — `kernel/util.js`

Replace each `child_process.exec(command)` with the safer `execFile`:

**Current (lines 415, 432, 462, 479, 502, 539):**

```javascript
child_process.exec(command);
```

**Fixed examples:**

```javascript
// For opening files/URLs (platform-specific)
const { execFile } = require("child_process");

// Windows
execFile("cmd", ["/c", "start", "", filePath]);

// macOS
execFile("open", [filePath]);

// Linux
execFile("xdg-open", [filePath]);
```

**Important:** `execFile` does NOT spawn a shell, so shell metacharacters (`;`, `&&`, `|`, etc.) won't be interpreted. This prevents injection.

---

## 🟠 HIGH Fixes

### 6. Add API Authentication — `server/index.js`

**Create `server/auth.js`:**

```javascript
const crypto = require("crypto");

// Generate or load API token
let API_TOKEN = process.env.PINOKIO_API_TOKEN;
if (!API_TOKEN) {
  // Auto-generate and save to ENVIRONMENT
  API_TOKEN = crypto.randomBytes(24).toString("hex");
  console.log(`[Auth] Generated API token: ${API_TOKEN}`);
}

function authMiddleware(req, res, next) {
  // Allow health checks and static assets
  const publicPaths = ["/health", "/sound/", "/pinokio-black.png"];
  if (publicPaths.some((p) => req.path.startsWith(p))) return next();

  // Check for Electron app (trusted)
  if (req.agent === "electron") return next();

  // Check token in header or query
  const token =
    req.headers["x-pinokio-token"] ||
    req.query.token ||
    req.session?.authenticated;
  if (token === API_TOKEN) return next();

  // Check session (for browser-based login)
  if (req.session && req.session.authenticated) return next();

  return res.status(401).json({ error: "Unauthorized" });
}

module.exports = { authMiddleware, API_TOKEN };
```

**Add to `server/index.js` after session middleware:**

```javascript
const { authMiddleware } = require("./auth");

// Apply to API routes
this.app.use("/pinokio", authMiddleware);
this.app.use("/api", authMiddleware);
```

---

### 7. Add WebSocket Authentication — `server/socket.js`

**Add to the `connection` event handler:**

```javascript
const { API_TOKEN } = require("./auth");
const url = require("url");

wss.on("connection", (ws, req) => {
  // Parse token from query string: ws://localhost:42000?token=xxx
  const params = url.parse(req.url, true).query;
  const token = params.token;

  // Check Electron user-agent
  const userAgent = req.headers["user-agent"] || "";
  const isElectron = userAgent.includes("Pinokio");

  if (!isElectron && token !== API_TOKEN) {
    ws.close(4001, "Unauthorized");
    return;
  }

  // ... rest of existing connection handler ...
});
```

---

### 8. Harden File Serving Routes — `server/index.js`

**Add blocked-path middleware before `/asset` and `/files` routes:**

```javascript
const BLOCKED_PATTERNS = [
  /ENVIRONMENT$/,           // Environment variable files
  /\.git\//,                // Git directories
  /\.env$/,                 // Dotenv files
  /\.ssh\//,                // SSH keys
  /node_modules\//,         // Dependencies
  /\.pinokio-secret/,       // Secret files
]

function blockSensitiveFiles(req, res, next) {
  const decodedPath = decodeURIComponent(req.path)
  if (BLOCKED_PATTERNS.some(pattern => pattern.test(decodedPath))) {
    return res.status(403).json({ error: 'Access denied' })
  }
  next()
}

// Apply before serve routes
this.app.use('/asset', blockSensitiveFiles, serve, serveIndex(...))
this.app.use('/files', blockSensitiveFiles, serve2, serveIndex(...))
```

---

### 9. Add Sudo Confirmation — `kernel/shell.js`

**Add confirmation gate before sudo execution:**

```javascript
if (params.sudo) {
  // Log the sudo request
  console.log(`[SECURITY] Sudo requested: ${params.message}`)

  // Check against allowlist
  const { isSudoAllowed } = require('../kernel/bin/sudo-allowlist')
  if (!isSudoAllowed(params.message)) {
    throw new Error(`Sudo command not in allowlist: ${params.message}`)
  }

  // Existing sudo.exec code...
  sudo.exec(params.message, options, (err, stdout, stderr) => { ... })
}
```

---

## 🟡 MEDIUM Fixes

### 10. Fix XSS in EJS Templates — `server/views/*.ejs`

**Rule of thumb:**

- Use `<%= %>` (escaped) for ALL user-visible content
- Use `<%- %>` (raw) ONLY for trusted HTML (includes, partials)
- For JSON in `<script>` tags, sanitize `</script>`:

```ejs
<!-- SAFE: JSON in script tags -->
<script type="application/json" id="data">
  <%- JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e') %>
</script>

<!-- SAFE: Safe JSON helper (add to server) -->
<script>
  var workspace = <%- safeJson(name || "") %>
</script>
```

**Add `safeJson` helper to Express:**

```javascript
this.app.locals.safeJson = function (obj) {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/'/g, "\\u0027");
};
```

**Priority templates to fix:**

1. `server/views/registry_checkin.ejs` — `<%- dataJson %>` (highest risk)
2. `server/views/bookmarklet.ejs` — `<%- bookmarkletHref %>`
3. `server/views/net.ejs` — `<%- JSON.stringify(cwd) %>`

---

### 11. Add Security Headers — `server/index.js`

**Install:**

```bash
npm install helmet
```

**Add near the top of the middleware chain:**

```javascript
const helmet = require("helmet");
this.app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // EJS inline scripts + Ace editor
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws://localhost:*", "wss://localhost:*"],
        fontSrc: ["'self'", "data:"],
      },
    },
    crossOriginEmbedderPolicy: false, // needed for proxied app iframes
  }),
);
```

---

### 12. Add Rate Limiting — `server/index.js`, `pipe/index.js`

**Install:**

```bash
npm install express-rate-limit
```

**Add to `server/index.js`:**

```javascript
const rateLimit = require("express-rate-limit");

// General API limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, try again later" },
});
this.app.use("/pinokio", apiLimiter);

// Strict limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // 10 attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
});
```

**Add to `pipe/index.js` (passcode login):**

```javascript
const rateLimit = require('express-rate-limit')
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,                     // 5 passcode attempts per 15 min
  message: 'Too many login attempts, try again later',
})
app.post('/login', loginLimiter, (req, res) => { ... })
```

---

### 13. Harden Dynamic Module Loading — `kernel/loader.js`

**Add path validation before any dynamic `require()`:**

```javascript
const path = require("path");

function safeRequire(modulePath, allowedRoot) {
  const resolved = path.resolve(modulePath);
  if (!resolved.startsWith(allowedRoot)) {
    throw new Error(`Module path outside allowed root: ${resolved}`);
  }
  clearModule(resolved);
  return require(resolved);
}
```

---

## 🟢 LOW Fixes

### 14. Fix Verbose Error Messages

**Replace in production:**

```javascript
// Instead of:
res.status(500).send(e.message);

// Use:
if (process.env.NODE_ENV === "production") {
  res.status(500).json({ error: "Internal server error" });
} else {
  res.status(500).json({ error: e.message, stack: e.stack });
}
```

### 15. Disable Directory Listing

**Remove `serveIndex` from routes or add auth:**

```javascript
// Option A: Remove directory listing entirely
this.app.use('/asset', serve)  // no serveIndex

// Option B: Keep but require auth
this.app.use('/asset', authMiddleware, serve, serveIndex(...))
```

### 16. Block ENVIRONMENT File Exposure

Already handled by Fix #8 (sensitive file blocking middleware). The `BLOCKED_PATTERNS` array includes `/ENVIRONMENT$/`.

---

## 🔵 INFORMATIONAL Fixes

### 17. Add Cookie Security Flags

Already handled by Fix #1 and Fix #2. The cookie configuration includes:

```javascript
cookie: {
  httpOnly: true,
  secure: process.env.PINOKIO_HTTPS_ACTIVE === '1',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000
}
```

### 18. Add Input Validation

**Install:**

```bash
npm install joi
```

**Example usage for API endpoints:**

```javascript
const Joi = require("joi");

const installSchema = Joi.object({
  url: Joi.string().uri().required(),
  name: Joi.string().alphanum().max(100),
  branch: Joi.string().max(50),
});

app.post("/pinokio/install", (req, res) => {
  const { error, value } = installSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  // ... proceed with validated input
});
```

### 19. Run Dependency Audit

```bash
# Check for known vulnerabilities
npm audit

# Auto-fix where possible
npm audit fix

# Force fix (may include breaking changes)
npm audit fix --force

# Generate detailed report
npm audit --json > audit-report.json
```

**Add to CI/CD:**

```bash
# Fail build if critical vulnerabilities found
npm audit --audit-level=critical
```

### 20. Add Audit Logging

**Create `kernel/audit-log.js`:**

```javascript
const fs = require("fs");
const path = require("path");

class AuditLog {
  constructor(logDir) {
    this.logDir = logDir;
    this.stream = null;
  }

  init(logDir) {
    this.logDir = logDir;
    const logFile = path.resolve(logDir, "security-audit.log");
    fs.mkdirSync(logDir, { recursive: true });
    this.stream = fs.createWriteStream(logFile, { flags: "a" });
  }

  log(entry) {
    if (!this.stream) return;
    const line = JSON.stringify({
      ...entry,
      timestamp: new Date().toISOString(),
    });
    this.stream.write(line + "\n");
  }
}

module.exports = new AuditLog();
```

**Usage:**

```javascript
const auditLog = require("./audit-log");
auditLog.init(path.resolve(homedir, "logs"));

// Log shell commands
auditLog.log({ type: "shell.exec", command: message, sudo: false });

// Log file access
auditLog.log({ type: "file.access", path: filePath, method: req.method });

// Log auth attempts
auditLog.log({ type: "auth.attempt", ip: req.ip, success: false });
```
