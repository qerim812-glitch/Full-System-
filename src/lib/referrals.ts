import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

import { getCurrentUser, getSupabaseServerClient } from "./supabase/server";

/** The caller's invite link and how many people have used it (migration 0025). */
export type Referral = {
  code: string;
  url: string;
  joined: number;
};

export const fetchMyReferral = createServerFn({ method: "GET" }).handler(
  async (): Promise<Referral | null> => {
    const supabase = getSupabaseServerClient();
    const user = await getCurrentUser();
    if (!user) return null;

    const [{ data: me }, { count }] = await Promise.all([
      supabase
        .from("profiles")
        .select("referral_code")
        .eq("id", user.id)
        .maybeSingle(),
      // "profiles: read my referrals" exposes the rows referred by the caller.
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("referred_by", user.id),
    ]);
    const code = (me as { referral_code?: string } | null)?.referral_code;
    if (!code) return null;

    const origin = getRequestUrl({
      xForwardedHost: true,
      xForwardedProto: true,
    }).origin;
    return {
      code,
      url: `${origin}/register?ref=${encodeURIComponent(code)}`,
      joined: count ?? 0,
    };
  },
);
