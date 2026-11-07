import { createFileRoute } from "@tanstack/react-router";

import { healthStatus } from "@/server/health";

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => Response.json(healthStatus()),
    },
  },
});
