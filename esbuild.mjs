import esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').BuildOptions}
 */
const esbuildConfig = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  format: "cjs",
  minify: production,
  sourcemap: false, // Never generate .map files
  sourcesContent: false,
  platform: "node",
  outfile: "dist/extension.js",
  external: ["vscode", "typescript"],
  logLevel: "silent",
  plugins: [
    // Simple plugin to handle external modules
    {
      name: "external-modules",
      setup(build) {
        // Mark vscode and typescript as external
        build.onResolve({ filter: /^(vscode|typescript)$/ }, args => {
          return { path: args.path, external: true };
        });
      }
    }
  ]
};

if (watch) {
  console.log("[watch] build started");
  esbuild
    .context(esbuildConfig)
    .then(ctx => {
      ctx.watch();
      console.log("[watch] build finished");
    })
    .catch(() => process.exit(1));
} else {
  esbuild.build(esbuildConfig).catch(() => process.exit(1));
}
