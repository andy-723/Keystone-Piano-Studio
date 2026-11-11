import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { devtools } from "@tanstack/devtools-vite";

export default defineConfig({
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/react-router",
      "@tanstack/react-query",
      "@tanstack/react-start",
    ],
  },
  plugins: [
    ...(process.env["NODE_ENV"] !== "production" ? [devtools()] : []),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    viteReact(),
    nitro({
      preset: "vercel",
      // Run server functions in Sydney, next to Supabase (ap-southeast-2). Vercel's default
      // region is Washington DC (iad1), which adds ~200 ms to every database round trip.
      vercel: { functions: { regions: ["syd1"] } },
    }),
  ],
});
