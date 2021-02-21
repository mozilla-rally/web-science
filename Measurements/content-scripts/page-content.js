/**
 * Content script to extract url, title, and text from a page
 * @module WebScience.Measurements.content-scripts.page-content
 */
// Function encapsulation to maintain unique variable scope for each content script

// workerIds and Readbility are defined by injected code, tell eslint not to worry
/* global workerIds */
/* global Readability */


(
  async function () {
    /**
     * Send page content to a background script (e.g., a classifier)
     * @param {string} workerId - id of the background worker
     * @param {Object} pageContent - parsed page content
     * @returns {void}
     */
    function sendPageContentToBackground(workerId, pageContent) {
        browser.runtime.sendMessage({
            type: workerId,
            url : document.location.href,
            title : pageContent.title,
            text : pageContent.textContent,
            context: {
              timestamp: Date.now(),
              referrer: document.referrer,
            }
        });
    }

    // Parse (a clone of) the document using the injected readability script
    const documentClone = document.cloneNode(true);
    const pageContent = new Readability(documentClone).parse();

    for (const workerId of workerIds) {
        sendPageContentToBackground(workerId, pageContent);
    }
  }
)();
