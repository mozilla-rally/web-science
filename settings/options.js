function saveOptions(e) {
    e.preventDefault();
    var curr = document.querySelector("#collection").checked;
    localforage.setItem("collectionConsent", curr)
        .then(collectionMain);
}

function restoreOptions() {

    function setCurrentChoice(result) {
        var curr = result;
        if (result == null) curr = false;
        document.querySelector("#collection").checked = curr;
    }

    function onError(error) {
        console.log(`Error: ${error}`);
    }

    localforage.getItem("collectionConsent")
        .then(setCurrentChoice, onError);
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
