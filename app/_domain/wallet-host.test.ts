import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runtimeOperationNames } from "@/app/_domain/product-face";
import {
  contrastFailures,
  engineLightTokens,
  hostColourKeys,
  hostColourTokens,
  hostContrastRules,
  hostFontFamilies,
  hostJourneys,
  hostTokenCss,
  journeyOfJournalEntry,
  journeyOfOperation,
  journeysOfTask,
  type HostColours,
} from "@/app/_domain/wallet-host";

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

function rootTokens() {
  const block = /:root\s*\{([^}]*)\}/.exec(css);
  if (!block) throw new Error("no :root block in globals.css");
  return Object.fromEntries(
    Array.from(block[1].matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})/gi), (m) => [
      m[1],
      m[2],
    ]),
  ) as Record<string, string>;
}

const enginePalette = (): HostColours => {
  const tokens = rootTokens();
  return Object.fromEntries(
    hostColourKeys.map((key) => [key, tokens[hostColourTokens[key]]]),
  ) as HostColours;
};

describe("engine tokens", () => {
  it("keeps the fixed light tokens equal to app/globals.css", () => {
    const tokens = rootTokens();
    for (const [name, value] of Object.entries(engineLightTokens)) {
      expect([name, tokens[name]]).toEqual([name, value]);
    }
    for (const key of hostColourKeys) {
      expect(tokens[hostColourTokens[key]]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("keeps the Satoshi stack equal to the generic body family", () => {
    expect(css).toContain(`font-family: ${hostFontFamilies.satoshi};`);
  });

  it("the engine's own light palette passes every host contrast rule", () => {
    expect(contrastFailures(enginePalette())).toEqual([]);
  });

  it("names the contract's listed pairs first", () => {
    expect(hostContrastRules.slice(0, 3).map((rule) => rule.id)).toEqual([
      "ink/surface",
      "onActionPrimary/actionPrimary",
      "actionPrimary/surface",
    ]);
  });
});

describe("hostTokenCss", () => {
  it("emits the validated palette as the existing tokens, in both themes", () => {
    const output = hostTokenCss(enginePalette(), "system-serif");
    expect(output).toBe(
      `html[data-wallet-host],html[data-wallet-host].dark{--brand:#159db8;--brand-strong:#07768d;--brand-soft:#e8f7fa;--ink:#092c33;--muted:#5c7277;--action-primary:#07768d;--action-primary-hover:#055f70;--on-action-primary:#ffffff;--surface:#ffffff;--surface-subtle:#f3f7f7;--border:#dce7e8;--content-accent:#07768d;--surface-raised:#ffffff;--border-strong:#799094;--danger:#ad3232;--on-danger:#ffffff;--success:#167a5a;--warning:#8f5300}html[data-wallet-host] body{font-family:${hostFontFamilies["system-serif"]}}`,
    );
  });

  it("refuses anything but a lowercase #rrggbb or a bundled family", () => {
    for (const value of [
      "red",
      "#fff",
      "#FFFFFF",
      "x;}body{display:none",
      "#ffffff;background:url(https://x.example)",
    ]) {
      expect(() =>
        hostTokenCss({ ...enginePalette(), brand: value }, "satoshi"),
      ).toThrow("invalid_host_colour");
    }
    expect(() =>
      hostTokenCss(
        enginePalette(),
        "Inter" as unknown as keyof typeof hostFontFamilies,
      ),
    ).toThrow("invalid_host_font");
  });
});

describe("journeys", () => {
  it("maps every runtime operation to exactly one journey", () => {
    for (const operation of runtimeOperationNames) {
      expect(hostJourneys).toContain(journeyOfOperation(operation));
    }
    expect(journeyOfOperation("registration.submit")).toBe("registration");
    expect(journeyOfOperation("registration.settle.reserve")).toBe(
      "registration",
    );
    expect(journeyOfOperation("products.private.read")).toBe("myProducts");
    expect(journeyOfOperation("cases.list")).toBe("serviceProgress");
    expect(journeyOfOperation("case.read")).toBe("serviceProgress");
    expect(journeyOfOperation("case.open")).toBe("serviceProgress");
    expect(journeyOfOperation("case.quote.approve")).toBe("quoteDecisions");
    expect(journeyOfOperation("case.quote.decline")).toBe("quoteDecisions");
    expect(journeyOfOperation("transfer.accept")).toBe("transfer");
    expect(journeyOfOperation("transfer.acceptance.read")).toBe("transfer");
  });

  it("maps a journal entry by its kind, and a runtime write by its operation", () => {
    expect(journeyOfJournalEntry({ kind: "registration" })).toBe(
      "registration",
    );
    expect(journeyOfJournalEntry({ kind: "settle", operation: "update" })).toBe(
      "registration",
    );
    expect(
      journeyOfJournalEntry({
        kind: "transfer",
        operation: "transfer.request",
      }),
    ).toBe("transfer");
    expect(
      journeyOfJournalEntry({ kind: "runtime", operation: "case.open" }),
    ).toBe("serviceProgress");
    expect(
      journeyOfJournalEntry({
        kind: "runtime",
        operation: "case.quote.approve",
      }),
    ).toBe("quoteDecisions");
    expect(
      journeyOfJournalEntry({ kind: "runtime", operation: "transfer.offer" }),
    ).toBe("transfer");
    expect(
      journeyOfJournalEntry({ kind: "runtime", operation: "toString" }),
    ).toBeUndefined();
    expect(journeyOfJournalEntry({ kind: "other" })).toBeUndefined();
  });

  it("maps the contract's task routes; anything else is not a route", () => {
    expect(journeysOfTask("/")).toEqual([]);
    expect(journeysOfTask("/support")).toEqual([]);
    expect(journeysOfTask("/ended")).toEqual([]);
    expect(journeysOfTask("/register")).toEqual(["registration"]);
    expect(journeysOfTask("/register/result/op-1")).toEqual(["registration"]);
    expect(journeysOfTask("/products")).toEqual(["myProducts"]);
    expect(journeysOfTask("/products/aaaaaaaaaaaaaaaaaaaaaaaa/care")).toEqual([
      "myProducts",
    ]);
    expect(
      journeysOfTask("/products/aaaaaaaaaaaaaaaaaaaaaaaa/transfer"),
    ).toEqual(["myProducts", "transfer"]);
    expect(journeysOfTask("/service")).toEqual(["serviceProgress"]);
    expect(journeysOfTask("/accept")).toEqual(["transfer"]);
    expect(journeysOfTask("/claims")).toBeUndefined();
    expect(journeysOfTask("/../register")).toBeUndefined();
    expect(journeysOfTask("register")).toBeUndefined();
  });
});
