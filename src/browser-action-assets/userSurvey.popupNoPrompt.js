(async function() {
    // Load the message from storage
    const messageStorageKey = "webScience.userSurvey.popupNoPromptMessage";
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
})();
