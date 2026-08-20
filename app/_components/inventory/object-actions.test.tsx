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
        cancel: "Cancel",
        deny: "Deny",
        optional: "Optional",
        completed: `Action submitted. ID: ${values?.id}`,
        executionFailed: "The action could not be completed.",
        "names.burn": "Burn",
        "names.transfer": "Transfer",
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
