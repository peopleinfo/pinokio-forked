---
description: How to sync the fork with the latest pinokiod npm version (conflict-free)
---

> **Before syncing**, read the upstream-sync skill: `.agent/skills/upstream-sync/SKILL.md`
> It explains the patch-layer architecture that keeps our security fixes separate from upstream code.

## Pre-Sync Check

1. Verify our patches directory exists and is intact:

```bash
ls patches/security/
```

2. Check the latest version on npm:

```bash
npm view pinokiod version
```

3. Compare with our current version:

```bash
node -p "require('./package.json').version"
```

If a new version is available, continue below.

## Sync Steps

4. Create a sync branch (replace `<VERSION>` with actual version):

```bash
git checkout -b sync/pinokiod-<VERSION>
```

5. Download the tarball:

```bash
npm pack pinokiod@<VERSION> --pack-destination .
```

6. Extract — overwrite all upstream files (safe, our patches are separate):

```bash
tar -xzf pinokiod-<VERSION>.tgz --strip-components=1
```

7. Clean up the tarball:

```bash
rm pinokiod-<VERSION>.tgz
```

8. Verify our patches weren't touched:

```bash
git diff patches/
```

This should show NO changes. If it does, upstream somehow included a `patches/` dir — investigate.

## Post-Sync Verification

9. Install any new dependencies:

```bash
npm install
```

10. Quick smoke test — verify patches still load:

```bash
node -e "require('./patches/entry')"
```

11. Review upstream changes:

```bash
git diff --stat
```

12. Check if upstream changed any APIs our patches hook into:

```bash
git diff server/index.js | grep -E "prototype\.start|this\.app\s*="
git diff server/socket.js | grep -E "WebSocket\.Server|wss\.on"
```

If these patterns changed, update the corresponding patch files.

13. Stage and commit:

```bash
git add -A && git commit -m "sync: update pinokiod to v<VERSION>"
```

14. Merge into main:

```bash
git checkout main && git merge sync/pinokiod-<VERSION>
```

## If Something Breaks

If patches fail after sync, check the conflict resolution checklist in:
`.agent/skills/upstream-sync/SKILL.md` → "Conflict Resolution Checklist"

Common issues:

- **Server.prototype.start renamed** → Update `patches/entry.js`
- **Route paths changed** → Update `patches/security/auth-middleware.js`
- **Upstream added same dependency** → Remove our duplicate, use theirs
