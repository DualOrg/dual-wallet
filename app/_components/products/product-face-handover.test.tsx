import { render, screen, waitFor } from "@testing-library/react";
import { ProductFaceError } from "@/app/_domain/product-face";

jest.mock("next-intl", () => jest.requireActual("@/test/intl-mock").intlMock);

const submitFaceHandover = jest.fn();
jest.mock("@/app/_services/product-face.client", () => ({
  submitFaceHandover: (...args: unknown[]) => submitFaceHandover(...args),
}));

import { ProductFaceHandover } from "@/app/_components/products/product-face-handover";

const TICKET = "k".repeat(43);

function arrive(hash: string) {
  window.history.replaceState(
    null,
    "",
    `/products/morrow-home/handover${hash}`,
  );
}

describe("ProductFaceHandover (contract r14)", () => {
  beforeEach(() => submitFaceHandover.mockReset());

  it("strips the fragment before anything is sent, then leaves for the register task", async () => {
    arrive(`#ticket=${TICKET}`);
    let hashWhenSent: string | undefined;
    submitFaceHandover.mockImplementation(async () => {
      hashWhenSent = window.location.hash;
      return "/products/morrow-home/register";
    });
    const leave = jest.fn();
    render(
      <ProductFaceHandover
        slug="morrow-home"
        available
        programmeName="Morrow Home Arc"
        leave={leave}
      />,
    );
    expect(window.location.hash).toBe("");
    expect(window.location.href).not.toContain(TICKET);
    await waitFor(() =>
      expect(leave).toHaveBeenCalledWith("/products/morrow-home/register"),
    );
    expect(hashWhenSent).toBe("");
    expect(submitFaceHandover).toHaveBeenCalledTimes(1);
    expect(submitFaceHandover).toHaveBeenCalledWith(
      "morrow-home",
      TICKET,
      "handover",
    );
    expect(
      screen.getByRole("heading", { name: "Morrow Home Arc" }),
    ).toBeTruthy();
  });

  it("stores nothing for a programme without handover, but still strips the fragment", async () => {
    arrive(`#ticket=${TICKET}`);
    const leave = jest.fn();
    render(
      <ProductFaceHandover
        slug="unknown"
        available={false}
        programmeName={null}
        leave={leave}
      />,
    );
    expect(window.location.hash).toBe("");
    expect(
      await screen.findByText(
        "This registration link can't be opened in this wallet.",
      ),
    ).toBeTruthy();
    expect(submitFaceHandover).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  });

  it("refuses a missing or malformed ticket without sending it", async () => {
    for (const hash of ["", "#ticket=short", "#access=MH-HANDOVER-A"]) {
      arrive(hash);
      const { unmount } = render(
        <ProductFaceHandover
          slug="morrow-home"
          available
          programmeName="Morrow Home Arc"
          leave={jest.fn()}
        />,
      );
      expect(
        await screen.findByText(
          "This registration link is incomplete. Open it again from the message you received.",
        ),
      ).toBeTruthy();
      unmount();
    }
    expect(submitFaceHandover).not.toHaveBeenCalled();
  });

  it("shows the wallet's refusal", async () => {
    arrive(`#ticket=${TICKET}`);
    submitFaceHandover.mockRejectedValue(
      new ProductFaceError("handover_unavailable", 404),
    );
    const leave = jest.fn();
    render(
      <ProductFaceHandover
        slug="morrow-home"
        available
        programmeName="Morrow Home Arc"
        leave={leave}
      />,
    );
    expect(
      await screen.findByText(
        "This registration link can't be opened in this wallet.",
      ),
    ).toBeTruthy();
    expect(leave).not.toHaveBeenCalled();
  });
});
