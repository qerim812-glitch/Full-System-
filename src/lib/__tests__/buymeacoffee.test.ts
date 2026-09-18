import { describe, expect, it } from "vitest";

import {
  bmcAmountToMinor,
  bmcProviderRef,
  bmcSignature,
  buyMeACoffeeUrl,
  isBmcDonationEvent,
  isBmcRefundEvent,
  parseBmcDonation,
  timingSafeEqual,
  verifyBmcSignature,
} from "@/lib/buymeacoffee";

describe("buyMeACoffeeUrl", () => {
  it("builds the public page URL", () => {
    expect(buyMeACoffeeUrl("socialcircle")).toBe(
      "https://www.buymeacoffee.com/socialcircle",
    );
  });

  it("escapes a handle so it cannot break out of the path", () => {
    expect(buyMeACoffeeUrl("a/../evil")).toBe(
      "https://www.buymeacoffee.com/a%2F..%2Fevil",
    );
  });
});

describe("bmcAmountToMinor", () => {
  it("converts numbers and strings to minor units", () => {
    expect(bmcAmountToMinor(5)).toBe(500);
    expect(bmcAmountToMinor("5")).toBe(500);
    expect(bmcAmountToMinor("12.50")).toBe(1250);
    expect(bmcAmountToMinor("0.99")).toBe(99);
  });

  it("does not lose a cent to binary floating point", () => {
    // 5.10 * 100 is 509.9999999999999 as a float.
    expect(bmcAmountToMinor("5.10")).toBe(510);
    expect(bmcAmountToMinor(5.1)).toBe(510);
    expect(bmcAmountToMinor("1.15")).toBe(115);
  });

  it("rejects anything that is not a positive money amount", () => {
    expect(bmcAmountToMinor("0")).toBeNull();
    expect(bmcAmountToMinor("-5")).toBeNull();
    expect(bmcAmountToMinor("abc")).toBeNull();
    expect(bmcAmountToMinor("1.234")).toBeNull();
    expect(bmcAmountToMinor(null)).toBeNull();
    expect(bmcAmountToMinor(undefined)).toBeNull();
  });
});

describe("event classification", () => {
  it("treats one-off payments as donations", () => {
    expect(isBmcDonationEvent("donation.created")).toBe(true);
    expect(isBmcDonationEvent("extra_purchase.created")).toBe(true);
  });

  it("does not treat memberships or recurring donations as one-off", () => {
    expect(isBmcDonationEvent("membership.started")).toBe(false);
    expect(isBmcDonationEvent("recurring_donation.started")).toBe(false);
    expect(isBmcDonationEvent(null)).toBe(false);
  });

  it("recognises refunds separately", () => {
    expect(isBmcRefundEvent("donation.refunded")).toBe(true);
    expect(isBmcRefundEvent("donation.created")).toBe(false);
  });
});

describe("parseBmcDonation", () => {
  const envelope = {
    event_id: "evt_1",
    type: "donation.created",
    live_mode: true,
    created: 1_764_000_000,
    attempt: 1,
    data: {
      id: 998877,
      amount: "5.00",
      currency: "eur",
      supporter_name: "Ana",
      supporter_email: "Ana@Example.com",
      support_note: "Keep going!",
    },
  };

  it("normalises a donation payload", () => {
    const parsed = parseBmcDonation(envelope);
    expect(parsed).toEqual({
      providerRef: "bmc:998877",
      amountMinor: 500,
      currency: "EUR",
      supporterName: "Ana",
      supporterEmail: "ana@example.com",
      message: "Keep going!",
      liveMode: true,
    });
  });

  it("namespaces the provider ref so it cannot collide with another provider", () => {
    expect(bmcProviderRef(envelope)).toBe("bmc:998877");
  });

  it("falls back to the envelope event id when data carries no id", () => {
    expect(bmcProviderRef({ event_id: "evt_9", data: { amount: 1 } })).toBe(
      "bmc:evt_9",
    );
  });

  it("accepts the alternative field spellings", () => {
    const parsed = parseBmcDonation({
      event_id: "evt_2",
      type: "donation.created",
      data: {
        transaction_id: "tx_7",
        total_amount: 3,
        currency_code: "USD",
        payer_name: "Bes",
        payer_email: "bes@example.com",
        supporter_message: "hi",
      },
    });
    expect(parsed?.providerRef).toBe("bmc:tx_7");
    expect(parsed?.amountMinor).toBe(300);
    expect(parsed?.currency).toBe("USD");
    expect(parsed?.supporterName).toBe("Bes");
  });

  it("falls back to EUR rather than handing Postgres a bad CHAR(3)", () => {
    const parsed = parseBmcDonation({
      event_id: "e",
      data: { id: 1, amount: 2, currency: "Euro" },
    });
    expect(parsed?.currency).toBe("EUR");
  });

  it("marks a test event so it is not booked as real money", () => {
    const parsed = parseBmcDonation({ ...envelope, live_mode: false });
    expect(parsed?.liveMode).toBe(false);
  });

  it("returns null when no amount can be read, rather than recording zero", () => {
    expect(parseBmcDonation({ event_id: "e", data: { id: 1 } })).toBeNull();
    expect(parseBmcDonation({ event_id: "e", data: null })).toBeNull();
    expect(parseBmcDonation({ event_id: "e" })).toBeNull();
  });
});

describe("signature verification", () => {
  const secret = "whsec_test";
  const body = '{"type":"donation.created","data":{"id":1,"amount":5}}';

  it("matches the documented HMAC-SHA256 hex construction", async () => {
    // Buy Me a Coffee documents the header as
    //   crypto.createHmac("sha256", secret).update(rawBody).digest("hex")
    // This literal is that Node expression's output for the secret and body
    // above, so it pins our Web Crypto implementation to theirs — if the two
    // ever diverge, every real delivery would be rejected as unsigned.
    const signature = await bmcSignature(body, secret);
    expect(signature).toBe(
      "fe11080e21b3b5a5e642af92fcff8eb6ed03e9e3bfd7d0a69685986bb054cb65",
    );
    expect(await verifyBmcSignature(body, signature, secret)).toBe(true);
  });

  it("is case-insensitive about the header and tolerates whitespace", async () => {
    const signature = await bmcSignature(body, secret);
    expect(
      await verifyBmcSignature(body, ` ${signature.toUpperCase()} `, secret),
    ).toBe(true);
  });

  it("rejects a body that was altered after signing", async () => {
    const signature = await bmcSignature(body, secret);
    const tampered = body.replace('"amount":5', '"amount":500');
    expect(await verifyBmcSignature(tampered, signature, secret)).toBe(false);
  });

  it("rejects the wrong secret, a missing header and an empty secret", async () => {
    const signature = await bmcSignature(body, secret);
    expect(await verifyBmcSignature(body, signature, "whsec_other")).toBe(
      false,
    );
    expect(await verifyBmcSignature(body, null, secret)).toBe(false);
    expect(await verifyBmcSignature(body, signature, "")).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("compares equal strings as equal", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("rejects different values and different lengths", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
    expect(timingSafeEqual("", "a")).toBe(false);
  });
});
