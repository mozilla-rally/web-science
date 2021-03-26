# Web Science
A library of reusable functionality for [Mozilla Rally](https://support.mozilla.org/en-US/kb/about-firefox-pioneer) studies.

## Requirements
* [Node.js](https://nodejs.org/en/), available via [Homebrew](https://brew.sh/) on macOS
* [Mozilla web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)

## Example Usage
See the [Rally Study 01](https://github.com/mozilla-rally/rally-study-01/), which we recommend using as a template.

## Architecture
The Web Science library consists of two types of modules: measurement modules that collect a specific type of data, and utility modules that provide supporting functionality.

### Measurement Modules - [/Measurements/](https://github.com/mozilla-rally/web-science/tree/master/Measurements)
* Under construction, measurement modules will be available soon.

### Utility Modules - [/Utilities/](https://github.com/mozilla-rally/web-science/tree/master/Utilities)
The utility modules provide a library of reusable functions that assist with conducting studies.
* [Debugging.js](https://github.com/mozilla-rally/web-science/blob/master/Utilities/Debugging.js) - Functionality for outputting debugging messages to the console in a consistent format. Implemented with the [`console`](https://developer.mozilla.org/en-US/docs/Web/API/console) Web API.
* [Events.js](https://github.com/mozilla-rally/web-science/blob/master/Utilities/Events.js) - Functionality for building events similar to [events.Event](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/events/Event) objects in WebExtensions.
* [Idle.js](https://github.com/mozilla-rally/web-science/blob/master/Utilities/Idle.js) - Functionality for supporting browser idle state listeners with differing idle state thresholds. Implemented with the [`idle`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/idle) WebExtensions API.
* [Messaging.js](https://github.com/mozilla-rally/web-science/blob/master/Utilities/Messaging.js) - Functionality for supporting message types and message schemes for messaging between the background page and content scripts. Implemented with the [`runtime`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/runtime) WebExtensions API.
* [PageManager.js](https://github.com/mozilla-rally/web-science/blob/master/Utilities/PageManager.js) - Functionality for uniquely identifying webpages and acting on events associated with webpage loading, user attention, and audio playback. The `PageManager` module provides a convenient API for content scripts and basic webpage loading events for background scripts. Implemented with the [`tabs`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs) and [`windows`](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/windows) WebExtensions APIs and the `Idle` utility module.

Coming soon to `npm`!