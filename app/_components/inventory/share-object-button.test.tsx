import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShareObjectButton } from "@/app/_components/inventory/share-object-button";

jest.mock("next-intl", () => ({
  useTranslations:
    () =>
    (key: string): string => {
      const messages: Record<string, string> = {
        share: "Share",
        shared: "Copied",
        shareFailedShort: "Copy failed",
        sharedStatus: "The public object link was copied to your clipboard.",
        shareFailed: "The public object link could not be shared or copied.",
      };
      return messages[key];
    },
}));

describe("ShareObjectButton", () => {
  it("shares the canonical public object URL", async () => {
    const share = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: share,
    });

    render(<ShareObjectButton objectId="object-123" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        url: "http://localhost/objects/object-123",
      }),
    );
  });

  it("copies the public URL when native sharing is unavailable", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<ShareObjectButton objectId="object-123" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        "http://localhost/objects/object-123",
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy(),
    );
  });
});
