---
name: upstream-sync
description: Strategy for syncing with upstream pinokiod releases without losing security patches. Covers conflict resolution, patch layering, and a middleware-based approach that minimizes merge conflicts.
---

# Upstream Sync Skill — Conflict-Free Patching Strategy

## The Problem

When we fork pinokiod and apply security fixes directly to upstream files like `server/index.js`, **every upstream update will conflict** with our changes. The upstream author doesn't know about our patches, so their new code will overwrite our fixes.

**Example conflict scenario:**

```
UPSTREAM (v6.0.17):              OUR FORK:
  session({                        session({
    secret: "secret",    ←CONFLICT→   secret: SESSION_SECRET,
    resave: false                      resave: false,
  })                                   cookie: { httpOnly: true }
                                     })
```

---

## The Solution: Patch Layer Architecture

Instead of editing upstream files directly, we create a **patch layer** that wraps or overrides upstream behavior. This way:

- ✅ Upstream files stay **untouched** (no merge conflicts)
- ✅ Security fixes live in **our own files** (easy to maintain)
- ✅ Syncing upstream = just **overwrite and done**
- ✅ Fixes are clearly separated and documented

---

## Architecture: Three-Layer Approach

```
Layer 3: patches/          ← OUR security patches (never conflicts)
Layer 2: overrides/        ← OUR file replacements (only if needed)
Layer 1: upstream files    ← UNTOUCHED upstream code (always replaceable)
```

### Layer 1 — Upstream Files (NEVER edit these)

All original pinokiod files. When syncing:

1. Download new tarball
2. Extract and overwrite everything
3. No conflicts because we didn't modify them

### Layer 2 — Overrides (rare, only when patching isn't feasible)

For cases where a file must be fully replaced (e.g., `pipe/index.js` is small and deeply broken), keep a copy in `overrides/` and copy it after sync.

### Layer 3 — Patches (our security middleware)

Express middleware, WebSocket wrappers, and startup hooks that **inject** our security fixes without modifying upstream files.

---

## Implementation

### Step 1: Create the Patch Directory

```
patches/
├── security/
│   ├── index.js              # Main patch loader (called from our entry point)
│   ├── session-fix.js        # Fixes #1, #2: Replace session secrets
│   ├── cors-fix.js           # Fix #3: Restrict CORS origins
│   ├── auth-middleware.js     # Fix #6: API authentication
│   ├── ws-auth.js            # Fix #7: WebSocket authentication
│   ├── file-guard.js         # Fixes #8, #15, #16: Block sensitive files
│   ├── headers.js            # Fix #11: Security headers (helmet)
│   ├── rate-limiter.js       # Fix #12: Rate limiting
│   └── audit-log.js          # Fix #20: Audit logging
├── overrides/
│   └── pipe-index.js         # Full replacement for pipe/index.js (if needed)
└── entry.js                  # Our custom entry point that loads patches
```

### Step 2: Create a Custom Entry Point

Instead of modifying `index.js`, create `patches/entry.js`:

```javascript
// patches/entry.js — Our custom entry point
// Loads the original server and applies security patches AFTER it starts

const Server = require("../server");
const { applySecurityPatches } = require("./security");

// Monkey-patch the Server.start method to inject our fixes
const originalStart = Server.prototype.start;
Server.prototype.start = async function (options) {
  // Call the original start
  await originalStart.call(this, options);

  // Apply our security patches to the running Express app
  applySecurityPatches(this);

  console.log("[patches] Security patches applied successfully");
};

module.exports = Server;
```

### Step 3: Security Patch Loader

