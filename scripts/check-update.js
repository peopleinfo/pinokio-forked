#!/usr/bin/env node
/**
 * check-update.js — Check if a new upstream pinokiod version is available
 *
 * Usage: npm run check-update
 */
const { execSync } = require("child_process");
const path = require("path");

const pkg = require(path.resolve(__dirname, "..", "package.json"));
const localVersion = pkg.version;

console.log("🔍 Checking for upstream pinokiod updates...\n");
console.log(`   Local version:    v${localVersion}`);

try {
  const latest = execSync("npm view pinokiod version", {
    encoding: "utf8",
  }).trim();
  console.log(`   Upstream version: v${latest}`);

  if (latest === localVersion) {
    console.log("\n✅ You are up to date! No sync needed.");
    process.exit(0);
  }

  // Compare versions
  const semver = require("semver");
  if (semver.gt(latest, localVersion)) {
    console.log(`\n🔄 Update available: v${localVersion} → v${latest}`);
    console.log("");
    console.log("   To sync, run:");
    console.log("   npm run sync");
    console.log("");
    console.log("   Or manually:");
    console.log(`   1. git checkout -b sync/pinokiod-${latest}`);
    console.log(`   2. npm pack pinokiod@${latest} --pack-destination .`);
    console.log(`   3. tar -xzf pinokiod-${latest}.tgz --strip-components=1`);
    console.log(`   4. rm pinokiod-${latest}.tgz`);
    console.log("   5. npm install");
    console.log(
      `   6. git add -A && git commit -m "sync: update pinokiod to v${latest}"`,
    );
    console.log("   7. git checkout main && git merge sync/pinokiod-" + latest);
    process.exit(1); // exit 1 = update available (useful for CI)
  } else {
    console.log(
      `\n⚠️  Local version (v${localVersion}) is ahead of upstream (v${latest})`,
    );
    console.log("   This is expected if you have local changes.");
    process.exit(0);
  }
} catch (err) {
  console.error("\n❌ Failed to check upstream version.");
  console.error("   Make sure you have internet access and npm is installed.");
  console.error(`   Error: ${err.message}`);
  process.exit(2);
}
