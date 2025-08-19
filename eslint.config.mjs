import js from "@eslint/js";
import globals from "globals";
import stylistic from "@stylistic/eslint-plugin";
import jsdoc from "eslint-plugin-jsdoc";
import node from "eslint-plugin-node";
import chaiFriendly from "eslint-plugin-chai-friendly";

const jsdocRules = {
  "jsdoc/require-jsdoc": ["warn", { enableFixer: false }],
  "jsdoc/require-param": ["warn", { enableFixer: false }],
  "jsdoc/require-param-description": "warn",
  "jsdoc/require-param-name": "warn",
  "jsdoc/require-param-type": "warn",
  "jsdoc/require-hyphen-before-param-description": [
    "warn",
    "always",
  ],
  "jsdoc/require-returns": "warn",
  "jsdoc/require-returns-check": "error",
};

const styleRules = {
  "@stylistic/arrow-spacing": [
    "error",
    {
      after: false,
      before: false,
    }],
  "@stylistic/comma-dangle": [
    "error",
    "never",
  ],
  "@stylistic/spaced-comment": [
    "error",
    "never",
  ],
  "@stylistic/lines-around-comment": [
    "error",
    {
      beforeBlockComment: true,
      afterBlockComment: false,
      beforeLineComment: false,
      afterLineComment: false,
      allowBlockStart: true,
    },
  ],
  "@stylistic/lines-between-class-members": [
    "error",
    "always",
    {
      exceptAfterSingleLine: true,
    },
  ],
  "@stylistic/newline-per-chained-call": [
    "error",
    {
      ignoreChainWithDepth: 2,
    },
  ],
  "@stylistic/padded-blocks": [
    "error",
    "never",
  ],
  "@stylistic/brace-style": [
    "error",
    "1tbs",
    {
      allowSingleLine: true,
    },
  ],
  "@stylistic/padding-line-between-statements": [
    "error",
    {
      blankLine: "any",
      prev: [
        "const",
        "let",
        "var",
      ],
      next: "*",
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
        "while",
      ],
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
        "multiline-block-like",
      ],
      next: [
        "block-like",
        "do",
        "for",
        "multiline-block-like",
        "switch",
        "try",
        "while",
      ],
    },
  ],
};

export default [
  js.configs.recommended,
  jsdoc.configs["flat/recommended"],
  stylistic.configs["disable-legacy"],
  stylistic.configs.customize({
    indent: 2,
    quotes: "double",
    semi: true,
    arrowParens: true,
  }),
  {
    ignores: ["node_modules/"],
  },
  {
    files: ["test/**/*.js"],
    plugins: {
      chaiFriendly,
    },
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
        ...globals.node,
        it: "readonly",
        describe: "readonly",
        before: "readonly",
        after: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
  },
  {
    files: ["**/*.js"],
    plugins: {
      node,
      "@stylistic": stylistic,
      jsdoc,
    },
    languageOptions: {
      globals: {
        ...globals.nodeBuiltin,
        ...globals.node,
      },
      sourceType: "module",
    },
    rules: {
      ...styleRules,
      ...jsdocRules,
      "no-nested-ternary": "off",
      "no-param-reassign": "warn",
      "camelcase": [
        "error",
        {
          properties: "never",
        },
      ],
      "eqeqeq": [
        "error",
        "always",
        {
          null: "ignore",
        },
      ],
      "func-style": [
        "error",
        "declaration",
        {
          allowArrowFunctions: true,
        },
      ],
      "no-use-before-define": [
        "error",
        {
          functions: false,
        },
      ],
      "no-warning-comments": "warn",
      "require-unicode-regexp": "off",

    },
  },
];
