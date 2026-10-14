import { fireEvent, render, screen, within } from "@testing-library/react";
import { ProductFaceConfirmationDialog } from "@/app/_components/products/product-face-confirmation";
import type { ProductFaceConfirmation } from "@/app/_domain/product-face";
import { application, HOLDER } from "@/test/product-face-fixtures";

jest.mock("next-intl", () => jest.requireActual("@/test/intl-mock").intlMock);

function renderDialog(request: ProductFaceConfirmation) {
  const onAnswer = jest.fn();
  render(
    <>
      <button type="button">Opener</button>
      <ProductFaceConfirmationDialog
        request={request}
        application={application}
        walletAddress={HOLDER}
        onAnswer={onAnswer}
      />
    </>,
  );
  return onAnswer;
}

describe("ProductFaceConfirmationDialog", () => {
  it("shows canonical unit facts, the programme and the user's own wallet", () => {
    const onAnswer = renderDialog({
      kind: "registration",
      unit: {
        objectId: "aaaaaaaaaaaaaaaaaaaaaaaa",
        templateId: application.templateIds[0],
        name: "Arc grinder",
        fields: { serialNumber: "MH-ARC-0001", model: "Arc" },
        readback: { ownerIsYou: false, state: "Issued", lifecycleTarget: null },
        registration: "not_owned",
      },
    });
    const dialog = screen.getByRole("dialog", {
      name: "Register this product to your wallet?",
    });
    expect(
      within(dialog).getByText("Requested by morrow-home for Morrow Home Arc"),
    ).toBeTruthy();
    expect(within(dialog).getByText("MH-ARC-0001")).toBeTruthy();
    expect(within(dialog).getByText("0x12....678")).toBeTruthy();
    // The least consequential choice has focus first.
    expect(document.activeElement).toBe(
      within(dialog).getByRole("button", { name: "Cancel" }),
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onAnswer).toHaveBeenCalledWith(false);
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Register product" }),
    );
    expect(onAnswer).toHaveBeenLastCalledWith(true);
  });

  it("closes as a cancellation on Escape", () => {
    const onAnswer = renderDialog({
      kind: "runtime",
      operation: "case.open",
      product: { objectId: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Arc grinder" },
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onAnswer).toHaveBeenCalledWith(false);
  });

  it("shows the host-read quote exactly and states that no payment is taken", () => {
    renderDialog({
      kind: "runtime",
      operation: "case.quote.approve",
      product: { objectId: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Arc grinder" },
      caseId: "case-1",
      quote: {
        caseId: "case-1",
        quoteVersion: "q2",
        provider: "Morrow Service Centre",
        amount: "1234567.89",
        currency: "EUR",
      },
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Approve a service quote")).toBeTruthy();
    expect(within(dialog).getByText("€1,234,567.89")).toBeTruthy();
    expect(
      within(dialog).getByText("Provider (from the publisher)"),
    ).toBeTruthy();
    expect(within(dialog).getByText("No payment is taken.")).toBeTruthy();
  });

  it("lists the exact decoded settle changes", () => {
    renderDialog({
      kind: "settle",
      product: { objectId: "aaaaaaaaaaaaaaaaaaaaaaaa", name: "Arc grinder" },
      action: "update",
      changes: [
        {
          field: "custom.state",
          from: "Transfer pending",
          to: "Authenticity verified",
        },
      ],
    });
    const table = screen.getByRole("table", {
      name: "Changes to your product",
    });
    const row = within(table).getByRole("row", { name: /Status/ });
    expect(within(row).getByText("Transfer pending")).toBeTruthy();
    expect(within(row).getByText("Authenticity verified")).toBeTruthy();
  });
});
