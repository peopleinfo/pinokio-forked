#!/usr/bin/env node
/**
 * postinstall.js — Runs after `npm install`
 *
 * Rebuilds node-pty native bindings on Windows where prebuilts are missing.
 *
 * Root cause: @homebridge/node-pty-prebuilt-multiarch ships only Linux
 * prebuilds. On Windows it needs compilation from C++ source. Two issues:
 *   1) binding.gyp requires Spectre-mitigated MSVC libs (not usually installed)
 *   2) Full `node-gyp rebuild` fails on the winpty-agent sub-target
 *
 * Fix: patch binding.gyp, configure, then selectively MSBuild just conpty.
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const IS_WIN = process.platform === "win32";

function run(cmd, opts = {}) {
  try {
    const out = execSync(cmd, {
      cwd: ROOT,
      stdio: "pipe",
      timeout: 180_000,
      ...opts,
    });
    return { ok: true, stdout: out.toString() };
  } catch (e) {
    return {
      ok: false,
      stderr: (e.stderr || "").toString().slice(0, 800),
      stdout: (e.stdout || "").toString().slice(0, 800),
    };
  }
}

function findMSBuild() {
  const candidates = [
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files\\Microsoft Visual Studio\\2022\\Professional\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2022\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\BuildTools\\MSBuild\\Current\\Bin\\MSBuild.exe",
    "C:\\Program Files (x86)\\Microsoft Visual Studio\\2019\\Community\\MSBuild\\Current\\Bin\\MSBuild.exe",
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function msbuild(msbuildExe, vcxproj, cwd) {
  return run(
    `"${msbuildExe}" "${vcxproj}" /p:Configuration=Release /p:Platform=x64 /t:Build /v:minimal`,
    { cwd },
  );
}

console.log("");
console.log("📦  Pinokiod Post-Install");
console.log(`    ${process.platform}/${process.arch}  node ${process.version}`);
console.log("");

// ── 1. Test if node-pty already works ────────────────────────────
console.log("1.  Testing node-pty...");
let ptyWorks = false;
try {
  const pty = require("@homebridge/node-pty-prebuilt-multiarch");
  const shell = IS_WIN ? "cmd.exe" : "bash";
  const p = pty.spawn(shell, [], { cols: 80, rows: 24, env: process.env });
  p.kill();
  console.log("    ✅ works");
  ptyWorks = true;
} catch (e) {
  console.log(`    ❌ ${e.message.split("\n")[0]}`);
}

// ── 2. Rebuild on Windows if needed ──────────────────────────────
if (!ptyWorks && IS_WIN) {
  console.log("");
  console.log("2.  Rebuilding node-pty for Windows...");

  let ptyDir;
  try {
    ptyDir = path.dirname(
      require.resolve("@homebridge/node-pty-prebuilt-multiarch/package.json"),
    );
  } catch {
    ptyDir = null;
  }

  if (!ptyDir) {
    console.log("    ❌ Cannot find node-pty package");
  } else {
    // A) Patch binding.gyp — disable Spectre mitigation
    const bindingPath = path.join(ptyDir, "binding.gyp");
    if (fs.existsSync(bindingPath)) {
      let gyp = fs.readFileSync(bindingPath, "utf8");
      if (gyp.includes("'SpectreMitigation': 'Spectre'")) {
        gyp = gyp.replace(
          "'SpectreMitigation': 'Spectre'",
          "'SpectreMitigation': 'false'",
        );
        fs.writeFileSync(bindingPath, gyp);
        console.log("    🔧 Patched binding.gyp (Spectre → disabled)");
      }
    }

    // B) Clean + configure
    const buildDir = path.join(ptyDir, "build");
    if (fs.existsSync(buildDir))
      fs.rmSync(buildDir, { recursive: true, force: true });

    console.log("    🔧 node-gyp configure...");
    const cfgResult = run("npx --yes node-gyp configure", { cwd: ptyDir });
    if (!cfgResult.ok) {
      console.log(
        "    ❌ configure failed — need Visual Studio Build Tools with C++ workload",
      );
    } else {
      console.log("    ✅ configured");

      // C) Build targets with MSBuild (targeted, skipping broken winpty-agent)
      const msbuildExe = findMSBuild();
      if (!msbuildExe) {
        console.log("    ⚠️  MSBuild not found, trying full node-gyp build...");
        run("npx --yes node-gyp build", { cwd: ptyDir });
      } else {
        const targets = [
          { name: "conpty", vcx: "conpty.vcxproj", required: true },
          {
            name: "conpty_console_list",
            vcx: "conpty_console_list.vcxproj",
            required: false,
          },
        ];
        for (const t of targets) {
          const vcxPath = path.join(buildDir, t.vcx);
          if (!fs.existsSync(vcxPath)) {
            console.log(`    ⚠️  ${t.vcx} not found`);
            continue;
          }
          console.log(`    🔨 Building ${t.name}...`);
          const r = msbuild(msbuildExe, vcxPath, ptyDir);
          if (r.ok) {
            console.log(`    ✅ ${t.name}`);
          } else {
            const level = t.required ? "❌" : "⚠️";
            console.log(`    ${level} ${t.name} build failed`);
          }
        }
      }

      // D) Verify
      const conpty = path.join(buildDir, "Release", "conpty.node");
      if (fs.existsSync(conpty)) {
        console.log(
          `    ✅ conpty.node built (${(fs.statSync(conpty).size / 1024).toFixed(0)}KB)`,
        );
      } else {
        console.log("    ❌ conpty.node not found");
      }
    }

    // E) Patch conpty_console_list_agent.js to handle missing native module
    //    (can't compile due to pnpm path length limits on Windows)
    const agentFile = path.join(ptyDir, "lib", "conpty_console_list_agent.js");
    if (fs.existsSync(agentFile)) {
      const agentContent = fs.readFileSync(agentFile, "utf8");
      if (!agentContent.includes("// patched-graceful-fallback")) {
        console.log(
          "    🔧 Patching conpty_console_list_agent.js (graceful fallback)...",
        );
        const patched = `"use strict";
// patched-graceful-fallback
var getConsoleProcessList;
try {
    getConsoleProcessList = require('../build/Release/conpty_console_list.node').getConsoleProcessList;
} catch (err) {
    try {
        getConsoleProcessList = require('../build/Debug/conpty_console_list.node').getConsoleProcessList;
    } catch (err2) {
        // Native module not available — fall back: just return the shell PID.
        // windowsPtyAgent.js has a 5s timeout that does the same fallback.
        getConsoleProcessList = function(pid) { return [pid]; };
    }
}
var shellPid = parseInt(process.argv[2], 10);
var consoleProcessList = getConsoleProcessList(shellPid);
process.send({ consoleProcessList: consoleProcessList });
process.exit(0);
`;
        fs.writeFileSync(agentFile, patched);
        console.log("    ✅ Patched (no more error spam on shell kill)");
      }
    }

    // F) Final test
    Object.keys(require.cache).forEach((k) => {
      if (k.includes("node-pty")) delete require.cache[k];
    });
    try {
      const pty = require("@homebridge/node-pty-prebuilt-multiarch");
      const p = pty.spawn("cmd.exe", [], {
        cols: 80,
        rows: 24,
        env: process.env,
      });
      p.kill();
      console.log("    ✅ node-pty now works!");
      ptyWorks = true;
    } catch (e2) {
      console.log(`    ❌ Still failing: ${e2.message.split("\n")[0]}`);
    }
  }
}

// ── 3. Other native modules ──────────────────────────────────────
console.log("");
console.log("3.  Other modules...");
for (const mod of ["@parcel/watcher"]) {
  try {
    require(mod);
    console.log(`    ✅ ${mod}`);
  } catch (e) {
    console.log(`    ❌ ${mod}: ${e.message.split("\n")[0]}`);
  }
}

// ── 4. Patch conpty_console_list_agent.js (always, even if pty works) ──
//    The native conpty_console_list.node can't be compiled on Windows with
//    pnpm due to path length limits. Patch the agent to fall back silently.
{
  let ptyDir;
  try {
    ptyDir = path.dirname(
      require.resolve("@homebridge/node-pty-prebuilt-multiarch/package.json"),
    );
  } catch {
    ptyDir = null;
  }

  if (ptyDir && IS_WIN) {
    const agentFile = path.join(ptyDir, "lib", "conpty_console_list_agent.js");
    if (fs.existsSync(agentFile)) {
      const agentContent = fs.readFileSync(agentFile, "utf8");
      if (!agentContent.includes("// patched-graceful-fallback")) {
        console.log("");
        console.log("4.  Patching conpty_console_list_agent.js...");
        const patched = `"use strict";
// patched-graceful-fallback
var getConsoleProcessList;
try {
    getConsoleProcessList = require('../build/Release/conpty_console_list.node').getConsoleProcessList;
} catch (err) {
    try {
        getConsoleProcessList = require('../build/Debug/conpty_console_list.node').getConsoleProcessList;
    } catch (err2) {
        // Native module not available — fall back: just return the shell PID.
        // windowsPtyAgent.js has a 5s timeout that does the same fallback.
        getConsoleProcessList = function(pid) { return [pid]; };
    }
}
var shellPid = parseInt(process.argv[2], 10);
var consoleProcessList = getConsoleProcessList(shellPid);
process.send({ consoleProcessList: consoleProcessList });
process.exit(0);
`;
        fs.writeFileSync(agentFile, patched);
        console.log("    ✅ Patched (no more error spam on shell kill)");
      }
    }
  }
}

// ── 5. Directories ───────────────────────────────────────────────
for (const dir of ["patches/security", "patches/overrides"]) {
  const p = path.resolve(ROOT, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  const gk = path.join(p, ".gitkeep");
  if (!fs.existsSync(gk)) fs.writeFileSync(gk, "");
}

// ── 6. Summary ───────────────────────────────────────────────────
console.log("");
if (ptyWorks) {
  console.log("✅  Ready! Run:  bash dev.sh  or  dev.bat");
} else {
  console.log(
    "⚠️   Server will start (http://localhost:42000) but PTY is broken.",
  );
  console.log(
    "    Fix: install VS Build Tools C++ → then run: node scripts/postinstall.js",
  );
}
console.log("");
