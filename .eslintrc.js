/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

module.exports = {
  env: {
    browser: true,
    es6: true,
    node: true,
    webextensions: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/warnings",
    "plugin:node/recommended",
  ],
  overrides: [
    {
      files: "tests/**",
      env: {
        mocha: true,
      },
      extends: [
        "plugin:mocha/recommended",
      ],
    },
  ],
  globals: {
    ChromeUtils: false,
    ExtensionAPI: false,
    __ENABLE_DEVELOPER_MODE__: false,
  },
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
  },
  plugins: [
    "import",
    "node",
    "mocha"
  ],
  root: true,
  rules: {
    "node/no-deprecated-api": "error",
    "node/no-extraneous-require": "off",
    "node/no-missing-import": "off",
    "node/no-unpublished-import": "off",
    "node/no-unpublished-require": "off",
    "node/no-unsupported-features/es-syntax": "off",

    "no-multi-spaces": "error",
    "no-unused-vars": [ "error", { vars: "all", args: "none", ignoreRestSiblings: false } ],
    "no-var": "warn",
    "prefer-const": "warn",
  },
};
