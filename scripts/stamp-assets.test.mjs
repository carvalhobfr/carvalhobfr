import test from 'node:test';
import assert from 'node:assert/strict';
import { hashOf, stamp } from './stamp-assets.mjs';

const hashes = { 'hero-dark.svg': 'aaaaaaaa', 'snake-light.svg': 'bbbbbbbb' };

test('adds the hash to asset references and replaces an old one', () => {
  const md = '<img src="assets/hero-dark.svg"> srcset="assets/snake-light.svg?v=00000000"';
  assert.equal(stamp(md, hashes), '<img src="assets/hero-dark.svg?v=aaaaaaaa"> srcset="assets/snake-light.svg?v=bbbbbbbb"');
});

test('is idempotent and leaves unknown files and other URLs alone', () => {
  const md = '<img src="assets/hero-dark.svg"> <img src="assets/missing.svg"> <img src="https://img.shields.io/x.svg?v=1">';
  const once = stamp(md, hashes);
  assert.equal(stamp(once, hashes), once);
  assert.match(once, /assets\/missing\.svg"/);
  assert.match(once, /img\.shields\.io\/x\.svg\?v=1/);
});

test('hash changes with content and is 8 hex characters', () => {
  assert.match(hashOf('a'), /^[0-9a-f]{8}$/);
  assert.notEqual(hashOf('a'), hashOf('b'));
});

test('replaces non-hex version tokens left by manual edits', () => {
  assert.equal(stamp('<img src="assets/hero-dark.svg?v=softwareengineer2">', hashes), '<img src="assets/hero-dark.svg?v=aaaaaaaa">');
});
