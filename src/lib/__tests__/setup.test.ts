import { describe, expect, it } from "vitest";

describe("test harness", () => {
  it("resolves the @/ path alias", async () => {
    const { cn } = await import("@/lib/utils");
    expect(cn("a", "b")).toBe("a b");
  });
});
