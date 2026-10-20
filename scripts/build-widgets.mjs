#!/usr/bin/env node
// Builds assets/*.svg (hero, impact, shipping; light and dark) for the profile README.
//
//   data/impact.json     hand-curated metrics, each with scope and source (never fetched)
//   data/shipping.json   last good release data (cache, committed)
//   assets/*.svg         output
//
// Zero dependencies, Node 20+. If an API fails the cached value is used and a warning is
// printed; if there is no cache either, nothing is written and the exit code is 1.
//
//   node scripts/build-widgets.mjs             fetch, then build
//   node scripts/build-widgets.mjs --offline   build from the cache only

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const THEMES = {
  light: { bg: '#ffffff', fg: '#09090b', muted: '#52525b', faint: '#71717a', line: '#d4d4d8', tile: '#f4f4f5' },
  dark: { bg: '#0a0a0a', fg: '#fafafa', muted: '#a1a1aa', faint: '#8b8b95', line: '#3f3f46', tile: '#18181b' },
};

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace";
const MAX_SVG_BYTES = 20_000;

// ---------------------------------------------------------------- helpers

export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid date: ${iso}`);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export function normalizeVersion(raw) {
  const m = /^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)$/.exec(String(raw ?? '').trim());
  if (!m) throw new Error(`invalid version: ${raw}`);
  return `v${m[1]}`;
}

function channel(hex) {
  const c = parseInt(hex, 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(color) {
  const h = color.replace('#', '');
  return 0.2126 * channel(h.slice(0, 2)) + 0.7152 * channel(h.slice(2, 4)) + 0.0722 * channel(h.slice(4, 6));
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// WCAG AA for the colors that carry text or information. Decoration (line, tile) is exempt.
export function assertContrast(themes = THEMES) {
  const failures = [];
  for (const [name, th] of Object.entries(themes)) {
    for (const key of ['fg', 'muted', 'faint']) {
      const ratio = contrast(th[key], th.bg);
      if (ratio < 4.5) failures.push(`${name}.${key} on bg is ${ratio.toFixed(2)}:1 (needs 4.5:1)`);
    }
    const onFocus = contrast(th.bg, th.fg);
    if (onFocus < 4.5) failures.push(`${name}.bg on fg is ${onFocus.toFixed(2)}:1 (needs 4.5:1)`);
  }
  if (failures.length) throw new Error(`contrast check failed:\n  ${failures.join('\n  ')}`);
}

function text(x, y, content, { size = 16, weight = 400, fill, cls = 'sans', anchor, length, spacing } = {}) {
  const attrs = [
    `x="${x}"`,
    `y="${y}"`,
    `class="${cls}"`,
    `font-size="${size}"`,
    `font-weight="${weight}"`,
    `fill="${fill}"`,
  ];
  if (anchor) attrs.push(`text-anchor="${anchor}"`);
  if (length) attrs.push(`textLength="${length}"`, 'lengthAdjust="spacingAndGlyphs"');
  if (spacing) attrs.push(`letter-spacing="${spacing}"`);
  return `<text ${attrs.join(' ')}>${esc(content)}</text>`;
}

function frame({ width, height, title, desc, th, body, defs = '' }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-labelledby="t d">
<title id="t">${esc(title)}</title>
<desc id="d">${esc(desc)}</desc>
<style>.sans{font-family:${SANS}}.mono{font-family:${MONO}}</style>
<defs>${defs}</defs>
<rect x="0.75" y="0.75" width="${width - 1.5}" height="${height - 1.5}" rx="16" fill="${th.bg}" stroke="${th.line}" stroke-width="1.5"/>
${body}
</svg>
`;
}

// ---------------------------------------------------------------- hero

