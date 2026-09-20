import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

/**
 * Meetups — "I'm hosting coffee at Mulliri on Friday at 20:00, join me".
 *
 * Every write goes through an RPC from 0018 rather than a table write, for the
 * same reason bookings go through `book_venue()`: capacity has to be checked
 * under a row lock, and the venue's age limits have to hold for guests as well
 * as for the host. There is no INSERT grant on either table, so this is not a
 * convention that can be forgotten — a direct insert is refused.
 */

export const JOIN_POLICIES = ["open", "approval", "connections"] as const;
export const VISIBILITIES = ["public", "connections"] as const;
export const RECURRENCES = ["none", "weekly", "biweekly", "monthly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export function recurrenceLabel(recurrence: Recurrence): string {
  switch (recurrence) {
    case "weekly":
      return "Repeats weekly";
    case "biweekly":
      return "Repeats every two weeks";
    case "monthly":
      return "Repeats monthly";
    default:
      return "One-off";
  }
}

export type JoinPolicy = (typeof JOIN_POLICIES)[number];
export type Visibility = (typeof VISIBILITIES)[number];
export type MemberStatus = "joined" | "pending" | "declined" | "left";

export type MeetupSummary = {
  id: string;
  title: string;
  description: string | null;
  venue_slug: string;
  venue_name: string | null;
  location_id: string | null;
  location_name: string | null;
  meet_date: string;
  meet_time: string;
  capacity: number;
  join_policy: JoinPolicy;
  visibility: Visibility;
  status: "open" | "cancelled" | "completed";
  recurrence: Recurrence;
  series_id: string | null;
  host_id: string;
  host_name: string | null;
  host_avatar: string | null;
  /** Confirmed attendees, host included. */
  going: number;
  /** The caller's own relationship to this meetup. */
  myStatus: MemberStatus | null;
  isHost: boolean;
};

export type MeetupAttendee = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  status: MemberStatus;
  isHost: boolean;
};

export type MeetupDetail = MeetupSummary & {
  attendees: MeetupAttendee[];
  pending: MeetupAttendee[];
};

/** Seats still available. Never negative, even if capacity is lowered later. */
export function seatsLeft(capacity: number, going: number): number {
  return Math.max(capacity - going, 0);
}

export function joinPolicyLabel(policy: JoinPolicy): string {
  return policy === "open"
    ? "Anyone can join"
    : policy === "approval"
      ? "Host approves requests"
      : "Connections only";
}

export function visibilityLabel(visibility: Visibility): string {
  return visibility === "public" ? "Public" : "Visible to connections";
}

/**
 * What the Join button should say and whether it is actionable.
 *
 * Pure so the rules are testable without a database — they are the part most
 * likely to drift out of step with `join_meetup()`.
 */
export function joinAction(meetup: {
  status: string;
  capacity: number;
  going: number;
  myStatus: MemberStatus | null;
  isHost: boolean;
  join_policy: JoinPolicy;
}): { label: string; disabled: boolean; kind: "join" | "leave" | "none" } {
  if (meetup.isHost)
    return { label: "You are hosting", disabled: true, kind: "none" };
  if (meetup.status === "cancelled")
    return { label: "Cancelled", disabled: true, kind: "none" };
  if (meetup.myStatus === "joined")
    return { label: "Leave meetup", disabled: false, kind: "leave" };
  if (meetup.myStatus === "pending")
    return { label: "Request sent", disabled: true, kind: "none" };
  if (seatsLeft(meetup.capacity, meetup.going) === 0)
    return { label: "Full", disabled: true, kind: "none" };
  return {
    label: meetup.join_policy === "approval" ? "Ask to join" : "Join",
    disabled: false,
    kind: "join",
  };
}

export const createMeetupSchema = z.object({
  venueSlug: z.string().min(1).max(120),
  locationId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(3, "Give it a name").max(120),
  description: z.string().trim().max(1000).optional(),
  meetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  meetTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Pick a time"),
  capacity: z
    .number()
    .int()
    .min(2, "A meetup needs at least two people")
    .max(20, "Twenty is the maximum"),
  joinPolicy: z.enum(JOIN_POLICIES).default("open"),
  visibility: z.enum(VISIBILITIES).default("public"),
  recurrence: z.enum(RECURRENCES).default("none"),
  notes: z.string().trim().max(500).optional(),
});

