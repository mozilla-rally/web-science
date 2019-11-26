async function saveOptions(e) {
  e.preventDefault();
  /* When the user hits the save button, send a message
   *  to the background page with the new value.
   */
  var consent = document.querySelector("#collection").checked;

  browser.runtime.sendMessage({
    type: "WebScience.Options.saveStudySpecificConsent",
    content: {
      studySpecificConsent: consent
    }
  });
}

async function restoreOptions() {

  function setCurrentChoice(result) {
    document.querySelector("#collection").checked = result;
  }

  /* Send a message to the background page to ask whether
   *  the study is currently enabled, and then set the slider
   *  to reflect that -- the response from the listener is
   *  the answer.
   */
  browser.runtime.sendMessage({
    type: "WebScience.Options.checkStudySpecificConsent"
  }).then(setCurrentChoice);
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);