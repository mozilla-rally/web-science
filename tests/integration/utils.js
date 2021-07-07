/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const assert = require("assert");
const { Builder, until } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");
const fs = require("fs");
const readline = require('readline');

// The number of milliseconds to wait for some
// property to change in tests. This should be
// a long time to account for slow CI.
const WAIT_FOR_PROPERTY = 5000;

async function processLineByLine(pattern, expectedCount) {
  const fileStream = fs.createReadStream("dist/integration.log");

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let count = 0;
  for await (const line of rl) {
    if (line.includes(pattern)) {
      count++;
    }
  }

  assert.ok(count == expectedCount, `Expected pattern ${pattern} to be present on ${expectedCount} line*s) of browser console output`);
}

/**
* Find the element and perform an action on it.
*
* @param driver
*        The Selenium driver to use.
* @param element
*        The element to look for and execute actions on.
* @param action
*        A function in the form `e => {}` that will be called
*        and receive the element once ready.
*/
async function findAndAct(driver, element, action) {
  await driver.wait(until.elementLocated(element), WAIT_FOR_PROPERTY);
  await driver.findElement(element).then(e => action(e));
}

/**
 * Get a Selenium driver for using the Firefox browser.
 *
 * @param {Boolean} headless
 *        Whether or not to run Firefox in headless mode.
 * @returns {WebDriver} a WebDriver instance to control Firefox.
 */
async function getFirefoxDriver(headless) {
  const firefoxOptions = new firefox.Options();
  firefoxOptions.setPreference("xpinstall.signatures.required", false);
  firefoxOptions.setPreference("extensions.experiments.enabled", true);
  firefoxOptions.setPreference("devtools.console.stdout.content", true);
  firefoxOptions.setPreference("devtools.console.stdout.chrome", true);

  if (headless) {
    firefoxOptions.headless();
  }

  if (process.platform === "linux") {
    // Look for the Firefox executable in different locations.
    const FIREFOX_PATHS = [
      "/usr/bin/firefox-trunk",
      "/usr/bin/firefox",
    ];

    for (const path of FIREFOX_PATHS) {
      if (fs.existsSync(path)) {
        firefoxOptions.setBinary(path);
        break;
      }
    }
  } else if (process.platform === "darwin") {
    firefoxOptions.setBinary(
      "/Applications/Firefox Nightly.app/Contents/MacOS/firefox"
    );
  }

  return await new Builder()
    .forBrowser("firefox")
    .setFirefoxOptions(firefoxOptions)
    .setFirefoxService(new firefox.ServiceBuilder().setStdio("inherit"))
    .build();
}

module.exports.getFirefoxDriver = getFirefoxDriver;
module.exports.findAndAct = findAndAct;
module.exports.WAIT_FOR_PROPERTY = WAIT_FOR_PROPERTY;
module.exports.processLineByLine = processLineByLine;
