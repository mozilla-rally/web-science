# WebScience
WebScience is an open-source library for building browser-based research studies, including on [Rally](https://rally.mozilla.org/).

## Design Goals
* Reduce the barriers to implementing browser-based research studies, by providing production-quality functionality that is commonly required, difficult to implement correctly, and difficult to maintain.
* Standardize measurement methods across browser-based research studies.
* Advance the state of the art in browser-based research methods, such as by providing a sophisticated model for user attention to web content and providing infrastructure for in-browser machine learning classification of webpages.
* Encourage researchers to practice data minimization when implementing studies.
* Support integration with existing libraries that are valuable for browser-based studies, such as for indexed data storage (e.g., [Dexie.js](https://dexie.org/)) or for machine learning (e.g., [TensorFlow.js](https://www.tensorflow.org/js), [ONNX.js](https://github.com/microsoft/onnxjs), [WebDNN](https://mil-tokyo.github.io/webdnn/), or [sklearn-porter](https://github.com/nok/sklearn-porter)).
* Provide an API that is built on and consistent with [WebExtensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions), reducing the learning curve and offering compatibility with all major web browsers.

## Contributors
The primary contributors to WebScience are researchers at the [Princeton University Center for Information Technology Policy](https://citp.princeton.edu/) and the [Mozilla Rally](https://rally.mozilla.org/) team.

## Getting Started with WebScience
The easiest way to get started is with the Rally [study template](https://github.com/mozilla-rally/study-template), which has already been configured to integrate the WebScience library.

If you would prefer to build a browser extension with WebScience from scratch, we recommend the following steps:
* Use [Node.js](https://nodejs.org/en/) for managing the extension's dependencies with a [`package.json`](https://docs.npmjs.com/cli/v7/configuring-npm/package-json) file and [`npm install`](https://docs.npmjs.com/cli/v7/commands/npm-install). WebScience is available on [npm](https://www.npmjs.com/) as the package [`@mozilla/web-science`](https://www.npmjs.com/package/@mozilla/web-science).
* Use [Rollup](https://rollupjs.org/guide/en/) with the [`node-resolve`](https://github.com/rollup/plugins/tree/master/packages/node-resolve) plugin to integrate WebScience into your bundled extension.

## Using WebScience in a Study Extension
Using WebScience in your study extension is easy. At the start of the background script where you want to use WebScience, just add:
```js
import * as webScience from "@mozilla/web-science";
```
You will then be able to use the WebScience API within the background script (e.g., `webScience.pageNavigation...`).

You can also selectively import components of the WebScience API, if you prefer. Just add, for example:
```js
import { pageNavigation, socialMediaLinkSharing } from "@mozilla/web-science";
```
You will then be able to use those components of the API (e.g., `pageNavigation...`).

## Exploring the WebScience API
We will have documentation for the WebScience API online shortly. In the interim, the WebScience source includes voluminous JSDoc annotations.

## API Implementation Progress
| Module                   | No Breaking Changes Planned | No Known Bugs      | Good Documentation | Good Test Coverage |   
| ------------------------ | --------------------------- | ------------------ | ------------------ | ------------------ |
| `debugging`              | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `events`                 | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `id`                     | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `idle`                   | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `inline`                 | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `linkExposure`           | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `linkResolution`         | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `matching`               | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `messaging`              | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `pageManager`            | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `pageNavigation`         | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `pageText`               | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `permissions`            | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `randomization`          | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `scheduling`             | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `socialMediaActivity`    | :x: [#23](https://github.com/mozilla-rally/web-science/issues/23)                        | :white_check_mark: | :white_check_mark: | :x:                |
| `socialMediaLinkSharing` | :x: [#17](https://github.com/mozilla-rally/web-science/issues/17)                        | :white_check_mark: | :white_check_mark: | :x:                |
| `storage`                | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `userSurvey`             | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
| `workers`                | :white_check_mark:          | :white_check_mark: | :white_check_mark: | :x:                |
