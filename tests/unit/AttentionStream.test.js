/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 const assert = require('assert').strict;
 const sinon = require('sinon');
 
 const AttentionStream = require('../../src/AttentionStream.js');
 
// A fake study id to use in the tests when looking for a
// "known" study.
const FAKE_STUDY_ID = "test@ion-studies.com";
const FAKE_STUDY_ID_NOT_INSTALLED = "test-not-installed@ion-studies.com";
const FAKE_STUDY_LIST = [
  {
    "addon_id": FAKE_STUDY_ID
  },
  {
    "addon_id": FAKE_STUDY_ID_NOT_INSTALLED
  }
];
const FAKE_WEBSITE = "https://test.website";

async function delay(ms=1000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

 describe('Core', function () {
   beforeEach(function () {
     // Force the sinon-chrome stubbed API to resolve its promise
     // in tests. Without the next two lines, tests querying the
     // `browser.management.getAll` API will be stuck and timeout.
     // Note that this will fake our data to make FAKE_STUDY_ID look
     // installed.
    //  chrome.management.getAll
    //    .callsArgWith(0, [{type: "extension", id: FAKE_STUDY_ID}])
    //    .resolves();
    //  chrome.management.getAll.yields(
    //    [{type: "extension", id: FAKE_STUDY_ID}]);
 
     // NodeJS doesn't support "fetch" so we need to mock it
     // manually (or use a third party package). This isn't too
     // bad, as we can just return our fake ids.
 
     this.attention = new AttentionStream();
   });
 
  //  describe('_openControlPanel()', function () {
  //    it('should open the options page', function () {
  //      chrome.runtime.openOptionsPage.flush();
  //      this.core._openControlPanel();
  //      assert.ok(chrome.runtime.openOptionsPage.calledOnce);
  //    });
  //  });
 
   describe('.initialize()', function () {
    //  it('opens the options page on install', function () {
    //    chrome.runtime.openOptionsPage.flush();
    //    // The initializer installs the handlers.
    //    this.attention.initialize();
    //    // Dispatch an installation event to see if the page is
    //    // opened.
    //    chrome.runtime.onInstalled.dispatch({reason: "install"});
    //    assert.ok(chrome.runtime.openOptionsPage.calledOnce);
    //  });
 
     it('listens for web extension tab events', function () {
       assert.ok(browser.tabs.onActivated.addListener.calledOnce);
       assert.ok(chrome.tabs.onUpdated.addListener.calledOnce);
       assert.ok(chrome.tabs.onRemoved.addListener.calledOnce);
     });
   });

   describe('.onChange()', function () {
     it('adds an onChange callback', function() {
      this.attention.onChange(() => {

      });
      assert.equal(this.attention._onChangeHandlers.length, 1);
     })
     it('calls all of the _onChangeHandlers callbacks', function() {
      const callback1 = sinon.fake();
      const callback2 = sinon.fake();
      this.attention.onChange(callback1);
      this.attention.onChange(callback2);
      this.attention._handleChange();
      assert.ok(callback1.calledOnce);
      assert.ok(callback2.calledOnce);
     });
     it('a new page load (update) creates a new event', async function() {
      const callback = sinon.fake();
      this.attention.onChange(callback);

      chrome.tabs.onUpdated.dispatch(undefined, {status: "loading", url: "https://example.com/"});
      await delay(1);
      chrome.tabs.onUpdated.dispatch(undefined, {favIconUrl: "https://news.example.com/favicon.ico"});
      await delay(1);
      chrome.tabs.onUpdated.dispatch(undefined, {title: "Example.com"});
      await delay(1);
      chrome.tabs.onUpdated.dispatch(undefined, {status: "complete"});
      await delay(1);

      await delay(100);

      chrome.tabs.onUpdated.dispatch(undefined, {status: "loading", url: "https://nytimes.com"});
      await delay(1);
      chrome.tabs.onUpdated.dispatch(undefined, {favIconUrl: "https://nytimes.com"});
      await delay(1);
      chrome.tabs.onUpdated.dispatch(undefined, {title: "The New York Times"});
      await delay(1);
      chrome.tabs.onUpdated.dispatch(undefined, {status: "complete"});
      await delay(1);

      const firstEvent = this.attention._events[0];
      assert.equal(firstEvent.url, 'https://example.com/');
      assert.equal(firstEvent.reason, 'update');
      assert.equal(firstEvent.status, 'complete');
     })
     it('calls when the tab events occur', async function() {
      
     })
   })
  
  afterEach(function () {
    chrome.flush();
  });
});