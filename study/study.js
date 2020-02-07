import { studyDomains } from "/study/newsDomains.js"
import { youtubeChannels } from "/study/newsYouTubeChannels.js";
import { facebookAccounts } from "/study/newsFacebookAccounts.js";
import { twitterHandles } from "/study/newsTwitterHandles.js";
import * as WebScience from "../WebScience/WebScience.js"

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
        trackUserAttention: true
      });

    // Configure link exposure collection
    WebScience.Utilities.LinkResolution.initialize();
    WebScience.Studies.LinkExposure.runStudy({
        domains: studyDomains,
        privateWindows : false,
    });

    // Configure social media account exposure study
    WebScience.Studies.SocialMediaAccountExposure.runStudy({
        fbaccounts: facebookAccounts,
        ytchannels: youtubeChannels,
        twitterHandles : twitterHandles,
        privateWindows : false,
    });

    // Configure social media news exposure study
    WebScience.Studies.SocialMediaNewsExposure.runStudy({
        privateWindows : false,
    });

    // Configure social media sharing collection
    WebScience.Studies.SocialMediaSharing.runStudy({
        domains: studyDomains,
        facebook: true,
        twitter: true,
        reddit: true,
        privateWindows: false
    });
    
    // Configure surveys (pending choices)
    /*
    WebScience.Utilities.UserSurvey.runStudy({
        surveyUrl: "https://www.mozilla.org/en-US/",
        surveyTimeAfterInitialRun: 5000
    });
    */
}
