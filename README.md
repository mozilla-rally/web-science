# Web Science
A research project on how web users consume, are exposed to, and share news. Also, we hope, a library and template for [Firefox Pioneer](https://support.mozilla.org/en-US/kb/about-firefox-pioneer) studies.

## Requirements
* [Node.js](https://nodejs.org/en/), available via [Homebrew](https://brew.sh/) on macOS
* [Mozilla web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)

## Running the Extension
Launch an instance of Firefox with a temporary profile using `web-ext run` in the extension directory.

## Debugging the Extension
Debugging output is available in Tools → Web Developer → Browser Console. Make sure that the Show Content Messages option is checked. You might find it helpful to set a filter for debugging messages of interest.

The repository also contains configuration files for convenient debugging in [Visual Studio Code](https://code.visualstudio.com/):
* [/.vscode/launch.json](https://github.com/citp/web-science/blob/master/.vscode/launch.json) - Launch configurations for the extension.
* [/jsconfig.json](https://github.com/citp/web-science/blob/master/jsconfig.json) - Autocomplete and type checking configuration for the extension.

If you open the repository base directory in Visual Studio Code, these files will automatically load.

## Architecture
Web Science consists of three components: a study, study modules, and utility modules.

### Study - [/study/](https://github.com/citp/web-science/tree/master/study)
The study includes logic and data specific to this research project. This is, by design, the lightest component—the overwhelming majority of our implementation is not study specific, in order to promote reusability and facilitate rapid study development.
* [study.html](https://github.com/citp/web-science/blob/master/study/study.html) - A [background page](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) for loading [background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background). We use a background page for ES6 module support.
* [study.js](https://github.com/citp/web-science/blob/master/study/study.js) - A [background script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) that configures study and utility modules to conduct our study of how web users consume, are exposed to, and share news.
* [domains.js](https://github.com/citp/web-science/blob/master/study/domains.js) - The news domains of interest for our study.
* [mediaFbAccounts.js](https://github.com/citp/web-science/blob/master/study/domains.js) - Facebook accounts of media
* [mediaYtChannels.js](https://github.com/citp/web-science/blob/master/study/domains.js) - Youtube channels of media

### Study Modules - [/WebScience/Studies/](https://github.com/citp/web-science/tree/master/WebScience/Studies)
The study modules provide reusable measurement and intervention building blocks for conducting studies.
* [Navigation.js](https://github.com/citp/web-science/blob/master/WebScience/Studies/Navigation.js) - Measures user navigation and attention to webpages on domains of interest, using the `PageEvents` utility module and [content scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts).
* [LinkExposure.js](https://github.com/citp/web-science/blob/master/WebScience/Studies/LinkExposure.js) - Measures how users are exposed to links to domains of interest, using a [content script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts).
  * [content-scripts/linkExposure.js](https://github.com/citp/web-science/blob/master/WebScience/Studies/content-scripts/linkExposure.js) - A [content script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts) that extracts links to domains of interest from a page DOM.
* [SocialMediaNewsExposure.js](https://github.com/citp/web-science/blob/master/WebScience/Studies/SocialMediaNewsExposure.js) - Measures how users are exposed to news on social media , using a [content script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts).
  * [content-scripts/socialMediaNewsExposure-youtube.js](https://github.com/citp/web-science/blob/master/WebScience/Studies/content-scripts/socialMediaNewsExposure-youtube.js) - A [content script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts) that checks for News & Politics category on Youtube.
* [SocialMediaAccountExposure.js](https://github.com/citp/web-science/blob/master/WebScience/Studies/SocialMediaNewsExposure.js) - Measures how users are exposed to content from known media outlets on Youtube and Facebook, using [content script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts).
  * [content-scripts/socialMediaAccountExposure-youtube.js](https://github.com/citp/web-science/blob/master/WebScience/Studies/content-scripts/socialMediaNewsExposure-youtube.js) - A [content script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts) that checks content from known Youtube channels
  * [content-scripts/socialMediaAccountExposure-fb.js](https://github.com/citp/web-science/blob/master/WebScience/Studies/content-scripts/socialMediaNewsExposure-fb.js) - A [content script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts) that checks for posts from official handles of known media
* [SocialMediaSharing.js](https://github.com/citp/web-science/blob/master/WebScience/Studies/SocialMediaSharing.js) - Measures user sharing of links to domains of interest on social media (Facebook, Twitter, and Reddit). Implemented with the [`webRequest`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest) WebExtensions API.

### Utility Modules - [/WebScience/Utilities/](https://github.com/citp/web-science/tree/master/WebScience/Utilities)
The utility modules provide a library of reusable functions that assist with conducting studies.
* [Consent.js](https://github.com/citp/web-science/blob/master/WebScience/Utilities/Consent.js) - Functions for requesting user consent and acting on user consent events.
* [Debugging.js](https://github.com/citp/web-science/blob/master/WebScience/Utilities/Debugging.js) - Functionality for outputting debugging messages to the console in a consistent format. Implemented with the [`console`](https://developer.mozilla.org/en-US/docs/Web/API/console) Web API.
* [Idle.js](https://github.com/citp/web-science/blob/master/WebScience/Utilities/Idle.js) - Functionality for supporting browser idle state listeners with differing idle state thresholds. Implemented with the [`idle`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/idle) WebExtensions API.
* [LinkResolution.js](https://github.com/citp/web-science/blob/master/WebScience/Utilities/LinkResolution.js) - Functionality for resolving shortened and shimmed URLs. Implemented with the [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) Web API and the [`webRequest`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest) WebExtensions API.
* [Matching.js](https://github.com/citp/web-science/blob/master/WebScience/Utilities/Matching.js) - Functions for efficiently matching domain names and URLs.
* [Messaging.js](https://github.com/citp/web-science/blob/master/WebScience/Utilities/Messaging.js) - Functionality for supporting message types and message schemes for messaging between the background page and content scripts. Implemented with the [`runtime`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime) WebExtensions API.
* [PageEvents.js](https://github.com/citp/web-science/blob/master/WebScience/Utilities/PageEvents.js) - Functions for acting on events associated with webpage loading and user attention. The `PageEvents` module provides a research abstraction that guarantees the order of events (i.e., a finite-state automaton). Implemented with the [`tabs`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs), [`windows`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows), and [`webRequest`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest) WebExtensions APIs and the `Idle` utility module.
* [Randomization.js](https://github.com/citp/web-science/blob/master/WebScience/Utilities/Randomization.js) - Functionality for selecting and persisting randomized conditions.
* [ResponseBody.js](https://github.com/citp/web-science/blob/master/WebScience/Utilities/ResponseBody.js) - Functionality for reassembling an HTTP(S) response body using the [`webRequest`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest) WebExtensions API.
* [Scheduling.js](https://github.com/citp/web-science/blob/master/WebScience/Utilities/Scheduling.js) - Functionality for scheduling daily and weekly tasks, when the browser is idle. Implemented with the `Idle` utility module. Similar to the `idle-daily` event emitted by the Firefox [`nsIdleService`](https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XPCOM/Reference/Interface/nsIIdleService).
* [Storage.js](https://github.com/citp/web-science/blob/master/WebScience/Utilities/Storage.js) - Functionality for persisting study data. Implemented using the [`localForage`](https://github.com/localForage/localForage) library.
  * [../dependencies/localforagees6.min.js](https://github.com/citp/web-science/blob/master/WebScience/dependencies/localforagees6.min.js) - The [`localForage`](https://github.com/localForage/localForage) library, lightly modified to support importation as an ES6 module.
