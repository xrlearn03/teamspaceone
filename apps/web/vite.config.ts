import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_API_URL || "http://localhost:3000";
  const sfuTarget = env.VITE_SFU_URL || "ws://127.0.0.1:8443";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        // Public API paths used by the guest/apply/invite pages in dev.
        "/meetings/public": { target: apiTarget, changeOrigin: true },
        "/interview/public": { target: apiTarget, changeOrigin: true },
        "/auth/redeem": { target: apiTarget, changeOrigin: true },
        // SFU signaling WebSocket; mirrors the nginx "/sfu" location in prod.
        "/sfu": {
          target: sfuTarget,
          ws: true,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/sfu/, "") || "/",
        },
      },
    },
  };
});
