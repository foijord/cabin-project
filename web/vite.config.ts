import { defineConfig } from "vite";

// GitHub Pages project site: https://<user>.github.io/cabin-project/
export default defineConfig({
  base: "/cabin-project/",
  build: {
    chunkSizeWarningLimit: 800,
  },
});
