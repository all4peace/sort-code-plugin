// ESLint flat config for ESLint v9+
import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";
import sortKeysFix from "eslint-plugin-sort-keys-fix";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "test-cases/**"]
  },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2021,
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        process: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly"
      },
      sourceType: "module"
    },
    rules: {
      "comma-dangle": ["error", "always-multiline"],
      indent: ["error", 2],
      "max-len": ["error", { code: 100 }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      quotes: ["error", "double"],
      semi: ["error", "always"],
      "sort-imports": ["warn", { ignoreDeclarationSort: true }],
      "sort-keys": ["warn", "asc", { caseSensitive: false, natural: true }]
    }
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        console: "readonly",
        process: "readonly",
        setInterval: "readonly",
        setTimeout: "readonly"
      },
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2021,
        project: ["./tsconfig.json"],
        sourceType: "module"
      }
    },
    plugins: {
      "@typescript-eslint": tseslint,
      "sort-keys-fix": sortKeysFix
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/consistent-type-imports": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/member-ordering": "warn",
      "sort-keys-fix/sort-keys-fix": "warn",
      "no-undef": "off",
      "no-unused-vars": "off"
    }
  },
  prettier
];
