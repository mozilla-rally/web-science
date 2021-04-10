/**
 * WebScience Final Build Step
 * -----------------------
 *   * Convert content script, worker script, and HTML files to background script files with inlined content.
 */

import url from "@rollup/plugin-url";

const intermediateDirectory = "intermediate";
const distributionDirectory = "dist";

export default (cliArgs) => {
  return [{
    input: `${intermediateDirectory}/webScience.js`,
    output: {
      dir: distributionDirectory,
      preserveModules: true,
      preserveModulesRoot: intermediateDirectory,
      format: "es"
    },
    plugins: [
      url({
        include: [ "**/*.content.js", "**/*.worker.js", "**/*.html" ],
        limit: Number.MAX_VALUE // Inline regardless of content size
      })
    ]
  }];
}
