/* This Source Code Form is subject to the terms of the Mozilla Public
* License, v. 2.0. If a copy of the MPL was not distributed with this
* file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const utils = require("./utils.js");
const { By, until } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");

// The number of milliseconds to wait for some
// property to change in tests. This should be
// a long time to account for slow CI.
const WAIT_FOR_PROPERTY = 5000;

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

describe("Study Template integration test example", function () {
  // eslint-disable-next-line mocha/no-hooks-for-single-case
  beforeEach(async function () {
    this.driver = await utils.getFirefoxDriver(true);
  });

  // eslint-disable-next-line mocha/no-hooks-for-single-case
  afterEach(async function () {
    await this.driver.quit();
  });

  it("successfully opens the study template options page on installation", async function () {
    await this.driver.get(`file:///${__dirname}/index.html`);
    await this.driver.wait(until.titleIs("Installation Test"), WAIT_FOR_PROPERTY);
    await findAndAct(this.driver, By.id("install"), e => e.click());
    // switch to browser UI context to interact with Firefox add-on install prompts.
    await this.driver.setContext(firefox.Context.CHROME);
    await findAndAct(this.driver, By.css(`[label="Add"]`), e => e.click());
    await findAndAct(this.driver, By.css(`[label="Okay, Got It"]`), e => e.click());
    // Switch back to web content context.
    await this.driver.setContext(firefox.Context.CONTENT);

    // We expect the extension to load its options page in a new tab.
    // We also expect the study extension to show the Rally installation page
    // since the Rally Core Add-On is not installed.
    await this.driver.wait(async () => {
      return (await this.driver.getAllWindowHandles()).length === 3;
    }, WAIT_FOR_PROPERTY);

  // Selenium is still focused on the latest tab (which is the Rally Core Add-On installation page).
  // Switch to the options page to ensure it exists.
    const tabs = (await this.driver.getAllWindowHandles());
    // this should be the options page.
    const newTab = tabs[1];
    
    await this.driver.switchTo().window(newTab);
   
   // Let's wait until the page is fully loaded and the title matches. 
    await this.driver.wait(
      until.titleIs("Rally Study Template"),
      WAIT_FOR_PROPERTY
    );
  });
});
