export {};

try {
    // @ts-ignore
    importScripts("browser-polyfill.min.js", "background.js");
} catch (ex) {
    console.error("Could not load scripts from service worker:", ex);
}
