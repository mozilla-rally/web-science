async function saveOptions(e) {
  e.preventDefault();
  /* When the user hits the save button, grab the background page
   *  and call the function to save that new value
   */
  var consent = document.querySelector("#collection").checked;
  var backgroundWindow = await browser.runtime.getBackgroundPage();
  backgroundWindow.saveStudySpecificConsent(consent);
}

async function restoreOptions() {

  function setCurrentChoice(result) {
    document.querySelector("#collection").checked = result;
  }

  var backgroundWindow = await browser.runtime.getBackgroundPage();

  setCurrentChoice(await backgroundWindow.checkStudySpecificConsent());
}

document.addEventListener("DOMContentLoaded", restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);