export function renderHero(th) {
  const W = 720;
  const H = 280;
  const chips = ['webOS', 'Tizen', 'Android TV'];
  let cx = 40;
  let chipsSvg = '';
  for (const label of chips) {
    const w = Math.round(label.length * 10.2 + 28);
    chipsSvg += `<rect x="${cx}" y="204" width="${w}" height="34" rx="17" fill="none" stroke="${th.faint}" stroke-width="1.2"/>`;
    chipsSvg += text(cx + w / 2, 227, label, { size: 17, cls: 'mono', fill: th.muted, anchor: 'middle' });
    cx += w + 10;
  }

  // A TV screen with the spatial-navigation focus ring, the thing CTV work is made of.
  const tiles = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const x = 462 + col * 69;
      const y = 66 + row * 62;
      const focused = col === 1 && row === 0;
      if (focused) {
        tiles.push(`<rect x="${x - 5}" y="${y - 5}" width="68" height="60" rx="9" fill="none" stroke="${th.fg}" stroke-width="2"/>`);
        tiles.push(`<rect x="${x}" y="${y}" width="58" height="50" rx="5" fill="${th.fg}"/>`);
        tiles.push(`<polygon points="${x + 22},${y + 14} ${x + 22},${y + 36} ${x + 42},${y + 25}" fill="${th.bg}"/>`);
      } else {
        tiles.push(`<rect x="${x}" y="${y}" width="58" height="50" rx="5" fill="${th.tile}" stroke="${th.line}"/>`);
      }
    }
  }
  const tv = `
<rect x="440" y="44" width="240" height="156" rx="14" fill="none" stroke="${th.fg}" stroke-width="2.5"/>
${tiles.join('\n')}
<rect x="548" y="200" width="24" height="10" fill="${th.fg}"/>
<line x1="520" y1="212" x2="600" y2="212" stroke="${th.fg}" stroke-width="2.5" stroke-linecap="round"/>`;

  const dpad = `
<circle cx="650" cy="248" r="20" fill="none" stroke="${th.muted}" stroke-width="1.5"/>
<circle cx="650" cy="248" r="5" fill="${th.fg}"/>
<polygon points="650,232 646,238 654,238" fill="${th.muted}"/>
<polygon points="650,264 646,258 654,258" fill="${th.muted}"/>
<polygon points="634,248 640,244 640,252" fill="${th.muted}"/>
<polygon points="666,248 660,244 660,252" fill="${th.muted}"/>
${text(616, 253, 'focus · select', { size: 16, cls: 'mono', fill: th.faint, anchor: 'end' })}`;

  const defs = `
<pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${th.line}"/></pattern>
<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0.35" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
<mask id="m"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>`;

  const body = `
<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="15" fill="url(#dots)" mask="url(#m)"/>
${text(40, 104, 'Matheus Carvalho', { size: 42, weight: 700, fill: th.fg, length: 372 })}
${text(40, 142, 'Software Engineer', { size: 24, fill: th.muted, length: 214 })}
${text(40, 172, 'Smart TV · streaming · web platforms', { size: 18, fill: th.faint, length: 336 })}
${chipsSvg}
${tv}
${dpad}`;

  return frame({
    width: W,
    height: H,
    th,
    defs,
    body,
    title: 'Matheus Carvalho, Software Engineer',
    desc: 'Software Engineer for Smart TV, streaming and web platforms. LG webOS, Samsung Tizen and Android TV. Illustration of a TV screen with a focused tile.',
  });
}

// ---------------------------------------------------------------- impact

