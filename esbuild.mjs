import esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** @type {import('esbuild').BuildOptions} */
const config = {
  bundle: true,
  entryPoints: ["src/extension.ts"],
  // `typescript` is bundled on purpose: VS Code does not expose its copy to extensions.
  external: ["vscode"],
  format: "cjs",
  logLevel: "info",
  minify: production,
  outfile: "dist/extension.js",
  platform: "node",
  sourcemap: !production,
  target: "node18"
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
} else {
  await esbuild.build(config);
}
