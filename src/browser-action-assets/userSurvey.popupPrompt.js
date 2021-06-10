(async function() {
    // Load the message from storage
    const messageStorageKey = "webScience.userSurvey.popupPromptMessage";
    const messageResults = await browser.storage.local.get(messageStorageKey);
    if(messageResults[messageStorageKey]) {
        const contentElement = document.getElementById("content");
        contentElement.textContent = messageResults[messageStorageKey];
    }

    // Load icon URL from storage
    const iconUrlStorageKey = "webScience.userSurvey.popupIconUrl";
    const iconUrlResults = await browser.storage.local.get(iconUrlStorageKey);
    if(iconUrlResults[iconUrlStorageKey]) {
        const iconElement = document.getElementById("icon");
        iconElement.src = iconUrlResults[iconUrlStorageKey];
        iconElement.style.display = "block";
    }
    
    // Listen for clicks on the buttons
    document.addEventListener("click", async (e) => {
        if (e.target.name === "agree") {
            await browser.runtime.sendMessage({ type: "webScience.userSurvey.openSurvey" });
        }
        else if (e.target.name === "later") {
            window.close();
        }
        else if (e.target.name === "never") {
            await browser.runtime.sendMessage({ type: "webScience.userSurvey.cancelSurvey" });
            window.close();
        }
    });
})();