/**
 * Turns a Postgres error from one of the meetup RPCs into something worth
 * showing. The messages raised in 0018 are already written for people, so most
 * pass through; this filters out the ones that are not.
 */
export function mapMeetupError(message: string): string {
  if (/row-level security|insufficient_privilege|not authorised/i.test(message))
    return "You cannot do that.";
  if (/violates|constraint/i.test(message) && !/admits ages/i.test(message))
    return "That did not work. Please check the details and try again.";
  return message || "Something went wrong.";
}

type Row = Record<string, unknown>;

/**
 * Attaches host, venue, attendance count and the caller's own status.
 *
 * Three follow-up queries rather than one join because PostgREST cannot
 * aggregate, and counting attendees in SQL per row would mean a view. The
 * lists are page-sized, so this is three round trips regardless of how many
 * meetups come back — not N+1.
 */
async function decorate(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  rows: Row[],
  viewerId: string | null,
): Promise<MeetupSummary[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r["id"] as string);
  const hostIds = [...new Set(rows.map((r) => r["host_id"] as string))];
  const slugs = [...new Set(rows.map((r) => r["venue_slug"] as string))];
  const locationIds = [
    ...new Set(
      rows
        .map((r) => r["location_id"] as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const [members, hosts, venues, locations] = await Promise.all([
    supabase
      .from("meetup_members")
      .select("meetup_id, user_id, status")
      .in("meetup_id", ids),
    supabase
      .from("public_profiles")
      .select("id, display_name, avatar_url")
      .in("id", hostIds),
    supabase.from("venues").select("slug, name").in("slug", slugs),
    locationIds.length > 0
      ? supabase
          .from("venue_locations")
          .select("id, name")
          .in("id", locationIds)
      : Promise.resolve({ data: [] as Row[] }),
  ]);

  const memberRows = (members.data ?? []) as Row[];
  const goingByMeetup = new Map<string, number>();
  const mineByMeetup = new Map<string, MemberStatus>();
  for (const row of memberRows) {
    const meetupId = row["meetup_id"] as string;
    const status = row["status"] as MemberStatus;
    if (status === "joined") {
      goingByMeetup.set(meetupId, (goingByMeetup.get(meetupId) ?? 0) + 1);
    }
    if (viewerId && row["user_id"] === viewerId) {
      mineByMeetup.set(meetupId, status);
    }
  }

  const hostById = new Map(
    ((hosts.data ?? []) as Row[]).map((p) => [p["id"] as string, p]),
  );
  const venueBySlug = new Map(
    ((venues.data ?? []) as Row[]).map((v) => [
      v["slug"] as string,
      v["name"] as string,
    ]),
  );
  const locationById = new Map(
    ((locations.data ?? []) as Row[]).map((l) => [
      l["id"] as string,
      l["name"] as string,
    ]),
  );

  return rows.map((r) => {
    const id = r["id"] as string;
    const hostId = r["host_id"] as string;
    const host = hostById.get(hostId);
    const locationId = (r["location_id"] as string | null) ?? null;
    return {
      id,
      title: r["title"] as string,
      description: (r["description"] as string | null) ?? null,
      venue_slug: r["venue_slug"] as string,
      venue_name: venueBySlug.get(r["venue_slug"] as string) ?? null,
      location_id: locationId,
      location_name: locationId ? (locationById.get(locationId) ?? null) : null,
      meet_date: r["meet_date"] as string,
      meet_time: String(r["meet_time"] ?? "").slice(0, 5),
      capacity: r["capacity"] as number,
      join_policy: r["join_policy"] as JoinPolicy,
      visibility: r["visibility"] as Visibility,
      status: r["status"] as MeetupSummary["status"],
      recurrence: ((r["recurrence"] as string | null) ?? "none") as Recurrence,
      series_id: (r["series_id"] as string | null) ?? null,
      host_id: hostId,
      host_name: (host?.["display_name"] as string | null) ?? null,
      host_avatar: (host?.["avatar_url"] as string | null) ?? null,
      going: goingByMeetup.get(id) ?? 0,
      myStatus: mineByMeetup.get(id) ?? null,
      isHost: viewerId === hostId,
    };
  });
}

export const fetchMeetups = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z
      .object({
        scope: z.enum(["upcoming", "hosting", "going"]).default("upcoming"),
        venueSlug: z.string().max(120).optional(),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data }): Promise<MeetupSummary[]> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return [];

    // Today in Tirana, not UTC — a meetup at 21:00 tonight must not drop off
    // the list because the server clock has already rolled over.
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Europe/Tirane",
    });

    let query = supabase
      .from("meetups")
      .select(
        "id, host_id, venue_slug, location_id, title, description, meet_date, meet_time, capacity, join_policy, visibility, status, recurrence, series_id",
      )
      .eq("status", "open")
      .gte("meet_date", today)
      .order("meet_date", { ascending: true })
      .order("meet_time", { ascending: true })
      .limit(60);

    if (data.venueSlug) query = query.eq("venue_slug", data.venueSlug);
    if (data.date) query = query.eq("meet_date", data.date);
    if (data.scope === "hosting") query = query.eq("host_id", user.id);

    const { data: rows, error } = await query;
    if (error) {
      console.error("[meetups] fetchMeetups failed:", error.message);
      return [];
    }

    const decorated = await decorate(supabase, (rows ?? []) as Row[], user.id);

    // "Going" is filtered after decoration because it depends on the caller's
    // own membership, which the list query does not carry.
    return data.scope === "going"
      ? decorated.filter(
          (m) => m.myStatus === "joined" || m.myStatus === "pending",
        )
      : decorated;
  });

