function saveOptions(e) {
    e.preventDefault();
    browser.storage.local.set({
        "collectionConsent": document.querySelector("#collection").checked
    })
    .then(collectionMain());
   
}

function restoreOptions() {

    function setCurrentChoice(result) {
        document.querySelector("#collection").checked = result["collectionConsent"] || false;
    }

    function onError(error) {
        console.log(`Error: ${error}`);
    }

    browser.storage.local.get("collectionConsent")
    .then(setCurrentChoice, onError);
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
