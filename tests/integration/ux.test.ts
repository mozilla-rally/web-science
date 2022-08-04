/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import fs from "fs";
import minimist from "minimist";
import { until, WebDriver } from "selenium-webdriver";
import { spawn } from "child_process";

import {
  extensionLogsPresent,
  getChromeDriver,
  getFirefoxDriver, WAIT_FOR_PROPERTY
} from "./utils";


const args = minimist(process.argv.slice(2));
for (const arg of ["test_browser", "load_extension", "headless_mode"]) {
  if (!(arg in args)) {
    throw new Error(`Missing required option: --${arg}`);
  }
}

const testBrowser = args["test_browser"];
const loadExtension = args["load_extension"] === "true";
const headlessMode = args["headless_mode"] === "true";

export let getDriver;
switch (testBrowser) {
  case "chrome":
    getDriver = getChromeDriver;
    break;
  case "firefox":
    getDriver = getFirefoxDriver;
    break;
  default:
    throw new Error(`Unknown test_browser: ${testBrowser}`);
}

console.info(
  `Running with test_browser: ${testBrowser}, load_extension: ${loadExtension}, headless_mode: ${headlessMode}`
);

// Wait ten minutes overall before Jest times the test out.
jest.setTimeout(60 * 10000);

let driver: WebDriver;
let screenshotCount = 0;
let server;

let logWindow;
let testWindow;

const PORT = "8000";
const BASE_URL = `http://localhost:${PORT}`;
const PATH = "tests/integration/webarchive/localhost";

/**
 * Switch to the original window and wait for log to match regexp.
 * Needed for Chrome, since Selenium can only access web content logs.
 *
 * @param matches
 */
async function waitForLogs(matches: RegExp[]) {
  // Preserve handle to current test window.
  const testWindow = await driver.getWindowHandle();

  // Switch to original window to read logs.
  await driver.switchTo().window(logWindow);

  // Wait until log message is present, or time out.
  await driver.wait(
    async () =>
      await extensionLogsPresent(
        driver,
        testBrowser,
        matches
      ),
    WAIT_FOR_PROPERTY
  );

  // Restore focus to test window.
  await driver.switchTo().window(testWindow);
}

describe("WebScience Test Extension", function () {
  beforeAll(async () => {
    server = spawn("http-server", [PATH, "-p", PORT]);
    console.debug(`Test server running on port ${PORT}`);
  });

  afterAll(async () => {
    server.kill();
    console.debug(`Test server stopped on port ${PORT}`);
  });

  beforeEach(async () => {
    driver = await getDriver(loadExtension, headlessMode);

    // Chrome extensions don't seem to load scripts if we load the initial page within the first second.
    // FIXME add a better way to detect when Chrome is ready to start tests.
    await driver.sleep(1000);

    await driver.get(BASE_URL);
    await driver.wait(
      until.titleIs("Test"),
      WAIT_FOR_PROPERTY
    );

    // Start a new window for tests, the original will be used to collect logs from the extension.
    // Selenium is currently not able to access Chrome extension logs directly, so they are messaged to the
    // original window
    logWindow = await driver.getWindowHandle();
    await driver.switchTo().newWindow('window');
  });

  afterEach(async () => {
    screenshotCount++;

    const image = await driver.takeScreenshot();
    let extension = loadExtension ? "extension" : "no_extension";
    let headless = headlessMode ? "headless" : "no_headless";

    const screenshotDir = `screenshots/${testBrowser}-${extension}-${headless}`;
    const screenshotFilename = `${screenshotDir}/out-${screenshotCount}.png`;
    try {
      await fs.promises.access(`./${screenshotDir}`);
    } catch (ex) {
      await fs.promises.mkdir(`./${screenshotDir}`);
    }
    await fs.promises.writeFile(screenshotFilename, image, "base64");
    console.log(`recorded screenshot: ${screenshotFilename}`);

    await driver.quit();
  });

  it("tests navigation by modifying address bar in a single tab", async function () {
    await driver.get(BASE_URL);

    await driver.get(`${BASE_URL}/test1.html`);
    await driver.wait(
      until.titleIs("Test1"),
      WAIT_FOR_PROPERTY
    );

    await waitForLogs([
      /(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000)/,
      /(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test1.html)/,
      /(WebScienceTest - Page text received):.*/
    ]);

    await driver.navigate().back();

    await waitForLogs([
      /(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000\/test1.html)/,
      /(WebScienceTest - Page visit start).*(http:\/\/localhost:8000)/,
      /(WebScienceTest - Page text received):.*/
    ]);

    await driver.get(`${BASE_URL}/test2.html`);
    await driver.wait(
      until.titleIs("Test2"),
      WAIT_FOR_PROPERTY
    );

    await waitForLogs([
      /(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000\/test1.html)/,
      /(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test2.html)/,
      /(WebScienceTest - Page text received):.*/
    ]);
  });

  it("tests navigation by loading each site in a new window", async function () {
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);

    await driver.switchTo().newWindow('window');

    await driver.get(`${BASE_URL}/test1.html`);
    await driver.wait(
      until.titleIs("Test1"),
      WAIT_FOR_PROPERTY
    );

    await waitForLogs([
      /(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000)/,
      /(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test1.html)/,
      /(WebScienceTest - Page text received):.*/
    ]);

    await driver.close();
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);

    await driver.switchTo().newWindow('window');

    await driver.get(`${BASE_URL}/test2.html`);
    await driver.wait(
      until.titleIs("Test2"),
      WAIT_FOR_PROPERTY
    );

    await waitForLogs([
      /(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000\/test1.html)/,
      /(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test2.html)/
    ]);
  });

  it("tests navigation by loading each site in a new tab", async function () {

    await driver.switchTo().newWindow('tab');

    await driver.get(BASE_URL);
    await driver.wait(
      until.titleIs("Test"),
      WAIT_FOR_PROPERTY
    );

    await waitForLogs([
      /(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000)/,
      /(WebScienceTest - Page visit start).*(http:\/\/localhost:8000)/,
      /(WebScienceTest - Page text received):.*/
    ]);

    await driver.close();
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);

    await driver.switchTo().newWindow('tab');

    await driver.get(`${BASE_URL}/test1.html`);
    await driver.wait(
      until.titleIs("Test1"),
      WAIT_FOR_PROPERTY
    );

    await waitForLogs([
      /(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000)/,
      /(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test1.html)/,
      /(WebScienceTest - Page text received):.*/
    ]);

    await driver.close();
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);

    await driver.switchTo().newWindow('tab');

    await driver.get(`${BASE_URL}/test2.html`);
    await driver.wait(
      until.titleIs("Test2"),
      WAIT_FOR_PROPERTY
    );

    await waitForLogs([
      /(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000\/test1.html)/,
      /(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test2.html)/,
      /(WebScienceTest - Page text received):.*/
    ]);
  });
});