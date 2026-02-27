import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const modelSourcePath = fileURLToPath(new URL("../model/src/index.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@ccv/model": modelSourcePath
    }
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"]
    }
  }
});
