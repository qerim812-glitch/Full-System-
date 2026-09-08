import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
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
  pending: "border-border text-muted-foreground",
  confirmed: "border-green-600/40 text-green-700 dark:text-green-400",
  failed: "border-destructive/40 text-destructive",
  refunded: "border-border text-muted-foreground",
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
  const [method, setMethod] =
    useState<(typeof METHODS)[number]["value"]>("bank_transfer");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // Parsed here so the user sees a bad amount before a round trip, and so
    // the server only ever receives exact minor units.
    const amountMinor = toMinorUnits(amount);
    if (amountMinor === null) {
      toast.error("Enter an amount like 12.50.");
      return;
    }

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

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setAmount("");
    setMessage("");
    toast.success("Thank you — your donation is recorded as pending.");
    await router.invalidate();
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Support NewPop
        </h1>
        <p className="text-sm text-muted-foreground">
          Donations keep the platform running. Record your donation here and we
          will confirm it once the transfer arrives.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <form
          onSubmit={handleSubmit}
          className="flex h-fit flex-col gap-4 rounded-lg border border-border bg-card p-5"
        >
          <h2 className="text-base font-semibold text-foreground">
            Record a donation
          </h2>

          <Alert>
            <AlertDescription>
              This records your intent — it does not take payment. Nothing is
              charged, and an admin marks it confirmed once the money arrives.
            </AlertDescription>
          </Alert>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                inputMode="decimal"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="12.50"
              />
            </div>
            <div className="flex w-28 flex-col gap-2">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                value={currency}
                onChange={(e) =>
                  setCurrency(e.target.value as (typeof CURRENCIES)[number])
                }
                className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="method">Method</Label>
            <select
              id="method"
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as (typeof METHODS)[number]["value"])
              }
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
            >
              {METHODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="message">Message (optional)</Label>
            <Textarea
              id="message"
              value={message}
              maxLength={1000}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Anything you would like us to know"
            />
          </div>

          <Button type="submit" disabled={busy} className="mt-1 w-full">
            {busy ? "Recording…" : "Record donation"}
          </Button>
        </form>

        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold text-foreground">
            Your donations
          </h2>
          {donations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Nothing recorded yet.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {donations.map((donation) => (
                <li
                  key={donation.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-border bg-card px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium tabular-nums text-foreground">
                      {formatAmount(donation.amount_minor, donation.currency)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(donation.created_at).toLocaleDateString()}
                      {donation.message ? ` · ${donation.message}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
                      STATUS_STYLES[donation.status] ??
                      "border-border text-muted-foreground"
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
