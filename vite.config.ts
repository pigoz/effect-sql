/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ["./test/**/*.test.{js,mjs,cjs,ts,mts,cts}"],
    setupFiles: ["./test/helpers/setup.runtime.ts"],
  },
});
