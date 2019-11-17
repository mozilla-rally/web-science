import { studyDomains } from "/study/domains.js"
import * as WebScience from "/WebScience/WebScience.js"

// This is a study that won't involve identifiable data or any intervention,
// so we're disabling the study-specific consent feature.
WebScience.disableStudySpecificConsent();

// Configure navigation collection
WebScience.Navigation.runStudy({
  domains: studyDomains,
  trackUserAttention: true,
  savePageContent: false
});

// Temporary support for dumping the navigation study data to a downloaded file
browser.browserAction.onClicked.addListener(async (tab) => {
  var navigationStudyData = await WebScience.Navigation.getStudyDataAsObject();
  var linkExposureStudyData = await WebScience.LinkExposure.getStudyDataAsObject();
  var combinedStudyData = {
    navigation: navigationStudyData,
    linkExposure: linkExposureStudyData
  };
  browser.downloads.download( { url: URL.createObjectURL(new Blob([ JSON.stringify(combinedStudyData) ], { type: "application/json" })) } );
});

// Configure exposure collection

WebScience.LinkExposure.runStudy({
  domains: studyDomains
});

// Configure surveys
// TODO something like...

/*
WebScience.UserSurvey.runStudy({
  surveyPromptText: "foo",
  surveyUrl: "bar",
  surveyTimeAfterInitialRun: 12345
});
*/
