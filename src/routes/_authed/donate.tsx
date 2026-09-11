import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "../../components/ui/alert";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import {
  CURRENCIES,
  declareDonation,
  fetchMyDonations,
  formatAmount,
  toMinorUnits,
} from "../../lib/donations";

const METHODS = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other" },
] as const;

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  confirmed: "bg-accent text-accent-foreground",
  failed: "bg-destructive/10 text-destructive",
  refunded: "bg-muted text-muted-foreground",
};

export const Route = createFileRoute("/_authed/donate")({
  loader: async () => ({ donations: await fetchMyDonations() }),
  component: DonatePage,
});

function DonatePage() {
  const { donations } = Route.useLoaderData();
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("ALL");
  const [method, setMethod] = useState<(typeof METHODS)[number]["value"]>("bank_transfer");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const totalConfirmed = donations
    .filter((d) => d.status === "confirmed")
    .reduce((s, d) => s + d.amount_minor, 0);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const amountMinor = toMinorUnits(amount);
    if (amountMinor === null) { toast.error("Enter an amount like 12.50."); return; }
    setBusy(true);
    const result = await declareDonation({
      data: {
        amountMinor,
        currency,
        method,
        ...(message.trim() ? { message: message.trim() } : {}),
      },
    });
    setBusy(false);
    if (!result.ok) { toast.error(result.error); return; }
    setAmount("");
    setMessage("");
    toast.success("Thank you — your donation is recorded as pending.");
    await router.invalidate();
  }

  return (
    <div className="flex flex-col gap-8">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Support NewPop</h1>
        <p className="text-sm text-muted-foreground">
          Donations keep the platform running. Record your donation and we'll confirm it once the transfer arrives.
        </p>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-4">
        <StatChip label="Total donations" value={String(donations.length)} />
        <StatChip label="Confirmed" value={String(donations.filter(d => d.status === "confirmed").length)} accent />
        <StatChip label="Pending" value={String(donations.filter(d => d.status === "pending").length)} />
        {totalConfirmed > 0 && (
          <StatChip label="Total confirmed" value={formatAmount(totalConfirmed, currency)} />
        )}
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">

        {/* ── Donation form ────────────────────────────────────── */}
        <form
          onSubmit={handleSubmit}
          className="flex h-fit flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <h2 className="text-base font-semibold text-foreground">Record a donation</h2>

          <Alert>
            <AlertDescription>
              This records your intent — it does not take payment. Nothing is charged.
              An admin marks it confirmed once the money arrives.
            </AlertDescription>
          </Alert>

          {/* Amount + currency */}
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="amount" className="text-xs font-medium">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="12.50"
                className="rounded-xl"
              />
            </div>
            <div className="flex w-28 flex-col gap-1.5">
              <Label htmlFor="currency" className="text-xs font-medium">Currency</Label>
              <select
                id="currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as (typeof CURRENCIES)[number])}
                className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Payment method — pill selector */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Payment method</Label>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMethod(m.value)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                    method === m.value
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-card text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="message" className="text-xs font-medium">
              Message <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="message"
              value={message}
              maxLength={1000}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything you'd like us to know"
              className="rounded-xl"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Recording…" : "Record donation"}
          </button>
        </form>

        {/* ── Donation history ─────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">Your donations</h2>
          {donations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center">
              <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {donations.map((donation) => (
                <li
                  key={donation.id}
                  className="flex items-start justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {formatAmount(donation.amount_minor, donation.currency)}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        {donation.method.replace("_", " ")}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(donation.created_at).toLocaleDateString()}
                      {donation.message ? ` · ${donation.message}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-0.5 text-[11px] font-semibold capitalize ${
                      STATUS_STYLES[donation.status] ?? "bg-muted text-muted-foreground"
                    }`}
                  >
                    {donation.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex min-w-[7rem] flex-col gap-0.5 rounded-2xl px-5 py-3 shadow-sm ${
        accent ? "bg-accent text-accent-foreground" : "border border-border bg-card"
      }`}
    >
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold leading-none text-foreground">{value}</span>
    </div>
  );
}
