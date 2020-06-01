/**
 * Content script to extract url, title, and text from a page
 * @module WebScience.Measurements.content-scripts.page-content
 */
// Function encapsulation to maintain unique variable scope for each content script
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
    let documentClone = document.cloneNode(true);
    let pageContent = new Readability(documentClone).parse();

    sendPageContentToBackground(workerId, pageContent);
  }
)();
