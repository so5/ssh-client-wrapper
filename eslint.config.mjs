import js from "@eslint/js";
import globals from "globals";
import stylistic from "@stylistic/eslint-plugin";
import jsdoc from "eslint-plugin-jsdoc";
import eslintPluginChaiFriendly from "eslint-plugin-chai-friendly";
import eslintPluginChaiExpect from "eslint-plugin-chai-expect";

const styleRules = {
  "arrow-body-style": ["error", "always"],
  "@stylistic/arrow-spacing": [
    "error",
    {
      after: false,
      before: false
    }],
  "@stylistic/comma-dangle": [
    "error",
    "never"
  ],
  "@stylistic/spaced-comment": [
    "error",
    "never"
  ],
  "@stylistic/lines-around-comment": [
    "error",
    {
      beforeBlockComment: true,
      afterBlockComment: false,
      beforeLineComment: false,
      afterLineComment: false,
      allowBlockStart: true
    }
  ],
  "@stylistic/lines-between-class-members": [
    "error",
    "always",
    {
      exceptAfterSingleLine: true
    }
  ],
  "@stylistic/newline-per-chained-call": [
    "error",
    {
      ignoreChainWithDepth: 2
    }
  ],
  "@stylistic/padded-blocks": [
    "error",
    "never"
  ],
  "@stylistic/brace-style": [
    "error",
    "1tbs",
    {
      allowSingleLine: true
    }
  ],
  "@stylistic/padding-line-between-statements": [
    "error",
    {
      blankLine: "any",
      prev: [
        "const",
        "let",
        "var"
      ],
      next: "*"
    },
    {
      blankLine: "always",
      prev: "*",
      next: [
        "class",
        "do",
        "for",
        "function",
        "switch",
        "try",
        "while"
      ]
    },
    {
      blankLine: "any",
      prev: [
        "const",
        "let",
        "var",
        "for",
        "while",
        "do",
        "block-like",
        "multiline-block-like"
      ],
      next: [
        "block-like",
        "do",
        "for",
        "multiline-block-like",
        "switch",
        "try",
        "while"
      ]
    }
  ],
  "@stylistic/quotes": [
    "error",
    "double"
  ],
  "@stylistic/semi": [
    "error",
    "always"
  ]
};

const jsdocRules = {
  "jsdoc/require-jsdoc": ["warn", { enableFixer: false }],
  "jsdoc/require-param": ["warn", { enableFixer: false }],
  "jsdoc/require-param-description": "warn",
  "jsdoc/require-param-name": "warn",
  "jsdoc/require-param-type": "warn",
  "jsdoc/require-hyphen-before-param-description": [
    "warn",
    "always"
  ],
  "jsdoc/require-returns": "warn",
  "jsdoc/require-returns-check": "error"
};

export default [
  // Global configuration
  {
    ignores: ["coverage-report.lcov", "node_modules/"]
  },
  js.configs.recommended,
  {
    plugins: {
      "@stylistic": stylistic
    }
  },
  // Lib configuration
  {
    files: ["lib/**/*.js"],
    plugins: {
      jsdoc
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.es2021,
        ...globals.node
      }
    },
    rules: {
      ...styleRules,
      ...jsdocRules
    }
  },
  // Test configuration
  {
    files: ["test/**/*.js"],
    plugins: {
      "chai-friendly": eslintPluginChaiFriendly,
      "chai-expect": eslintPluginChaiExpect
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.es2021,
        ...globals.node,
        ...globals.mocha
      }
    },
    rules: {
      ...styleRules,
      "no-unused-expressions": "off",
      "chai-friendly/no-unused-expressions": "error"
    }
  }
];
