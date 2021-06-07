const fs = require("fs");
const path = require("path");
const rollup = require("rollup");
const commonjs = require("@rollup/plugin-commonjs");
const nodeResolve = require("@rollup/plugin-node-resolve").nodeResolve;
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

/**
 * The WebScience Rollup plugin. This plugin is necessary because certain WebScience assets (e.g., content
 * scripts and HTML) are not handled by ordinary Rollup bundling. Developers building browser extensions
 * with WebScience should, for all anticipated use cases, be able to use the Rollup plugin as-is.
 * 
 * The plugin involves the following steps.
 *   * Identify WebScience asset dependencies, which are import statements that begin with an "include:" schema.
 *   * Resolve each WebScience asset dependency to a string containing an output path relative to the extension
 *     base directory. This format is required by WebExtensions APIs.
 *   * Allow Rollup tree shaking to occur, so that only necessary asset dependencies are bundled.
 *   * If an asset dependency is a content script (ending in .content.js), use Rollup to bundle the content script
 *     to the output directory in IIFE format, with support for Node module resolution and CommonJS module wrapping.
 *     This step allows WebScience content scripts to use components of the library and npm dependencies, and it
 *     makes debugging content script behavior straightforward. 
 *   * If an asset dependency is an HTML file (ending in .html), copy the file to the output directory, parse the file,
 *     identify script and stylesheet dependencies (`<script src="..."></script>` and `<link rel="stylesheet" href="...">`),
 *     and copy those additional dependencies to the output directory. The plugin currently only supports additional HTML
 *     dependencies that are in the same source directory as the HTML file.
 *   * If an asset dependency is not one of the above types, copy the file to the output directory.
 * @param {Object} [options] - Options for the plugin.
 * @param {string} [options.manifestPath="./manifest.json"] - The path to the WebExtensions manifest.json, either
 * absolute or relative to the current working directory. The plugin requires this path so that it can generate
 * paths relative to the extension base directory for WebExtensions APIs.
 * @param {string} [options.outputDirectory="./dist/webScience/"] - The directory where the plugin should output
 * required dependencies, either absolute or relative to the current working directory. This directory must
 * be equal to or a subdirectory of the directory containing the WebExtensions manifest.json.
 * @returns {Object} - The generated Rollup plugin.
 */
