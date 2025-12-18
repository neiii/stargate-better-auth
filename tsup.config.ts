import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/plugins/github-star-gate/index.ts",
    client: "src/plugins/github-star-gate/client.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["better-auth"],
});
