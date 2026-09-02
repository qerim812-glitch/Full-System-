import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("[seed-admin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ADMIN_EMAIL = "admin@admin.com";
const ADMIN_PASSWORD = "Tirana2016!";

async function findUserByEmail(email) {
  let page = 1;
  // paginate through users looking for the email
  // (small project, so a few pages max)
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) break;
    page += 1;
  }
  return null;
}

async function main() {
  const existing = await findUserByEmail(ADMIN_EMAIL);

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata ?? {}), is_admin: true, ageRange: "37+" },
    });
    if (error) throw error;
    console.log("[seed-admin] Admin account updated:", ADMIN_EMAIL);
    return;
  }

  const { error } = await admin.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { is_admin: true, ageRange: "37+" },
  });
  if (error) throw error;
  console.log("[seed-admin] Admin account created:", ADMIN_EMAIL);
}

main().catch((err) => {
  console.error("[seed-admin] Failed:", err.message ?? err);
  process.exit(1);
});
