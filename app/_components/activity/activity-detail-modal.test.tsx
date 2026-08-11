import { fireEvent, render, screen } from "@testing-library/react";
import type { ActionLog } from "@/api/web-sdk/models/ActionLog";
import { ActivityDetailModal } from "@/app/_components/activity/activity-detail-modal";
import { toActivityEntry } from "@/app/_domain/inventory";

jest.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations:
    () =>
    (key: string, values?: { count?: number }): string =>
      ({
        eyebrow: "Action record",
        close: "Close activity details",
        action: "Action",
        id: "Action ID",
        batchId: "Batch ID",
        name: "Action name",
        alias: "Alias",
        version: "Version",
        nonce: "Nonce",
        created: "Created",
        modified: "Last modified",
        authentication: "Authentication method",
        accessType: "Access type",
        integrity: "Integrity and participants",
        hash: "Action hash",
        messageHash: "Message hash",
        signer: "Signer",
        delegatedSigner: "Delegated signer",
        fees: "Fees",
        baseFee: "Base fee",
        baseFeeWei: "Base fee (wei)",
        dynamicFee: "Dynamic fee",
        dynamicFeeWei: "Dynamic fee (wei)",
        additionalFee: "Additional fee",
        additionalFeeWei: "Additional fee (wei)",
        tokenPrice: "Token price",
        totalFee: "Total fee",
        totalFeeWei: "Total fee (wei)",
        parameters: "Parameters",
        affectedObjects: `Affected objects (${values?.count ?? 0})`,
        objectId: "Object ID",
        templateId: "Template ID",
        changeType: "Change type",
        stateChangeId: "State change ID",
        previousStateHash: "Previous state hash",
        nextStateHash: "Next state hash",
        previousIntegrityHash: "Previous integrity hash",
        integrityHash: "Integrity hash",
        permit: "Permit",
        access: "Access policy",
        securityNote: "Sensitive values are hidden.",
      })[key] ?? key,
}));

const raw = {
  id: "action-1",
  name: "update",
  alias: "Update passport",
  params: { id: "object-1", dataHash: "0xdata", permitSecret: "top-secret" },
  messageHash: "0xmessage",
  signer: "0xsigner",
  signature: "0xsignature",
  hash: "0xaction",
  affectedObjects: [
    {
      id: "object-1",
      templateId: "template-1",
      prevStateHash: "0xprev-state",
      nextStateHash: "0xnext-state",
      prevIntegrityHash: "0xprev-integrity",
      integrityHash: "0xintegrity",
      stateChangeId: "state-change-1",
      changeType: "update",
    },
  ],
  status: "completed",
  baseFee: "0.1",
  baseFeeWei: "100",
  dynamicFee: "0.2",
  dynamicFeeWei: "200",
  tokenPrice: "1",
  totalFee: "0.3 DUAL",
  totalFeeWei: "300",
  nonce: 4,
  access: { type: "public" },
  auth: { type: "webauthn", credentialId: "credential-secret" },
  version: 1,
  whenCreated: new Date("2026-08-11T10:00:00Z"),
  whenModified: new Date("2026-08-11T10:01:00Z"),
} as ActionLog;

describe("ActivityDetailModal", () => {
  it("shows the complete safe action data and omits signing secrets", () => {
    const onClose = jest.fn();
    const entry = toActivityEntry(raw);
    expect(entry.detail).not.toHaveProperty("signature");
    expect(entry.detail).not.toHaveProperty("auth");
    expect(entry.detail.params).not.toHaveProperty("permitSecret");
    render(<ActivityDetailModal entry={entry} onClose={onClose} />);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Update passport" }),
    ).toBeTruthy();
    expect(screen.getByText("0xmessage")).toBeTruthy();
    expect(screen.getByText("state-change-1")).toBeTruthy();
    expect(screen.getByText("webauthn")).toBeTruthy();
    expect(screen.queryByText("0xsignature")).toBeNull();
    expect(screen.queryByText("top-secret")).toBeNull();
    expect(screen.queryByText("credential-secret")).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Close activity details" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
