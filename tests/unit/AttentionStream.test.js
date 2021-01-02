/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 jest.mock('webextension-polyfill', () => require('sinon-chrome/webextensions'));
 const browser = require("webextension-polyfill");

 const sinon = require('sinon');

 jest.mock('../../src/get-page-url');
 const getPageURL = require('../../src/get-page-url');
 
 const AttentionStream = require('../../src/AttentionStream.js');

async function delay(ms=1000) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updatePage(title, url) {
  browser.tabs.onUpdated.dispatch(undefined, {status: "loading", url});
  await delay(1);
  browser.tabs.onUpdated.dispatch(undefined, {favIconUrl: url});
  await delay(1);
  browser.tabs.onUpdated.dispatch(undefined, {title});
  await delay(1);
  browser.tabs.onUpdated.dispatch(undefined, {status: "complete"});
  await delay(1);
}


 describe('Core', function () {
    beforeAll(function() {
      global.browser = browser;
    })

    afterAll(function() {
      browser.flush();
      delete global.browser;
    })
  let attention;
   beforeEach(function () {
    getPageURL.mockReset();
    attention = new AttentionStream();
   });


 
   describe('.initialize()', function () {
     it('listens for web extension tab events', function () {
       expect(browser.tabs.onActivated.addListener.calledOnce).toBeTruthy();
       expect(browser.tabs.onUpdated.addListener.calledOnce).toBeTruthy();
       expect(browser.tabs.onRemoved.addListener.calledOnce).toBeTruthy();
     });
   });

   describe('.onChange()', function () {
     it('adds an onChange callback', function() {
      attention.onChange(() => {

      });
      expect(attention._onChangeHandlers.length).toBe(1);
     })
     it('calls all of the _onChangeHandlers callbacks', function() {
      const callback1 = sinon.fake();
      const callback2 = sinon.fake();
      attention.onChange(callback1);
      attention.onChange(callback2);
      attention._handleChange();

      expect(callback1.calledOnce).toBeTruthy();
      expect(callback2.calledOnce).toBeTruthy();
     });
     it('tab-updated: updating the tab creates a new event', async function() {
      const callback = sinon.fake();
      attention.onChange(callback);

      getPageURL.mockResolvedValue("https://example.com/");
      await updatePage('Example.com', "https://example.com/");
      await delay(1);

      getPageURL.mockResolvedValue("https://news.com/");
      await updatePage('News Site', "https://news.com/");
      await delay(1);

      // FIXME: create an active: false case.
      getPageURL.mockResolvedValue("https://socialmedia.com/test/path?q=test");
      await updatePage('Social Media Site', "https://socialmedia.com/test/path?q=test");

      const [firstEvent, secondEvent] = attention._events;
      expect(firstEvent.url).toBe('https://example.com/');
      expect(firstEvent.reason).toBe('tab-updated');
      expect(firstEvent.status).toBe('complete');

      expect(secondEvent.url).toBe('https://news.com/');
      expect(secondEvent.reason).toBe('tab-updated');
      expect(secondEvent.status).toBe('complete');

      expect(attention._current.url).toBe("https://socialmedia.com/test/path?q=test");
      expect(attention._current.reason).toBe('tab-updated');
      expect(attention._current.status).toBe('complete');

      // FIXME: test that callback was called.
     })

     it('tab-activated: switching tabs creates new event', async function() {
      const callback = sinon.fake();
      attention.onChange(callback);

      // set first page
      getPageURL.mockResolvedValue("https://example.com/");
      await updatePage('Example.com', "https://example.com/");
      await delay(1);

      // mock a tab activation event
      getPageURL.mockResolvedValue("https://news.com/");
      browser.tabs.onActivated.dispatch();
      await delay(0);

      getPageURL.mockResolvedValue("https://example2.com/");
      browser.tabs.onActivated.dispatch();
      await delay(0);

      const [event1, event2] = attention._events;
      expect(event1.url).toBe('https://example.com/');
      expect(event1.reason).toBe('tab-updated');
      expect(event1.status).toBe('complete');

      expect(event2.url).toBe('https://news.com/');
      expect(event2.reason).toBe('tab-activated');

      expect(attention._current.url).toBe("https://example2.com/");
     })
   })

   it('tab-removed: removing a tab creates a new event', async function() {
    const callback = sinon.fake();
    const attention = new AttentionStream();
    attention.onChange(callback);

    getPageURL.mockResolvedValue("https://example1.com/");
    await updatePage('Example1.com', "https://example1.com/");

    getPageURL.mockResolvedValue("https://example2.com/")
    browser.tabs.onRemoved.dispatch();
    await delay(0);

    getPageURL.mockResolvedValue("https://example3.com/");
    await updatePage('Example1.com', "https://example3.com/");
    
    const [event1, event2] = attention._events;
    expect(event1.url).toBe('https://example1.com/');
    expect(event1.reason).toBe('tab-updated');
    expect(event1.status).toBe('complete');

    expect(event2.url).toBe('https://example2.com/');
    expect(event2.reason).toBe('tab-removed');

   })
  
  afterEach(function () {
    browser.flush();
    jest.resetModules();
  });
});