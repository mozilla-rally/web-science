/* Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    webextensions: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:import/warnings",
  ],
  globals: {
    ChromeUtils: false,
    ExtensionAPI: false,
    // NOTE: These get injected via Rollup.
    __STUDIES_LIST__: false,
    __DISABLE_REMOTE_SETTINGS__: false,
    __DISABLE_LOCALE_CHECK__: false,
    __ENABLE_DATA_SUBMISSION__: false,
    __WEBSITE_URL__: false,
  },
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
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: "module",
  },
  plugins: [
    "import",
    "mocha",
    "node",
    "notice",
  ],
  root: true,
  rules: {
    "node/no-deprecated-api": "error",
    "node/no-extraneous-require": "off",
    "node/no-missing-import": "off",
    "node/no-unpublished-import": "off",
    "node/no-unpublished-require": "off",
    "node/no-unsupported-features/es-syntax": "off",

    // "notice/notice": ["error", { mustMatch: "Licensed to the Apache Software Foundation (ASF) under one", "templateFile": "copyright.txt" }],

    "eol-last": "warn",
    "no-unused-vars": ["error", { vars: "all", args: "none", ignoreRestSiblings: false }],
    "no-var": 2, // TODO: "warn",
    "prefer-const": 2, // TODO: "warn",
    "semi": [2, "always"],
  },
};
