import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
import copy from "rollup-plugin-copy";
import webScienceRollupPlugin from "@mozilla/web-science/rollup-plugin";

export default (cliArgs) => {
  const rollupConfig = [
    {
      input: "src/background.js",
      output: {
        file: "dist/background.js",
      },
      plugins: [
        webScienceRollupPlugin(),
        resolve({
          browser: true,
        }),
        commonjs(),
        copy({
          targets: [{
            src: [
              "node_modules/webextension-polyfill/dist/browser-polyfill.min.js",
            ],
            dest: "dist/",
          }, {
            src: [
              "src/test.content.js",
            ],
            dest: "dist/",

          }],
          flatten: true,
        })
      ],
    },
  ];
  return rollupConfig;
}
