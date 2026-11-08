import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// reads the real colours from styles.css
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const tokens = (selector) => {
  const body = css.slice(css.indexOf(selector)).match(/\{([^}]*)\}/)[1];
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map(([, name, hex]) => [name, hex]));
};
const THEMES = { light: tokens(':root {'), dark: tokens(":root[data-theme='dark'] {") };

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// [text token, background token, minimum ratio, where it's used]
const SEVERITIES = ['sev-critical', 'sev-high', 'sev-medium', 'sev-low'];
const PAIRS = [
  ...['bg', 'sidebar', 'surface', 'control'].map((b) => ['ink', b, 4.5, 'body text']),
  ...['bg', 'sidebar', 'surface', 'raised', 'control'].map((b) => ['muted', b, 4.5, 'secondary text']),
  ['bg', 'ink', 4.5, 'primary button label'],
  ...SEVERITIES.flatMap((s) => ['bg', 'surface', 'raised'].map((b) => [s, b, 4.5, 'severity text'])),
  ...SEVERITIES.map((s) => ['bg', s, 4.5, 'Repo Map tile label']),
  ...['bg', 'sidebar', 'surface'].map((b) => ['focus', b, 3, 'focus ring']),
  ['data', 'bg', 4.5, 'status text'],
  ...['bg', 'sidebar', 'surface'].map((b) => ['brand', b, 3, 'logo ring']),
];

for (const [theme, t] of Object.entries(THEMES)) {
  test(`contrast (${theme}): every text, label and focus pair meets WCAG AA`, () => {
    const failures = PAIRS.map(([fg, bg, min, use]) => ({ fg, bg, min, use, got: ratio(t[fg], t[bg]) })).filter((p) => p.got < p.min);
    assert.deepEqual(failures.map((p) => `${p.fg} on ${p.bg} (${p.use}): ${p.got.toFixed(2)}, needs ${p.min}`), []);
  });
}

test('contrast: the sidebar, cards and dividers stay visible in both themes', () => {
  for (const [theme, t] of Object.entries(THEMES)) {
    assert.ok(ratio(t.sidebar, t.bg) >= 1.1, `${theme}: sidebar blends into the page`);
    assert.ok(ratio(t.surface, t.bg) >= 1.05, `${theme}: cards blend into the page`);
    assert.ok(ratio(t.control, t.sidebar) >= 1.1, `${theme}: the selected nav item blends into the sidebar`);
    assert.ok(ratio(t.rule, t.bg) >= 1.3, `${theme}: table rules are too faint`);
    assert.ok(ratio(t.rule, t.surface) >= 1.2, `${theme}: input edges are too faint on cards`);
  }
});
