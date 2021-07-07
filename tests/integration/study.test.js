/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// const assert = require("assert");
const { getFirefoxDriver, processLineByLine, WAIT_FOR_PROPERTY } = require("./utils.js");
const { until } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");

describe("Study Template integration test example", function () {
  // eslint-disable-next-line mocha/no-hooks-for-single-case
  beforeEach(async function () {
    this.driver = await getFirefoxDriver(true);
    await this.driver.installAddon("tests/build/web-ext-artifacts/webscience_build_test-1.0.0.zip");
    await this.driver.setContext(firefox.Context.CONTENT);
  });

  // eslint-disable-next-line mocha/no-hooks-for-single-case
  afterEach(async function () {
    await this.driver.quit();
  });

  it("successfully runs the study against test sites", async function () {
    await this.driver.get(`file:///${__dirname}/sites/wikipedia/index.html`);

    // Let"s wait until the page is fully loaded and the title matches.
    await this.driver.wait(
      until.titleIs("Wikipedia"),
      WAIT_FOR_PROPERTY
    );

    // Check the log output to ensure that the extension started up OK.
    const expectedCount = 1;
    await processLineByLine("WebScience Test Startup", expectedCount);
  });
});
