import { studyDomains } from "/study/domains.js"
import { shortDomains } from "/study/shortdomains.js"
import { socialMedia } from "/study/socialmedia.js"
import * as WebScience from "/WebScience/WebScience.js"

WebScience.Utilities.Debugging.enableDebugging();
const debugLog = WebScience.Utilities.Debugging.getDebuggingLog("study");

/* These will be called depending on the consent setting for this study,
 *  in response to study events (e.g. stating the necessity of consent)
 *  and user actions (e.g. giving or revoking consent).
 */
WebScience.Utilities.Consent.registerStudyStartedListener(runStudies);
WebScience.Utilities.Consent.registerStudyEndedListener(stopStudies);

/* This is a study that won't involve identifiable data or any intervention,
 *  so we're disabling the study-specific consent feature.
 * The user can still opt-out by going to the settings page and
 *  turning off the data collection.
 */
WebScience.Utilities.Consent.disableStudySpecificConsent();

/* Will get consent, if necessary, and start the study when ready.
 */
WebScience.Utilities.Consent.requestConsentAndBegin();

function stopStudies() {
    // TODO -- send Telemetry message to delete remote data, and uninstall
    debugLog("Ending study");
}

function runStudies() {
  debugLog("Beginning study");
  // Configure navigation collection
  WebScience.Studies.Navigation.runStudy({
    domains: studyDomains,
    trackUserAttention: true,
    savePageContent: false
  });

// Configure link exposure collection
WebScience.Studies.LinkExposure.runStudy({
  domains: studyDomains,
  shortdomains: shortDomains
});

// Configure link exposure collection
/*WebScience.Studies.SocialMediaLinkExposure.runStudy({
  domains: studyDomains,
  shortdomains: shortDomains,
  socialmedia: socialMedia
});*/

// Configure social media sharing collection
/*WebScience.Studies.SocialMediaSharing.runStudy({
  domains: studyDomains,
  facebook: true,
  twitter: true,
  reddit: true
});*/

  // TODO configure social media account exposure collection
  // Something like...

  /*
  WebScience.Studies.SocialMediaAccountExposure.runStudy({
    facebookAccounts: [ ],
    twitterAccounts: [ ],
    youtubeAccounts: [ ]
  });
  */

  // TODO configure social media news exposure collection (i.e., content
  // recognized by platforms as news regardless of whether we recognize the domain
  // Something like...

  /*
  WebScience.Studies.SocialMediaNewsExposure.runStudy({
    facebook: true,
    twitter: true,
    youtube: true
  });
  */

  // Configure surveys
  // TODO something like...

  /*
  WebScience.Studies.UserSurvey.runStudy({
    surveyPromptText: "foo",
    surveyUrl: "bar",
    surveyTimeAfterInitialRun: 12345
  });
  */

  // Temporary support for dumping the navigation study data to a downloaded file
  browser.browserAction.onClicked.addListener(async (tab) => {
    var navigationStudyData = await WebScience.Studies.Navigation.getStudyDataAsObject();
    var linkExposureStudyData = await WebScience.Studies.LinkExposure.getStudyDataAsObject();
    var socialMediaSharingStudyData = await WebScience.Studies.SocialMediaSharing.getStudyDataAsObject();
    var counterData = await WebScience.Utilities.Storage.Counter.getContentsAsObject();
    var combinedStudyData = {
      navigation: navigationStudyData,
      linkExposure: linkExposureStudyData,
      socialMediaSharing: socialMediaSharingStudyData,
      counters: counterData
    };
    browser.downloads.download({ url: URL.createObjectURL(new Blob([JSON.stringify(combinedStudyData)], { type: "application/json" })) });
  });
}