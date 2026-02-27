import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@nemetz/ui": path.resolve(__dirname, "../../packages/ui/src")
    }
  },
  server: {
    proxy: {
      "/api/ai": "http://localhost:8787",
      "/api": "http://localhost:4000"
    },
    fs: {
      allow: [path.resolve(__dirname, "../..")]
    }
  }
});
