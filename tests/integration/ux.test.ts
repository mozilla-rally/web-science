/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import fs, { createReadStream } from "fs";
import minimist from "minimist";
import readline from "readline";
import { By, until, WebDriver } from "selenium-webdriver";
import { spawn } from "child_process";

import {
  extensionLogsPresent, findAndAct,
  getChromeDriver,
  getFirefoxDriver, WAIT_FOR_PROPERTY
} from "./utils";


const args = minimist(process.argv.slice(2));
console.debug(args);
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

const PORT = "8000";
const BASE_URL = `http://localhost:${PORT}`;
const PATH = "tests/integration/webarchive/localhost";

const waitForExtensionLog = async (message) => {
  await driver.wait(
    async () =>
      await extensionLogsPresent(
        driver,
        testBrowser,
        message
      ),
    WAIT_FOR_PROPERTY
  );
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
    await driver.wait(
      until.titleIs("Test"),
      WAIT_FOR_PROPERTY
    );

    await waitForExtensionLog(/(WebScienceTest - Page visit start).*(http:\/\/localhost:8000)/);

    await driver.get(`${BASE_URL}/test1.html`);
    await driver.wait(
      until.titleIs("Test1"),
      WAIT_FOR_PROPERTY
    );

    await waitForExtensionLog(/(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000)/);
    await waitForExtensionLog(/(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test1.html)/);

    await driver.navigate().back();

    await waitForExtensionLog(/(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000\/test1.html)/);
    await waitForExtensionLog(/(WebScienceTest - Page visit start).*(http:\/\/localhost:8000)/);

    await driver.get(`${BASE_URL}/test2.html`);
    await driver.wait(
      until.titleIs("Test2"),
      WAIT_FOR_PROPERTY
    );

    await waitForExtensionLog(/(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000\/test1.html)/);
    await waitForExtensionLog(/(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test2.html)/);
  });

  it("tests navigation by loading each site in a new window", async function () {

    await driver.switchTo().newWindow('window');

    await driver.get(BASE_URL);
    await driver.wait(
      until.titleIs("Test"),
      WAIT_FOR_PROPERTY
    );

    await waitForExtensionLog(/(WebScienceTest - Page visit start).*(http:\/\/localhost:8000)/);

    await driver.close();
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);

    await driver.switchTo().newWindow('window');

    await driver.get(`${BASE_URL}/test1.html`);
    await driver.wait(
      until.titleIs("Test1"),
      WAIT_FOR_PROPERTY
    );

    await waitForExtensionLog(/(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000)/);
    await waitForExtensionLog(/(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test1.html)/);

    await driver.close();
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);

    await driver.switchTo().newWindow('window');

    await driver.get(`${BASE_URL}/test2.html`);
    await driver.wait(
      until.titleIs("Test2"),
      WAIT_FOR_PROPERTY
    );

    await waitForExtensionLog(/(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000\/test1.html)/);
    await waitForExtensionLog(/(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test2.html)/);

    await driver.close();
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);
  });

  it("tests navigation by loading each site in a new tab", async function () {

    await driver.switchTo().newWindow('tab');

    await driver.get(BASE_URL);
    await driver.wait(
      until.titleIs("Test"),
      WAIT_FOR_PROPERTY
    );

    await waitForExtensionLog(/(WebScienceTest - Page visit start).*(http:\/\/localhost:8000)/);

    await driver.close();
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);

    await driver.switchTo().newWindow('tab');

    await driver.get(`${BASE_URL}/test1.html`);
    await driver.wait(
      until.titleIs("Test1"),
      WAIT_FOR_PROPERTY
    );

    await waitForExtensionLog(/(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000)/);
    await waitForExtensionLog(/(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test1.html)/);

    await driver.close();
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);

    await driver.switchTo().newWindow('tab');

    await driver.get(`${BASE_URL}/test2.html`);
    await driver.wait(
      until.titleIs("Test2"),
      WAIT_FOR_PROPERTY
    );

    await waitForExtensionLog(/(WebScienceTest - Page visit stop).*(http:\/\/localhost:8000\/test1.html)/);
    await waitForExtensionLog(/(WebScienceTest - Page visit start).*(http:\/\/localhost:8000\/test2.html)/);

    await driver.close();
    await driver.switchTo().window((await driver.getAllWindowHandles())[0]);
  });
});