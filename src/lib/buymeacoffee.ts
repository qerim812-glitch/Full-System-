/**
 * Buy Me a Coffee integration — pure helpers.
 *
 * Two halves, both testable without a network or a database:
 *
 *   1. The public page URL, used by the button on /donate.
 *   2. Webhook verification and payload normalisation, used by
 *      src/routes/api/bmc-webhook.ts.
 *
 * Everything here is deliberately free of Supabase and of `node:` imports —
 * the HMAC uses Web Crypto, which exists in Node 18+, in the Vercel runtime
 * and in Vitest, so the signature check is covered by unit tests.
 */

/**
 * The Buy Me a Coffee page to send supporters to.
 *
 * Public on purpose: it is a username that appears in a URL a member clicks.
 * Empty when unset, which is what `isBmcConfigured()` reports so the UI can
 * fall back to the manual form instead of rendering a link to nowhere.
 */
export const BMC_USERNAME: string = (
  import.meta.env.VITE_BMC_USERNAME ?? ""
).trim();

export function isBmcConfigured(): boolean {
  return BMC_USERNAME.length > 0;
}

export function buyMeACoffeeUrl(username: string = BMC_USERNAME): string {
  return `https://www.buymeacoffee.com/${encodeURIComponent(username)}`;
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Buy Me a Coffee signs each delivery with
 * `HMAC-SHA256(raw request body, webhook signing secret)`, hex-encoded, in the
 * `x-signature-sha256` header.
 *
 * The body must be the bytes exactly as received — re-serialising the parsed
 * JSON changes key order and whitespace and the hash stops matching, so the
 * route reads `await request.text()` once and passes that same string here and
 * to the parser.
 */
export const BMC_SIGNATURE_HEADER = "x-signature-sha256";

export async function bmcSignature(
  rawBody: string,
  secret: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return [...new Uint8Array(signed)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time comparison.
 *
 * A plain `===` on a signature leaks, through how long it takes to fail, how
 * many leading characters were right — enough to reconstruct a valid signature
 * one character at a time. Comparing every character and OR-ing the
 * differences takes the same time whatever the input.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function verifyBmcSignature(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header || !secret) return false;
  const expected = await bmcSignature(rawBody, secret);
  return timingSafeEqual(expected.toLowerCase(), header.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Payload normalisation
// ---------------------------------------------------------------------------

/**
 * Event types that represent money arriving once, which is all this app
 * records. Memberships and recurring donations fire their own event types and
 * are ignored rather than mis-recorded as one-off donations.
 */
export const BMC_DONATION_EVENTS = [
  "donation.created",
  "extra_purchase.created",
  "commission_order.created",
  "wishlist_payment.created",
] as const;

/** Events that reverse a donation already recorded. */
export const BMC_REFUND_EVENTS = [
  "donation.refunded",
  "extra_purchase.refunded",
  "commission_order.refunded",
  "wishlist_payment.refunded",
] as const;

export type BmcEnvelope = {
  event_id?: unknown;
  type?: unknown;
  live_mode?: unknown;
  created?: unknown;
  attempt?: unknown;
  data?: unknown;
};

export type NormalisedBmcDonation = {
  /** Namespaced so donations.provider_ref stays unique across providers. */
  providerRef: string;
  amountMinor: number;
  currency: string;
  supporterName: string | null;
  supporterEmail: string | null;
  message: string | null;
  liveMode: boolean;
};

/**
 * Buy Me a Coffee documents the envelope (`event_id` / `type` / `live_mode` /
 * `created` / `attempt` / `data`) and the signature scheme publicly, but the
 * field names *inside* `data` only in their OpenAPI spec. Rather than commit
 * to one spelling and silently record zeroes if it is wrong, each value is
 * read from a list of candidates, and `parseBmcDonation` returns null when the
 * required ones are all missing. The route logs the keys it actually received
 * in that case, so a single test event from the BMC dashboard is enough to
 * confirm or correct this list.
 */
const AMOUNT_KEYS = ["amount", "total_amount", "amount_paid", "total"];
const CURRENCY_KEYS = ["currency", "currency_code"];
const NAME_KEYS = ["supporter_name", "payer_name", "name", "supporter"];
const EMAIL_KEYS = ["supporter_email", "payer_email", "email"];
const MESSAGE_KEYS = [
  "support_note",
  "supporter_message",
  "note",
  "message",
  "comment",
];
const REF_KEYS = ["id", "support_id", "transaction_id", "psp_id", "payment_id"];

function pick(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

/**
 * Major units to minor units without floating point.
 *
 * `5.10 * 100` is 509.9999999999999 in binary floating point, so the string is
 * split on the decimal point instead — the same reasoning as `toMinorUnits`
 * in donations.ts, but tolerant of BMC sending a number or a string.
 */
export function bmcAmountToMinor(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const text = String(value).trim().replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const [whole = "0", fraction = ""] = text.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return minor > 0 ? minor : null;
}

function asString(value: unknown, max: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.slice(0, max);
}

export function bmcEventType(payload: BmcEnvelope): string | null {
  return typeof payload.type === "string" ? payload.type : null;
}

export function isBmcDonationEvent(type: string | null): boolean {
  return (
    type !== null && (BMC_DONATION_EVENTS as readonly string[]).includes(type)
  );
}

export function isBmcRefundEvent(type: string | null): boolean {
  return (
    type !== null && (BMC_REFUND_EVENTS as readonly string[]).includes(type)
  );
}

/** The provider_ref for an event, used to find the row a refund reverses. */
export function bmcProviderRef(payload: BmcEnvelope): string | null {
  const data =
    payload.data && typeof payload.data === "object"
      ? (payload.data as Record<string, unknown>)
      : {};
  const ref = pick(data, REF_KEYS) ?? payload.event_id;
  const text = asString(ref, 180);
  return text ? `bmc:${text}` : null;
}

export function parseBmcDonation(
  payload: BmcEnvelope,
): NormalisedBmcDonation | null {
  if (!payload.data || typeof payload.data !== "object") return null;
  const data = payload.data as Record<string, unknown>;

  const amountMinor = bmcAmountToMinor(pick(data, AMOUNT_KEYS));
  const providerRef = bmcProviderRef(payload);
  if (amountMinor === null || providerRef === null) return null;

  // donations.currency is CHAR(3); anything else would be rejected by the
  // constraint, so fall back rather than hand Postgres a bad row.
  const rawCurrency = asString(pick(data, CURRENCY_KEYS), 8)?.toUpperCase();
  const currency =
    rawCurrency && /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : "EUR";

  return {
    providerRef,
    amountMinor,
    currency,
    supporterName: asString(pick(data, NAME_KEYS), 120),
    supporterEmail:
      asString(pick(data, EMAIL_KEYS), 320)?.toLowerCase() ?? null,
    message: asString(pick(data, MESSAGE_KEYS), 1000),
    liveMode: payload.live_mode !== false,
  };
}