export function validateImpact(data) {
  const need = (cond, msg) => {
    if (!cond) throw new Error(`data/impact.json: ${msg}`);
  };
  need(data && typeof data === 'object', 'must be an object');
  need(data.product?.name && data.product?.company && data.product?.role, 'product.name/company/role required');
  const h = data.headline;
  need(h?.value && h?.label && h?.period, 'headline.value/label/period required');
  need(Array.isArray(h.sources) && h.sources.length > 0, 'headline.sources required (a metric without a source is not published)');
  need(Array.isArray(data.milestones) && data.milestones.length === 3, 'exactly 3 milestones expected');
  for (const m of data.milestones) {
    need(m.when && m.value && m.unit, 'milestone needs when/value/unit');
    need(m.source?.name && /^https:\/\//.test(m.source?.url ?? ''), `milestone ${m.when} needs a source with an https url`);
  }
  const e = data.ecosystem;
  need(e?.name && Array.isArray(e.items) && e.items.length === 2, 'ecosystem.name and exactly 2 items required');
  need(Array.isArray(e.sources) && e.sources.length > 0, 'ecosystem.sources required');
  need(typeof data.disclaimer === 'string' && data.disclaimer.length > 0, 'disclaimer required');
  return data;
}

export function renderImpact(th, data) {
  const W = 720;
  const H = 424;
  const { product, headline, milestones, ecosystem } = data;

  const xs = [40, 360, 680];
  const anchors = ['start', 'middle', 'end'];
  const nodeX = [48, 360, 672];
  const timeline = milestones
    .map((m, i) => {
      const last = i === milestones.length - 1;
      return [
        `<circle cx="${nodeX[i]}" cy="232" r="${last ? 8 : 6}" fill="${last ? th.fg : th.bg}" stroke="${last ? th.fg : th.muted}" stroke-width="2"/>`,
        text(xs[i], 264, m.when, { size: 17, cls: 'mono', fill: th.faint, anchor: anchors[i] }),
        text(xs[i], 290, m.value, { size: 20, weight: 700, fill: th.fg, anchor: anchors[i] }),
        text(xs[i], 314, m.unit, { size: 17, fill: th.muted, anchor: anchors[i] }),
      ].join('\n');
    })
    .join('\n');

  const eco = ecosystem.items
    .map((it, i) => {
      const x = i === 0 ? 40 : 360;
      return `<text x="${x}" y="392" class="sans" fill="${th.fg}"><tspan font-size="24" font-weight="700">${esc(it.value)}</tspan><tspan dx="10" font-size="18" font-weight="400" fill="${th.muted}">${esc(it.label)}</tspan></text>`;
    })
    .join('\n');

  const body = `
${text(40, 46, 'ENGINEERING IMPACT', { size: 16, cls: 'mono', fill: th.faint, spacing: '1.5' })}
${text(680, 46, `${product.name.toUpperCase()} · ${product.company.toUpperCase()}`, { size: 16, cls: 'mono', fill: th.faint, anchor: 'end', spacing: '1' })}
${text(34, 172, headline.value, { size: 120, weight: 700, fill: th.fg, length: 236 })}
${text(300, 120, headline.label, { size: 28, weight: 600, fill: th.fg, length: 260 })}
${text(300, 150, `${product.name} · ${headline.period}`, { size: 20, fill: th.muted })}
${text(300, 178, 'A product metric, not an individual result.', { size: 18, fill: th.muted, length: 372 })}
<line x1="48" y1="232" x2="672" y2="232" stroke="${th.faint}" stroke-width="1.5"/>
${timeline}
<line x1="40" y1="338" x2="680" y2="338" stroke="${th.line}"/>
${text(40, 364, `${ecosystem.name.toUpperCase()} ECOSYSTEM · CONTEXT`, { size: 16, cls: 'mono', fill: th.faint, spacing: '1' })}
${eco}`;

  const milestoneText = milestones.map((m) => `${m.when}: ${m.value} ${m.unit}`).join('. ');
  const ecoText = ecosystem.items.map((i) => `${i.value} ${i.label}`).join(', ');
  return frame({
    width: W,
    height: H,
    th,
    body,
    title: `Engineering impact: ${headline.value} ${headline.label} on ${product.name}`,
    desc: `${product.name} (${product.company}) reached ${headline.value} ${headline.label} in ${headline.period}. ${milestoneText}. Context, ${ecosystem.name} ecosystem: ${ecoText}. ${data.disclaimer}`,
  });
}

// ---------------------------------------------------------------- shipping

const ROWS = [
  { key: 'orbit', name: 'Orbit', blurb: 'Native macOS command center · Swift' },
  { key: 'conclave', name: 'Conclave', blurb: 'Evidence-first PR review CLI · npm · MIT' },
];

export function renderShipping(th, shipping) {
  const W = 720;
  const H = 204;
  const rows = ROWS.map((row, i) => {
    const s = shipping[row.key];
    const y = 84 + i * 64;
    const pillW = Math.round(s.version.length * 10.2 + 22);
    return [
      `<circle cx="48" cy="${y - 7}" r="4.5" fill="${th.fg}"/>`,
      text(64, y, row.name, { size: 24, weight: 700, fill: th.fg }),
      `<rect x="214" y="${y - 22}" width="${pillW}" height="30" rx="8" fill="none" stroke="${th.faint}" stroke-width="1.2"/>`,
      text(214 + pillW / 2, y - 2, s.version, { size: 17, cls: 'mono', fill: th.fg, anchor: 'middle' }),
      text(680, y - 2, formatDate(s.date), { size: 20, fill: th.muted, anchor: 'end' }),
      text(64, y + 26, row.blurb, { size: 18, fill: th.muted }),
    ].join('\n');
  }).join('\n');

  const body = `
${text(40, 40, 'NOW SHIPPING', { size: 16, cls: 'mono', fill: th.faint, spacing: '1.5' })}
${text(680, 40, 'updated daily', { size: 16, cls: 'mono', fill: th.faint, anchor: 'end' })}
${rows}`;

  const summary = ROWS.map((r) => `${r.name} ${shipping[r.key].version} on ${formatDate(shipping[r.key].date)}`).join('. ');
  return frame({
    width: W,
    height: H,
    th,
    body,
    title: 'Now shipping',
    desc: `Latest releases. ${summary}.`,
  });
}

// ---------------------------------------------------------------- data

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchJson(url, { headers = {}, retries = 2, timeoutMs = 10_000, fetchImpl = fetch } = {}) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchImpl(url, {
        headers: { 'user-agent': 'carvalhobfr-profile-widgets', accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const err = new Error(`${url} -> HTTP ${res.status}`);
        err.permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
        throw err;
      }
      return await res.json();
    } catch (err) {
      last = err;
      if (err.permanent || attempt === retries) break;
      await sleep(500 * 2 ** attempt);
    }
  }
  throw last;
}

