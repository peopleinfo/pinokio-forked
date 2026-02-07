#!/usr/bin/env node
/**
 * security-scan.js — Live security scan for pinokiod codebase
 *
 * Checks each known vulnerability and reports current status + score.
 * Usage: node scripts/security-scan.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function readFile(relPath) {
  try {
    return fs.readFileSync(path.resolve(ROOT, relPath), "utf8");
  } catch {
    return null;
  }
}

function fileContains(relPath, pattern) {
  const content = readFile(relPath);
  if (!content) return false;
  if (pattern instanceof RegExp) return pattern.test(content);
  return content.includes(pattern);
}

function countOccurrences(relPath, pattern) {
  const content = readFile(relPath);
  if (!content) return 0;
  if (pattern instanceof RegExp) {
    const matches = content.match(
      new RegExp(
        pattern.source,
        pattern.flags + (pattern.flags.includes("g") ? "" : "g"),
      ),
    );
    return matches ? matches.length : 0;
  }
  return content.split(pattern).length - 1;
}

// ─── Define all checks ───────────────────────────────────────────
const findings = [
  {
    id: 1,
    name: 'Hardcoded session secret "secret"',
    severity: "CRITICAL",
    exploitability: 9,
    impact: 7,
    weight: 3,
    category: "Secrets & Crypto",
    check: () => {
      const has =
        fileContains("server/index.js", `secret: "secret"`) ||
        fileContains("server/index.js", `secret: 'secret'`);
      return {
        fixed: !has,
        detail: has
          ? 'Found: secret: "secret" in server/index.js'
          : "No hardcoded secret found",
      };
    },
  },
  {
    id: 2,
    name: 'Hardcoded pipe secret "oikonip"',
    severity: "CRITICAL",
    exploitability: 9,
    impact: 7,
    weight: 3,
    category: "Secrets & Crypto",
    check: () => {
      const has =
        fileContains("pipe/index.js", `secret: 'oikonip'`) ||
        fileContains("pipe/index.js", `secret: "oikonip"`);
      return {
        fixed: !has,
        detail: has
          ? 'Found: secret: "oikonip" in pipe/index.js'
          : "No hardcoded secret found",
      };
    },
  },
  {
    id: 3,
    name: "CORS origin: * (multiple files)",
    severity: "CRITICAL",
    exploitability: 8,
    impact: 9,
    weight: 3,
    category: "Access Control",
    check: () => {
      const files = [
        "server/index.js",
        "pipe/index.js",
        "server/socket.js",
        "kernel/router/common.js",
        "kernel/router/connector.js",
        "kernel/router/localhost_home_router.js",
        "kernel/router/pinokio_domain_router.js",
        "kernel/router/rewriter.js",
      ];
      const affected = files.filter((f) => {
        return (
          fileContains(f, `origin: '*'`) ||
          fileContains(f, `origin: "*"`) ||
          fileContains(f, `Access-Control-Allow-Origin: *`) ||
          fileContains(f, `"Access-Control-Allow-Origin": ["*"]`) ||
          fileContains(f, `'Access-Control-Allow-Origin': ['*']`)
        );
      });
      return {
        fixed: affected.length === 0,
        detail:
          affected.length > 0
            ? `Found wildcard CORS in ${affected.length} files: ${affected.join(", ")}`
            : "No wildcard CORS found",
        partial: affected.length > 0 && affected.length < files.length,
      };
    },
  },
  {
    id: 4,
    name: "Unrestricted shell/PTY execution",
    severity: "CRITICAL",
    exploitability: 6,
    impact: 10,
    weight: 2,
    category: "Injection",
    check: () => {
      const hasWriteDirect =
        fileContains("kernel/shell.js", ".write(message)") ||
        fileContains("kernel/shell.js", ".write(m)");
      const hasAuditLog =
        fileContains("kernel/shell.js", "audit") ||
        fileContains("kernel/shell.js", "auditLog");
      const hasAllowlist =
        fileContains("kernel/shell.js", "allowlist") ||
        fileContains("kernel/shell.js", "whitelist");
      let detail = [];
      if (hasWriteDirect) detail.push("PTY accepts arbitrary commands");
      if (!hasAuditLog) detail.push("No audit logging");
      if (!hasAllowlist) detail.push("No command allowlist");
      const fixed = !hasWriteDirect || (hasAuditLog && hasAllowlist);
      return {
        fixed,
        detail: detail.join("; ") || "Shell execution is hardened",
      };
    },
  },
  {
    id: 5,
    name: "child_process.exec() unsanitized",
    severity: "CRITICAL",
    exploitability: 5,
    impact: 9,
    weight: 2,
    category: "Injection",
    check: () => {
      const count =
        countOccurrences("kernel/util.js", /child_process\.exec\(/g) +
        countOccurrences("kernel/util.js", /exec\(command/g) +
        countOccurrences("kernel/util.js", /execSync\(/g);
      return {
        fixed: count === 0,
        detail:
          count > 0
            ? `Found ${count} exec/execSync calls in kernel/util.js`
            : "No raw exec() calls found",
      };
    },
  },
  {
    id: 6,
    name: "No API endpoint authentication",
    severity: "HIGH",
    exploitability: 8,
    impact: 9,
    weight: 3,
    category: "Access Control",
    check: () => {
      const hasAuthMiddleware =
        fileContains("server/index.js", "authMiddleware") ||
        fileContains("server/index.js", "x-pinokio-token") ||
        fileContains("server/index.js", "PINOKIO_API_TOKEN");
      const hasPatchAuth = fs.existsSync(
        path.resolve(ROOT, "patches/security/auth-middleware.js"),
      );
      return {
        fixed: hasAuthMiddleware || hasPatchAuth,
        detail: hasAuthMiddleware
          ? "Auth middleware found in server"
          : hasPatchAuth
            ? "Auth patch exists in patches/"
            : "No authentication on any API route",
      };
    },
  },
  {
    id: 7,
    name: "No WebSocket authentication",
    severity: "HIGH",
    exploitability: 8,
    impact: 8,
    weight: 3,
    category: "Access Control",
    check: () => {
      const content = readFile("server/socket.js");
      if (!content)
        return { fixed: false, detail: "Cannot read server/socket.js" };
      const hasAuth =
        content.includes("token") &&
        (content.includes("unauthorized") ||
          content.includes("Unauthorized") ||
          content.includes("close(4001"));
      const hasPatchAuth = fs.existsSync(
        path.resolve(ROOT, "patches/security/ws-auth.js"),
      );
      return {
        fixed: hasAuth || hasPatchAuth,
        detail: hasAuth
          ? "WebSocket auth check found"
          : hasPatchAuth
            ? "WS auth patch exists in patches/"
            : "WebSocket accepts connections without auth",
      };
    },
  },
  {
    id: 8,
    name: "Path traversal via /asset, /files",
    severity: "HIGH",
    exploitability: 7,
    impact: 7,
    weight: 1,
    category: "Data Exposure",
    check: () => {
      const hasGuard =
        fileContains("server/index.js", "blockSensitiveFiles") ||
        fileContains("server/index.js", "ENVIRONMENT") ||
        fileContains("server/index.js", "BLOCKED_PATTERNS");
      const hasSanitize = fileContains(
        "server/routes/files.js",
        "sanitizeSegments",
      );
      const hasPatch = fs.existsSync(
        path.resolve(ROOT, "patches/security/file-guard.js"),
      );
      return {
        fixed: hasGuard || hasPatch,
        partial: hasSanitize && !hasGuard,
        detail: hasGuard
          ? "File guard middleware found"
          : hasPatch
            ? "File guard patch exists"
            : hasSanitize
              ? "sanitizeSegments exists on /files but /asset is unguarded"
              : "No file access protection",
      };
    },
  },
  {
    id: 9,
    name: "Sudo execution without confirmation",
    severity: "HIGH",
    exploitability: 4,
    impact: 10,
    weight: 2,
    category: "Privilege Escalation",
    check: () => {
      const hasSudo =
        fileContains("kernel/shell.js", "sudo.exec") ||
        fileContains("kernel/shell.js", "params.sudo");
      const hasAllowlist =
        fileContains("kernel/shell.js", "isSudoAllowed") ||
        fileContains("kernel/shell.js", "sudo-allowlist");
      return {
        fixed: !hasSudo || hasAllowlist,
        detail:
          hasSudo && !hasAllowlist
            ? "sudo.exec() with no allowlist or confirmation"
            : hasAllowlist
              ? "Sudo allowlist found"
              : "No sudo usage detected",
      };
    },
  },
  {
    id: 10,
    name: "XSS via unescaped EJS <%- %>",
    severity: "MEDIUM",
    exploitability: 5,
    impact: 6,
    weight: 2,
    category: "Injection",
    check: () => {
      const viewsDir = path.resolve(ROOT, "server/views");
      let total = 0;
      if (fs.existsSync(viewsDir)) {
        const walk = (dir) => {
          for (const f of fs.readdirSync(dir)) {
            const full = path.join(dir, f);
            if (fs.statSync(full).isDirectory()) walk(full);
            else if (f.endsWith(".ejs")) {
              total += countOccurrences(full, /<%- /g);
            }
          }
        };
        walk(viewsDir);
      }
      return {
        fixed: total === 0,
        detail:
          total > 0
            ? `Found ${total} unescaped <%- %> outputs across EJS templates`
            : "No unescaped EJS output found",
      };
    },
  },
  {
    id: 11,
    name: "No security headers (helmet/CSP)",
    severity: "MEDIUM",
    exploitability: 3,
    impact: 5,
    weight: 0.5,
    category: "Hardening",
    check: () => {
      const hasHelmet = fileContains("server/index.js", "helmet");
      const hasPkg = fileContains("package.json", '"helmet"');
      const hasPatch = fs.existsSync(
        path.resolve(ROOT, "patches/security/headers.js"),
      );
      return {
        fixed: hasHelmet || hasPatch,
        detail: hasHelmet
          ? "helmet middleware found"
          : hasPatch
            ? "Headers patch exists"
            : "No security headers configured",
      };
    },
  },
  {
    id: 12,
    name: "No rate limiting",
    severity: "MEDIUM",
    exploitability: 6,
    impact: 4,
    weight: 0.5,
    category: "Hardening",
    check: () => {
      const hasRateLimit =
        fileContains("server/index.js", "rateLimit") ||
        fileContains("server/index.js", "rate-limit");
      const hasPkg = fileContains("package.json", '"express-rate-limit"');
      const hasPatch = fs.existsSync(
        path.resolve(ROOT, "patches/security/rate-limiter.js"),
      );
      return {
        fixed: hasRateLimit || hasPkg || hasPatch,
        detail: hasRateLimit
          ? "Rate limiting found in server"
          : hasPatch
            ? "Rate limiter patch exists"
            : "No rate limiting on any endpoint",
      };
    },
  },
  {
    id: 13,
    name: "Dynamic module loading risk",
    severity: "MEDIUM",
    exploitability: 3,
    impact: 7,
    weight: 0.5,
    category: "Hardening",
    check: () => {
      const has =
        fileContains("kernel/loader.js", "clear-module") ||
        fileContains("kernel/loader.js", "clearModule");
      return {
        fixed: !has,
        detail: has
          ? "Dynamic require via clear-module in loader.js"
          : "No dynamic module loading risk",
      };
    },
  },
  {
    id: 14,
    name: "Verbose error messages",
    severity: "LOW",
    exploitability: 2,
    impact: 3,
    weight: 0.5,
    category: "Hardening",
    check: () => {
      const count =
        countOccurrences(
          "server/index.js",
          /res\.status\(\d+\)\.send\(e\.message\)/g,
        ) + countOccurrences("server/index.js", /res\.send\(e\.message\)/g);
      return {
        fixed: count === 0,
        detail:
          count > 0
            ? `Found ${count} verbose error responses`
            : "No verbose errors found",
      };
    },
  },
  {
    id: 15,
    name: "Directory listing enabled",
    severity: "LOW",
    exploitability: 4,
    impact: 4,
    weight: 1,
    category: "Data Exposure",
    check: () => {
      const has = fileContains("server/index.js", "serveIndex");
      return {
        fixed: !has,
        detail: has
          ? "serveIndex middleware active on /asset and /files"
          : "No directory listing",
      };
    },
  },
  {
    id: 16,
    name: "ENVIRONMENT file exposure",
    severity: "LOW",
    exploitability: 5,
    impact: 6,
    weight: 1,
    category: "Data Exposure",
    check: () => {
      const hasBlock =
        fileContains("server/index.js", "ENVIRONMENT") &&
        fileContains("server/index.js", "block");
      const hasPatch = fs.existsSync(
        path.resolve(ROOT, "patches/security/file-guard.js"),
      );
      return {
        fixed: hasBlock || hasPatch,
        detail:
          !hasBlock && !hasPatch
            ? "ENVIRONMENT files are accessible via /asset and /files routes"
            : "ENVIRONMENT files are blocked",
      };
    },
  },
  {
    id: 17,
    name: "Missing cookie security flags",
    severity: "INFO",
    exploitability: 3,
    impact: 4,
    weight: 0.5,
    category: "Hardening",
    check: () => {
      const has =
        fileContains("server/index.js", "httpOnly") ||
        fileContains("server/index.js", "sameSite");
      return {
        fixed: has,
        detail: has
          ? "Cookie security flags found"
          : "No httpOnly/sameSite/secure flags on session cookies",
      };
    },
  },
  {
    id: 18,
    name: "No input validation (joi/zod)",
    severity: "INFO",
    exploitability: 4,
    impact: 5,
    weight: 0.5,
    category: "Hardening",
    check: () => {
      const has =
        fileContains("package.json", '"joi"') ||
        fileContains("package.json", '"zod"') ||
        fileContains("package.json", '"ajv"');
      return {
        fixed: has,
        detail: has
          ? "Validation library found in dependencies"
          : "No input validation library in dependencies",
      };
    },
  },
  {
    id: 19,
    name: "Dependency audit needed",
    severity: "INFO",
    exploitability: 3,
    impact: 5,
    weight: 0.5,
    category: "Hardening",
    check: () => {
      // Just check if node_modules exists (can't run npm audit without it)
      const hasModules = fs.existsSync(path.resolve(ROOT, "node_modules"));
      return {
        fixed: false,
        detail: hasModules
          ? "Run: npm audit"
          : "node_modules not installed yet",
      };
    },
  },
  {
    id: 20,
    name: "No audit logging",
    severity: "INFO",
    exploitability: 1,
    impact: 3,
    weight: 0.5,
    category: "Hardening",
    check: () => {
      const has =
        fs.existsSync(path.resolve(ROOT, "kernel/audit-log.js")) ||
        fs.existsSync(path.resolve(ROOT, "patches/security/audit-log.js"));
      return {
        fixed: has,
        detail: has ? "Audit log module found" : "No audit logging system",
      };
    },
  },

  // ─── EXTERNAL DATA EXPOSURE FINDINGS (#21-#26) ───────────────

  {
    id: 21,
    name: "Open HTTP proxy (net.request)",
    severity: "CRITICAL",
    exploitability: 9,
    impact: 9,
    weight: 3,
    category: "External Exposure",
    check: () => {
      // kernel/api/net/index.js: axios(req.params) — forwards ANY request
      const content = readFile("kernel/api/net/index.js");
      if (!content) return { fixed: true, detail: "net/index.js not found" };
      const hasOpenProxy =
        content.includes("axios(req.params)") ||
        content.includes("axios(req.body)");
      const hasValidation =
        content.includes("allowlist") ||
        content.includes("whitelist") ||
        content.includes("allowedHosts");
      return {
        fixed: !hasOpenProxy || hasValidation,
        detail:
          hasOpenProxy && !hasValidation
            ? "SSRF: kernel/api/net/index.js passes user params directly to axios — any URL can be fetched as the server"
            : hasValidation
              ? "URL allowlist found"
              : "No open proxy detected",
      };
    },
  },
  {
    id: 22,
    name: "Cloudflare tunnel exposes local server",
    severity: "HIGH",
    exploitability: 5,
    impact: 9,
    weight: 2,
    category: "External Exposure",
    check: () => {
      const hasCloudflare = fileContains(
        "kernel/api/cloudflare/index.js",
        "cloudflared tunnel",
      );
      const hasPasscodeRequired =
        fileContains("kernel/api/cloudflare/index.js", "passcode") &&
        fileContains("kernel/api/cloudflare/index.js", "req.params.passcode");
      return {
        fixed: !hasCloudflare,
        partial: hasPasscodeRequired,
        detail: hasCloudflare
          ? hasPasscodeRequired
            ? "Cloudflare tunneling active — passcode option exists but is optional (can be bypassed)"
            : "Cloudflare tunneling gives full public internet access to local server — no auth"
          : "No Cloudflare tunnel integration found",
      };
    },
  },
  {
    id: 23,
    name: "Twitter/X API with stored tokens",
    severity: "MEDIUM",
    exploitability: 4,
    impact: 7,
    weight: 1,
    category: "External Exposure",
    check: () => {
      const content = readFile("kernel/connect/providers/x/index.js");
      if (!content) return { fixed: true, detail: "X provider not found" };
      const hasStoredTokens =
        content.includes("x.json") && content.includes("persist");
      const hasEncryption =
        content.includes("encrypt") || content.includes("cipher");
      const hasClientId = content.includes(
        "d2FQZ0U4NXpzYnRyS1hZeHBvbUc6MTpjaQ",
      );
      let detail = [];
      if (hasStoredTokens && !hasEncryption)
        detail.push("OAuth tokens stored in plaintext (connect/x.json)");
      if (hasClientId) detail.push("Hardcoded Twitter client ID (base64)");
      return {
        fixed: (!hasStoredTokens || hasEncryption) && !hasClientId,
        detail:
          detail.length > 0
            ? detail.join("; ")
            : "X/Twitter integration is secure",
      };
    },
  },
  {
    id: 24,
    name: "LAN peer discovery broadcasts system info",
    severity: "MEDIUM",
    exploitability: 4,
    impact: 6,
    weight: 1.5,
    category: "External Exposure",
    check: () => {
      const content = readFile("kernel/peer.js");
      if (!content) return { fixed: true, detail: "peer.js not found" };
      const hasUdpBroadcast =
        content.includes("dgram") && content.includes("setBroadcast(true)");
      const hasPeerRefresh =
        content.includes("/pinokio/peer/refresh") &&
        content.includes("axios.post");
      const exposesSystemInfo =
        content.includes("platform") &&
        content.includes("gpu") &&
        content.includes("memory");
      let detail = [];
      if (hasUdpBroadcast) detail.push("UDP broadcast on LAN discovers peers");
      if (hasPeerRefresh)
        detail.push("HTTP POST shares system info with LAN peers");
      if (exposesSystemInfo)
        detail.push(
          "Exposes: hostname, platform, arch, GPU, memory, installed apps, process list",
        );
      return {
        fixed: !hasUdpBroadcast && !hasPeerRefresh,
        detail:
          detail.length > 0 ? detail.join("; ") : "No peer discovery active",
      };
    },
  },
  {
    id: 25,
    name: "Checkpoint data sent to external registry",
    severity: "MEDIUM",
    exploitability: 3,
    impact: 6,
    weight: 1,
    category: "External Exposure",
    check: () => {
      const hasRegistryPost =
        fileContains("server/index.js", "axios.post") &&
        fileContains("server/index.js", "/checkpoints");
      const hasRegistryUrl = fileContains(
        "server/index.js",
        "https://beta.pinokio.co",
      );
      const hasUserToken =
        fileContains("server/index.js", "registryToken") ||
        fileContains("server/index.js", "Bearer");
      let detail = [];
      if (hasRegistryUrl)
        detail.push("Default registry: https://beta.pinokio.co");
      if (hasRegistryPost)
        detail.push(
          "Checkpoint data (hash, config, system info) POSTed to registry",
        );
      if (hasUserToken)
        detail.push("Uses Bearer token from user's registry account");
      return {
        fixed: !hasRegistryPost,
        detail:
          detail.length > 0
            ? detail.join("; ")
            : "No external registry communication",
      };
    },
  },
  {
    id: 26,
    name: "Fake user-agent on outbound requests",
    severity: "LOW",
    exploitability: 2,
    impact: 3,
    weight: 0.5,
    category: "External Exposure",
    check: () => {
      const has =
        fileContains("kernel/api/net/index.js", "fake-useragent") ||
        fileContains("kernel/api/net/index.js", "fakeUa");
      return {
        fixed: !has,
        detail: has
          ? "kernel/api/net/index.js spoofs User-Agent on all outbound HTTP requests (misrepresents identity)"
          : "No User-Agent spoofing",
      };
    },
  },
];

// ─── Run all checks ─────────────────────────────────────────────

console.log("");
console.log(
  "╔══════════════════════════════════════════════════════════════════╗",
);
console.log(
  "║              🔒 PINOKIOD SECURITY SCAN REPORT                  ║",
);
console.log(
  "║              " +
    new Date().toISOString().slice(0, 19) +
    "                         ║",
);
console.log(
  "╚══════════════════════════════════════════════════════════════════╝",
);
console.log("");

const severityIcon = {
  CRITICAL: "🔴",
  HIGH: "🟠",
  MEDIUM: "🟡",
  LOW: "🟢",
  INFO: "🔵",
};
const statusIcon = (r) => (r.fixed ? "✅" : r.partial ? "⚠️ " : "❌");

let totalDeduction = 0;
let maxPossible = 0;
const results = [];

for (const f of findings) {
  const result = f.check();
  const riskScore = (f.exploitability + f.impact) / 2;
  const deduction = result.fixed
    ? 0
    : result.partial
      ? riskScore * f.weight * 0.5
      : riskScore * f.weight;
  totalDeduction += deduction;
  maxPossible += riskScore * f.weight;
  results.push({ ...f, result, riskScore, deduction });
}

const safetyScore = Math.max(
  0,
  Math.round(100 - (totalDeduction / maxPossible) * 100),
);
const grade =
  safetyScore >= 95
    ? "A+"
    : safetyScore >= 85
      ? "A"
      : safetyScore >= 70
        ? "B"
        : safetyScore >= 50
          ? "C"
          : safetyScore >= 30
            ? "D"
            : "F";
const gradeIcon = safetyScore >= 70 ? "🟢" : safetyScore >= 50 ? "🟡" : "🔴";

// Print results grouped by severity
const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

for (const sev of severities) {
  const items = results.filter((r) => r.severity === sev);
  if (items.length === 0) continue;

  console.log(`${severityIcon[sev]}  ${sev}`);
  console.log("─".repeat(66));

  for (const r of items) {
    const status = statusIcon(r.result);
    const score = r.riskScore.toFixed(1);
    console.log(
      `  ${status} #${String(r.id).padEnd(2)} ${r.name.padEnd(42)} Risk: ${score}`,
    );
    console.log(`       ${r.result.detail}`);
  }
  console.log("");
}

// Print summary
const fixedCount = results.filter((r) => r.result.fixed).length;
const partialCount = results.filter((r) => r.result.partial).length;
const unfixedCount = results.length - fixedCount - partialCount;

console.log("═".repeat(66));
console.log("");
console.log(
  `  📊 OVERALL SAFETY SCORE: ${safetyScore} / 100  —  Grade: ${grade} ${gradeIcon}`,
);
console.log("");
console.log(`  ✅ Fixed:    ${fixedCount} / ${results.length}`);
if (partialCount > 0)
  console.log(`  ⚠️  Partial:  ${partialCount} / ${results.length}`);
console.log(`  ❌ Unfixed:  ${unfixedCount} / ${results.length}`);
console.log("");

// Top 3 priorities
const topFixes = results
  .filter((r) => !r.result.fixed)
  .sort((a, b) => b.deduction - a.deduction)
  .slice(0, 3);

if (topFixes.length > 0) {
  console.log("  🎯 TOP PRIORITIES:");
  for (let i = 0; i < topFixes.length; i++) {
    const f = topFixes[i];
    console.log(`     ${i + 1}. Fix #${f.id}: ${f.name}`);
  }
  console.log("");
  console.log("  📖 See: .agent/skills/security-audit/FIX.md");
}

console.log("");
console.log("═".repeat(66));

// Exit code: 0 = grade B+, 1 = below B
process.exit(safetyScore >= 70 ? 0 : 1);
