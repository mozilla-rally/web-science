/**
 * Content script for the PageManager module. This module provides a PageManager
 * API with global scope in the content script environment. The API includes the
 * following features.
 *   * pageId - A unique ID for the page.
 *   * url - The URL of the page, omitting any hash.
 *   * referrer - The referrer for the page.
 *   * pageHasAttention - Whether the page currently has the user's attention.
 *   * pageHasAudio - Whether there is currently audio playing on the page.
 *   * pageVisitStart - An event that fires when a page visit begins.
 *   * pageVisitStartTime - The time that the page visit started.
 *   * pageVisitStop - An event that fires when a page visit ends.
 *   * pageAttentionUpdate - An event that fires when the page's attention state
 *     changes.
 *   * pageAudioUpdate - An event that fires when the page's audio state changes.
 * 
 * # Events
 * See the documentation in the PageManager module for detail on the event types.
 * 
 * Each event implements the standard WebExtensions event features.
 *   * addListener
 *   * removeListener
 *   * hasListener
 * 
 * Event listeners receive an object with the following property.
 *   * timeStamp - The time that the underlying browser event fired.
 * 
 * Example usage:
 * ```
 * PageManager.pageVisitStart.addListener(({timeStamp}) => {
 *     console.log(`Page visit started at ${timeStamp} with page ID ${PageManager.pageId}`);
 * });
 * 
 * PageManager.pageAttentionUpdate.addListener(({timeStamp}) => {
 *     console.log(`Page attention update at ${timeStamp} with attention state ${PageManager.pageHasAttention}.`);
 * });
 * ```
 * 
 * # Content Script Load Ordering
 * Note that the WebExtensions content script model does not guarantee execution
 * order for content scripts, so it is possible that the API will not have loaded
 * when a content script that depends on the API loads. As a workaround, this
 * content script checks the global `pageManagerHasLoaded` for an array of
 * functions to call after the content script has executed, but before the content
 * script has fired the page visit start event.
 * 
 * Example usage:
 * ```
 * function main() {
 *     // Content script logic goes here
 * }
 * 
 * if("PageManager" in window)
 *     main();
 * else {
 *     if(!("pageManagerHasLoaded" in window))
 *         window.pageManagerHasLoaded = [];
 *     window.pageManagerHasLoaded.push(main);
 * }
 * ```
 * 
 * @module WebScience.Utilities.content-scripts.pageManager
 */

