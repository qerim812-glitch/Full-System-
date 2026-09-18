import { createFileRoute } from "@tanstack/react-router";

import {
  BMC_SIGNATURE_HEADER,
  bmcEventType,
  bmcProviderRef,
  isBmcDonationEvent,
  isBmcRefundEvent,
  parseBmcDonation,
  verifyBmcSignature,
  type BmcEnvelope,
} from "../../lib/buymeacoffee";
import { getSupabaseServiceRoleClient } from "../../lib/supabase/service-role";

/**
 * Buy Me a Coffee webhook receiver — POST /api/bmc-webhook.
 *
 * Paste this URL into BMC → Settings → Webhooks, then put the webhook's
 * signing secret in BMC_WEBHOOK_SECRET (server-side env, no VITE_ prefix).
 * Until that variable is set the route reports 501 and records nothing, so
 * deploying this before the BMC side exists is harmless.
 *
 * Why this route may write to the database with no session: there is no user
 * here. The caller is BMC's server. The credential is the HMAC signature over
 * the raw body, which is checked before anything is read out of the payload,
 * and only then does the handler reach for the service-role client.
 *
 * It is deliberately not CSRF-protected: src/start.ts filters the CSRF
 * middleware to `handlerType === "serverFn"`, and a webhook by definition has
 * no browser origin to check.
 *
 * Status codes matter because BMC retries on anything that is not 2xx:
 *   200  recorded, or an event type we intentionally ignore
 *   202  understood but not recorded (unrecognised payload shape / test event)
 *   401  signature missing or wrong — never retried into success, so BMC
 *        surfaces it in their delivery log where it can be seen
 *   501  BMC_WEBHOOK_SECRET not configured on this deployment
 */

function json(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function handleWebhook(request: Request): Promise<Response> {
  const secret = process.env["BMC_WEBHOOK_SECRET"];
  if (!secret) {
    console.warn(
      "[bmc] webhook hit but BMC_WEBHOOK_SECRET is not set — ignoring.",
    );
    return json({ error: "Webhook not configured" }, 501);
  }

  // The signature covers the bytes exactly as sent. Read the body once, as
  // text, and use that same string for both the HMAC and the JSON parse —
  // re-serialising the parsed object would change key order and break the
  // comparison.
  const rawBody = await request.text();
  const signature = request.headers.get(BMC_SIGNATURE_HEADER);

  if (!(await verifyBmcSignature(rawBody, signature, secret))) {
    console.warn("[bmc] rejected a delivery with an invalid signature.");
    return json({ error: "Invalid signature" }, 401);
  }

  let payload: BmcEnvelope;
  try {
    payload = JSON.parse(rawBody) as BmcEnvelope;
  } catch {
    return json({ error: "Body is not JSON" }, 202);
  }

  const type = bmcEventType(payload);

  // ---- anything that is not money moving ----------------------------------
  // Checked before the service-role client is built: memberships and recurring
  // donations are events we acknowledge and drop, and constructing a client we
  // never use would turn a missing service-role key into a 500 that BMC then
  // retries forever, instead of a clean "understood, ignored".
  if (!isBmcDonationEvent(type) && !isBmcRefundEvent(type)) {
    return json({ ignored: type ?? "unknown event" }, 200);
  }

  // ---- refunds ------------------------------------------------------------
  if (isBmcRefundEvent(type)) {
    const providerRef = bmcProviderRef(payload);
    if (!providerRef) return json({ ignored: "refund without a ref" }, 202);

    const { error } = await getSupabaseServiceRoleClient()
      .from("donations")
      .update({ status: "refunded" })
      .eq("provider_ref", providerRef);

    if (error) {
      console.error("[bmc] could not mark refunded:", error.message);
      return json({ error: "Could not record refund" }, 500);
    }
    return json({ ok: true, action: "refunded" }, 200);
  }

  // ---- donations ----------------------------------------------------------
  const donation = parseBmcDonation(payload);
  if (!donation) {
    // The signature was valid, so this really is BMC — the payload just did
    // not match any field spelling in lib/buymeacoffee.ts. Log the keys (not
    // the values, which include a supporter's email) so the candidate list can
    // be corrected from one test event.
    const data = payload.data;
    console.error(
      "[bmc] valid signature but unrecognised donation payload. type=%s data keys=%s",
      type,
      data && typeof data === "object"
        ? Object.keys(data as Record<string, unknown>).join(",")
        : typeof data,
    );
    return json({ error: "Unrecognised payload shape" }, 202);
  }

  // BMC's "send test event" has live_mode false. Recording those in production
  // would put money in the ledger that never arrived; in development they are
  // exactly what you want to see land.
  if (!donation.liveMode && process.env["NODE_ENV"] === "production") {
    return json({ ignored: "test event" }, 200);
  }

  // Only now, with a payload we are certain we will write, is the service-role
  // client built — every branch above answers without touching the database,
  // and building it eagerly turned those answers into 500s.
  const supabase = getSupabaseServiceRoleClient();

  // Attach the donation to a member when the supporter's email matches one, so
  // it shows up on their own /donate page. No match is fine and common —
  // supporters do not have to be members.
  let userId: string | null = null;
  if (donation.supporterEmail) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", donation.supporterEmail)
      .maybeSingle();
    userId = (profile as { id: string } | null)?.id ?? null;
  }

  // provider_ref is UNIQUE, which is what makes this idempotent: BMC retries a
  // delivery it did not get a 2xx for, and the retry collides instead of
  // double-counting. ignoreDuplicates turns that collision into a no-op.
  const { error } = await supabase.from("donations").upsert(
    {
      user_id: userId,
      donor_email: donation.supporterEmail,
      donor_name: donation.supporterName,
      amount_minor: donation.amountMinor,
      currency: donation.currency,
      method: "card",
      provider: "buymeacoffee",
      // Money has already changed hands by the time BMC calls us — unlike the
      // manual form, there is nothing for an admin to confirm.
      status: "confirmed",
      provider_ref: donation.providerRef,
      message: donation.message,
    },
    { onConflict: "provider_ref", ignoreDuplicates: true },
  );

  if (error) {
    console.error("[bmc] could not record donation:", error.message);
    return json({ error: "Could not record donation" }, 500);
  }

  return json({ ok: true, action: "recorded" }, 200);
}

export const Route = createFileRoute("/api/bmc-webhook")({
  server: {
    handlers: {
      POST: ({ request }) => handleWebhook(request),
    },
  },
});
