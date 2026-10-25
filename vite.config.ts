import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2020",
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
