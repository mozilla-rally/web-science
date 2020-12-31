/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 module.exports = {
    // Global options:
    verbose: true,
    // Command options:
    build: {
      overwriteDest: true,
    },
    run: {
      firefox: "nightly",
      pref: ["extensions.experiments.enabled=true"],
    },
    ignoreFiles: [
      "bin",
      "docs",
      "scripts",
      "src",
      "stories",
      "support",
      "tests",
      "CHANGELOG.md",
      "CODE_OF_CONDUCT.md",
      "copyright.txt",
      "LICENSE",
      "package-lock.json",
      "package.json",
      "README.md",
      "rollup.config.*",
      "web-ext-config.js",
      "public/**/*.map",
    ],
  };
  