import { createFileRoute } from "@tanstack/react-router";
import indexHtml from "../../public/index.html?raw";

export const Route = createFileRoute("/")({
  server: {
    handlers: {
      GET: async () =>
        new Response(indexHtml, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        }),
    },
  },
});
