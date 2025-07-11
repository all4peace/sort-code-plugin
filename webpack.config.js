import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default (env, argv) => {
  const isProduction = argv.mode === "production";

  return {
    target: "node",
    mode: argv.mode || "development",
    entry: "./src/extension.ts",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "extension.js",
      libraryTarget: "commonjs2"
    },
    externals: {
      vscode: "commonjs vscode"
    },
    resolve: {
      extensions: [".ts", ".js"],
      extensionAlias: {
        ".js": [".js", ".ts"]
      }
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: [
            {
              loader: "ts-loader"
            }
          ]
        }
      ]
    },
    optimization: {
      minimize: isProduction,
      usedExports: true,
      sideEffects: false
    },
    devtool: false, // Disable source maps to reduce package size
    infrastructureLogging: {
      level: "log"
    },
    stats: {
      warnings: false // Suppress warnings about dynamic requires in ts-morph
    }
  };
};
