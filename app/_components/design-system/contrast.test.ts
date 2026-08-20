import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The palette is the one place a WCAG contrast regression is invisible in
 * review, so the ratios that the themes depend on are asserted here.
 */
const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function tokens(selector: string) {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(css);
  if (!block) throw new Error(`no ${selector} block in globals.css`);
  const values: Record<string, string> = {};
  for (const [, name, value] of block[1].matchAll(
    /(--[\w-]+):\s*(#[0-9a-f]{6})/gi,
  )) {
    values[name] = value;
  }
  return values;
}

const channels = (hex: string) =>
  [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));

const luminance = (hex: string) =>
  channels(hex)
    .map((value) => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, c, i) => sum + [0.2126, 0.7152, 0.0722][i] * c, 0);

function ratio(foreground: string, background: string) {
  const [a, b] = [luminance(foreground), luminance(background)].sort(
    (x, y) => y - x,
  );
  return (a + 0.05) / (b + 0.05);
}

/** `color-mix(in srgb, <fg> <percent>%, <bg>)` flattened to a hex value. */
function mix(foreground: string, background: string, percent: number) {
  const [f, b] = [channels(foreground), channels(background)];
  return `#${f
    .map((value, i) =>
      Math.round(value * percent + b[i] * (1 - percent))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

describe.each([
  ["light", tokens(":root"), tokens(":root")["--surface-raised"]],
  [
    "dark",
    { ...tokens(":root"), ...tokens("\\.dark") },
    tokens("\\.dark")["--surface-raised"],
  ],
])("%s theme contrast", (_theme, t, raised) => {
  it("shows focus indicators at 3:1 against the surfaces they sit on", () => {
    expect(ratio(t["--brand-strong"], raised)).toBeGreaterThanOrEqual(3);
    expect(
      ratio(t["--brand-strong"], t["--surface-subtle"]),
    ).toBeGreaterThanOrEqual(3);
  });

  it("shows form control boundaries at 3:1", () => {
    expect(ratio(t["--border-strong"], raised)).toBeGreaterThanOrEqual(3);
  });

  it("shows accent text at 4.5:1 on every surface it is used on", () => {
    for (const surface of [raised, t["--surface-subtle"], t["--brand-soft"]]) {
      expect(ratio(t["--content-accent"], surface)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(t["--brand-strong"], surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("shows secondary and placeholder text at 4.5:1", () => {
    expect(ratio(t["--muted"], raised)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(t["--muted"], t["--surface-subtle"])).toBeGreaterThanOrEqual(
      4.5,
    );
  });

  it("shows every status chip at 4.5:1 on its own tint", () => {
    const surface = t["--surface"];
    expect(
      ratio(t["--success"], mix(t["--success"], surface, 0.1)),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      ratio(t["--warning"], mix(t["--warning"], surface, 0.1)),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      ratio(t["--danger"], mix(t["--danger"], surface, 0.09)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("shows the danger button label at 4.5:1", () => {
    expect(ratio(t["--on-danger"], t["--danger"])).toBeGreaterThanOrEqual(4.5);
  });

  it("shows text on the primary action, avatar and selection at 4.5:1", () => {
    const on = t["--on-action-primary"];
    expect(ratio(on, t["--action-primary"])).toBeGreaterThanOrEqual(4.5);
    // The avatar gradient runs to a stop mixed 78% with --ink.
    expect(
      ratio(on, mix(t["--action-primary"], t["--ink"], 0.78)),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