export const fetchMeetup = createServerFn({ method: "GET" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<MeetupDetail | null> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return null;

    // No status filter: the host and everyone who was going must still be able
    // to open a cancelled meetup. can_view_meetup() in RLS decides who that is.
    const { data: row, error } = await supabase
      .from("meetups")
      .select(
        "id, host_id, venue_slug, location_id, title, description, meet_date, meet_time, capacity, join_policy, visibility, status, recurrence, series_id",
      )
      .eq("id", data.id)
      .maybeSingle();

    if (error || !row) {
      if (error) console.error("[meetups] fetchMeetup failed:", error.message);
      return null;
    }

    const [summary] = await decorate(supabase, [row as Row], user.id);
    if (!summary) return null;

    const { data: memberRows } = await supabase
      .from("meetup_members")
      .select("user_id, status")
      .eq("meetup_id", data.id)
      .in("status", ["joined", "pending"]);

    const members = (memberRows ?? []) as Row[];
    const profileIds = members.map((m) => m["user_id"] as string);
    const { data: profiles } = profileIds.length
      ? await supabase
          .from("public_profiles")
          .select("id, display_name, avatar_url")
          .in("id", profileIds)
      : { data: [] as Row[] };

    const profileById = new Map(
      ((profiles ?? []) as Row[]).map((p) => [p["id"] as string, p]),
    );

    const toAttendee = (m: Row): MeetupAttendee => {
      const userId = m["user_id"] as string;
      const profile = profileById.get(userId);
      return {
        user_id: userId,
        display_name: (profile?.["display_name"] as string | null) ?? null,
        avatar_url: (profile?.["avatar_url"] as string | null) ?? null,
        status: m["status"] as MemberStatus,
        isHost: userId === summary.host_id,
      };
    };

    return {
      ...summary,
      attendees: members
        .filter((m) => m["status"] === "joined")
        .map(toAttendee)
        // Host first, so the list reads as "whose meetup is this".
        .sort((a, b) => Number(b.isHost) - Number(a.isHost)),
      // Only the host is shown the pending queue; RLS lets a guest read their
      // own pending row, so this is filtered rather than assumed empty.
      pending: summary.isHost
        ? members.filter((m) => m["status"] === "pending").map(toAttendee)
        : [],
    };
  });

