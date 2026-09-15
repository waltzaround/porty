import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function macAssetNames(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error('Invalid version');
  return ['arm64', 'x64'].flatMap(arch => ['dmg', 'zip'].map(ext => `Porty-${version}-mac-${arch}.${ext}`));
}

export function planUploads(release, assets) {
  if (release.draft || !release.prerelease) throw new Error('Only published preview releases can be extended');
  return assets.filter(asset => {
    const existing = release.assets.find(item => item.name === asset.name);
    if (!existing) return true;
    if (existing.state !== 'uploaded' || existing.digest !== `sha256:${asset.hash}`)
      throw new Error(`Existing asset differs: ${asset.name}. Assets are never overwritten; rerun the failed publish job using its original artifacts.`);
    return false;
  });
}

export function macReleaseNotes(body, version) {
  const section = `<!-- macos-preview:start -->
## macOS preview

- **Apple Silicon:** Download \`Porty-${version}-mac-arm64.dmg\` for M-series Macs.
- **Intel:** Download \`Porty-${version}-mac-x64.dmg\` for Intel Macs.
- ZIP versions are also included. Open the DMG and drag Porty into Applications.
- **Requirements:** macOS 12 or later.

These previews are **not Developer ID signed or notarized**. macOS may block them or require approval in Privacy & Security. Hardware support is still being tested; updates are installed manually.

Mac SHA-256 checksums are in \`SHA256SUMS-macos.txt\`; Windows checksums remain in \`SHA256SUMS.txt\`.
<!-- macos-preview:end -->`;
  const original = body.replace(/\r\n/g, '\n')
    .replace(/<!-- macos-preview:start -->[\s\S]*?<!-- macos-preview:end -->/g, '')
    .replace(/^# (Porty .+?) — Windows preview/m, '# $1 — macOS and Windows preview')
    .replace(/ macOS downloads are not part of this release\./g, '').trim();
  return `${original}\n\n${section}\n`;
}

async function publish() {
  const { RELEASE_VERSION: version, RELEASE_TAG: tag, RELEASE_SHA: sha, GITHUB_REPOSITORY: repo } = process.env;
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !/^[0-9a-f]{40}$/.test(sha ?? '') || tag !== `v${version}`)
    throw new Error('Release repository, tag and immutable source commit are required');
  const names = macAssetNames(version);
  const directory = path.resolve('release/public');
  const assets = [];
  for (const name of names) {
    const file = path.join(directory, name);
    if (!(await stat(file)).isFile() || (await stat(file)).size === 0) throw new Error(`Missing package: ${name}`);
    assets.push({ name, file, hash: createHash('sha256').update(await readFile(file)).digest('hex') });
  }
  const checksumName = 'SHA256SUMS-macos.txt';
  const checksumFile = path.join(directory, checksumName);
  await writeFile(checksumFile, assets.map(a => `${a.hash}  ${a.name}\n`).join(''));
  assets.push({ name: checksumName, file: checksumFile, hash: createHash('sha256').update(await readFile(checksumFile)).digest('hex') });
  const gh = args => execFileSync('gh', args, { encoding: 'utf8' });
  const readRelease = () => JSON.parse(gh(['api', `repos/${repo}/releases/tags/${tag}`]));
  const target = JSON.parse(gh(['api', `repos/${repo}/commits/${tag}`]));
  if (target.sha !== sha) throw new Error('Release tag moved since the build');
  const release = readRelease();
  const uploads = planUploads(release, assets);
  if (uploads.length) gh(['release', 'upload', tag, ...uploads.map(a => a.file), '--repo', repo]);
  const completed = readRelease();
  if (planUploads(completed, assets).length) throw new Error('Release assets are incomplete');
  const notesFile = path.resolve('release/macos-notes.md');
  await writeFile(notesFile, macReleaseNotes(completed.body ?? '', version));
  gh(['release', 'edit', tag, '--repo', repo, '--title', `Porty ${version} — macOS and Windows preview`, '--notes-file', notesFile, '--prerelease', '--latest=false']);
  console.log(`Published and verified ${assets.length} macOS assets for ${tag}; Windows assets preserved.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await publish();
