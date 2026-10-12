// esbuild.config.mjs
import { build } from "esbuild";

await build({
  entryPoints: ["src/client/chat.ts"],
  bundle: true,
  outfile: "public/dist/chat.js",
  format: "esm",
  target: "es2022",
  platform: "browser",
  external: ["partysocket", "partyserver", "partysocket/react"],
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  sourcemap: true,
});

console.log("Chat client built successfully!");