export const createMeetup = createServerFn({ method: "POST" })
  .validator((data: unknown) => createMeetupSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    // create_meetup() calls book_venue() internally, so a failure anywhere —
    // no seats, venue closed at that hour, wrong age, time in the past —
    // rolls back the meetup as well. No half-created meetup without a table.
    const { data: row, error } = await supabase.rpc("create_meetup", {
      p_venue_slug: data.venueSlug,
      p_meet_date: data.meetDate,
      p_meet_time: data.meetTime,
      p_capacity: data.capacity,
      p_title: data.title,
      p_description: data.description ?? null,
      p_location_id: data.locationId ?? null,
      p_join_policy: data.joinPolicy,
      p_visibility: data.visibility,
      p_notes: data.notes ?? null,
      p_recurrence: data.recurrence,
    });

    if (error) {
      console.error("[meetups] create failed:", error.message);
      return { ok: false as const, error: mapMeetupError(error.message) };
    }
    const created = (Array.isArray(row) ? row[0] : row) as Row | null;
    return { ok: true as const, id: (created?.["id"] as string) ?? null };
  });

/** Host only: book the next instance of a repeating meetup. */
export const scheduleNextMeetup = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: row, error } = await supabase.rpc("schedule_next_meetup", {
      p_meetup_id: data.id,
    });
    if (error) {
      console.error("[meetups] schedule next failed:", error.message);
      return { ok: false as const, error: mapMeetupError(error.message) };
    }
    const created = (Array.isArray(row) ? row[0] : row) as Row | null;
    return { ok: true as const, id: (created?.["id"] as string) ?? null };
  });

export const joinMeetup = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: status, error } = await supabase.rpc("join_meetup", {
      p_meetup_id: data.id,
    });
    if (error) {
      console.error("[meetups] join failed:", error.message);
      return { ok: false as const, error: mapMeetupError(error.message) };
    }
    return { ok: true as const, status: status as MemberStatus };
  });

export const leaveMeetup = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };

    // Leaving is the one member write that is a plain UPDATE: the "leave own"
    // policy pins it to status = 'left' for your own row, so it needs no RPC.
    const { error } = await supabase
      .from("meetup_members")
      .update({ status: "left" })
      .eq("meetup_id", data.id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[meetups] leave failed:", error.message);
      return { ok: false as const, error: "Could not leave that meetup." };
    }
    return { ok: true as const };
  });

export const respondToJoinRequest = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        meetupId: z.string().uuid(),
        userId: z.string().uuid(),
        approve: z.boolean(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: result, error } = await supabase.rpc(
      "respond_to_join_request",
      {
        p_meetup_id: data.meetupId,
        p_user_id: data.userId,
        p_approve: data.approve,
      },
    );
    if (error) {
      console.error("[meetups] respond failed:", error.message);
      return { ok: false as const, error: mapMeetupError(error.message) };
    }
    if (result === "no_pending_request") {
      return {
        ok: false as const,
        error: "That request is no longer pending.",
      };
    }
    return { ok: true as const, status: result as string };
  });

export const cancelMeetup = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { error } = await supabase.rpc("cancel_meetup", {
      p_meetup_id: data.id,
    });
    if (error) {
      console.error("[meetups] cancel failed:", error.message);
      return { ok: false as const, error: mapMeetupError(error.message) };
    }
    return { ok: true as const };
  });

export const removeAttendee = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ meetupId: z.string().uuid(), userId: z.string().uuid() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: result, error } = await supabase.rpc(
      "remove_meetup_attendee",
      { p_meetup_id: data.meetupId, p_user_id: data.userId },
    );
    if (error) {
      console.error("[meetups] remove attendee failed:", error.message);
      return { ok: false as const, error: mapMeetupError(error.message) };
    }
    if (result === false) {
      return { ok: false as const, error: "They are no longer on the list." };
    }
    return { ok: true as const };
  });

/**
 * The text behind "share my plans".
 *
 * Community guidelines tell people to let a friend know where they are going;
 * this composes that message so it is one tap rather than a chore. Kept pure
 * and exported so the wording is covered by tests — it is safety copy, and it
 * should not silently lose the venue or the time in a refactor.
 */
export function sharePlanText(plan: {
  title: string;
  venueName: string;
  date: string;
  time: string;
  hostName?: string | null;
}): string {
  const lines = [
    `I'm going to ${plan.title} at ${plan.venueName}.`,
    `${plan.date} at ${plan.time}.`,
  ];
  if (plan.hostName) lines.push(`Hosted by ${plan.hostName}.`);
  lines.push("Sent from Social Circle so you know where I am.");
  return lines.join("\n");
}
