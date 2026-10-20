import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  THEMES,
  esc,
  formatDate,
  normalizeVersion,
  contrast,
  assertContrast,
  validateImpact,
  collectShipping,
  fetchJson,
  renderAll,
} from './build-widgets.mjs';

const impact = JSON.parse(await readFile(new URL('../data/impact.json', import.meta.url), 'utf8'));
const shipping = {
  orbit: { version: 'v0.3.0', date: '2026-10-13T20:53:15.000Z', url: 'https://example.test/o' },
  conclave: { version: 'v0.20.0', date: '2026-10-13T11:45:16.375Z', url: 'https://example.test/c' },
};

test('escapes XML special characters', () => {
  assert.equal(esc(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
});

test('formats dates in UTC, independent of the machine timezone', () => {
  assert.equal(formatDate('2026-10-13T23:59:59Z'), 'Oct 13, 2026');
  assert.throws(() => formatDate('not a date'));
});

test('normalizes versions and rejects junk', () => {
  assert.equal(normalizeVersion('0.20.0'), 'v0.20.0');
  assert.equal(normalizeVersion('v1.2.3-beta.1'), 'v1.2.3-beta.1');
  assert.throws(() => normalizeVersion('latest'));
  assert.throws(() => normalizeVersion('<script>'));
});

test('palette meets WCAG AA for text colors', () => {
  assert.doesNotThrow(() => assertContrast());
  assert.ok(contrast('#000000', '#ffffff') > 20.9);
  assert.throws(() => assertContrast({ bad: { ...THEMES.light, faint: '#cccccc' } }), /faint/);
});

test('impact data without a source is rejected', () => {
  assert.doesNotThrow(() => validateImpact(structuredClone(impact)));
  const noSource = structuredClone(impact);
  noSource.headline.sources = [];
  assert.throws(() => validateImpact(noSource), /source/);
  const insecure = structuredClone(impact);
  insecure.milestones[0].source.url = 'http://example.test';
  assert.throws(() => validateImpact(insecure), /https/);
});

test('every widget renders in both themes with title, desc and no placeholder text', () => {
  const files = renderAll(impact, shipping);
  assert.equal(Object.keys(files).length, 6);
  for (const [name, svg] of Object.entries(files)) {
    assert.match(svg, /<svg [^>]*role="img"/, name);
    assert.match(svg, /<title id="t">.+<\/title>/, name);
    assert.match(svg, /<desc id="d">.+<\/desc>/, name);
    assert.doesNotMatch(svg, /NaN|undefined|null/, name);
  }
  assert.match(files['impact-light.svg'], /2M\+/);
  assert.match(files['impact-light.svg'], /not an individual result/);
  assert.match(files['shipping-dark.svg'], /Oct 13, 2026/);
});

test('falls back to the cache when an API fails', async () => {
  const sources = {
    orbit: async () => {
      throw new Error('HTTP 503');
    },
    conclave: async () => shipping.conclave,
  };
  const { data, warnings, missing } = await collectShipping({ getJson: null, cache: shipping, sources });
  assert.deepEqual(data.orbit, shipping.orbit);
  assert.deepEqual(data.conclave, shipping.conclave);
  assert.equal(missing.length, 0);
  assert.match(warnings[0], /orbit: HTTP 503 \(using cached value\)/);
});

test('reports missing data when an API fails and there is no cache', async () => {
  const sources = {
    orbit: async () => {
      throw new Error('HTTP 503');
    },
    conclave: async () => shipping.conclave,
  };
  const { missing } = await collectShipping({ getJson: null, cache: {}, sources });
  assert.deepEqual(missing, ['orbit']);
});

test('offline mode never calls the network', async () => {
  const sources = {
    orbit: async () => assert.fail('should not be called'),
    conclave: async () => assert.fail('should not be called'),
  };
  const { data, missing } = await collectShipping({ getJson: null, cache: shipping, offline: true, sources });
  assert.equal(missing.length, 0);
  assert.equal(data.orbit.version, 'v0.3.0');
});

test('fetchJson does not retry client errors but retries server errors', async () => {
  let calls = 0;
  const notFound = async () => {
    calls++;
    return { ok: false, status: 404 };
  };
  await assert.rejects(fetchJson('https://x.test', { fetchImpl: notFound, retries: 2 }), /HTTP 404/);
  assert.equal(calls, 1);

  calls = 0;
  const flaky = async () => {
    calls++;
    return calls < 2 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ ok: true }) };
  };
  assert.deepEqual(await fetchJson('https://x.test', { fetchImpl: flaky, retries: 2 }), { ok: true });
  assert.equal(calls, 2);
});
