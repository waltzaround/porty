# Release preparation

## Test builds

Use Node.js 22.12+ and `npm ci`. On Windows:

```powershell
npm test
npm run dist:win
npm run verify:package
npm run test:packaged
npm run size:report
```

These produce unsigned test installers. The standard CI workflow builds actual Windows installers and macOS DMG/ZIP packages, verifies package contents and security settings, and smoke-tests the packaged app. CI smoke checks permit unavailable hardware queries on hosted runners; local smoke checks require successful hardware queries. CI does not replace physical hardware testing.

## GitHub Windows preview releases

The `Windows preview release` workflow builds the current app on GitHub's Windows runner, runs the parser tests and packaged-app checks, and publishes an explicitly labelled **unsigned prerelease** in `waltzaround/porty`. Trigger it manually on `main` or push a `v*` tag matching `package.json`. A reused version cannot point to a different commit, and existing release assets are never overwritten.

Downloads use `Porty-VERSION-windows-x64-setup.exe` and `Porty-VERSION-windows-x64-portable.exe`, accompanied by `SHA256SUMS.txt`. Only those public files are uploaded; private source maps and scan output are excluded. The release remains a draft until all assets upload successfully.

The website's version-specific URLs are configured in `landing/.env.production`. Update them with each release and deploy only after the corresponding assets are available. `VITE_WINDOWS_UNSIGNED=true` and `VITE_MAC_UNSIGNED=true` label preview builds that do not have publisher signing.

## GitHub macOS preview releases

The `macOS preview release` workflow follows successful `Windows preview release` runs automatically. It can also be dispatched on `main` with an existing published preview tag (for example `v1.0.3`). The resolver checks that Windows installer and portable assets are present and that the tag matches the package version. For automatic runs it also verifies the Windows run's commit.

Apple Silicon and Intel jobs build the exact tagged source on `macos-15` (arm64) and `macos-15-intel` (x64). Both run parser tests, package verification, packaged-app smoke checks and size reporting. The publisher runs only when both jobs succeed. It adds `Porty-VERSION-mac-arm64.dmg`, `Porty-VERSION-mac-arm64.zip`, `Porty-VERSION-mac-x64.dmg`, `Porty-VERSION-mac-x64.zip` and `SHA256SUMS-macos.txt` to the existing preview, leaving Windows files and their checksum file intact.

The app is not Developer ID signed or notarized in this preview workflow. Downloads and release notes state this explicitly. macOS 12 or later is required. Mac signing/notarization remains a separate release step requiring Apple credentials.

Uploads are never clobbered. Identical assets can be reused, but conflicting hashes stop publication. If uploading fails partway through, rerun the failed publish job so it uses the original build artifacts, rather than rebuilding that version. The website uses the architecture-specific DMG URLs; ZIP files remain available on the GitHub release page. Publishing a GitHub release does not automatically deploy the website: update its release settings, verify the downloads, and run `npm run deploy` from `landing/`.

### Signed builds

Configure a Windows code-signing certificate in the `production` GitHub environment:

- `WINDOWS_CSC_LINK`: certificate file encoded for electron-builder (for example, base64 PFX).
- `WINDOWS_CSC_KEY_PASSWORD`: its password.

Keep credentials in the secret store. Do not commit them. Alternatively, provide `CSC_LINK`/`CSC_KEY_PASSWORD` (or `WIN_CSC_LINK`/`WIN_CSC_KEY_PASSWORD`) locally and run `npm run release:win`.

The local `release:win` command refuses to run without signing credentials, forces signing, checks Authenticode validity on the app, installer and portable EXE, verifies package contents and fuses, and smoke-tests the app. The GitHub preview workflow intentionally uses unsigned `dist:win` builds instead. Signing-service integrations need their own configuration; no service credentials are configured in this repository.

Increment the version with `npm version patch --no-git-tag-version` (or minor/major), review the package/lockfile changes, commit, then tag the matching version. The UI reads its version from package.json. Version 1.0.1 contains the Windows hardware, node-view and production-hardening updates.

## Package guarantees

Version 1.0.3 refines the connection map with dark node cards, device icons, centered branches, zoom, fit-to-view, branch focus, and search that keeps upstream ancestry. `npm run test:ui` checks those interactions against local Windows hardware after a build. `npm run capture:product` captures the actual app for the landing page; screenshot assets are outside the desktop package. The packaged smoke check remains suitable for hosted CI without attached peripherals.

- Renderer source maps are disabled. Main/preload maps are stored privately in `.artifacts/sourcemaps/<version>/`; they are excluded from packages and CI uploads. Retain these privately with the corresponding release/commit if needed for debugging.
- The build bundles dependencies, excludes duplicate `node_modules`, and collects their licence texts into `licenses/dependencies/DEPENDENCIES.txt`. Existing WhatCable notices and Electron's runtime licence files remain included.
- Packaged DevTools and development menu entries are disabled. The production renderer has `connect-src 'none'`; the local WebSocket exception exists only in Vite's development server.
- Node-as-runtime mode, Node environment options and Node CLI inspection are disabled. Archive integrity validation and loading only from `app.asar` are enabled. These protect the application archive, not every external resource.
- Windows C# helpers compile into `Porty.Native.dll` at build time; C# source is excluded from packages. Hardware probing still runs through PowerShell and remains subject to Windows policy.
- `verify:package` checks these archive, policy, version, licence, native-resource and fuse invariants. `test:packaged` uses a temporary loopback Chromium debugging connection to exercise the real hardened executable; it does not re-enable Node inspection or change fuses.

## Size policy

- Chromium UI resources are restricted to English (US/UK). Porty currently has an English-only UI. This does not remove Unicode support or hardware names in other languages. Add locales explicitly when localizing the app.
- Main/preload code is minified, with `process.platform` resolved for the build host so unused platform branches can be removed. Build each OS on its native runner; do not reuse one OS's compiled JavaScript for another OS.
- Maximum compression is enabled. Windows NSIS differential packaging is disabled because there is no updater: full-download compression takes priority. Re-evaluate this when adding differential updates.
- macOS maximum compression selects a bzip2-compressed DMG and stronger ZIP compression. Intel and Apple Silicon builds run separately in CI, with architecture-labelled filenames; no universal binary is generated. These settings require validation on the Mac runners.
- Graphics/software-rendering fallbacks, ICU Unicode data, and Chromium/Electron licence notices remain intact. Removing them risks compatibility or missing notices.
- `npm run size:report` writes `release/size-report.json`. CI enforces a 1 MiB application-archive budget, and Windows budgets of 320 MiB unpacked and 95 MiB per download. Budget failures require investigation rather than silently raising limits.

## Remaining release checks

Before public distribution, test clean install, upgrade from an earlier build, uninstall, standard-user launch, sleep/wake, device/display unplug-replug, identical accessories, and representative docks. Test enterprise PowerShell restrictions and graceful missing readings. Verify downloaded signed artifacts on a clean Windows machine. macOS signing and notarization also need credentials and separate validation before a macOS public release.

There is no automatic updater, remote telemetry, or uploaded crash reporting. For now distribute updates manually through a trusted release location. Choose an update host and signing policy before implementing automatic updates. Privacy-safe diagnostic export and broader hardware coverage remain follow-up work.
