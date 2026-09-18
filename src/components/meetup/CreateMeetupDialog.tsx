import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  JOIN_POLICIES,
  VISIBILITIES,
  createMeetup,
  joinPolicyLabel,
  visibilityLabel,
  type JoinPolicy,
  type Visibility,
} from "../../lib/meetups";
import { todayInTirana } from "../../lib/utils";
import type { Venue } from "../../lib/venues";
import { Chip, primaryPillClass } from "../PageChrome";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

const inputCls =
  "h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

/**
 * Hosting a meetup also books the table.
 *
 * The party size and the capacity are the same number by design: the host
 * reserves seats for everyone, so the venue sees one booking for six rather
 * than six bookings for one. That is why the form says "seats" rather than
 * "party size" and why the confirmation mentions the booking.
 */
export function CreateMeetupDialog({ venues }: { venues: Venue[] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [venueSlug, setVenueSlug] = useState(venues[0]?.slug ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [meetDate, setMeetDate] = useState(todayInTirana());
  const [meetTime, setMeetTime] = useState("20:00");
  const [capacity, setCapacity] = useState(4);
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>("open");
  const [visibility, setVisibility] = useState<Visibility>("public");

  const venue = venues.find((v) => v.slug === venueSlug);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await createMeetup({
        data: {
          venueSlug,
          title: title.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          meetDate,
          meetTime,
          capacity,
          joinPolicy,
          visibility,
        },
      });
      if (!result.ok) {
        // The database messages are already written for people ("Mulliri is
        // open from 18:00 to 23:00"), so they are shown as-is.
        toast.error(result.error);
        return;
      }
      toast.success("Meetup created — the table is booked in your name.");
      setOpen(false);
      setTitle("");
      setDescription("");
      if (result.id) {
        await navigate({
          to: "/meetups/$meetupId",
          params: { meetupId: result.id },
        });
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={primaryPillClass()}>
          Host a meetup
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Host a meetup</DialogTitle>
          <DialogDescription>
            This books the table in your name for everyone, so you only need one
            reservation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meetup-title" className="text-xs font-medium">
              What is it?
            </Label>
            <Input
              id="meetup-title"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Coffee and cards"
              className="rounded-xl"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meetup-venue" className="text-xs font-medium">
              Where
            </Label>
            <select
              id="meetup-venue"
              value={venueSlug}
              onChange={(e) => setVenueSlug(e.target.value)}
              className={inputCls}
            >
              {venues.map((v) => (
                <option key={v.slug} value={v.slug}>
                  {v.name}
                </option>
              ))}
            </select>
            {venue ? (
              <p className="text-[11px] text-muted-foreground">
                Ages {venue.min_age}–{venue.max_age}. The same limits apply to
                everyone who joins.
              </p>
            ) : null}
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="meetup-date" className="text-xs font-medium">
                Date
              </Label>
              <input
                id="meetup-date"
                type="date"
                required
                min={todayInTirana()}
                value={meetDate}
                onChange={(e) => setMeetDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex w-32 flex-col gap-1.5">
              <Label htmlFor="meetup-time" className="text-xs font-medium">
                Time
              </Label>
              <input
                id="meetup-time"
                type="time"
                required
                value={meetTime}
                onChange={(e) => setMeetTime(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="flex w-24 flex-col gap-1.5">
              <Label htmlFor="meetup-seats" className="text-xs font-medium">
                Seats
              </Label>
              <input
                id="meetup-seats"
                type="number"
                min={2}
                max={20}
                required
                value={capacity}
                onChange={(e) => setCapacity(Number(e.target.value))}
                className={inputCls}
              />
            </div>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium text-foreground">
              Who can join?
            </legend>
            <div className="flex flex-wrap gap-2">
              {JOIN_POLICIES.map((policy) => (
                <Chip
                  key={policy}
                  active={joinPolicy === policy}
                  onClick={() => setJoinPolicy(policy)}
                  className="px-3 py-1.5 text-xs"
                >
                  {joinPolicyLabel(policy)}
                </Chip>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium text-foreground">
              Who can see it?
            </legend>
            <div className="flex flex-wrap gap-2">
              {VISIBILITIES.map((option) => (
                <Chip
                  key={option}
                  active={visibility === option}
                  onClick={() => setVisibility(option)}
                  className="px-3 py-1.5 text-xs"
                >
                  {visibilityLabel(option)}
                </Chip>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meetup-description" className="text-xs font-medium">
              Anything else{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Textarea
              id="meetup-description"
              value={description}
              maxLength={1000}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Bring a deck of cards."
              className="rounded-xl"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !venueSlug}
            className={primaryPillClass("w-full py-2.5")}
          >
            {busy ? "Creating…" : `Book ${capacity} seats and open the meetup`}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
