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
    fs: {
      allow: [path.resolve(__dirname, "../..")]
    }
  }
});
