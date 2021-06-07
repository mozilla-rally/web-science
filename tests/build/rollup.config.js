import commonjs from "@rollup/plugin-commonjs";
import resolve from "@rollup/plugin-node-resolve";
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
      ],
    }
  ];
  return rollupConfig;
}
