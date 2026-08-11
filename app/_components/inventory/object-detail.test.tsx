import { fireEvent, render, screen, within } from "@testing-library/react";
import { ObjectDetail } from "@/app/_components/inventory/object-detail";
import type { ObjectDetail as ObjectDetailModel } from "@/app/_domain/inventory";

jest.mock("@/app/_components/inventory/object-visual", () => ({
  ObjectVisual: ({ name }: { name: string }) => (
    <div data-testid="object-front">{name}</div>
  ),
}));

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    () =>
    (key: string, values?: { count?: number; number?: number }): string =>
      ({
        notAvailable: "Not available",
        details: "Object details",
        description: "Verified identity",
        name: "Name",
        descriptionLabel: "Description",
        image: "Image",
        metadata: "Metadata",
        customData: "Custom data",
        systemData: "System data",
        noCustomData: "No custom data",
        smartObject: "Smart object",
        cardSides: "Card sides",
        frontSide: "Front",
        backSide: "Back",
        moreOptions: "More pass options",
        showDetails: "Show details",
        closeDetails: "Close pass details",
        objectInformation: "Object information",
        actions: "Object actions",
        showActions: "Show object actions",
        dataFields: `${values?.count ?? 0} fields`,
        dataItems: `${values?.count ?? 0} items`,
        itemNumber: `Item ${values?.number ?? 0}`,
        emptyValue: "Empty",
        nullValue: "Null",
        category: "Category",
        edition: "Edition",
        owner: "Owner",
        version: "Version",
        created: "Created",
        modified: "Last updated",
        stateHash: "State hash",
        contentHash: "Content hash",
        templateId: "Template ID",
      })[key] ?? key,
}));

const item: ObjectDetailModel = {
  id: "object-123",
  name: "Aurelia S7",
  description: "A product passport",
  category: "digital-product-passport",
  edition: 1,
  owner: "0x1234",
  templateId: "template-123",
  version: 1,
  stateHash: "state-hash",
  contentHash: "content-hash",
  createdAt: new Date("2026-08-11T12:00:00Z"),
  modifiedAt: new Date("2026-08-11T12:01:00Z"),
  custom: {
    manufacturer: "Aurelia Instruments",
    compliance: {
      certifications: ["CE", "ISO 9001"],
      verified: true,
    },
  },
  system: { source: "publisher" },
};

describe("ObjectDetail", () => {
  it("shows only the pass until details are requested from the menu", () => {
    render(<ObjectDetail item={item} />);

    expect(screen.getByTestId("object-front")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 2, name: "Aurelia S7" }),
    ).toBeTruthy();
    expect(screen.getByText("A product passport")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Metadata" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More pass options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Show details" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(
      within(dialog).getByRole("heading", { name: "Metadata" }),
    ).toBeTruthy();
    expect(within(dialog).getByText("A product passport")).toBeTruthy();
    expect(
      within(dialog).getByRole("heading", { name: "Custom data" }),
    ).toBeTruthy();
    expect(within(dialog).getByText("Manufacturer")).toBeTruthy();
    expect(within(dialog).getByText("Aurelia Instruments")).toBeTruthy();
    const compliance = within(dialog).getByText("Compliance").closest("div");
    expect(compliance).toBeTruthy();
    fireEvent.click(within(compliance!).getByText("2 fields"));
    const certifications = within(compliance!)
      .getByText("Certifications")
      .closest("div");
    expect(certifications).toBeTruthy();
    fireEvent.click(within(certifications!).getByText("2 items"));
    expect(within(certifications!).getByText("ISO 9001")).toBeTruthy();
    expect(within(compliance!).getByText("true")).toBeTruthy();
    expect(
      within(dialog).getByRole("heading", { name: "System data" }),
    ).toBeTruthy();
    expect(within(dialog).getByText("publisher")).toBeTruthy();
    expect(
      within(dialog).getByRole("heading", { name: "Object information" }),
    ).toBeTruthy();
    expect(within(dialog).getByText("state-hash")).toBeTruthy();
    expect(within(dialog).getByText("content-hash")).toBeTruthy();
  });

  it("leaves an assigned card face unchanged", () => {
    render(
      <ObjectDetail
        item={{
          ...item,
          display: {
            kind: "document",
            url: "/api/public/objects/object-123/display/card",
            mediaType: "image/svg+xml",
            interactive: false,
            revision: "face-1",
          },
        }}
      />,
    );

    expect(screen.getByTestId("object-front")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { level: 2, name: "Aurelia S7" }),
    ).toBeNull();
    expect(screen.queryByText("A product passport")).toBeNull();
  });

  it("opens template actions from the lower pass button", () => {
    render(<ObjectDetail item={item} actions={<div>Action controls</div>} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Show object actions" }),
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Action controls")).toBeTruthy();
  });
});
