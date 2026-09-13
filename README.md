# zalo-auto

Windows desktop app (NSIS `.exe`, `electron` + `playwright`) that reads `${id}-${phone}.jpg` images from a folder, searches `chat.zalo.me` by phone, pastes the image with a caption, and sends — with throttling, dedupe, and auto-update.

## Requirements

- Node 22, `npm`
- Windows 10+ for building the installer

## Dev

```ps
npm install
# first clone only — downloads Chromium into node_modules and %LOCALAPPDATA%\ms-playwright
npx playwright install chromium
# with bundled path (used by the packaged app)
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium

npm run dev        # Electron + Vite dev (hot reload)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm test           # vitest 43 tests
npm run build      # electron-vite build (out/)
```

On first launch the app does a headless `isLoggedIn` check (`#contact-search-input`) — no window pops. Click **Log in** to open a visible Chromium, scan QR, then it closes. **Logout** leaves the browser open on the QR page so you can verify.

Images are named `${id}-${phone}.jpg` (e.g. `123-0123.456.789.jpg`). Phone is normalized (`84…` → `0…`). History is `filename::sha256` in `%APPDATA%\zalo-auto\history.json`. Caption tokens: `{id} {phone} {filename} {name} {index} {total}`.

Selectors are in `resources/selectors.json` (and override ` %APPDATA%\zalo-auto\selectors.json`). Edit the file and click **Reload selectors** in the app — no rebuild needed. See `src/main/zalo/selectors.ts` for the loader.

## Build a local installer (no publish)

```ps
npm run build
npx electron-builder --publish never
# output: dist/zalo-auto Setup X.Y.Z.exe  (~300 MB, includes Chromium) + dist/win-unpacked/
```

`win.icon` is `resources/icon.png` → `resources/icon.ico` (`scripts/generate-icon.mjs` + `png-to-ico`). `extraResources` copies `selectors.json`/`icon` into the packaged `resources/`.

## Publishing a new release (hosted exe)

Releases are hosted on **GitHub Releases** (`electron-builder` `publish: github` + `electron-updater` in `src/main/updater.ts`). The app checks `latest.yml` on launch when packaged (`autoDownload:true`, prompt `Restart & install`).

### One-time setup

1. Repo is public `https://github.com/minhle20001998/zola-auto` (already set in `electron-builder.yml: owner/repo` and pushed to `origin/master`).
2. Create a classic PAT: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token (classic) → Note `zola-auto release`, Expiration `90 days`, scope `repo` → Generate → copy `ghp_…`.
3. Repo → Settings → Secrets and variables → Actions → New repository secret → Name `GH_TOKEN` → Value `ghp_…` → Add.

### Each release

```ps
# 1. Pick a bump: patch (0.1.0 → 0.1.1), minor, or major
npm version patch
# → bumps package.json, commits, and creates tag v0.1.1 locally

# 2. Push commit and tag
git push
git push --tags
# If you ran `npm version` already, `git tag v0.1.1` will say “already exists” — just push the existing tag with `git push --tags` as above.
```

What happens:

- `/.github/workflows/release.yml` triggers on `push: tags: v*` on `windows-latest`: `npm ci` → `lint`/`typecheck`/`test` → `PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install chromium` → `npm run package -- --publish always` (uses `GH_TOKEN`) → creates Release `v0.1.1` at `https://github.com/minhle20001998/zola-auto/releases` with `zalo-auto Setup 0.1.1.exe`, `.blockmap`, and `latest.yml`.

- Installed `0.1.0` will see `0.1.1` on next launch and show the updater banner.

### Local version & tag must match

`package.json` `version` must equal the tag (`v0.1.1` → `0.1.1`), otherwise `electron-builder` errors. `npm version` keeps them in sync.

### Troubleshooting

- `Executable doesn't exist at ...\ms-playwright\chromium-...` → run both installs above (default + `PLAYWRIGHT_BROWSERS_PATH=0`).
- `winCodeSign` symlink error on local build → add `win.signAndEditExecutable: false` + `forceCodeSigning: false` in `electron-builder.yml` (already set) or build on `windows-latest` CI where admin is available.
- `zaloLoginStatus` shows `not logged in` right after login → check `Logs` → `Load debug file` (`%APPDATA%\zalo-auto\logs\debug.log`); `isLoggedIn` logs `url` and `searchInput count/visible`. The `loginStatus.json` cache is at `%APPDATA%\zalo-auto\loginStatus.json`.
