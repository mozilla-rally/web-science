/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 import commonjs from "@rollup/plugin-commonjs";
 import replace from "@rollup/plugin-replace";
 import resolve from "@rollup/plugin-node-resolve";
 
 /**
  * Helper to detect developer mode.
  *
  * @param cliArgs the command line arguments.
  * @return {Boolean} whether or not developer mode is enabled.
  */
 function isDevMode(cliArgs) {
   return Boolean(cliArgs["config-enable-developer-mode"]);
 }
 
 export default (cliArgs) => [
   {
     input: "src/background.js",
     output: {
       file: "dist/background.js",
       sourcemap: isDevMode(cliArgs) ? "inline" : false,
     },
     plugins: [
       replace({
         // In Developer Mode, the study does not submit data and
         // gracefully handles communication errors with the Core
         // Add-on.
         __ENABLE_DEVELOPER_MODE__: isDevMode(cliArgs),
       }),
       resolve({
         browser: true,
       }),
       commonjs(),
     ],
   },
   {
     input: "src/content-script.js",
     output: {
       file: "dist/content-script.js",
       sourcemap: isDevMode(cliArgs) ? "inline" : false,
     },
     plugins: [
       resolve({
         browser: true,
       }),
       commonjs(),
     ],
   },
 ];
 