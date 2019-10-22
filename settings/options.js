function saveOptions(e) {
    e.preventDefault();
    var curr = document.querySelector("#collection").checked;
    console.log("in saveOptions curr is ", curr);
    localforage.setItem("collectionConsent", curr)
        .then(collectionMain);
}

function restoreOptions() {

    function setCurrentChoice(result) {
        var curr = result;
        if (result == null) curr = false;
        console.log("result was ", result);
        console.log("and so curr is ", curr);
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
