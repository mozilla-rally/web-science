/**
 * This module enables analyzing the text content of webpages, including with
 * natural language processing methods. The module uses Mozilla Readability
 * in a content script to parse document title and content when possible.
 * 
 * ## Training, Testing, and Deploying Natural Language Processing Models
 * A motivating use case for this module is applying natural language
 * processing methods to webpage text. The module provides infrastructure for
 * NLP models, but leaves implementation and evaluation of models to study
 * authors. We recommend using existing toolkits for NLP feature generation
 * (e.g., Natural or NLP.js) and for working with models (e.g., TensorFlow.js,
 * ONNX.js, WebDNN, or sklearn-porter). We also recommend using the same
 * codebase for collecting data (e.g., with web crawls), constructing models,
 * evaluating models, and deploying models in browser-based studies. When
 * maintaining multiple NLP codebases for a browser-based study, subtle
 * inconsistencies are easy to introduce and can call into question NLP model
 * performance.
 * 
 * ## Web Crawls to Collect Natural Language Processing Training Data
 * Because WebScience integrates with ordinary browser extensions, you can
 * use this module in a web crawl to collect page text content as NLP training
 * data. All the major browser automation toolkits (e.g., Selenium, Puppeteer,
 * Playwright, and WebdriverIO) support running web crawls with browser
 * extensions installed. We recommend running an online crawl to collect NLP
 * data, using this module to extract webpage text, then training and testing
 * models offline. If you use web crawl data to construct an NLP model for a
 * browser-based study, be sure to carefully consider how the distribution
 * of pages in the crawl compares to the distribution of pages that a user in
 * the study might visit. If a crawl is not representative of user browsing,
 * NLP model performance on crawl data might significantly differ from
 * performance when deployed in a browser-based study.
 * 
 * ## Implementing Natural Language Processing in Web Workers
 * Because natural language processing methods can be computationally
 * expensive, it is very important to offload NLP tasks from an extension's
 * main thread. We recommend pairing this module with the `workers` module to 
 * implement NLP tasks inside of Web Workers, which run in separate threads
 * and will not block the extension's main thread. Some NLP toolkits support
 * additional optimizations, such as WebAssembly or WebGL, and we recommend
 * enabling all available optimizations to minimize the possibility of impact
 * on the user's browsing experience. 
 * 
 * @see {@link https://github.com/mozilla/readability}
 * @see {@link https://github.com/NaturalNode/natural}
 * @see {@link https://github.com/axa-group/nlp.js}
 * @see {@link https://www.tensorflow.org/js}
 * @see {@link https://github.com/microsoft/onnxjs}
 * @see {@link https://mil-tokyo.github.io/webdnn/}
 * @see {@link https://github.com/nok/sklearn-porter}
 * @module pageText
 */

import * as messaging from "./messaging.js";
import * as matching from "./matching.js";
import * as events from "./events.js";
import * as inline from "./inline.js";
import * as pageManager from "./pageManager.js";
import * as permissions from "./permissions.js";
import pageTextContentScript from "./content-scripts/pageText.content.js";

/**
 * A listener for the `onTextParsed` event.
 * @callback textParsedListener
 * @memberof module:pageText.onTextParsed
 * @param {Object} details - Additional information about the page data event.
 * @param {string} details.pageId - The ID for the page, unique across browsing sessions.
 * @param {string} details.url - The URL of the page, without any hash.
 * @param {string} details.title - The title of the document, parsed by Readability.
 * @param {string} details.content - The document text content as an HTML string, parsed by Readability.
 * @param {string} details.textContent - The document text content with HTML tags removed, parsed by Readability.
 * @param {boolean} details.privateWindow - Whether the page loaded in a private window.
 */

/**
 * @typedef {Object} TextParsedListenerRecord
 * @property {matching.MatchPatternSet} matchPatternSet - The match patterns for the listener.
 * @property {boolean} privateWindows - Whether to notify the listener about pages in private windows.
 * @property {browser.contentScripts.RegisteredContentScript} contentScript - The content
 * script associated with the listener.
 * @private
 */

/**
 * A map where each key is a listener and each value is a record for that listener.
 * @constant {Map<textParsedListener, TextParsedListenerRecord>}
 * @private
 */
const textParsedListeners = new Map();

/**
 * Add a listener for the `onTextParsed` event.
 * @function addListener
 * @memberof module:pageText.onTextParsed
 * @param {textParsedListener} listener - The listener to add.
 * @param {Object} options - Options for the listener.
 * @param {string[]} options.matchPatterns - The webpages where the listener should be notified about page text.
 * @param {boolean} [options.privateWindows=false] - Whether to notify the listener about pages in private windows.
 */