export const SOURCES = {
  async orbit(getJson, env = {}) {
    const headers = env.GITHUB_TOKEN ? { authorization: `Bearer ${env.GITHUB_TOKEN}` } : {};
    const r = await getJson('https://api.github.com/repos/carvalhobfr/orbit-releases/releases/latest', { headers });
    return { version: normalizeVersion(r.tag_name), date: new Date(r.published_at).toISOString(), url: String(r.html_url) };
  },
  async conclave(getJson) {
    const r = await getJson('https://registry.npmjs.org/conclave-ai');
    const latest = r['dist-tags']?.latest;
    if (!latest || !r.time?.[latest]) throw new Error('npm registry: latest version or its date is missing');
    return {
      version: normalizeVersion(latest),
      date: new Date(r.time[latest]).toISOString(),
      url: `https://www.npmjs.com/package/conclave-ai/v/${latest}`,
    };
  },
};

// Fresh value when the API answers, cached value when it does not, error when neither exists.
export async function collectShipping({ getJson, cache = {}, offline = false, env = {}, sources = SOURCES }) {
  const data = {};
  const warnings = [];
  for (const key of Object.keys(sources)) {
    if (!offline) {
      try {
        data[key] = await sources[key](getJson, env);
        continue;
      } catch (err) {
        warnings.push(`${key}: ${err.message}${cache[key] ? ' (using cached value)' : ''}`);
      }
    }
    if (cache[key]) data[key] = cache[key];
    else warnings.push(`${key}: no cached value to fall back on`);
  }
  const missing = Object.keys(sources).filter((k) => !data[k]);
  return { data, warnings, missing };
}

// ---------------------------------------------------------------- io

async function readJson(file, { optional = false } = {}) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (optional && err.code === 'ENOENT') return undefined;
    throw new Error(`${path.relative(ROOT, file)}: ${err.message}`);
  }
}

async function writeIfChanged(file, content) {
  let current;
  try {
    current = await readFile(file, 'utf8');
  } catch {
    // first write
  }
  if (current === content) return false;
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, file);
  return true;
}

export function renderAll(impact, shipping) {
  const out = {};
  for (const [name, th] of Object.entries(THEMES)) {
    out[`hero-${name}.svg`] = renderHero(th);
    out[`impact-${name}.svg`] = renderImpact(th, impact);
    out[`shipping-${name}.svg`] = renderShipping(th, shipping);
  }
  for (const [file, svg] of Object.entries(out)) {
    if (Buffer.byteLength(svg) > MAX_SVG_BYTES) throw new Error(`${file} is larger than ${MAX_SVG_BYTES} bytes`);
    if (/NaN|undefined|null/.test(svg)) throw new Error(`${file} contains NaN/undefined/null`);
  }
  return out;
}

async function main() {
  const offline = process.argv.includes('--offline');
  const inActions = process.env.GITHUB_ACTIONS === 'true';
  const warn = (msg) => (inActions ? console.log(`::warning::${msg}`) : console.warn(`warning: ${msg}`));

  assertContrast();
  const impact = validateImpact(await readJson(path.join(ROOT, 'data/impact.json')));
  const cacheFile = path.join(ROOT, 'data/shipping.json');
  const cache = (await readJson(cacheFile, { optional: true })) ?? {};

  const { data, warnings, missing } = await collectShipping({ getJson: fetchJson, cache, offline, env: process.env });
  warnings.forEach(warn);
  if (missing.length) {
    console.error(`error: no data for ${missing.join(', ')}; assets left untouched`);
    process.exit(1);
  }

  const files = renderAll(impact, data);
  const changed = [];
  if (await writeIfChanged(cacheFile, `${JSON.stringify(data, null, 2)}\n`)) changed.push('data/shipping.json');
  for (const [name, svg] of Object.entries(files)) {
    if (await writeIfChanged(path.join(ROOT, 'assets', name), svg)) changed.push(`assets/${name}`);
  }
  console.log(changed.length ? `updated: ${changed.join(', ')}` : 'up to date');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`error: ${err.message}`);
    process.exit(1);
  });
}