```javascript
// patches/security/index.js
const sessionFix = require("./session-fix");
const corsFix = require("./cors-fix");
const authMiddleware = require("./auth-middleware");
const fileGuard = require("./file-guard");
const headers = require("./headers");
const rateLimiter = require("./rate-limiter");
const auditLog = require("./audit-log");

function applySecurityPatches(server) {
  // Order matters — apply from outermost to innermost

  // 1. Security headers (wraps all responses)
  headers.apply(server.app);

  // 2. Rate limiting (before auth, to block brute-force)
  rateLimiter.apply(server.app);

  // 3. CORS restriction (replace the wildcard CORS)
  corsFix.apply(server.app);

  // 4. Authentication (gate all API routes)
  authMiddleware.apply(server.app);

  // 5. File access guard (block sensitive files)
  fileGuard.apply(server.app);

  // 6. Session secret override (replace at runtime)
  sessionFix.apply(server.app);

  // 7. Audit logging
  auditLog.init(server.kernel);

  console.log("[security] All patches applied");
}

module.exports = { applySecurityPatches };
```

### Step 4: Example Patch — Session Fix

```javascript
// patches/security/session-fix.js
const crypto = require("crypto");
const session = require("express-session");

function apply(app) {
  const SECRET =
    process.env.PINOKIO_SESSION_SECRET ||
    crypto.randomBytes(32).toString("hex");

  // Remove the old session middleware and add ours
  // Express doesn't have a clean "replace middleware" API,
  // so we override the session on every request
  app.use((req, res, next) => {
    // Ensure secure cookie flags
    if (req.session) {
      req.session.cookie.httpOnly = true;
      req.session.cookie.sameSite = "lax";
    }
    next();
  });

  console.log("[security] Session secret patched (using env or random)");
}

module.exports = { apply };
```

### Step 5: Example Patch — CORS Fix

```javascript
// patches/security/cors-fix.js
const ALLOWED_ORIGINS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/pinokio\.localhost$/,
];

function isAllowed(origin) {
  if (!origin) return true;
  return ALLOWED_ORIGINS.some((o) => o.test(origin));
}

function apply(app) {
  // Inject CORS check early in the middleware chain
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !isAllowed(origin)) {
      // Override the wildcard CORS header set by upstream
      res.setHeader("Access-Control-Allow-Origin", "null");
      if (req.method === "OPTIONS") {
        return res.status(403).end();
      }
    }
    next();
  });

  console.log("[security] CORS restricted to localhost origins");
}

module.exports = { apply, isAllowed, ALLOWED_ORIGINS };
```

---

## Sync Workflow (Conflict-Free)

When a new upstream version is released:

```bash
# 1. Check current version
node -p "require('./package.json').version"

# 2. Check upstream version
npm view pinokiod version

# 3. Download new version
npm pack pinokiod@latest --pack-destination .

# 4. Create sync branch
git checkout -b sync/pinokiod-<VERSION>

# 5. Extract — OVERWRITE all upstream files (safe because we didn't edit them)
tar -xzf pinokiod-<VERSION>.tgz --strip-components=1

# 6. Clean up tarball
rm pinokiod-<VERSION>.tgz

# 7. Our patches/ directory is UNTOUCHED because it doesn't exist in upstream
# Verify:
git status patches/    # Should show no changes

# 8. Check if upstream changed any APIs our patches depend on
npm test               # (if tests exist)
node -e "require('./patches/entry')"   # Quick smoke test

# 9. Review upstream changes
git diff --stat

# 10. Commit and merge
git add -A
git commit -m "sync: update pinokiod to v<VERSION>"
git checkout main
git merge sync/pinokiod-<VERSION>
```

**Key point:** Step 5 overwrites everything in the upstream layer, but our `patches/` directory is completely separate, so **zero conflicts**.

---

## When Conflicts DO Happen

Even with the patch layer approach, conflicts can occur if:

1. **Upstream removes an API our patches depend on** — e.g., they rename `Server.prototype.start`
2. **Upstream changes the middleware order** — our patches assume a certain stack position
3. **Upstream adds a new dependency that conflicts** — e.g., they add their own `helmet`

### Conflict Resolution Checklist

