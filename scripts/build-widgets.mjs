#!/usr/bin/env node
// Builds assets/hero-*.svg and assets/impact-*.svg (light and dark) for the profile README.
//
//   data/impact.json   hand-curated metrics, each with scope and source (never fetched)
//   assets/*.svg       output
//
// Zero dependencies, Node 20+, no network. Release badges, downloads and the contribution
// snake are produced elsewhere (shields.io and the snk action in the workflow).

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
  const chips = ['React', 'TypeScript', 'Node.js'];
  let cx = 40;
  let chipsSvg = '';
  for (const label of chips) {
    const w = Math.round(label.length * 10.2 + 28);
    chipsSvg += `<rect x="${cx}" y="204" width="${w}" height="34" rx="17" fill="none" stroke="${th.faint}" stroke-width="1.2"/>`;
    chipsSvg += text(cx + w / 2, 227, label, { size: 17, cls: 'mono', fill: th.muted, anchor: 'middle' });
    cx += w + 10;
  }

  // A browser window in front of a TV with a focus ring, and the API behind them: one
  // developer from the web to the living room.
  const tvTiles = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const x = 548 + col * 45;
      const y = 116 + row * 44;
      if (col === 1 && row === 0) {
        tvTiles.push(`<rect x="${x - 4}" y="${y - 4}" width="45" height="44" rx="7" fill="none" stroke="${th.fg}" stroke-width="2"/>`);
        tvTiles.push(`<rect x="${x}" y="${y}" width="37" height="36" rx="4" fill="${th.fg}"/>`);
        tvTiles.push(`<polygon points="${x + 13},${y + 10} ${x + 13},${y + 26} ${x + 26},${y + 18}" fill="${th.bg}"/>`);
      } else {
        tvTiles.push(`<rect x="${x}" y="${y}" width="37" height="36" rx="4" fill="${th.tile}" stroke="${th.line}"/>`);
      }
    }
  }
  const art = `
<rect x="436" y="44" width="176" height="128" rx="10" fill="${th.bg}" stroke="${th.fg}" stroke-width="2.5"/>
<line x1="436" y1="66" x2="612" y2="66" stroke="${th.line}" stroke-width="1.5"/>
<circle cx="450" cy="55" r="3" fill="${th.faint}"/><circle cx="461" cy="55" r="3" fill="${th.faint}"/><circle cx="472" cy="55" r="3" fill="${th.faint}"/>
<rect x="486" y="49" width="112" height="12" rx="6" fill="${th.tile}" stroke="${th.line}"/>
<rect x="448" y="76" width="152" height="16" rx="3" fill="${th.tile}"/>
<rect x="448" y="100" width="72" height="60" rx="4" fill="${th.tile}" stroke="${th.line}"/>
<rect x="528" y="100" width="72" height="60" rx="4" fill="${th.tile}" stroke="${th.line}"/>
<rect x="540" y="108" width="144" height="100" rx="10" fill="${th.bg}" stroke="${th.fg}" stroke-width="2.5"/>
${tvTiles.join('\n')}
<rect x="600" y="208" width="24" height="8" fill="${th.fg}"/>
<line x1="580" y1="218" x2="644" y2="218" stroke="${th.fg}" stroke-width="2.5" stroke-linecap="round"/>
<line x1="480" y1="172" x2="480" y2="184" stroke="${th.faint}" stroke-width="1.5" stroke-dasharray="3 3"/>
<rect x="436" y="184" width="88" height="44" rx="8" fill="${th.tile}" stroke="${th.line}"/>
${text(452, 212, '>_ api', { size: 18, cls: 'mono', fill: th.fg })}`;

  const defs = `
<pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="${th.line}"/></pattern>
<linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0.35" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
<mask id="m"><rect width="${W}" height="${H}" fill="url(#fade)"/></mask>`;

  const body = `
<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="15" fill="url(#dots)" mask="url(#m)"/>
${text(40, 104, 'Matheus Carvalho', { size: 42, weight: 700, fill: th.fg, length: 372 })}
${text(40, 142, 'Full-stack Developer', { size: 24, fill: th.muted, length: 234 })}
${text(40, 172, 'Web products & media platforms', { size: 18, fill: th.faint, length: 280 })}
${chipsSvg}
${art}`;

  return frame({
    width: W,
    height: H,
    th,
    defs,
    body,
    title: 'Matheus Carvalho, Full-stack Developer',
    desc: 'Full-stack developer building web products and media platforms with React, TypeScript and Node.js. Illustration of a browser window and a TV screen with a focused tile, connected to an API.',
  });
}

// ---------------------------------------------------------------- impact

