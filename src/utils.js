
/**
 * Register content scripts. Only Firefox supports dynamic content scripts at this time, so
 * log them in this case so callers know they need to declaratively register.
 *
 * @param matchPatternSet {Array<String>}
 * @param contentScript {import}
 */
export async function registerContentScripts(matchPatternSet, contentScript) {
    try {
        // getBrowserInfo is Firefox-only as well.
        const browserInfo = await browser.runtime.getBrowserInfo();

        // Register a content script for the listener
        if (browserInfo.name === "Firefox") {
            const registeredContentScript = await browser.contentScripts.register({
                matches: matchPatternSet,
                js: [{
                    file: contentScript
                }],
                runAt: "document_start"
            });

            return registeredContentScript;
        } else {
            // If `runtime.getBrowserInfo` API is implemented but is not Firefox, assume
            console.debug("WebScience pageNavigator loaded, requires content script:", contentScript);

        }
    } catch (ex) {
        // If the `runtime.getBrowserInfo` APIs is not implemented, then assume this is a Chromium browser.
        // This is the case for all non-Firefox browsers as of this writing
        // @see https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime/getBrowserInfo#browser_compatibility
        if (ex.message === "browser.runtime.getBrowserInfo is not a function") {
            console.debug("WebScience pageNavigator loaded, requires content script:", contentScript);
        } else {
            throw ex;
        }
    }
}