import { describe, expect, it, vi } from "vitest";

import {
  isLoginActionDisabled,
  submitLoginFlow,
} from "../../miniprogram/core/login-flow.js";

describe("combined mini-program login flow", () => {
  it("enables the action only after every visible requirement is satisfied", () => {
    expect(isLoginActionDisabled({
      agreementChecked: false,
      agreementRequired: true,
      inviteCode: "APPLYMATE",
      inviteRequired: true,
    })).toBe(true);
    expect(isLoginActionDisabled({
      agreementChecked: true,
      agreementRequired: true,
      inviteCode: "APPLYMATE",
      inviteRequired: true,
    })).toBe(false);
    expect(isLoginActionDisabled({
      agreementChecked: true,
      agreementRequired: true,
      inviteCode: "",
      inviteRequired: false,
    })).toBe(false);
  });

  it("accepts agreements before activating the invitation", async () => {
    const calls: string[] = [];
    const result = await submitLoginFlow({
      agreementChecked: true,
      agreementRequired: true,
      inviteCode: "APPLYMATE",
      inviteRequired: true,
    }, {
      acceptAgreement: async () => { calls.push("agreement"); },
      activateInvite: async () => { calls.push("invite"); },
    });

    expect(calls).toEqual(["agreement", "invite"]);
    expect(result).toEqual({ agreementAccepted: true, activated: true });
  });

  it("preserves the accepted agreement when invitation activation fails", async () => {
    const activateInvite = vi.fn(async () => Promise.reject(new Error("invalid invite")));

    await expect(submitLoginFlow({
      agreementChecked: true,
      agreementRequired: true,
      inviteCode: "WRONGCODE",
      inviteRequired: true,
    }, {
      acceptAgreement: async () => undefined,
      activateInvite,
    })).rejects.toMatchObject({ agreementAccepted: true });
    expect(activateInvite).toHaveBeenCalledOnce();
  });

  it("requires the checkbox and invitation without making API calls", async () => {
    const acceptAgreement = vi.fn();
    const activateInvite = vi.fn();

    await expect(submitLoginFlow({
      agreementChecked: false,
      agreementRequired: true,
      inviteCode: "",
      inviteRequired: true,
    }, { acceptAgreement, activateInvite })).rejects.toMatchObject({
      code: "AGREEMENT_REQUIRED",
    });
    expect(acceptAgreement).not.toHaveBeenCalled();
    expect(activateInvite).not.toHaveBeenCalled();
  });

  it("lets an administrator accept the agreement without an invitation", async () => {
    const activateInvite = vi.fn();
    await expect(submitLoginFlow({
      agreementChecked: true,
      agreementRequired: true,
      inviteCode: "",
      inviteRequired: false,
    }, {
      acceptAgreement: async () => undefined,
      activateInvite,
    })).resolves.toEqual({ agreementAccepted: true, activated: true });
    expect(activateInvite).not.toHaveBeenCalled();
  });
});
