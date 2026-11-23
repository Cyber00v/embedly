import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: "public",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: [resolve("index.html")],
    },
  },
});
