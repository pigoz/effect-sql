/// <reference types="vitest" />
/// <reference types="vite/client" />

import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["./test/**/*.test.{js,mjs,cjs,ts,mts,cts}"],
    globals: true,
  },
});
