---
description: How to sync the fork with the latest pinokiod npm version
---

## Check for Updates

1. Check the latest version on npm:

```bash
npm view pinokiod version
```

2. Compare with our current version:

```bash
node -p "require('./package.json').version"
```

## Sync Steps

3. If a new version is available, download the tarball:

```bash
npm pack pinokiod@latest --pack-destination .
```

4. Create a new branch for the sync (replace `<NEW_VERSION>` with actual version):

```bash
git checkout -b sync/pinokiod-<NEW_VERSION>
```

5. Extract the new version (overwriting existing files):

```bash
tar -xzf pinokiod-<NEW_VERSION>.tgz --strip-components=1
```

6. Clean up the tarball:

```bash
rm pinokiod-<NEW_VERSION>.tgz
```

7. Review the changes:

```bash
git diff --stat
```

8. Stage and commit:

```bash
git add -A && git commit -m "sync: update pinokiod to v<NEW_VERSION> from npm"
```

9. Merge into main branch:

```bash
git checkout main && git merge sync/pinokiod-<NEW_VERSION>
```

## Notes

- Replace `<NEW_VERSION>` with the actual version number (e.g., `6.0.17`)
- Always review the diff before merging to check for conflicts with custom changes
- The npm registry is the source of truth — GitHub repo may lag behind
- After syncing, run `npm install` to update any changed dependencies
