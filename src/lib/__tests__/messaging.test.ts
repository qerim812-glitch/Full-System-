import { describe, expect, it } from "vitest";

import {
  chatInputSchema,
  dmInputSchema,
  mapChatError,
  mapDmError,
} from "@/lib/messaging";
import { displayNameFor } from "@/lib/people";

describe("chatInputSchema", () => {
  it("trims surrounding whitespace", () => {
    expect(
      chatInputSchema.parse({ venueSlug: "radio-bar", body: "  hey  " }).body,
    ).toBe("hey");
  });

  it("rejects a message that is only whitespace", () => {
    expect(() =>
      chatInputSchema.parse({ venueSlug: "radio-bar", body: "   " }),
    ).toThrow();
  });

  it("rejects a body past the 1000-char database ceiling", () => {
    expect(() =>
      chatInputSchema.parse({ venueSlug: "radio-bar", body: "x".repeat(1001) }),
    ).toThrow();
  });
});

describe("dmInputSchema", () => {
  it("requires a uuid recipient", () => {
    expect(() =>
      dmInputSchema.parse({ recipientId: "not-a-uuid", body: "hi" }),
    ).toThrow();
  });

  it("allows the full 2000-char DM ceiling", () => {
    const body = "x".repeat(2000);
    expect(
      dmInputSchema.parse({
        recipientId: "00000000-0000-4000-8000-000000000000",
        body,
      }).body,
    ).toBe(body);
  });
});

describe("mapChatError", () => {
  it("explains an RLS rejection as the booking requirement", () => {
    expect(
      mapChatError(
        'new row violates row-level security policy for table "chat_messages"',
      ),
    ).toMatch(/booking a table/i);
  });

  it("falls back to generic copy", () => {
    expect(mapChatError("connection reset")).toMatch(/could not send/i);
  });
});

describe("mapDmError", () => {
  it("does not disclose that the sender has been blocked", () => {
    const copy = mapDmError(
      'new row violates row-level security policy for table "direct_messages"',
    );
    // Naming the block would invite the sender to route around it, and it is
    // indistinguishable from the recipient being suspended anyway.
    expect(copy).not.toMatch(/block/i);
    expect(copy).toMatch(/cannot message/i);
  });

  it("catches the self-message constraint", () => {
    expect(mapDmError('violates check constraint "dm_no_self"')).toMatch(
      /yourself/i,
    );
  });
});

describe("displayNameFor", () => {
  it("falls back when the profile is missing or suspended out of the view", () => {
    expect(displayNameFor(undefined)).toBe("Member");
  });

  it("falls back when the name is blank", () => {
    expect(
      displayNameFor({ id: "a", display_name: "   ", avatar_url: null }),
    ).toBe("Member");
  });

  it("uses the display name when present", () => {
    expect(
      displayNameFor({ id: "a", display_name: "Ana", avatar_url: null }),
    ).toBe("Ana");
  });
});
