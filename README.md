# News and Disinformation Study
A research project on how web users consume, are exposed to, and share news.

## Requirements
* [Node.js](https://nodejs.org/en/), available via [Homebrew](https://brew.sh/) on macOS
* [Mozilla web-ext](https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/)

## Architecture
See the [Web Science](https://github.com/citp/web-science) repository for a description
of the overall structure, including the common study modules. This repository contains
the study component, described below.

### Study - [/study/](https://github.com/citp/news-disinformation-study/tree/master/study)
The study includes logic and data specific to this research project. This is, by design, the lightest component—the overwhelming majority of our implementation is not study specific, in order to promote reusability and facilitate rapid study development.
* [study.html](https://github.com/citp/news-disinformation-study/blob/master/study/study.html) - A [background page](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) for loading [background scripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background). We use a background page for ES6 module support.
* [study.js](https://github.com/citp/news-disinformation-study/blob/master/study/study.js) - A [background script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background) that configures study and utility modules to conduct our study of how web users consume, are exposed to, and share news.
* [newsDomains.js](https://github.com/citp/news-disinformation-study/blob/master/study/newsDomains.js) - The news domains of interest for our study.
* [newsFacebookAccounts.js](https://github.com/citp/news-disinformation-study/blob/master/study/newsFacebookAccounts.js) - Facebook accounts of media
* [newsYouTubeChannels.js](https://github.com/citp/news-disinformation-study/blob/master/study/newsYouTubeChannels.js) - Youtube channels of media

## Running the Extension
Launch an instance of Firefox with a temporary profile using `web-ext run` in the extension directory.

## Debugging the Extension
Debugging output is available in Tools → Web Developer → Browser Console. Make sure that the Show Content Messages option is checked. You might find it helpful to set a filter for debugging messages of interest.

The repository also contains configuration files for convenient debugging in [Visual Studio Code](https://code.visualstudio.com/):
* [/.vscode/launch.json](https://github.com/citp/news-disinformation-study/blob/master/.vscode/launch.json) - Launch configurations for the extension.
* [/jsconfig.json](https://github.com/citp/news-disinformation-study/blob/master/jsconfig.json) - Autocomplete and type checking configuration for the extension.

If you open the repository base directory in Visual Studio Code, these files will automatically load.

