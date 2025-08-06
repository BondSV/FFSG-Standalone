import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
// In the stand‑alone build we omit Replit‑specific plugins. The runtime
// error overlay and cartographer plugins are provided by Replit and are
// unnecessary (and unavailable) outside of that environment.


export default defineConfig({
  plugins: [
    react(),
    // Additional plugins can be added here. Replit‑specific plugins have
    // been removed to ensure this configuration works on any platform.
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
