import test from 'node:test';
import assert from 'node:assert/strict';
import { macAssetNames, planUploads, macReleaseNotes } from '../scripts/publish-macos-preview.mjs';

test('both native Mac architectures require DMG and ZIP packages', () => {
  assert.deepEqual(macAssetNames('1.0.3'), [
    'Porty-1.0.3-mac-arm64.dmg', 'Porty-1.0.3-mac-arm64.zip',
    'Porty-1.0.3-mac-x64.dmg', 'Porty-1.0.3-mac-x64.zip',
  ]);
  assert.throws(() => macAssetNames('../1.0.3'));
});

test('uploads leave unrelated Windows files alone and permit identical retries', () => {
  const release = { draft: false, prerelease: true, assets: [{ name: 'windows.exe' }, { name: 'mac.dmg', state: 'uploaded', digest: 'sha256:abc' }] };
  assert.deepEqual(planUploads(release, [{ name: 'mac.dmg', hash: 'abc' }, { name: 'mac.zip', hash: 'def' }]), [{ name: 'mac.zip', hash: 'def' }]);
  assert.throws(() => planUploads(release, [{ name: 'mac.dmg', hash: 'different' }]), /never overwritten/);
  assert.throws(() => planUploads({ ...release, prerelease: false }, []), /preview/);
  assert.throws(() => planUploads({ ...release, draft: true }, []), /preview/);
});

test('release notes preserve Windows instructions and add one accurate Mac section', () => {
  const original = '# Porty 1.0.3 — Windows preview\r\n\r\nWindows installer instructions. macOS downloads are not part of this release.\r\nThanks to WhatCable.';
  const notes = macReleaseNotes(original, '1.0.3');
  assert.ok(notes.includes('Windows installer instructions.'));
  assert.ok(notes.includes('Thanks to WhatCable.'));
  assert.ok(notes.includes('not Developer ID signed or notarized'));
  assert.ok(!notes.includes('macOS downloads are not part'));
  assert.equal(macReleaseNotes(notes, '1.0.3'), notes);
});
