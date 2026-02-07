#!/usr/bin/env node
/**
 * sync.js — Sync fork with the latest upstream pinokiod version
 *
 * Usage: npm run sync
 *
 * This script:
 * 1. Checks if an update is available
 * 2. Creates a sync branch
 * 3. Downloads and extracts the new version
 * 4. Verifies patches are intact
 * 5. Installs dependencies
 * 6. Commits the changes
 *
 * It does NOT merge into main — that's left for you to review.
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const pkg = require(path.resolve(ROOT, "package.json"));
const localVersion = pkg.version;

function run(cmd, opts = {}) {
  console.log(`   $ ${cmd}`);
  return execSync(cmd, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: "inherit",
    ...opts,
  });
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

async function main() {
  console.log("🔄 Pinokiod Upstream Sync\n");
  console.log(`   Current version: v${localVersion}`);

  // 1. Check for update
  let latest;
  try {
    latest = runCapture("npm view pinokiod version");
  } catch (err) {
    console.error("❌ Cannot reach npm registry. Check internet connection.");
    process.exit(2);
  }
  console.log(`   Upstream version: v${latest}\n`);

  if (latest === localVersion) {
    console.log("✅ Already up to date!");
    process.exit(0);
  }

  // 2. Check for uncommitted changes
  const status = runCapture("git status --porcelain");
  if (status) {
    console.error(
      "❌ You have uncommitted changes. Commit or stash them first:",
    );
    console.error(status);
    process.exit(1);
  }

  // 3. Check current branch
  const currentBranch = runCapture("git rev-parse --abbrev-ref HEAD");
  const syncBranch = `sync/pinokiod-${latest}`;

  console.log(`📋 Plan:`);
  console.log(`   Branch: ${currentBranch} → ${syncBranch}`);
  console.log(`   Update: v${localVersion} → v${latest}`);
  console.log("");

  // 4. Create sync branch
  console.log("1️⃣  Creating sync branch...");
  run(`git checkout -b ${syncBranch}`);

  // 5. Download tarball
  console.log("\n2️⃣  Downloading upstream package...");
  run(`npm pack pinokiod@${latest} --pack-destination .`);

  // 6. Extract (overwrite upstream files)
  console.log("\n3️⃣  Extracting upstream files...");
  const tarball = `pinokiod-${latest}.tgz`;
  run(`tar -xzf ${tarball} --strip-components=1`);

  // 7. Clean up tarball
  fs.unlinkSync(path.resolve(ROOT, tarball));
  console.log(`   Cleaned up ${tarball}`);

  // 8. Verify patches intact
  console.log("\n4️⃣  Verifying patches...");
  const patchesDir = path.resolve(ROOT, "patches");
  if (fs.existsSync(patchesDir)) {
    const patchDiff = runCapture("git diff patches/ || true");
    if (patchDiff) {
      console.warn("⚠️  WARNING: patches/ directory was modified by upstream!");
      console.warn("   Review the changes carefully before continuing.");
    } else {
      console.log("   ✅ patches/ directory untouched");
    }
  } else {
    console.log(
      "   ℹ️  No patches/ directory yet (will be created when fixes are applied)",
    );
  }

  // Verify our custom files are intact
  const ourFiles = [
    ".agent",
    "scripts/check-update.js",
    "scripts/sync.js",
    "README.md",
    "AGENTS.md",
    "SKILLS.md",
  ];
  for (const f of ourFiles) {
    const fullPath = path.resolve(ROOT, f);
    if (fs.existsSync(fullPath)) {
      console.log(`   ✅ ${f} intact`);
    } else {
      console.warn(
        `   ⚠️  ${f} was removed by upstream extract — will be restored from git`,
      );
    }
  }

  // 9. Restore any of our files that upstream tarball may have deleted
  // (upstream tarball doesn't include our custom files, so they should still be there,
  //  but just in case tar was run with --overwrite-dir or similar)
  const deletedOurs = runCapture(
    "git diff --name-only --diff-filter=D -- scripts/ .agent/ README.md AGENTS.md SKILLS.md .gitignore || true",
  );
  if (deletedOurs) {
    console.log("\n   Restoring our custom files...");
    for (const file of deletedOurs.split("\n").filter(Boolean)) {
      run(`git checkout HEAD -- "${file}"`);
    }
  }

  // 10. Install dependencies
  console.log("\n5️⃣  Installing dependencies...");
  run("npm install");

  // 11. Show summary
  console.log("\n6️⃣  Change summary:");
  run("git diff --stat");

  // 12. Commit
  console.log("\n7️⃣  Committing...");
  run("git add -A");
  run(`git commit -m "sync: update pinokiod to v${latest} from npm"`);

  // Done
  console.log("\n" + "=".repeat(60));
  console.log(`✅ Synced to pinokiod v${latest} on branch: ${syncBranch}`);
  console.log("");
  console.log("Next steps:");
  console.log(`   1. Review the changes: git log --oneline -5`);
  console.log(`   2. Test: npm start`);
  console.log(
    `   3. Merge: git checkout ${currentBranch} && git merge ${syncBranch}`,
  );
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("\n❌ Sync failed:", err.message);
  console.error("\nTo recover:");
  console.error("   git checkout main");
  console.error(
    `   git branch -D sync/pinokiod-${runCapture("npm view pinokiod version").catch(() => "latest")}`,
  );
  process.exit(1);
});
