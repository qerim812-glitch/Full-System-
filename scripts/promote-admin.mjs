/**
 * Grant admin to an existing user.
 *
 *   node scripts/promote-admin.mjs someone@example.com
 *
 * Writes app_metadata.role, NOT user_metadata. user_metadata is writable by
 * the user through the client SDK, so a role stored there could be
 * self-granted — a normal account could read every booking, report and
 * private message in the database. app_metadata requires the service-role
 * key, i.e. this script.
 *
 * The user must sign out and back in afterwards: the claim is baked into the
 * JWT when it is issued, so an existing session keeps its old one until it
 * refreshes.
 *
 * No credentials are hardcoded here on purpose. Both values come from the
 * environment.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];

if (!url || !serviceKey) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.",
  );
  process.exit(1);
}
if (!email) {
  console.error("Usage: node scripts/promote-admin.mjs <email>");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const target = email.toLowerCase();
let user = null;

for (let page = 1; page <= 20 && !user; page += 1) {
  const { data, error } = await admin.auth.admin.listUsers({
    page,
    perPage: 200,
  });
  if (error) {
    console.error("Could not list users:", error.message);
    process.exit(1);
  }
  user = data.users.find((u) => u.email?.toLowerCase() === target) ?? null;
  if (data.users.length < 200) break;
}

if (!user) {
  console.error(`No user found with email ${email}. They must sign up first.`);
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(user.id, {
  app_metadata: { ...(user.app_metadata ?? {}), role: "admin" },
});

if (error) {
  console.error("Could not promote:", error.message);
  process.exit(1);
}

console.log(
  `${email} is now an admin. They must sign out and back in for it to take effect.`,
);
