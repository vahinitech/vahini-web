/* SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
   © 2026 Vahini Technologies. All rights reserved.

   Generates the "Figma top-50 web color schemes" theme blocks inside
   site/css/theme.css (between the GEN-WEB50 markers), one
   [data-theme="…"] block per scheme from the Figma article
   "53 website color schemes". Each scheme is reduced to a seed
   (accent colour, neutral tint, optional hot/dark overrides) and the
   full token set the site uses is derived from it with the same
   colour math for every theme, then nudged until it passes WCAG
   contrast targets:

     ink   on ivory   ≥ 8.0   (body text)
     muted on ivory   ≥ 4.6   (secondary text)
     accent-ink  on ivory ≥ 4.6   (accent-coloured text)
     accent-deep on ivory ≥ 4.5   (links, small accent text)
     white on accent-deep ≥ 3.0   (primary buttons)
     white on hot         ≥ 3.0   (hot buttons/badges)

   Run:  node tools/gen-web50-themes.mjs        (rewrites theme.css in place)
*/
import { readFileSync, writeFileSync } from 'node:fs';

const CSS = new URL('../site/css/theme.css', import.meta.url).pathname;
const LOGO_CRIMSON = '#C0080B'; /* sampled from site/assets/ev/vahini-mark.png */

/* ---------- colour math ---------- */
const hex2rgb = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
};
const rgb2hex = (r) => '#' + r.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0').toUpperCase()).join('');
const mix = (a, b, t) => rgb2hex(hex2rgb(a).map((v, i) => v + (hex2rgb(b)[i] - v) * t));
const darken = (c, t) => mix(c, '#000000', t);
const lighten = (c, t) => mix(c, '#FFFFFF', t);
const lum = (c) => {
  const [r, g, b] = hex2rgb(c).map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const darkenUntil = (fg, bg, target) => {
  let c = fg, guard = 0;
  while (contrast(c, bg) < target && guard++ < 60) c = darken(c, 0.05);
  return c;
};
const alpha = (c, a) => {
  const [r, g, b] = hex2rgb(c);
  return `rgba(${r},${g},${b},${a})`;
};

/* ---------- 53 schemes -> seeds ----------
   accent: the action/brand colour of the scheme
   tint:   the hue the neutrals lean toward
   hot:    highlight/alert colour (defaults to the Vahini logo crimson)
   note:   the scheme's number + display name from the article        */
const S = (n, name, accent, tint, extra = {}) => ({ n, name, accent, tint, ...extra });
const SCHEMES = [
  /* --- minimal & neutral --- */
  S(1, 'Ink wash', '#5F6B76', '#5F6B76'),
  S(2, 'Neutral elegance', '#8A7154', '#8A7154'),
  S(3, 'Jade pebble morning', '#3E8E7C', '#4E7A70'),
  S(4, 'Woodland', '#8A9A18', '#6B5B45'),
  S(5, 'Driftwood pearl morning', '#A87860', '#8A7468'),
  S(6, 'Graphite', '#6C82A8', '#76808E'),
  S(7, 'Urban slate', '#5E7590', '#66788C'),
  S(8, 'Pearl', '#7B5EA7', '#877E74'),
  S(9, 'Vichy', '#12A0A8', '#6E7A7C'),
  S(10, 'Sorbet', '#7F9678', '#8A8A76'),
  S(11, 'Frozen mist', '#C05A1E', '#767B80'),
  S(12, 'Yacht club', '#34497F', '#5E6876'),
  /* --- warm --- */
  S(13, 'Amber walnut morning', '#A5641F', '#8A7050'),
  S(14, 'Copper aquamarine dream', '#B65E2A', '#7A8A84'),
  S(15, 'Cocoa topaz noonday', '#D2701F', '#6E5844'),
  S(16, 'Sandstone aquamarine serenity', '#4E97AC', '#8C8070'),
  S(17, 'Honey opal sunset', '#C29018', '#8A7C64'),
  S(18, 'Seashell garnet afternoon', '#E8635C', '#948880'),
  S(19, 'Rose quartz evening', '#8E2438', '#94787E', { hot: '#B03A50' }),
  S(20, 'Calcite', '#E07A34', '#78808C'),
  S(21, 'Fireside', '#C24C22', '#8C7A66', { hot: '#A03418' }),
  S(22, 'Terrazzo', '#1F8E86', '#8C7C62'),
  /* --- cool --- */
  S(23, 'Sapphire nightfall whisper', '#2E5E9E', '#5C7086'),
  S(24, 'Lapis velvet evening', '#3A3F8F', '#6E7080'),
  S(25, 'Marina', '#274C77', '#707E8C'),
  S(26, 'Emerald lavender lake', '#3E9678', '#7E7E96'),
  S(27, 'Sage peridot morning', '#4C9A5E', '#6E8A72'),
  S(28, 'Amethyst dawn haze', '#8461B8', '#82788E'),
  S(29, 'Moon dust', '#6E7CC4', '#7C84A0'),
  S(30, 'Turquoise amber autumn', '#1E8FA6', '#7C8078'),
  S(31, 'Sapphire ash morning', '#5E82A8', '#8C8088'),
  S(32, 'Frosted aura', '#43597A', '#6E7886'),
  S(33, 'Royal glimmer', '#5B2C83', '#787080'),
  S(34, 'Neptune', '#2596A6', '#6C8290'),
  /* --- vibrant & bold --- */
  S(35, 'Tropical jade sunrise', '#E08A2E', '#7C8A8C'),
  S(36, 'Amethyst mint harmony', '#6B2E8F', '#6E7A72'),
  S(37, 'Hibiscus aura', '#C6187E', '#70788E'),
  S(38, 'Ocean ruby radiance', '#DE3D74', '#6C7E96'),
  S(39, 'Tropical heat', '#22A19A', '#948872', { hot: '#D95040' }),
  S(40, 'Celestial', '#1F6FD1', '#6E7A88'),
  S(41, 'Festive eve', '#5A4FBF', '#767098'),
  S(42, 'Freshly squeezed', '#E8940F', '#98865E'),
  S(43, 'Jelly shoes', '#C05FA8', '#8E7C8C'),
  /* --- modern --- */
  S(44, 'Opaline', '#D9531E', '#787C82'),
  S(45, 'Gossamer', '#16A5B4', '#7A8286'),
  S(46, 'Clockwork', '#D77826', '#7E7A76'),
  S(47, 'Lemon granite morning', '#C7A50A', '#6A7480'),
  S(48, 'Arctic reflection', '#5E88B0', '#7A8896'),
  S(49, 'Slate', '#2F9E6E', '#787E84'),
  S(50, 'Autumn luxe', '#A87B1C', '#84796A', { dark: '#181512' }),
  S(51, 'Inked', '#00ADB5', '#75797D'),
  S(52, 'Wraith', '#17924F', '#79706A'),
  S(53, 'Urban nocturne', '#6FA80F', '#6F757B', { dark: '#141518' }),
];

const kebab = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function buildTheme({ n, name, accent, tint, hot = LOGO_CRIMSON, dark }) {
  /* neutrals: a light warm/cool family leaning toward the scheme's tint */
  const ivory = mix('#EFEFEF', tint, 0.05);
  const ivory2 = lighten(ivory, 0.55);
  const surface2 = mix(darken(ivory, 0.07), tint, 0.04);
  let ink = mix('#20242B', tint, 0.12);
  ink = darkenUntil(ink, ivory, 8.0);
  const elephant = lighten(ink, 0.14);
  const muted = darkenUntil(lighten(ink, 0.34), ivory, 4.6);
  const hint = lighten(ink, 0.52);

  /* accent family */
  let accentDeep = darkenUntil(darken(accent, 0.16), '#FFFFFF', 3.0);
  const accentLite = lighten(accent, 0.35);
  const accentSoft = mix(accent, '#FFFFFF', 0.87);
  let accentInk = darkenUntil(darken(accent, 0.42), ivory, 4.6);
  accentDeep = darkenUntil(accentDeep, ivory, 4.5);

  /* hot family */
  const hotSafe = darkenUntil(hot, '#FFFFFF', 3.0);
  const hotDeep = darken(hotSafe, 0.2);
  const hotSoft = mix(hotSafe, '#FFFFFF', 0.88);

  const darkC = dark || darken(ink, 0.05);
  const dark2 = darken(darkC, 0.25);

  const t = kebab(name);
  return {
    id: t,
    css: `/* ${String(n).padStart(2, '0')} · ${name} */
:root[data-theme="${t}"]{
  --ivory:${ivory};  --ivory-2:${ivory2};  --surface:#FFFFFF;  --surface-2:${surface2};
  --ink:${ink};    --elephant:${elephant}; --muted:${muted};    --hint:${hint};

  --accent:${accent}; --accent-deep:${accentDeep}; --accent-lite:${accentLite}; --accent-soft:${accentSoft}; --accent-ink:${accentInk};
  --hot:${hotSafe};    --hot-deep:${hotDeep};    --hot-soft:${hotSoft};
  --dark:${darkC};   --dark-2:${dark2};

  --rule:${alpha(ink, 0.12)}; --rule-2:${alpha(ink, 0.22)}; --rule-on:${alpha(ivory, 0.16)};
  --live:#0F6E56; --live-bg:#DCF1E8; --dev:#8A5410; --dev-bg:#F6E9D4; --research:${mix(ink, '#6A727C', 0.5)}; --research-bg:${surface2};
}`,
    report: {
      name: `${n} ${t}`,
      'ink/ivory': contrast(ink, ivory).toFixed(1),
      'muted/ivory': contrast(muted, ivory).toFixed(1),
      'accent-ink/ivory': contrast(accentInk, ivory).toFixed(1),
      'accent-deep/ivory': contrast(accentDeep, ivory).toFixed(1),
      'white/accent-deep': contrast('#FFFFFF', accentDeep).toFixed(1),
      'white/hot': contrast('#FFFFFF', hotSafe).toFixed(1),
    },
  };
}

const built = SCHEMES.map(buildTheme);

/* contrast gate: fail loudly rather than ship an unreadable theme */
let bad = 0;
for (const b of built) {
  const r = b.report;
  const checks = [
    [+r['ink/ivory'], 8.0], [+r['muted/ivory'], 4.6], [+r['accent-ink/ivory'], 4.6],
    [+r['accent-deep/ivory'], 4.5], [+r['white/accent-deep'], 3.0], [+r['white/hot'], 3.0],
  ];
  if (checks.some(([v, min]) => v < min)) { bad++; console.error('CONTRAST FAIL', r); }
}
if (bad) { console.error(`${bad} theme(s) failed contrast`); process.exit(1); }

const BEGIN = '/* ==== GEN-WEB50:BEGIN (generated by tools/gen-web50-themes.mjs, do not hand-edit) ==== */';
const END = '/* ==== GEN-WEB50:END ==== */';
const block = `${BEGIN}
/* ------------------------------------------------------------
   The Figma "top 50" web color schemes as switchable themes.
   Pick any of these names in theme.config.js -> ACTIVE_THEME.
   Regenerate with:  node tools/gen-web50-themes.mjs
   ------------------------------------------------------------ */
${built.map((b) => b.css).join('\n\n')}
${END}`;

let css = readFileSync(CSS, 'utf8');
if (css.includes(BEGIN)) {
  css = css.replace(new RegExp(BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), block);
} else {
  css = css.trimEnd() + '\n\n' + block + '\n';
}
writeFileSync(CSS, css);
console.log(`wrote ${built.length} themes into site/css/theme.css`);
console.log('theme names:', built.map((b) => b.id).join(', '));
