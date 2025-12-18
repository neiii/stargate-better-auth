import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/plugins/stargate-better-auth/index.ts",
    client: "src/plugins/stargate-better-auth/client.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ["better-auth"],
});
