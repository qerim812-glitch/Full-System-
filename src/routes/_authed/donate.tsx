import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ChevronDown, Coffee, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "../../components/EmptyState";
import {
  Chip,
  PageHeader,
  RouteError,
  primaryPillClass,
} from "../../components/PageChrome";
import { StatChipSkeleton } from "../../components/Skeletons";
import { StatChip } from "../../components/StatChip";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { buyMeACoffeeUrl, isBmcConfigured } from "../../lib/buymeacoffee";
import {
  CURRENCIES,
  declareDonation,
  fetchMyDonations,
  formatAmount,
  toMinorUnits,
} from "../../lib/donations";
import { pageHead } from "../../lib/seo";
import { cn, formatDate } from "../../lib/utils";

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
  head: () =>
    pageHead("Support Social Circle", "Donations keep the platform running."),
  pendingComponent: () => (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="h-8 w-44 animate-pulse rounded-lg bg-muted" />
      <StatChipSkeleton count={3} />
      <div className="h-48 animate-pulse rounded-2xl bg-muted" />
      <div className="h-60 animate-pulse rounded-2xl bg-muted" />
    </div>
  ),
  errorComponent: () => <RouteError title="Could not load donations" />,
  component: DonatePage,
});

/**
 * Buy Me a Coffee is the primary call to action; the manual ledger stays
 * underneath it for bank transfers and cash, which still need an admin to
 * confirm that the money arrived.
 *
 * The manual form starts collapsed when BMC is configured, and open when it is
 * not — with no BMC username there would otherwise be nothing to do on this
 * page at all.
 */
function DonatePage() {
  const { donations } = Route.useLoaderData();
  const router = useRouter();

  const bmcReady = isBmcConfigured();
  const [manualOpen, setManualOpen] = useState(!bmcReady);

  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("ALL");
  const [method, setMethod] =
    useState<(typeof METHODS)[number]["value"]>("bank_transfer");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  // Totals are per currency — summing ALL + EUR minor units together was
  // meaningless and formatted with whatever the form currently selected.
  const confirmedByCurrency = new Map<string, number>();
  for (const d of donations) {
    if (d.status !== "confirmed") continue;
    confirmedByCurrency.set(
      d.currency,
      (confirmedByCurrency.get(d.currency) ?? 0) + d.amount_minor,
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const amountMinor = toMinorUnits(amount);
    if (amountMinor === null) {
      toast.error("Enter an amount like 12.50.");
      return;
    }
    setBusy(true);
    try {
      const result = await declareDonation({
        data: {
          amountMinor,
          currency,
          method,
          ...(message.trim() ? { message: message.trim() } : {}),
        },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setAmount("");
      setMessage("");
      toast.success("Thank you — your donation is recorded as pending.");
      await router.invalidate();
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Support Social Circle"
        subtitle="Social Circle is free to use. Donations cover the servers and keep it that way."
      />

      {/* Why donate, from the people behind it. Not autoplayed: a video
          that starts on its own, with sound, on a donations page reads as
          pressure. Preloads only metadata so the page stays light. */}
      <section
        className="overflow-hidden rounded-2xl border border-border bg-black shadow-sm"
        aria-label="A word from the team"
      >
        <video
          controls
          playsInline
          preload="metadata"
          poster="/og-image.png"
          className="aspect-video w-full"
        >
          <source src="/video/donate.mp4" type="video/mp4" />
          Your browser cannot play this video.{" "}
          <a href="/video/donate.mp4" className="underline">
            Download it instead.
          </a>
        </video>
      </section>

      <div className="flex flex-wrap gap-4">
        <StatChip label="Recorded" value={String(donations.length)} />
        <StatChip
          label="Pending"
          value={String(donations.filter((d) => d.status === "pending").length)}
        />
        {[...confirmedByCurrency.entries()].map(([code, minor]) => (
          <StatChip
            key={code}
            label={`Confirmed (${code})`}
            value={formatAmount(minor, code)}
            accent
          />
        ))}
      </div>

      {bmcReady ? (
        <section className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card px-6 py-8 text-center shadow-sm">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent"
            aria-hidden
          >
            <Coffee className="h-7 w-7 text-accent-foreground" />
          </span>
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">
              Buy us a coffee
            </h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Card payment handled by Buy Me a Coffee — you pick the amount
              there. It lands here automatically, no admin step.
            </p>
          </div>
          <a
            href={buyMeACoffeeUrl()}
            target="_blank"
            // noopener: the opened page gets window.opener otherwise and can
            // navigate this tab somewhere else.
            rel="noopener noreferrer"
            className={primaryPillClass("gap-2 px-6 py-2.5")}
          >
            <Coffee className="h-4 w-4" aria-hidden />
            Buy me a coffee
            <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
          </a>
        </section>
      ) : null}

      <section className="flex flex-col gap-4">
        {bmcReady ? (
          <button
            type="button"
            onClick={() => setManualOpen((open) => !open)}
            aria-expanded={manualOpen}
            aria-controls="manual-donation"
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left shadow-sm transition-colors hover:border-foreground/20"
          >
            <span className="text-sm font-medium text-foreground">
              Sent a bank transfer instead? Record it here
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                manualOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        ) : null}

        {manualOpen ? (
          <form
            id="manual-donation"
            onSubmit={handleSubmit}
            className="flex h-fit flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-sm"
          >
            {!bmcReady ? (
              <h2 className="text-base font-semibold text-foreground">
                Record a donation
              </h2>
            ) : null}

            <Alert>
              <AlertDescription>
                This records your intent — it does not take payment and nothing
                is charged. An admin marks it confirmed once the money arrives.
              </AlertDescription>
            </Alert>

            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="amount" className="text-xs font-medium">
                  Amount
                </Label>
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
                <Label htmlFor="currency" className="text-xs font-medium">
                  Currency
                </Label>
                <select
                  id="currency"
                  value={currency}
                  onChange={(e) =>
                    setCurrency(e.target.value as (typeof CURRENCIES)[number])
                  }
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {CURRENCIES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-xs font-medium text-foreground">
                Payment method
              </legend>
              <div className="flex flex-wrap gap-2">
                {METHODS.map((m) => (
                  <Chip
                    key={m.value}
                    active={method === m.value}
                    onClick={() => setMethod(m.value)}
                    className="px-4 py-1.5 text-sm"
                  >
                    {m.label}
                  </Chip>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="message" className="text-xs font-medium">
                Message{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
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
              className={primaryPillClass("w-full py-2.5")}
            >
              {busy ? "Recording…" : "Record donation"}
            </button>
          </form>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">
          Your donations
        </h2>
        {donations.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            body="Donations you make will be listed here with their status."
          />
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
                      {donation.provider === "buymeacoffee"
                        ? "Buy Me a Coffee"
                        : donation.method.replace("_", " ")}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(donation.created_at)}
                    {donation.message ? ` · ${donation.message}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLES[donation.status] ?? "bg-muted text-muted-foreground"}`}
                >
                  {donation.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
