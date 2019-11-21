import { studyDomains } from "/study/domains.js"
import * as WebScience from "/WebScience/WebScience.js"

WebScience.Utilities.DebugLog.enableDebugging();

// This is a study that won't involve identifiable data or any intervention,
// so we're disabling the study-specific consent feature.
WebScience.Utilities.Consent.disableStudySpecificConsent();

// Configure navigation collection
WebScience.Studies.Navigation.runStudy({
  domains: studyDomains,
  trackUserAttention: true,
  savePageContent: false
});

// Configure link exposure collection
WebScience.Studies.LinkExposure.runStudy({
  domains: studyDomains
});

// Configure social media sharing collection
WebScience.Studies.SocialMediaSharing.runStudy({
  domains: studyDomains,
  facebook: true,
  twitter: true,
  reddit: true
});

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
  var combinedStudyData = {
    navigation: navigationStudyData,
    linkExposure: linkExposureStudyData,
    socialMediaSharing: socialMediaSharingStudyData
  };
  browser.downloads.download( { url: URL.createObjectURL(new Blob([ JSON.stringify(combinedStudyData) ], { type: "application/json" })) } );
});
