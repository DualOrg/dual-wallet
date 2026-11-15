import { fireEvent, render, screen } from "@testing-library/react";
import { PlatformSelector } from "@/app/_components/platform-selector";

jest.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string, values?: { platform?: string }): string =>
      ({
        label: `Platform: ${values?.platform}`,
        production: "Production",
        sandbox: "Sandbox",
        hint: "You stay signed in.",
      })[key] ?? key,
}));

const trigger = () => screen.getByRole("button", { name: /Platform:/ });

describe("PlatformSelector", () => {
  it("shows only the platform when the sandbox is not configured", () => {
    render(<PlatformSelector platform="production" sandboxAvailable={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByLabelText("Platform: Production")).toBeTruthy();
  });

  it("links each platform and marks the current one", () => {
    render(<PlatformSelector platform="sandbox" sandboxAvailable />);
    expect(trigger().getAttribute("aria-label")).toBe("Platform: Sandbox");

    fireEvent.click(trigger());
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    const production = screen.getByRole("link", { name: "Production" });
    const sandbox = screen.getByRole("link", { name: "Sandbox" });
    expect(production.getAttribute("href")).toBe("?platform=production");
    expect(production.getAttribute("aria-current")).toBeNull();
    expect(sandbox.getAttribute("href")).toBe("?platform=sandbox");
    expect(sandbox.getAttribute("aria-current")).toBe("true");
  });

  it("closes on Escape and returns focus to the trigger", () => {
    render(<PlatformSelector platform="production" sandboxAvailable />);
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("link")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
