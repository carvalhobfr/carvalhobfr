import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { THEMES, esc, contrast, assertContrast, validateImpact, renderAll, wrap } from './build-widgets.mjs';

const impact = JSON.parse(await readFile(new URL('../data/impact.json', import.meta.url), 'utf8'));

test('escapes XML special characters', () => {
  assert.equal(esc(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;');
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

test('impact data needs a join date and a short footnote', () => {
  const noJoin = structuredClone(impact);
  noJoin.joined = 'last year';
  assert.throws(() => validateImpact(noJoin), /joined/);
  const longNote = structuredClone(impact);
  longNote.footnote = 'x'.repeat(65);
  assert.throws(() => validateImpact(longNote), /footnote/);
});

test('wraps long values into at most two lines', () => {
  assert.deepEqual(wrap('Hundreds of thousands', 12), ['Hundreds of', 'thousands']);
  assert.deepEqual(wrap('~1M', 12), ['~1M']);
  assert.throws(() => wrap('one two three four five six', 8), /two lines/);
});

test('every widget renders in both themes with title, desc and no placeholder text', () => {
  const files = renderAll(impact);
  assert.deepEqual(Object.keys(files).sort(), ['hero-dark.svg', 'hero-light.svg', 'impact-dark.svg', 'impact-light.svg']);
  for (const [name, svg] of Object.entries(files)) {
    assert.match(svg, /<svg [^>]*role="img"/, name);
    assert.match(svg, /<title id="t">.+<\/title>/, name);
    assert.match(svg, /<desc id="d">.+<\/desc>/, name);
    assert.doesNotMatch(svg, /NaN|undefined|null/, name);
  }
  assert.match(files['impact-light.svg'], /2M\+/);
  assert.match(files['impact-light.svg'], /SINCE I JOINED MEDIA CAPITAL · NOV 2021/);
  assert.match(files['impact-light.svg'], /published by Media Capital/);
  assert.match(files['impact-light.svg'], /Hundreds of/);
});
