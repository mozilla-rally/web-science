/**
 * WebScience Intermediate Build Step
 * -----------------------
 *   * Copy background script and HTML files to an intermediate directory.
 *   * Bundle content script dependencies into IIFE scripts, and copy the
 *     bundled script files to the intermediate directory.
 */

import copy from "rollup-plugin-copy";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import url from "@rollup/plugin-url";
import globby from "globby";

const sourceDirectory = "src";
const intermediateDirectory = "intermediate";

export default (cliArgs) => {
  // Background script files and HTML files
  const rollupConfig = [{
    input: ".empty.js", // Rollup requires an input file
    plugins: [
      copy({
        targets: [{
          src: [
            `${sourceDirectory}/**/*.js`,
            `${sourceDirectory}/**/*.html`,
            `!${sourceDirectory}/**/*.content.js`
          ],
          dest: `${intermediateDirectory}`
        }],
        flatten: false
      })
    ]
  }];

  // Content script files
  const contentScriptPaths = globby.sync(`${sourceDirectory}/**/*.content.js`);
  for(const contentScriptPath of contentScriptPaths) {
    rollupConfig.push({
      input: contentScriptPath,
      output: {
        file: `${intermediateDirectory}${contentScriptPath.slice(sourceDirectory.length)}`,
        format: "iife"
      },
      plugins: [
        // There can be a situation where a content script depends on a function in a background
        // script, the background script depends on another content script (inlined), and then
        // Rollup tree shakes out the other content script. We allow inlining other content
        // scripts to account for that situation.
        url({
          include: [ "**/*.content.js" ],
          exclude: [ contentScriptPath ],
          limit: Number.MAX_VALUE // Inline regardless of content size
        }),
        commonjs(),
        resolve({
          browser: true
        })
      ]
    });
  }

  return rollupConfig;
}