module.exports = function webScienceRollupPlugin({
    manifestPath = "./manifest.json",
    outputDirectory = "./dist/webScience/"
} = {
    manifestPath: "./manifest.json",
    outputDirectory: "./dist/webScience/"
}) {
    const includeScheme = "include:";

    // If the manifest path or output directory is relative, convert it to absolute with the current working directory
    manifestPath = path.resolve(process.cwd(), manifestPath);
    const manifestDirectory = path.dirname(manifestPath);
    outputDirectory = path.resolve(process.cwd(), outputDirectory) + path.sep;

    // Check that the output directory is either the manifest directory or a subdirectory of the manifest directory
    if(path.relative(manifestDirectory, outputDirectory).startsWith("..")) {
        throw new Error("Error: the Webscience Rollup plugin requires that the output directory be either the same as the extension manifest directory or a subdirectory of that directory.");
    }

    // Check that the WebExtensions manifest path is correct, since we need to generate paths relative to the manifest
    if(!fs.existsSync(manifestPath)) {
        throw new Error(`Error: the Webscience Rollup plugin requires either running Rollup in the base directory for the extension or specifying an extension manifest path.`);
    }

    // Check that the output directory is a directory path
    if(!outputDirectory.endsWith(path.sep)) {
        throw new Error("Error: the Webscience Rollup plugin requires a valid directory path.")
    }

    // If the output directory doesn't already exist, create it
    if(!fs.existsSync(outputDirectory)) {
        fs.mkdirSync(outputDirectory, {
            recursive: true
        });
    }

    /**
     * Generate the absolute file input path, absolute file output path, and output path relative to the WebExtensions manifest
     * directory for an import ID that uses the include scheme.
     */
    const pathsFromId = id => {
        // Remove the scheme to obtain the absolute file input path
        const inputPath = id.substring(includeScheme.length);
        // Add the file name to the output directory to obtain the absolute file output path
        const outputPath = outputDirectory + path.basename(inputPath);
        // Generate the output path relative to the WebExtensions manifest directory, since that's what WebExtensions APIs require
        const relativeOutputPath = path.relative(manifestDirectory, outputPath);
        return { inputPath, outputPath, relativeOutputPath };
    };

    const plugin = {
        name: "webscience-rollup-plugin",

        // When the Rollup build starts, check that plugin dependencies are present
        buildStart({ plugins }) {
            const pluginDependencies = {
                "commonjs": "@rollup/plugin-commonjs",
                "node-resolve": "@rollup/plugin-node-resolve"
            };
            const pluginNames = new Set();
            for(const plugin of plugins) {
                pluginNames.add(plugin.name);
            }
            for(const pluginName in pluginDependencies) {
                if(!pluginNames.has(pluginName)) {
                    throw new Error(`Error: bundling with the WebScience library requires ${pluginDependencies[pluginName]}.`);
                }
            }
        },

        async resolveId(source, importer) {
            // Ignore bundling entry points
            if(!importer) {
                return null;
            }
            // Ignore import statements that don't start with the include scheme
            if(!source.startsWith(includeScheme)) {
                return null;
            }
            // Remove the scheme, resolve the absolute path for the import, then restore the scheme
            source = source.substring(includeScheme.length);
            const resolution = await this.resolve(source, importer, { skipSelf: true });
            if(resolution === null || !("id" in resolution)) {
                throw new Error(`Error: unable to resolve WebScience dependency: ${source}.`);
            }
            return includeScheme + resolution.id;
        },

        async load(id) {
            // Ignore resolved import statements that don't start with the include scheme
            if(!id.startsWith(includeScheme)) {
                return null;
            }
            // Return a string that is the output path relative to the WebExtensions manifest directory, since that's what WebExtensions APIs require
            return `export default "${pathsFromId(id).relativeOutputPath}";`;
        },

        // Generate output files with the generateBundle hook, rather than the load hook, so we can benefit from tree shaking
        async generateBundle(options, bundle) {
            // Identify all the import IDs with the include scheme
            const idsWithIncludeScheme = new Set();
            for(const info of Object.values(bundle)) {
                if(info.type === "chunk") {
                    for(const id in info.modules) {
                        if(id.startsWith(includeScheme)) {
                            idsWithIncludeScheme.add(id);
                        }
                    }
                }
            }
            // Generate output files for each import ID with the include scheme
            for(const id of idsWithIncludeScheme) {
                const { inputPath, outputPath } = pathsFromId(id);
                // If the file is a content script (i.e., ends with .content.js), bundle it to the output directory in IIFE format
                if(inputPath.endsWith(".content.js")) {
                    const outputBundle = await rollup.rollup({
                        input: inputPath,
                        plugins: [
                            // If we encounter an import with the include scheme when bundling, just return an empty string and let Rollup tree shake the import
                            {
                                name: "ignore-include-scheme",
                                resolveId: plugin.resolveId,
                                load(id) {
                                    if(id.startsWith(includeScheme)) {
                                        return `export default "";`;
                                    }
                                }
                            },
                            commonjs(),
                            nodeResolve({
                                browser: true,
                                moduleDirectories: [
                                    process.cwd() + path.sep + "node_modules"
                                ]
                            })
                        ]
                    });
                    await outputBundle.write({
                        output: {
                            file: outputPath,
                            format: "iife"
                        }
                    });
                    await outputBundle.close();
                }
                // If the file is HTML (i.e., ends with .html), copy the file and any script or stylesheet dependencies
                else if(inputPath.endsWith("html")) {
                    // Copy the HTML file
                    fs.copyFileSync(inputPath, outputPath);
                    // Parse the HTML file and extract script and stylesheet dependency paths
                    const html = fs.readFileSync(inputPath, "utf8");
                    const dom = new JSDOM(html);
                    const embeddedFileRelativePaths = new Set();
                    const scriptElements = dom.window.document.querySelectorAll("script[src]");
                    for(const scriptElement of scriptElements) {
                        embeddedFileRelativePaths.add(scriptElement.src);
                    }
                    const stylesheetElements = dom.window.document.querySelectorAll("link[rel=stylesheet][href]");
                    for(const stylesheetElement of stylesheetElements) {
                        embeddedFileRelativePaths.add(stylesheetElement.href);
                    }
                    // Generate output paths for dependencies and copy the files
                    for(const embeddedFileRelativePath of embeddedFileRelativePaths) {
                        const embeddedFileAbsolutePath = path.resolve(path.dirname(inputPath), embeddedFileRelativePath);
                        if(path.dirname(embeddedFileAbsolutePath) === path.dirname(inputPath)) {
                            fs.copyFileSync(embeddedFileAbsolutePath, outputDirectory + path.basename(embeddedFileAbsolutePath));
                        }
                        else {
                            console.warn(`Warning: the Webscience Rollup plugin only supports HTML script and stylesheet embeds in the same directory as the HTML file. Unable to embed ${embeddedFileAbsolutePath} in ${outputPath}.`);
                        }
                    }
                }
                // For all other file types, copy the file to the output directory
                else {
                    fs.copyFileSync(inputPath, outputPath);
                }
            }
        }
    };

    return plugin;
};
