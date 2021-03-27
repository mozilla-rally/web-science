/**
 * WebScience Final Build Step
 * -----------------------
 *   * Convert content script files to background script files with inlined content scripts.
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
        include: "**/*.content.js",
        limit: Number.MAX_VALUE // Inline regardless of content script size
      })
    ]
  }];
}
