import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { Tabs } from "@/app/_components/design-system/tabs";

function ExampleTabs() {
  const [value, setValue] = useState<"email" | "wallet" | "passkey">("email");
  return (
    <Tabs
      label="Authentication method"
      options={[
        { id: "email", label: "Email" },
        { id: "wallet", label: "Wallet" },
        { id: "passkey", label: "Passkey" },
      ]}
      value={value}
      onChange={setValue}
    >
      <p>{value} panel</p>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("uses roving focus and arrow-key activation", () => {
    render(<ExampleTabs />);
    const email = screen.getByRole("tab", { name: "Email" });
    const wallet = screen.getByRole("tab", { name: "Wallet" });

    email.focus();
    fireEvent.keyDown(email, { key: "ArrowRight" });

    expect(document.activeElement).toBe(wallet);
    expect(wallet.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").textContent).toContain("wallet panel");
  });
});
