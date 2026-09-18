import { describe, expect, it } from "vitest";

import {
  createMeetupSchema,
  joinAction,
  joinPolicyLabel,
  mapMeetupError,
  seatsLeft,
  sharePlanText,
  visibilityLabel,
} from "@/lib/meetups";

describe("seatsLeft", () => {
  it("counts what is left", () => {
    expect(seatsLeft(6, 2)).toBe(4);
    expect(seatsLeft(6, 6)).toBe(0);
  });

  it("never goes negative when a host lowers capacity below the attendees", () => {
    expect(seatsLeft(3, 5)).toBe(0);
  });
});

describe("joinAction", () => {
  const base = {
    status: "open",
    capacity: 4,
    going: 2,
    myStatus: null,
    isHost: false,
    join_policy: "open" as const,
  };

  it("offers Join on an open meetup with room", () => {
    expect(joinAction(base)).toEqual({
      label: "Join",
      disabled: false,
      kind: "join",
    });
  });

  it("says Ask to join when the host approves requests", () => {
    expect(joinAction({ ...base, join_policy: "approval" }).label).toBe(
      "Ask to join",
    );
  });

  it("offers Leave once you are going", () => {
    expect(joinAction({ ...base, myStatus: "joined" })).toEqual({
      label: "Leave meetup",
      disabled: false,
      kind: "leave",
    });
  });

  it("shows a pending request as sent, not as joinable again", () => {
    const action = joinAction({ ...base, myStatus: "pending" });
    expect(action.disabled).toBe(true);
    expect(action.kind).toBe("none");
  });

  it("disables joining when full", () => {
    expect(joinAction({ ...base, going: 4 })).toEqual({
      label: "Full",
      disabled: true,
      kind: "none",
    });
  });

  it("lets someone already going leave a full meetup", () => {
    // Full plus already joined must offer Leave, not "Full" — otherwise there
    // is no way out of a meetup once the last seat goes.
    expect(joinAction({ ...base, going: 4, myStatus: "joined" }).kind).toBe(
      "leave",
    );
  });

  it("never offers the host a join or leave button", () => {
    expect(joinAction({ ...base, isHost: true })).toEqual({
      label: "You are hosting",
      disabled: true,
      kind: "none",
    });
  });

  it("shows a cancelled meetup as cancelled even to someone who joined", () => {
    expect(
      joinAction({ ...base, status: "cancelled", myStatus: "joined" }).label,
    ).toBe("Cancelled");
  });
});

describe("labels", () => {
  it("describes each join policy", () => {
    expect(joinPolicyLabel("open")).toBe("Anyone can join");
    expect(joinPolicyLabel("approval")).toBe("Host approves requests");
    expect(joinPolicyLabel("connections")).toBe("Connections only");
  });

  it("describes each visibility", () => {
    expect(visibilityLabel("public")).toBe("Public");
    expect(visibilityLabel("connections")).toBe("Visible to connections");
  });
});

describe("createMeetupSchema", () => {
  const valid = {
    venueSlug: "mulliri",
    title: "Coffee and cards",
    meetDate: "2026-09-20",
    meetTime: "20:00",
    capacity: 4,
  };

  it("accepts a minimal meetup and applies the defaults", () => {
    const parsed = createMeetupSchema.parse(valid);
    expect(parsed.joinPolicy).toBe("open");
    expect(parsed.visibility).toBe("public");
  });

  it("requires at least two people — a meetup of one is not a meeting", () => {
    expect(() => createMeetupSchema.parse({ ...valid, capacity: 1 })).toThrow();
  });

  it("caps capacity at the party size bookings allow", () => {
    expect(() =>
      createMeetupSchema.parse({ ...valid, capacity: 21 }),
    ).toThrow();
  });

  it("rejects a title too short to mean anything", () => {
    expect(() => createMeetupSchema.parse({ ...valid, title: "hi" })).toThrow();
  });

  it("rejects malformed dates and times", () => {
    expect(() =>
      createMeetupSchema.parse({ ...valid, meetDate: "20-09-2026" }),
    ).toThrow();
    expect(() =>
      createMeetupSchema.parse({ ...valid, meetTime: "8pm" }),
    ).toThrow();
  });

  it("accepts seconds on the time, which some browsers send", () => {
    expect(
      createMeetupSchema.parse({ ...valid, meetTime: "20:00:00" }).meetTime,
    ).toBe("20:00:00");
  });
});

describe("mapMeetupError", () => {
  it("passes through the messages written for people in 0018", () => {
    expect(mapMeetupError("That meetup is full")).toBe("That meetup is full");
    expect(mapMeetupError("This venue admits ages 25 to 99")).toBe(
      "This venue admits ages 25 to 99",
    );
  });

  it("hides raw policy failures", () => {
    expect(
      mapMeetupError(
        'new row violates row-level security policy for "meetups"',
      ),
    ).toBe("You cannot do that.");
  });

  it("always returns something showable", () => {
    expect(mapMeetupError("")).toBe("Something went wrong.");
  });
});

describe("sharePlanText", () => {
  const plan = {
    title: "Coffee and cards",
    venueName: "Mulliri",
    date: "Friday 20 September",
    time: "20:00",
  };

  it("names the venue, the date and the time — the three things a friend needs", () => {
    const text = sharePlanText(plan);
    expect(text).toContain("Mulliri");
    expect(text).toContain("Friday 20 September");
    expect(text).toContain("20:00");
    expect(text).toContain("Coffee and cards");
  });

  it("names the host when there is one other than you", () => {
    expect(sharePlanText({ ...plan, hostName: "Ana" })).toContain(
      "Hosted by Ana",
    );
  });

  it("omits the host line when you are hosting", () => {
    expect(sharePlanText({ ...plan, hostName: null })).not.toContain(
      "Hosted by",
    );
  });
});
