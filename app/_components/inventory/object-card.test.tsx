import { render, screen } from "@testing-library/react";
import { ObjectCard } from "@/app/_components/inventory/object-card";
import type { InventoryObject } from "@/app/_domain/inventory";

jest.mock("@/app/_components/inventory/object-visual", () => ({
  ObjectVisual: ({
    name,
    bridgeContext,
    allowInteraction,
  }: {
    name: string;
    bridgeContext?: unknown;
    allowInteraction?: boolean;
  }) => (
    <div
      data-testid="object-visual"
      data-bridge={bridgeContext ? "enabled" : "disabled"}
      data-interaction={allowInteraction === false ? "disabled" : "enabled"}
    >
      {name} visual
    </div>
  ),
}));

const item: InventoryObject = {
  id: "object-123",
  name: "DUAL",
  description: "The infrastructure for the programmable economy",
  category: "ICON",
  imageUrl: "https://example.com/dual.svg",
  owner: "0x1234",
  templateId: "template-123",
  version: 1,
  stateHash: "state-hash",
  contentHash: "content-hash",
  createdAt: new Date("2026-08-11T12:00:00Z"),
  modifiedAt: new Date("2026-08-11T12:01:00Z"),
  actions: [],
  raw: {} as InventoryObject["raw"],
};

describe("ObjectCard", () => {
  it("marks a metadata image for contained logo sizing", () => {
    render(<ObjectCard item={item} />);

    expect(screen.getByRole("link", { name: "Open DUAL" }).className).toContain(
      "is-metadata",
    );
  });

  it("leaves an assigned face in the full display treatment", () => {
    render(
      <ObjectCard
        item={{
          ...item,
          display: {
            kind: "document",
            url: "/api/public/objects/object-123/display/card",
            mediaType: "text/html",
            interactive: false,
            revision: "face-1",
          },
        }}
      />,
    );

    const link = screen.getByRole("link", { name: "Open DUAL" });
    expect(link.className).toContain("has-display");
    expect(link.className).not.toContain("is-metadata");
    expect(screen.getByTestId("object-visual").dataset.interaction).toBe(
      "disabled",
    );
  });

  it("passes object data to the face bridge only when explicitly enabled", () => {
    const { rerender } = render(<ObjectCard item={item} />);
    expect(screen.getByTestId("object-visual").dataset.bridge).toBe("disabled");

    rerender(<ObjectCard item={item} bridgeEnabled />);
    expect(screen.getByTestId("object-visual").dataset.bridge).toBe("enabled");
  });

  it("shows an actions indicator only for executable object actions", () => {
    const { rerender } = render(
      <ObjectCard item={{ ...item, actions: ["update", "transfer"] }} />,
    );

    expect(
      screen.getByRole("img", { name: "2 actions available" }),
    ).toBeTruthy();

    rerender(<ObjectCard item={{ ...item, actions: ["mint"] }} />);
    expect(
      screen.queryByRole("img", { name: /actions? available/ }),
    ).toBeNull();
  });
});
