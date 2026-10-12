// Builds assets/manrope.css (base64 variable font) and self-contained HTML copies in out/html/.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("./", import.meta.url);
const woff2 = await readFile(new URL("assets/fonts/manrope-variable.woff2", root));
const b64 = woff2.toString("base64");
const fontCss = `@font-face{font-family:"Manrope";src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:200 800;font-style:normal;font-display:block;}`;

await writeFile(new URL("assets/manrope.css", root), fontCss);
await mkdir(new URL("out/html/", root), { recursive: true });

for (const name of ["editorial", "cinematic", "minimalist"]) {
  const html = await readFile(new URL(`src/${name}.html`, root), "utf8");
  await writeFile(new URL(`out/html/${name}.html`, root), html.replace("__MANROPE_CSS__", fontCss));
}
console.log("built: assets/manrope.css + out/html/{editorial,cinematic,minimalist}.html");
