import { describe, expect, it } from "vitest";

import type { MeetupSummary } from "@/lib/meetups";
import { recommendMeetups } from "@/lib/recommend";
import {
  distanceKm,
  formatDistance,
  sortVenues,
  venueDistanceKm,
} from "@/lib/venue-filters";

function meetup(over: Partial<MeetupSummary>): MeetupSummary {
  return {
    id: "m",
    title: "Drinks",
    description: null,
    venue_slug: "radio",
    venue_name: "Radio",
    location_id: null,
    location_name: null,
    meet_date: "2026-09-21",
    meet_time: "20:00",
    capacity: 6,
    join_policy: "open",
    visibility: "public",
    status: "open",
    recurrence: "none",
    series_id: null,
    host_id: "host",
    host_name: "Ana",
    host_avatar: null,
    going: 2,
    myStatus: null,
    isHost: false,
    ...over,
  };
}

describe("recommendMeetups", () => {
  it("skips my own, joined, full and cancelled meetups", () => {
    const list = [
      meetup({ id: "mine", isHost: true, host_id: "me" }),
      meetup({ id: "joined", myStatus: "joined" }),
      meetup({ id: "full", going: 6 }),
      meetup({ id: "off", status: "cancelled" }),
    ];
    const out = recommendMeetups(list, {
      sharedInterestHostIds: new Set(["host", "me"]),
      favouriteSlugs: new Set(["radio"]),
      connectionIds: new Set(["host"]),
    });
    expect(out).toEqual([]);
  });

  it("ranks by reasons and explains them", () => {
    const list = [
      meetup({ id: "a", host_id: "stranger", venue_slug: "radio" }),
      meetup({ id: "b", host_id: "friend" }),
      meetup({ id: "c", host_id: "nobody", venue_slug: "elsewhere" }),
    ];
    const out = recommendMeetups(list, {
      sharedInterestHostIds: new Set(["friend"]),
      favouriteSlugs: new Set(["radio"]),
      connectionIds: new Set(["friend"]),
    });
    expect(out.map((r) => r.meetup.id)).toEqual(["b", "a"]);
    expect(out[0]!.reasons).toEqual([
      "Hosted by a connection",
      "At a venue you favourited",
      "Host shares your interests",
    ]);
    expect(out[1]!.reasons).toEqual(["At a venue you favourited"]);
  });

  it("honours the limit", () => {
    const list = Array.from({ length: 6 }, (_, i) =>
      meetup({ id: `m${i}`, host_id: `h${i}` }),
    );
    const out = recommendMeetups(
      list,
      {
        sharedInterestHostIds: new Set(list.map((m) => m.host_id)),
        favouriteSlugs: new Set(),
        connectionIds: new Set(),
      },
      2,
    );
    expect(out).toHaveLength(2);
  });
});

describe("distance", () => {
  const skanderbeg = { lat: 41.3275, lng: 19.8187 };
  const blloku = { lat: 41.3188, lng: 19.8145 };

  it("measures roughly a kilometre across central Tirana", () => {
    const km = distanceKm(skanderbeg, blloku);
    expect(km).toBeGreaterThan(0.9);
    expect(km).toBeLessThan(1.2);
  });

  it("formats metres under a kilometre", () => {
    expect(formatDistance(0.35)).toBe("350 m");
    expect(formatDistance(2.44)).toBe("2.4 km");
  });

  it("returns null without coordinates or an origin", () => {
    expect(venueDistanceKm({ lat: null, lng: null }, skanderbeg)).toBeNull();
    expect(venueDistanceKm({ lat: 41, lng: 19 }, null)).toBeNull();
  });

  it("sorts nearest first and sinks venues without coordinates", () => {
    const venues = [
      {
        name: "Far",
        description: "",
        min_age: 18,
        max_age: 99,
        capacity: 1,
        lat: 41.4,
        lng: 19.9,
      },
      {
        name: "None",
        description: "",
        min_age: 18,
        max_age: 99,
        capacity: 1,
        lat: null,
        lng: null,
      },
      {
        name: "Near",
        description: "",
        min_age: 18,
        max_age: 99,
        capacity: 1,
        ...blloku,
      },
    ];
    expect(
      sortVenues(venues, "distance", skanderbeg).map((v) => v.name),
    ).toEqual(["Near", "Far", "None"]);
  });
});