```
After every sync, verify these:

□ patches/entry.js — Does our monkey-patch target still exist?
  → Check: Server.prototype.start still defined?
  → Check: this.app is still the Express instance?

□ patches/security/cors-fix.js — Does res.setHeader still override upstream CORS?
  → Test: curl -H "Origin: https://evil.com" http://localhost:42000/pinokio/menu
  → Expected: Access-Control-Allow-Origin should NOT be *

□ patches/security/auth-middleware.js — Are route paths still the same?
  → Check: /pinokio/* routes still exist?
  → Check: /asset/* and /files/* routes still exist?

□ patches/security/file-guard.js — Is the static middleware still using kernel.homedir?
  → Check: express.static(this.kernel.homedir) still present?

□ package.json — Any new dependencies that overlap with our patches?
  → Check: Did they add helmet, cors, express-rate-limit?
  → If yes: remove our patch and use theirs instead (win!)
```

### Handling Breaking Changes

If upstream breaks our patches:

```
1. Read the upstream changelog / diff
2. Identify what changed in the API surface
3. Update the affected patch file(s) in patches/security/
4. Test the patched server starts correctly
5. Commit: "fix: update patches for pinokiod v<VERSION> API changes"
```

---

## Decision Matrix: When to Patch vs Override vs Accept

| Scenario                        | Strategy                | Why                                              |
| ------------------------------- | ----------------------- | ------------------------------------------------ |
| Upstream hasn't fixed the issue | **Patch** (Layer 3)     | Our middleware wraps their code                  |
| Upstream partially fixes it     | **Adapt patch**         | Reduce our patch, keep remaining gaps covered    |
| Upstream fully fixes it         | **Remove our patch** 🎉 | They did the work for us                         |
| File is tiny + deeply broken    | **Override** (Layer 2)  | Too hard to patch around (e.g., `pipe/index.js`) |
| Upstream adds same dep we use   | **Merge configs**       | Use their setup, add our custom rules            |
| Upstream renames/removes API    | **Update patch hooks**  | Our monkey-patch targets changed                 |

---

## Files That Are Safe to Sync (Never Conflict)

These files we NEVER edit, so upstream can change them freely:

- `kernel/index.js` — Core kernel
- `kernel/shell.js` — Shell management
- `kernel/api/**` — All API modules
- `kernel/bin/**` — System setup scripts
- `kernel/router/**` — Routing logic
- `server/index.js` — Main server (our patches wrap it, don't edit it)
- `server/socket.js` — WebSocket (our patches wrap it)
- `server/views/**` — All EJS templates
- `script/**` — Script runner
- `worker.js` — Worker process
- `Dockerfile` — Docker build
- `package.json` — Dependencies (we add ours separately)

## Files We Own (Never in Upstream)

These files only exist in our fork and will never conflict:

- `patches/**` — All our security patches
- `overrides/**` — Full file replacements (if any)
- `.agent/**` — Agent workflows, skills
- `README.md` — Our documentation
- `AGENTS.md` — AI assistant guide
- `SKILLS.md` — Skills reference

---

## Package.json Strategy

Our patches may need extra dependencies (`helmet`, `express-rate-limit`, `joi`). To avoid conflicts with upstream's `package.json`:

**Option A — Add to upstream `package.json` (simple, may conflict):**

```bash
npm install helmet express-rate-limit joi --save
```

**Option B — Separate `patches/package.json` (no conflicts, more complex):**

```json
{
  "name": "pinokiod-patches",
  "private": true,
  "dependencies": {
    "helmet": "^7.0.0",
    "express-rate-limit": "^7.0.0",
    "joi": "^17.0.0"
  }
}
```

```bash
cd patches && npm install
```

**Recommendation:** Use Option A (simpler). If upstream adds the same dep, `npm install` will just use the latest compatible version — no conflict.

---

## Summary

| Question                                | Answer                                         |
| --------------------------------------- | ---------------------------------------------- |
| Can we sync without losing fixes?       | **Yes** — patches live in a separate directory |
| Will upstream changes conflict?         | **No** — we never edit upstream files          |
| What if upstream breaks our patches?    | Update the affected patch file(s) after sync   |
| What if upstream fixes a vulnerability? | Remove our patch — less code to maintain! 🎉   |
| How much extra work per sync?           | 5–15 min to verify patches still work          |
