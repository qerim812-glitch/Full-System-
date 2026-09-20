import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  ADMIN_VENUE_COLUMNS,
  normaliseAdminVenue,
  venueUpsertSchema,
  type AdminLocation,
  type AdminVenue,
} from "./admin";
import { loadProfiles } from "./people";
import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

/**
 * The venue owner's side of things — see migration 0024.
 *
 * Nothing here checks "is this person an owner" in TypeScript. Every write
 * goes through RLS scoped by is_venue_owner(slug); a non-owner's update simply
 * matches no row. That keeps one rule in one place.
 */

export type VenuePhoto = {
  id: string;
  venue_slug: string;
  url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
};

export type OwnerBooking = {
  id: string;
  booking_date: string;
  booking_time: string;
  party_size: number;
  status: "confirmed" | "cancelled" | "completed";
  location_id: string | null;
  guest_name: string;
  guest_avatar: string | null;
};

const slugSchema = z.object({ venueSlug: z.string().min(1).max(120) });

/** Slugs of the venues the caller owns. Empty for everyone else. */
export const fetchOwnedVenueSlugs = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return [];
    // "venue_owners: read own or admin" scopes this to the caller.
    const { data, error } = await supabase
      .from("venue_owners")
      .select("venue_slug")
      .eq("user_id", user.id);
    if (error) {
      console.error("[owner] fetchOwnedVenueSlugs failed:", error.message);
      return [];
    }
    return (data ?? []).map((r) => r.venue_slug as string);
  },
);

/** Full venue rows (inactive included) for the venues the caller owns. */
export const fetchMyVenues = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminVenue[]> => {
    const slugs = await fetchOwnedVenueSlugs();
    if (slugs.length === 0) return [];
    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("venues")
      .select(ADMIN_VENUE_COLUMNS)
      .in("slug", slugs)
      .order("name");
    if (error) {
      console.error("[owner] fetchMyVenues failed:", error.message);
      return [];
    }
    return ((data ?? []) as Record<string, unknown>[]).map(normaliseAdminVenue);
  },
);

/** Edit an owned venue. The slug names the row; it cannot be changed. */
export const updateOwnedVenue = createServerFn({ method: "POST" })
  .validator((data: unknown) => venueUpsertSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("venues")
      .update({
        name: data.name,
        description: data.description,
        image_url: data.image_url,
        location_url: data.location_url,
        address: data.address ?? null,
        phone: data.phone ?? null,
        category: data.category,
        price_band: data.price_band,
        opens_at: data.opens_at,
        closes_at: data.closes_at,
        slot_minutes: data.slot_minutes,
        min_age: data.min_age,
        max_age: data.max_age,
        capacity: data.capacity,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
      })
      .eq("slug", data.slug)
      .select("slug");
    if (error) {
      console.error("[owner] updateOwnedVenue failed:", error.message);
      return { ok: false as const, error: "Could not save the venue." };
    }
    if (!rows || rows.length === 0) {
      return { ok: false as const, error: "You do not manage this venue." };
    }
    return { ok: true as const };
  });

/* ── Branches ───────────────────────────────────────────────────────────── */

export const fetchOwnerLocations = createServerFn({ method: "GET" })
  .validator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }): Promise<AdminLocation[]> => {
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("venue_locations")
      .select("id, venue_slug, name, address, capacity, lat, lng, is_active")
      .eq("venue_slug", data.venueSlug)
      .order("name");
    if (error) {
      console.error("[owner] fetchOwnerLocations failed:", error.message);
      return [];
    }
    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r["id"] as string,
      venue_slug: r["venue_slug"] as string,
      name: r["name"] as string,
      address: (r["address"] as string | null) ?? null,
      capacity: (r["capacity"] as number | null) ?? null,
      lat: r["lat"] == null ? null : Number(r["lat"]),
      lng: r["lng"] == null ? null : Number(r["lng"]),
      is_active: r["is_active"] as boolean,
    }));
  });

const locationSchema = z.object({
  id: z.string().uuid().optional(),
  venueSlug: z.string().min(1).max(120),
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(300).nullable().optional(),
  capacity: z.number().int().min(1).max(10000).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const upsertOwnerLocation = createServerFn({ method: "POST" })
  .validator((data: unknown) => locationSchema.parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const row = {
      venue_slug: data.venueSlug,
      name: data.name,
      address: data.address ?? null,
      capacity: data.capacity ?? null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      is_active: data.is_active,
    };
    const query = data.id
      ? supabase
          .from("venue_locations")
          .update(row)
          .eq("id", data.id)
          .select("id")
      : supabase.from("venue_locations").insert(row).select("id");
    const { data: rows, error } = await query;
    if (error) {
      if (/duplicate key/i.test(error.message)) {
        return {
          ok: false as const,
          error: "A branch with that name already exists.",
        };
      }
      console.error("[owner] upsertOwnerLocation failed:", error.message);
      return { ok: false as const, error: "Could not save the branch." };
    }
    if (!rows || rows.length === 0) {
      return { ok: false as const, error: "You do not manage this venue." };
    }
    return { ok: true as const, id: (rows[0] as { id: string }).id };
  });

export const deleteOwnerLocation = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { count } = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("location_id", data.id);
    if ((count ?? 0) > 0) {
      const { error } = await supabase
        .from("venue_locations")
        .update({ is_active: false })
        .eq("id", data.id);
      if (error) {
        return {
          ok: false as const,
          error: "Could not deactivate the branch.",
        };
      }
      return { ok: true as const, deactivated: true };
    }
    const { error } = await supabase
      .from("venue_locations")
      .delete()
      .eq("id", data.id);
    if (error) {
      return { ok: false as const, error: "Could not delete the branch." };
    }
    return { ok: true as const, deactivated: false };
  });

