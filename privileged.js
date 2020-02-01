ChromeUtils.import("resource://gre/modules/Console.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
ChromeUtils.import("resource://gre/modules/ExtensionUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(
    this,
    "BrowserWindowTracker",
    "resource:///modules/BrowserWindowTracker.jsm",
);

this.privileged = class extends ExtensionAPI {
    getAPI(context) {
        return {
            privileged: {
                createConsentPopup() {
                    var currentWindow = BrowserWindowTracker.getTopWindow({
                        private: false,
                        allowPopups: false,
                    });

                    // PopupNotifications API
                    currentWindow.PopupNotifications.show(
                        currentWindow.gBrowser.selectedBrowser, // browser
                        "uxmockup-popup", // id
                        "Firefox has partnered with researchers from Princeton University to study the health of the web. Learn how you can opt in to participating.", // message
                        null, // anchor id
                        { // main action
                            label: "Learn more",
                            accessKey: "L",
                            callback: function() { }
                        },
                        [ // secondary actions
                            {
                                label: "No thanks",
                                accessKey: "N",
                                callback: function() { }
                            }
                        ],
                        // temporary options
                        {
                            "persistence": 10,
                            "persistWhileVisible": true,
                            "dismissed": false,
                            // if we go with something like this, we'll need to use the right (light or dark) version
                            //"popupIconURL": //couldn't get a relative path to work, used absolute for screenshots "file:///pathtohere/icons/princeton_university_shield_light.png"
                        }
                    );

                },
                createSurveyPopup(url) {
                    var currentWindow = BrowserWindowTracker.getTopWindow({
                        private: false,
                        allowPopups: false,
                    });

                    // PopupNotifications API
                    currentWindow.PopupNotifications.show(
                        currentWindow.gBrowser.selectedBrowser, // browser
                        "uxmockup-popup", // id
                        "A survey is available for the study you joined.", // message
                        null, // anchor id
                        { // main action
                            label: "Open survey",
                            accessKey: "O",
                            callback: function () {
                                //browser.tabs.create({url: url});
                             }
                        },
                        [ // secondary actions
                            {
                                label: "No thanks",
                                accessKey: "N",
                                callback: function () { }
                            }
                        ],
                        // temporary options
                        {
                            "persistence": 10,
                            "persistWhileVisible": true,
                            "dismissed": false,
                            // if we go with something like this, we'll need to use the right (light or dark) version
                            //"popupIconURL": //couldn't get a relative path to work, used absolute for screenshots "file:///pathtohere/icons/princeton_university_shield_light.png"
                        }
                    );

                }
            }
        }
    }
  }