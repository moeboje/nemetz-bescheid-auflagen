import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const reactVendorPackages = [
            "/node_modules/react/",
            "/node_modules/react-dom/",
            "/node_modules/react-router/",
            "/node_modules/react-router-dom/",
            "/node_modules/scheduler/"
          ];

          if (reactVendorPackages.some((packagePath) => id.includes(packagePath))) {
            return "vendor-react";
          }
        }
      }
    }
  },
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