export function validateImpact(data) {
  const need = (cond, msg) => {
    if (!cond) throw new Error(`data/impact.json: ${msg}`);
  };
  need(data && typeof data === 'object', 'must be an object');
  need(data.product?.name && data.product?.company, 'product.name/company required');
  need(/^[A-Z][a-z]{2} \d{4}$/.test(data.joined ?? ''), 'joined must look like "Nov 2021"');
  const h = data.headline;
  need(h?.value && h?.label && h?.period, 'headline.value/label/period required');
  need(Array.isArray(h.sources) && h.sources.length > 0, 'headline.sources required (a metric without a source is not published)');
  need(Array.isArray(data.milestones) && data.milestones.length === 3, 'exactly 3 milestones expected (before, middle, now)');
  for (const m of data.milestones) {
    need(m.when && m.value && m.unit, 'milestone needs when/value/unit');
    need(m.source?.name && /^https:\/\//.test(m.source?.url ?? ''), `milestone ${m.when} needs a source with an https url`);
  }
  const e = data.ecosystem;
  need(e?.name && Array.isArray(e.items) && e.items.length === 2, 'ecosystem.name and exactly 2 items required');
  need(Array.isArray(e.sources) && e.sources.length > 0, 'ecosystem.sources required');
  need(typeof data.disclaimer === 'string' && data.disclaimer.length > 0, 'disclaimer required');
  need(typeof data.footnote === 'string' && data.footnote.length > 0 && data.footnote.length <= 64, 'footnote required (max 64 characters, it is drawn on one line)');
  return data;
}

// Greedy word wrap, at most two lines.
export function wrap(value, max) {
  const lines = [];
  let line = '';
  for (const word of String(value).split(' ')) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  lines.push(line);
  if (lines.length > 2) throw new Error(`"${value}" needs more than two lines at ${max} characters`);
  return lines;
}

export function renderImpact(th, data) {
  const W = 720;
  const H = 372;
  const { product, joined, milestones, ecosystem } = data;
  const [before, mid, now] = milestones;

  const beforeLines = wrap(before.value, 12);
  const beforeSvg = [
    text(40, 104, before.when, { size: 17, cls: 'mono', fill: th.faint }),
    ...beforeLines.map((l, i) => text(40, 148 + i * 34, l, { size: 30, weight: 700, fill: th.fg })),
    text(40, 148 + beforeLines.length * 34 + 2, before.unit, { size: 18, fill: th.muted }),
  ].join('\n');

  const nowSvg = [
    text(680, 104, now.when, { size: 17, cls: 'mono', fill: th.faint, anchor: 'end' }),
    text(680, 196, now.value, { size: 96, weight: 700, fill: th.fg, anchor: 'end' }),
    text(680, 228, now.unit, { size: 20, fill: th.muted, anchor: 'end' }),
  ].join('\n');

  const arrow = `
<line x1="246" y1="150" x2="448" y2="150" stroke="${th.muted}" stroke-width="1.5"/>
<polygon points="458,150 446,143 446,157" fill="${th.muted}"/>
<circle cx="351" cy="150" r="6" fill="${th.bg}" stroke="${th.muted}" stroke-width="2"/>
${text(351, 126, mid.when, { size: 16, cls: 'mono', fill: th.faint, anchor: 'middle' })}
${text(351, 184, mid.value, { size: 22, weight: 700, fill: th.fg, anchor: 'middle' })}
${text(351, 206, mid.unit, { size: 16, fill: th.muted, anchor: 'middle' })}`;

  const eco = ecosystem.items
    .map((it, i) => {
      const x = i === 0 ? 40 : 360;
      return `<text x="${x}" y="316" class="sans" fill="${th.fg}"><tspan font-size="24" font-weight="700">${esc(it.value)}</tspan><tspan dx="10" font-size="18" font-weight="400" fill="${th.muted}">${esc(it.label)}</tspan></text>`;
    })
    .join('\n');

  const body = `
${text(40, 46, `SINCE I JOINED ${product.company.toUpperCase()} · ${joined.toUpperCase()}`, { size: 16, cls: 'mono', fill: th.faint, spacing: '1.2' })}
${text(680, 46, product.name.toUpperCase(), { size: 16, cls: 'mono', fill: th.faint, anchor: 'end', spacing: '1.2' })}
${beforeSvg}
${arrow}
${nowSvg}
<line x1="40" y1="256" x2="680" y2="256" stroke="${th.line}"/>
${text(40, 284, `${ecosystem.name.toUpperCase()} ECOSYSTEM · CONTEXT`, { size: 16, cls: 'mono', fill: th.faint, spacing: '1' })}
${eco}
${text(40, 348, data.footnote, { size: 16, fill: th.faint })}`;

  const ecoText = ecosystem.items.map((i) => `${i.value} ${i.label}`).join(', ');
  return frame({
    width: W,
    height: H,
    th,
    body,
    title: `${product.name} since joining ${product.company} in ${joined}: ${before.value} ${before.unit} to ${now.value} ${now.unit}`,
    desc: `Joined ${product.company} in ${joined}. ${product.name}: ${before.when}, ${before.value} ${before.unit}. ${mid.when}, ${mid.value} ${mid.unit}. ${now.when}, ${now.value} ${now.unit}. Context, ${ecosystem.name} ecosystem: ${ecoText}. ${data.disclaimer}`,
  });
}

// ---------------------------------------------------------------- io

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
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

export function renderAll(impact) {
  const out = {};
  for (const [name, th] of Object.entries(THEMES)) {
    out[`hero-${name}.svg`] = renderHero(th);
    out[`impact-${name}.svg`] = renderImpact(th, impact);
  }
  for (const [file, svg] of Object.entries(out)) {
    if (Buffer.byteLength(svg) > MAX_SVG_BYTES) throw new Error(`${file} is larger than ${MAX_SVG_BYTES} bytes`);
    if (/NaN|undefined|null/.test(svg)) throw new Error(`${file} contains NaN/undefined/null`);
  }
  return out;
}

async function main() {
  assertContrast();
  const impact = validateImpact(await readJson(path.join(ROOT, 'data/impact.json')));
  const files = renderAll(impact);
  const changed = [];
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
