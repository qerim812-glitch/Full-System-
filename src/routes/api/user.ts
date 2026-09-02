import { createFileRoute } from "@tanstack/react-router";

type UserData = {
  userId: string;
  email: string;
  password: string;
  ageRange: string;
  bookingPlace: string;
  bookingDate: string;
  bookingTime: string;
};

function createInitialUserData(): UserData {
  return {
    userId: "USR-1003",
    email: "",
    password: "",
    ageRange: "",
    bookingPlace: "None",
    bookingDate: "N/A",
    bookingTime: "N/A",
  };
}

// Prototype storage: the serverless runtime has no writable filesystem, so the
// state lives in the warm instance. Durable storage needs a database.
let userData: UserData = createInitialUserData();

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function sanitizeInput(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/[<>]/g, "").trim().slice(0, 256);
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length >= 6 && email.length <= 26;
}

export const Route = createFileRoute("/api/user")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } }),
      GET: async () => json(userData),
      POST: async ({ request }) => {
        let parsed: Record<string, unknown>;
        try {
          const text = await request.text();
          parsed = text ? JSON.parse(text) : {};
        } catch {
          return json({ error: "Invalid user data" }, 400);
        }

        const sanitized: Partial<UserData> = {};

        if (parsed["email"] !== undefined) {
          const email = sanitizeInput(parsed["email"]);
          if (!isValidEmail(email)) return json({ error: "Invalid email format" }, 400);
          sanitized.email = email;
        }

        if (parsed["password"] !== undefined) {
          sanitized.password = sanitizeInput(parsed["password"]);
        }

        if (parsed["ageRange"] !== undefined) {
          const validAges = ["18-24", "25-30", "31-36", "37+"];
          if (validAges.includes(String(parsed["ageRange"]))) {
            sanitized.ageRange = String(parsed["ageRange"]);
          }
        }

        for (const key of ["bookingPlace", "bookingDate", "bookingTime"] as const) {
          if (parsed[key] !== undefined) sanitized[key] = sanitizeInput(parsed[key]);
        }

        userData = { ...userData, ...sanitized };
        return json(userData);
      },
    },
  },
});
