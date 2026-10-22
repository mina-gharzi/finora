import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` intentionally throws unless resolved under the
      // `react-server` condition (as Next.js does). Unit tests run in jsdom, so
      // point it at an empty module to allow importing server modules directly.
      "server-only": fileURLToPath(
        new URL("./src/test/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    // jsdom implements no `window.matchMedia`; the stub keeps components that
    // read a media query renderable under test (see the file for details).
    setupFiles: ["./src/test/jsdom-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