// Function encapsulation to maintain content script isolation
(
    function () {

        // Check if the PageManager content script has already run on this page
        // If it has, bail out
        if("PageManager" in window)
            return;

        // Construct a PageManager object on the `window` global
        // All the public PageManager functionality that is available in the content
        // script environment is exposed through this object
        window.PageManager = { };

        /**
        * Generate a page ID, a random 128-bit value represented as a hexadecimal string.
        * @private
        * @returns {string} The new page ID.
        */
        function generatePageId() {
            let pageIdBytes = window.crypto.getRandomValues(new Uint8Array(16));
            return Array.from(pageIdBytes, (byte) => {
                if(byte < 16)
                    return "0" + byte.toString(16);
                return byte.toString(16);
            }).join("");
        }

        /**
         * Returns a copy of the URL string from `window.location.href`, without any
         * hash at the end. We canonicalize URLs without the hash because jumping
         * between parts of a page (as indicated by a hash) should not be considered page
         * navigation.
         * @href
         * @returns {string} 
         */
        function locationHrefWithoutHash() {
            return window.location.href.slice(-1 * window.location.hash.length);
        }

        /**
         * Creates an event structured according to WebExtensions conventions (i.e.,
         * with `addListener`, `removeListener`, and `hasListener` functions).
         */
        function createEvent() {
            let listeners = new Set();
            return {
                addListener: function(listener) {
                    listeners.add(listener);
                },
                removeListener: function(listener) {
                    listeners.delete(listener);
                },
                hasListener: function(listener) {
                    return listeners.has(listener);
                },
                notifyListeners: function(arguments) {
                    for(let listener of listeners) {
                        try {
                            listener.apply(null, arguments);
                        }
                        catch(error) {
                            console.debug(`Error in PageManager content script event handler: ${error}`);
                        }
                    }
                }
            };
        }

        PageManager.pageVisitStart = createEvent();
        PageManager.pageVisitStop = createEvent();
        PageManager.pageAttentionUpdate = createEvent();
        PageManager.pageAudioUpdate = createEvent();

        /**
         * Send a message to the background page, with a catch because errors can
         * occur in `browser.runtime.sendMessage` when the page is unlooading.
         * @param {object} message - The message to send, which should be an object with
         * a type string.
         */
        PageManager.sendMessage = function(message) {
            browser.runtime.sendMessage(message).catch((reason) => {
                console.debug(`Error when sending message from content script to background page: ${JSON.stringify(message)}`);
            });
        };
        
        /**
         * The function for firing the page visit start event, which runs whenever a new page
         * loads. A page load might be because of ordinary web navigation (i.e., loading a new
         * HTML document with a base HTTP(S) request) or because the URL changed via the History
         * API.
         * @private
         * @param {number} timeStamp - The time when the underlying event fired. 
         * @param {boolean} [isHistoryChange=false] - Whether this page load was caused by the
         * History API.
         */
        function pageVisitStart(timeStamp, isHistoryChange = false) {
            // Assign a new page ID
            PageManager.pageId = generatePageId();
            // Store a copy of the URL, because we use it to check for History API page loads
            PageManager.url = locationHrefWithoutHash();
            // Store a copy of the referrer for convenience
            PageManager.referrer = document.referrer.repeat(1);
            PageManager.pageVisitStartTime = timeStamp;
            // If this is a History API page load, persist the states for attention and audio
            PageManager.pageHasAttention = isHistoryChange ? PageManager.pageHasAttention : false;
            PageManager.pageHasAudio = isHistoryChange ? PageManager.pageHasAudio : false;

            // Send the page visit start event to the background page
            PageManager.sendMessage({
                type: "WebScience.Utilities.PageManager.pageVisitStart",
                pageId: PageManager.pageId,
                url: PageManager.url,
                referrer: PageManager.referrer,
                timeStamp: PageManager.pageVisitStartTime,
                privateWindow: browser.extension.inIncognitoContext
            });

            // Notify the page visit start event listeners in the content script environment
            PageManager.pageVisitStart.notifyListeners([{
                timeStamp
            }]);

            console.debug(`Page visit start: ${JSON.stringify(PageManager)}`);
        };

        /**
         * The function for firing the page visit stop event, which runs whenever a page closes.
         * That could be because of browser exit, tab closing, tab navigation to a new page, or
         * a new page loading via the History API.
         * @private
         * @param {number} timeStamp - The time when the underlying event fired. 
         */
        function pageVisitStop(timeStamp) {
            // Send the page visit stop event to the background page
            PageManager.sendMessage({
                type: "WebScience.Utilities.PageManager.pageVisitStop",
                pageId: PageManager.pageId,
                url: PageManager.url,
                referrer: PageManager.referrer,
                timeStamp,
                pageVisitStartTime: PageManager.pageVisitStartTime,
                privateWindow: browser.extension.inIncognitoContext
            });

            // Notify the page visit stop event listeners in the content script environment
            PageManager.pageVisitStop.notifyListeners([{
                timeStamp
            }]);

            console.debug(`Page visit stop: ${JSON.stringify(PageManager)}`);
        };

        /**
         * The function for firing the page attention update event, which runs whenever the
         * page attention state might have changed. The function contains logic to verify
         * that the attention state actually changed before firing the event.
         * @param {number} timeStamp - The time when the underlying event fired.
         * @param {boolean} pageHasAttention - The latest attention state, according to the
         * PageManager module running in the background page.
         */
        function pageAttentionUpdate(timeStamp, pageHasAttention) {
            if(PageManager.pageHasAttention === pageHasAttention)
                return;
            
            PageManager.pageHasAttention = pageHasAttention;

            // Notify the page attention update event listeners in the content script environment
            PageManager.pageAttentionUpdate.notifyListeners([{
                timeStamp
            }]);

            console.debug(`Page attention update: ${JSON.stringify(PageManager)}`);
        }

        /**
         * The function for firing the page audio update event, which runs whenever the
         * page audio state might have changed. The function contains logic to verify
         * that the audio state actually changed before firing the event.
         * @param {number} timeStamp - The time when the underlying event fired.
         * @param {boolean} pageHasAudio - The latest audio state, according to the
         * PageManager module running in the background page.
         */
        function pageAudioUpdate(timeStamp, pageHasAudio) {
            if(PageManager.pageHasAudio === pageHasAudio)
                return;

            PageManager.pageHasAudio = pageHasAudio;

            // Notify the page audio update event listeners in the content script environment
            PageManager.pageAudioUpdate.notifyListeners([{
                timeStamp
            }]);

            console.debug(`Page audio update: ${JSON.stringify(PageManager)}`);
        }

        // Handle events sent from the background page
        browser.runtime.onMessage.addListener((message) => {
            if(message.type === "WebScience.Utilities.PageManager.pageAttentionUpdate") {
                pageAttentionUpdate(message.timeStamp, message.pageHasAttention);
                return;
            }

            // If the background page detected a URL change, this could be belated
            // notification about a conventional navigation or it could be a page
            // load via the History API
            // We can distinguish these two scenarios by checking whether the URL
            // visible to the user (`window.location.href`) has changed since the
            // page visit start
            if((message.type === "WebScience.Utilities.PageManager.urlChanged") && 
               (locationHrefWithoutHash() !== PageManager.url)) {
                pageVisitStop(message.timeStamp);
                pageVisitStart(message.timeStamp, true);
                return;
            }

            if(message.type === "WebScience.Utilities.PageManager.pageAudioUpdate") {
                pageAudioUpdate(message.timeStamp, message.pageHasAudio);
                return;
            }
        });

        // If there are any other content scripts that are waiting for the API to load,
        // execute the callbacks for those content scripts        
        if("pageManagerHasLoaded" in window) {
            if(typeof window.pageManagerHasLoaded === "array")
                for(let callback of window.pageManagerHasLoaded)
                    if(typeof callback === "function") {
                        try {
                            callback();
                        }
                        catch(error) {
                            console.debug(`Error in callback for PageManager load: ${error}`);
                        }
                    }
            delete window.pageManagerHasLoaded();
        }

        // Send the page visit start event for the first time
        pageVisitStart(Math.floor(window.performance.timeOrigin));

        // Send the page visit stop event on the window unload event
        window.addEventListener("unload", (event) => {
            pageVisitStop(Date.now());
        });
    }
)();
