# Release installer backups

Windows NSIS installers are too large for Git (>100 MB). Each tagged release that matters for recovery gets a folder here with:

- `README.md` — tag, commit, rebuild steps, GitHub Release link
- `manifest.json` — asset names, sizes, and SHA-256 digests
- `SHA256SUMS` — checksum file for verification after download

Downloaded binaries stay local (gitignored). Use:

```bash
npm run fetch:release-backup
# or: node scripts/fetch-release-backup.mjs --tag maka.streaming.v.01
```

Official copies remain on [GitHub Releases](https://github.com/n0social/maka-streaming-software/releases).
