import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
    // The Phaser vendor chunk is legitimately ~1.5MB (the engine); raise the
    // warning threshold above it so the build output stays clean.
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Split the Phaser engine into its own chunk: it's the bulk of the
        // bundle, rarely changes, and can be cached across our deploys.
        manualChunks: {
          phaser: ["phaser"],
        },
      },
    },
  },
  server: {
    host: true, // bind 0.0.0.0 so other devices on the LAN can connect
    allowedHosts: ["santoro", "santoro.local"],
  },
  preview: {
    host: true,
    allowedHosts: ["santoro", "santoro.local"],
  },
});
