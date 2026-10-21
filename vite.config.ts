import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.endsWith("/src/data/catalog.json")
            ? "catalog"
            : id.includes("@xyflow")
              ? "canvas"
              : id.includes("@supabase")
                ? "cloud"
                : undefined,
      },
    },
  },
});