/* ── Bookings ───────────────────────────────────────────────────────────── */

/** Upcoming (or all) bookings at an owned venue, soonest first. */
export const fetchOwnerBookings = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z
      .object({
        venueSlug: z.string().min(1).max(120),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<OwnerBooking[]> => {
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("bookings")
      .select(
        "id, user_id, booking_date, booking_time, party_size, status, location_id",
      )
      .eq("venue_slug", data.venueSlug)
      .gte("booking_date", data.from)
      .order("booking_date", { ascending: true })
      .order("booking_time", { ascending: true })
      .limit(200);
    if (error) {
      console.error("[owner] fetchOwnerBookings failed:", error.message);
      return [];
    }
    const list = (rows ?? []) as Record<string, unknown>[];
    const profiles = await loadProfiles(
      supabase,
      list.map((r) => r["user_id"] as string),
    );
    return list.map((r) => {
      const profile = profiles.get(r["user_id"] as string);
      return {
        id: r["id"] as string,
        booking_date: r["booking_date"] as string,
        booking_time: (r["booking_time"] as string).slice(0, 5),
        party_size: r["party_size"] as number,
        status: r["status"] as OwnerBooking["status"],
        location_id: (r["location_id"] as string | null) ?? null,
        guest_name: profile?.display_name?.trim() || "Member",
        guest_avatar: profile?.avatar_url ?? null,
      };
    });
  });

/* ── Photos ─────────────────────────────────────────────────────────────── */

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const VENUE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Public: the gallery for a venue, in display order. */
export const fetchVenuePhotos = createServerFn({ method: "GET" })
  .validator((data: unknown) => slugSchema.parse(data))
  .handler(async ({ data }): Promise<VenuePhoto[]> => {
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("venue_photos")
      .select("id, venue_slug, url, caption, sort_order, created_at")
      .eq("venue_slug", data.venueSlug)
      .order("sort_order")
      .order("created_at")
      .limit(30);
    if (error) {
      console.error("[owner] fetchVenuePhotos failed:", error.message);
      return [];
    }
    return (rows ?? []) as VenuePhoto[];
  });

/** Owner or admin: add a photo to the gallery. Multipart. */
export const addVenuePhoto = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data");
    const file = data.get("photo");
    if (!(file instanceof File)) throw new Error("Choose an image");
    return {
      venueSlug: z.string().min(1).max(120).parse(data.get("venueSlug")),
      caption: z
        .string()
        .trim()
        .max(200)
        .parse(String(data.get("caption") ?? "")),
      file,
    };
  })
  .handler(async ({ data }) => {
    const user = await getCurrentUser();
    if (!user) return { ok: false as const, error: "Please sign in again." };
    const ext = PHOTO_TYPES[data.file.type];
    if (!ext) {
      return { ok: false as const, error: "Use a JPEG, PNG or WebP image." };
    }
    if (data.file.size > VENUE_PHOTO_MAX_BYTES) {
      return { ok: false as const, error: "Photos must be under 5 MB." };
    }

    const supabase = getSupabaseServerClient();
    const path = `${data.venueSlug}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await data.file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from("venue-photos")
      .upload(path, bytes, {
        contentType: data.file.type,
        cacheControl: "31536000",
      });
    if (uploadError) {
      console.error("[owner] photo upload failed:", uploadError.message);
      return {
        ok: false as const,
        error: /row-level security|not authorized|unauthorized/i.test(
          uploadError.message,
        )
          ? "You do not manage this venue."
          : /bucket not found/i.test(uploadError.message)
            ? "Photo storage is not set up yet (run migration 0024)."
            : "Upload failed. Please try again.",
      };
    }
    const url = supabase.storage.from("venue-photos").getPublicUrl(path)
      .data.publicUrl;

    const { error } = await supabase.from("venue_photos").insert({
      venue_slug: data.venueSlug,
      uploaded_by: user.id,
      url,
      caption: data.caption || null,
    });
    if (error) {
      await supabase.storage.from("venue-photos").remove([path]);
      console.error("[owner] venue_photos insert failed:", error.message);
      return { ok: false as const, error: "Could not save that photo." };
    }
    return { ok: true as const, url };
  });

export const deleteVenuePhoto = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const supabase = getSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("venue_photos")
      .delete()
      .eq("id", data.id)
      .select("url");
    if (error) {
      console.error("[owner] deleteVenuePhoto failed:", error.message);
      return { ok: false as const, error: "Could not delete that photo." };
    }
    if (!rows || rows.length === 0) {
      return { ok: false as const, error: "Photo not found." };
    }
    const url = (rows[0] as { url: string }).url;
    const marker = "/venue-photos/";
    if (url.includes(marker)) {
      await supabase.storage
        .from("venue-photos")
        .remove([url.slice(url.indexOf(marker) + marker.length)]);
    }
    return { ok: true as const };
  });
