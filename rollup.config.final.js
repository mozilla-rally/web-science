/**
 * WebScience Final Build Step
 * -----------------------
 *   * Convert content script files to background script files with inlined content scripts.
 */

import globby from "globby";
import url from "@rollup/plugin-url";

const intermediateDirectory = "intermediate";
const distributionDirectory = "dist";

export default (cliArgs) => {
  const rollupConfig = [];
  const backgroundScriptPaths = globby.sync([
    `${intermediateDirectory}/**/*.js`,
    `!${intermediateDirectory}/**/*.content.js`
  ]);
  for(const backgroundScriptPath of backgroundScriptPaths) {
    rollupConfig.push({
      input: backgroundScriptPath,
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
    });
  }
  return rollupConfig;
}
