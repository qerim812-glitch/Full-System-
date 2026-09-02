import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
      ...SECURITY_HEADERS,
    },
  });
}

const VALID_AGE_RANGES = ["18-24", "25-30", "31-36", "37+"];

function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getAnonClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type AuthResult = {
  email: string;
  ageRange: string;
  isAdmin: boolean;
};

function buildResult(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): AuthResult {
  const meta = user.user_metadata ?? {};
  return {
    email: user.email ?? "",
    ageRange: typeof meta.ageRange === "string" ? meta.ageRange : "",
    isAdmin: meta.is_admin === true,
  };
}

export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } }),
      POST: async ({ request }) => {
        let parsed: Record<string, unknown>;
        try {
          const text = await request.text();
          parsed = text ? JSON.parse(text) : {};
        } catch {
          return json({ error: "Invalid request" }, 400);
        }

        const action = String(parsed["action"] ?? "");
        const email = String(parsed["email"] ?? "").trim().toLowerCase();
        const password = String(parsed["password"] ?? "");

        if (!email || !password) {
          return json({ error: "Email and password are required" }, 400);
        }

        const anon = getAnonClient();
        if (!anon) {
          return json({ error: "Authentication is not configured" }, 500);
        }

        if (action === "login") {
          const { data, error } = await anon.auth.signInWithPassword({ email, password });
          if (error || !data.user) {
            return json({ error: "Invalid email or password" }, 401);
          }
          return json({ user: buildResult(data.user) });
        }

        if (action === "register") {
          const ageRange = String(parsed["ageRange"] ?? "");
          if (!VALID_AGE_RANGES.includes(ageRange)) {
            return json({ error: "Please select a valid age range" }, 400);
          }
          if (password.length < 6) {
            return json({ error: "Password must be at least 6 characters" }, 400);
          }

          const service = getServiceClient();
          if (!service) {
            return json({ error: "Authentication is not configured" }, 500);
          }

          // Auto-confirm so the user can log in immediately (chosen behavior).
          const { data, error } = await service.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { ageRange, is_admin: false },
          });

          if (error || !data.user) {
            const message = error?.message ?? "";
            if (/registered|already|exists/i.test(message)) {
              return json({ error: "An account with this email already exists" }, 409);
            }
            if (/valid email|invalid/i.test(message)) {
              return json({ error: "Please enter a valid email address" }, 400);
            }
            if (/password/i.test(message)) {
              return json({ error: message }, 400);
            }
            console.error("[api/auth] register failed:", message);
            return json({ error: "Could not create account. Please try again." }, 500);
          }

          return json({ user: buildResult(data.user) });
        }

        return json({ error: "Unknown action" }, 400);
      },
    },
  },
});
