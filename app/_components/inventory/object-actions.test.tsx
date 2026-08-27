import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ObjectActions } from "@/app/_components/inventory/object-actions";
import type { InventoryObject } from "@/app/_domain/inventory";
import { ActionInputError } from "@/app/_services/inventory-actions";

const mutateAsync = jest.fn();

jest.mock("@/app/_hooks/use-inventory-action", () => ({
  useExecuteInventoryAction: () => ({ mutateAsync, isPending: false }),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => {
    const translate = (key: string, values?: Record<string, string>) => {
      const messages: Record<string, string> = {
        eyebrow: "Smart object actions",
        title: "Available actions",
        description: "Template actions",
        confirmation: `Run ${values?.action} for this object.`,
        execute: `Run ${values?.action}`,
        executing: "Authorizing",
        confirm: `Yes, run ${values?.action}`,
        confirmDestructive: `${values?.action} is permanent.`,
        confirmTransferZero: "Zero-address destination.",
        confirmTransferUnknown: "Not a valid address.",
        confirmConnectUnknown: "Not a valid address or object ID.",
        cancel: "Cancel",
        deny: "Deny",
        optional: "Optional",
        completed: `Action submitted. ID: ${values?.id}`,
        executionFailed: "The action could not be completed.",
        "names.burn": "Burn",
        "names.transfer": "Transfer",
        "names.connect": "Connect",
        "fields.to": "Destination",
        "validation.required": `Enter ${values?.field}.`,
      };
      return messages[key] ?? key;
    };
    return Object.assign(translate, { raw: () => "" });
  },
}));

const item = (actions: string[]) =>
  ({ id: "object-123", name: "Aurelia S7", actions }) as InventoryObject;

beforeEach(() => mutateAsync.mockReset());

describe("ObjectActions", () => {
  it("shows a validation failure on the field that caused it", async () => {
    mutateAsync.mockRejectedValue(new ActionInputError("to", "required"));

    render(<ObjectActions item={item(["transfer"])} />);
    const field = screen.getByLabelText(/Destination/);
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Run Transfer" }));

    await waitFor(() =>
      expect(field.getAttribute("aria-invalid")).toBe("true"),
    );
    expect(screen.getByRole("alert").textContent).toBe("Enter Destination.");
  });

  it("clears a field error once the value changes", async () => {
    mutateAsync.mockRejectedValue(new ActionInputError("to", "required"));

    render(<ObjectActions item={item(["transfer"])} />);
    const field = screen.getByLabelText(/Destination/);
    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Run Transfer" }));
    await waitFor(() =>
      expect(field.getAttribute("aria-invalid")).toBe("true"),
    );

    fireEvent.change(field, { target: { value: "0xabc" } });
    expect(field.getAttribute("aria-invalid")).toBe("false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("requires a second confirmation before burning", async () => {
    mutateAsync.mockResolvedValue({ actionId: "action-1" });

    render(<ObjectActions item={item(["burn"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Run Burn" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "Burn is permanent.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Yes, run Burn" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("does not burn when the run button is double-clicked", async () => {
    mutateAsync.mockResolvedValue({ actionId: "action-1" });

    render(<ObjectActions item={item(["burn"])} />);
    await userEvent.dblClick(screen.getByRole("button", { name: "Run Burn" }));

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("burns exactly once when the confirmation is double-clicked", async () => {
    mutateAsync.mockResolvedValue({ actionId: "action-1" });

    render(<ObjectActions item={item(["burn"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Run Burn" }));
    await userEvent.dblClick(
      screen.getByRole("button", { name: "Yes, run Burn" }),
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("opens the destructive confirmation focused on the safe choice", () => {
    render(<ObjectActions item={item(["burn"])} />);
    fireEvent.click(screen.getByRole("button", { name: "Run Burn" }));

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Cancel" }),
    );
  });

  it("asks for confirmation when the transfer destination is not an address", async () => {
    mutateAsync.mockResolvedValue({ actionId: "action-1" });

    render(<ObjectActions item={item(["transfer"])} />);
    fireEvent.change(screen.getByLabelText(/Destination/), {
      target: { value: "obj_123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Transfer" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Not a valid address.");

    fireEvent.click(screen.getByRole("button", { name: "Yes, run Transfer" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("leaves the confirmation with one cancel click", () => {
    const onCancel = jest.fn();
    render(<ObjectActions item={item(["transfer"])} onCancel={onCancel} />);
    fireEvent.change(screen.getByLabelText(/Destination/), {
      target: { value: "obj_123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Transfer" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("withdraws the confirmation when the destination changes", () => {
    render(<ObjectActions item={item(["transfer"])} onCancel={jest.fn()} />);
    const field = screen.getByLabelText(/Destination/);
    fireEvent.change(field, { target: { value: "obj_123" } });
    fireEvent.click(screen.getByRole("button", { name: "Run Transfer" }));
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.change(field, {
      target: { value: "0x1234567890abcdef1234567890abcdef12345f45" },
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "Run Transfer" })).toBeTruthy();
  });

  it("asks for confirmation when the transfer destination is the zero address", () => {
    render(<ObjectActions item={item(["transfer"])} />);
    fireEvent.change(screen.getByLabelText(/Destination/), {
      target: { value: `0x${"0".repeat(40)}` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Transfer" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(
      "Zero-address destination.",
    );
  });

  it("transfers to a valid Ethereum address without a confirmation step", async () => {
    mutateAsync.mockResolvedValue({ actionId: "action-1" });

    render(<ObjectActions item={item(["transfer"])} />);
    fireEvent.change(screen.getByLabelText(/Destination/), {
      target: { value: "0x1234567890abcdef1234567890abcdef12345f45" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Transfer" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("asks for confirmation when the connect destination has an unknown shape", () => {
    render(<ObjectActions item={item(["connect"])} />);
    fireEvent.change(screen.getByLabelText(/Destination/), {
      target: { value: "not-an-id" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Connect" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe(
      "Not a valid address or object ID.",
    );
  });

  it("connects to an object ID without a confirmation step", async () => {
    mutateAsync.mockResolvedValue({ actionId: "action-1" });

    render(<ObjectActions item={item(["connect"])} />);
    fireEvent.change(screen.getByLabelText(/Destination/), {
      target: { value: "665f1c2d4b1a2c3d4e5f6a7b" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run Connect" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("offers an explicit denial for actions the embedded app requested", () => {
    const onCancel = jest.fn();
    render(
      <ObjectActions
        item={item(["transfer"])}
        requestedAction={{ name: "transfer", input: {} }}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
