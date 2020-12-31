const OPTIONS_PAGE_PATH = "public/index.html";

module.exports = {
    initialize() {
        browser.runtime.onInstalled.addListener(async ({ reason }) => {
            if (reason !== "install") {
                // We're only showing this when the addon is installed.
                return;
            }
            browser.runtime.openOptionsPage().catch(e => {
                console.error(`Study Add-On - Unable to open the control panel`, e);
            });
        });
    },
  };