// UX fidelity F0 — the design spec tokens (src/styles/design-spec.css) must keep every TEXT
// pair at WCAG AA (4.5:1) in light and dark, for Riverbank. One recorded exception: white on
// the Riverbank brand red #ED1C24 (4.38:1), kept by the designer as the brand colour.
// The test reads the CSS itself, so a token edit that breaks contrast fails here.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/design-spec.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** The declarations of the first rule whose selector list starts with `selector`. */
function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector}`);
  if (start < 0) throw new Error(`no block ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const out: Record<string, string> = {};
  for (const decl of css.slice(open + 1, close).split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

type Rgb = [number, number, number];
type Rgba = [number, number, number, number];

function parse(value: string): Rgba {
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1]!;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1];
  }
  const rgba = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgba) {
    const [r, g, b, a = "1"] = rgba[1]!.split(",").map((s) => s.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new Error(`not a colour: ${value}`);
}

const over = (fg: Rgba, bg: Rgb): Rgb => [0, 1, 2].map((i) => fg[3] * fg[i]! + (1 - fg[3]) * bg[i]!) as Rgb;

function lum([r, g, b]: Rgb): number {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function ratio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolve a token for a theme: later blocks override earlier ones; var() is followed. */
function theme(...blocks: Record<string, string>[]) {
  const t = Object.assign({}, ...blocks) as Record<string, string>;
  const raw = (name: string): string => {
    const v = t[name];
    if (!v) throw new Error(`missing ${name}`);
    const ref = v.match(/^var\((--[\w-]+)\)$/);
    return ref ? raw(ref[1]!) : v;
  };
  const card = parse(raw("--ds-card")) as unknown as Rgb;
  /** Solid colour of a token, alpha-blended over `on` (default: the card). */
  const solid = (name: string, on: Rgb = card): Rgb => over(parse(raw(name)), on);
  /** The hex stops of a gradient token (the sidebar). */
  const gradientStops = (name: string): Rgb[] => [...raw(name).matchAll(/#[0-9a-f]{6}/gi)].map((m) => parse(m[0]).slice(0, 3) as Rgb);
  return { raw, solid, card, gradientStops };
}

const root = block(":root");
const riverbank = block('[data-tenant="riverbank"]');
const dark = block(".dark {");
const riverbankDark = block('.dark[data-tenant="riverbank"]');

const themes = {
  light: theme(root, riverbank),
  dark: theme(root, riverbank, dark, riverbankDark),
};

const AA = 4.5;

describe.each(Object.entries(themes))("Riverbank %s theme", (name, t) => {
  const bg = t.solid("--ds-bg");
  const s2 = t.solid("--ds-surface2");

  it("body text ramp (ink, ink2, ink3) and placeholders pass on card, surface2 and page", () => {
    for (const ink of ["--ds-ink", "--ds-ink2", "--ds-ink3", "--ds-placeholder"]) {
      for (const surface of [t.card, s2, bg]) expect(ratio(t.solid(ink), surface), ink).toBeGreaterThanOrEqual(AA);
    }
  });

  it("ink4 is below AA, which is why it is decoration only", () => {
    expect(ratio(t.solid("--ds-ink4"), t.card)).toBeLessThan(AA);
  });

  it("brand-ink text (links, active counts, Clear all) passes on card and on brand-wash", () => {
    const wash = t.solid("--ds-brand-wash");
    expect(ratio(t.solid("--ds-brand-ink"), t.card)).toBeGreaterThanOrEqual(AA);
    expect(ratio(t.solid("--ds-brand-ink"), wash)).toBeGreaterThanOrEqual(AA);
  });

  it.each(["ok", "warn", "bad", "info", "vio", "teal"])("%s status text passes on its wash and on the card", (tone) => {
    const text = t.solid(`--ds-${tone}-text`);
    expect(ratio(text, t.solid(`--ds-${tone}w`))).toBeGreaterThanOrEqual(AA);
    expect(ratio(text, t.card)).toBeGreaterThanOrEqual(AA);
  });

  it("muted chip text passes on its wash", () => {
    expect(ratio(t.solid("--ds-ink2"), t.solid("--ds-mutedw"))).toBeGreaterThanOrEqual(AA);
  });

  it("sidebar labels and items pass at both ends of the sidebar gradient", () => {
    for (const stop of t.gradientStops("--ds-side")) {
      expect(ratio(t.solid("--ds-side-dim", stop), stop)).toBeGreaterThanOrEqual(AA);
      expect(ratio(t.solid("--ds-side-ink", stop), stop)).toBeGreaterThanOrEqual(AA);
    }
    const active = t.solid("--ds-side-active");
    expect(ratio([255, 255, 255], active)).toBeGreaterThanOrEqual(AA);
  });

  it("primary buttons keep the brand red — the one accepted exception (4.38:1)", () => {
    expect(t.raw("--ds-brand").toLowerCase()).toBe("#ed1c24");
    const r = ratio(t.solid("--ds-on-brand"), t.solid("--ds-brand"));
    expect(r).toBeGreaterThan(4.3);
    expect(r).toBeLessThan(AA);
    // Hover/pressed go to brand-ink in light mode, which passes.
    if (name === "light") expect(ratio([255, 255, 255], t.solid("--ds-brand-ink"))).toBeGreaterThanOrEqual(AA);
  });
});