/**
 * Remove a listener for the `onTextParsed` event.
 * @function removeListener
 * @memberof module:pageText.onTextParsed
 * @param {textParsedListener} listener - The listener to remove.
 */

/**
 * Whether a specified listener has been added for the `onTextParsed` event.
 * @function hasListener
 * @memberof module:pageText.onTextParsed
 * @param {textParsedListener} listener - The listener to check.
 * @returns {boolean} Whether the listener has been added for the event.
 */

/**
 * Whether the `onTextParsed` event has any listeners.
 * @function hasAnyListeners
 * @memberof module:pageText.onTextParsed
 * @returns {boolean} Whether the event has any listeners.
 */

/**
 * An event that fires when a page's text content has been parsed with Readability. If the text
 * content is not parseable, this event does not fire.
 * @namespace
 */
export const onTextParsed = events.createEvent({
    name: "webScience.pageText.onTextParsed",
    addListenerCallback: addListener,
    removeListenerCallback: removeListener,
    notifyListenersCallback: () => { return false; }
});

/**
 * Whether the module has completed initialization.
 * @type {boolean}
 * @private
 */
let initialized = false;

/**
 * A callback function for adding a text parsed listener. The options for this private function must
 * be kept in sync with the options for the public `onTextParsed.addListener` function.
 * @param {textParsedListener} listener - The listener being added.
 * @param {Object} options - Options for the listener.
 * @param {string[]} options.matchPatterns - The match patterns for pages where the listener should
 * be notified.
 * @param {boolean} [options.privateWindows=false] - Whether the listener should be notified for
 * pages in private windows.
 * @private
 */
async function addListener(listener, {
    matchPatterns,
    privateWindows = false
}) {
    // Initialization
    if (!initialized) {
        initialized = true;
        await pageManager.initialize();

        // Listen for content script messages
        messaging.onMessage.addListener(textParsedDetails => {
            // Remove the type string from the content script message
            delete textParsedDetails.type;

            // Notify listeners when the private window and match pattern requirements are met
            for (const [listener, listenerRecord] of textParsedListeners) {
                if ((!textParsedDetails.privateWindow || listenerRecord.privateWindows)
                    && (listenerRecord.matchPatternSet.matches(textParsedDetails.url))) {
                    listener(textParsedDetails);
                }
            }
        },
        {
            type: "webScience.pageText.parsedText",
            schema: {
                pageId: "string",
                url: "string",
                title: "string",
                content: "string",
                textContent: "string",
                privateWindow: "boolean"
            }
        });

        // Notify the content script when there is a new Readability status
        // for a page and the page URL matches at least one listener
        messaging.registerSchema("webScience.pageText.isArticle", {
            isArticle: "boolean"
        });
        browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if("isArticle" in changeInfo && "url" in tab) {
                // Test match patterns here rather than in the tabs.onUpdated
                // listener options so we don't have to manage multiple listeners
                // or remove and add the listener while events might be queued
                for (const listenerRecord of textParsedListeners.values()) {
                    if (listenerRecord.matchPatternSet.matches(tab.url)) {
                        messaging.sendMessageToTab(tabId, {
                            type: "webScience.pageText.isArticle",
                            isArticle: tab.isArticle
                        });
                        break;
                    }
                }
            }
        }, {
            urls: permissions.getManifestOriginMatchPatterns(),
            properties: [ "isArticle" ]
        });
    }

    // Compile the match patterns for the listener
    const matchPatternSet = matching.createMatchPatternSet(matchPatterns);
    // Register a content script for the listener
    const contentScript = await browser.contentScripts.register({
        matches: matchPatterns,
        js: [{
            code: inline.dataUrlToString(pageTextContentScript)
        }],
        runAt: "document_idle"
    });

    // Store a record for the listener
    textParsedListeners.set(listener, {
        matchPatternSet,
        contentScript,
        privateWindows
    });
}

/**
 * A callback function for removing a text parsed listener.
 * @param {textParsedListener} listener - The listener that is being removed.
 * @private
 */
function removeListener(listener) {
    // If there is a record of the listener, unregister its content script
    // and delete the record
    const listenerRecord = textParsedListeners.get(listener);
    if (listenerRecord === undefined) {
        return;
    }
    listenerRecord.contentScript.unregister();
    textParsedListeners.delete(listener);
}
