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

async function updatePage(title, url, active=true, incognito=false) {
  const everything = { url, active, incognito};
  browser.tabs.onUpdated.dispatch(undefined, {status: "loading", url}, { ...everything, status: "loading"});
  await delay(1);
  browser.tabs.onUpdated.dispatch(undefined, {favIconUrl: url}, { ...everything, faviconURL: url, status: "loading" });
  await delay(1);
  browser.tabs.onUpdated.dispatch(undefined, {title}, { ...everything, title, url, status: "loading" });
  await delay(1);
  browser.tabs.onUpdated.dispatch(undefined, {...everything, title, url, status: "complete"});
  await delay(1);
}

 describe('Core', function () {
   let webExtensionStorage = {};

  beforeAll(function() {
    global.browser = browser;
    global.browser.storage = {};
    global.browser.storage.local = {
      async get(key) {
        if (key === null) {
          return webExtensionStorage;
        }
        const value = webExtensionStorage[key];
        return { [key]: value };
      },
      async set(obj) {
        const [key, value] = Object.entries(obj)[0];
        webExtensionStorage[key] = value;
      },
      async clear() {
        webExtensionStorage = {};
      },
    };
  });

    afterAll(function() {
      browser.flush();
      delete global.browser;
    })
  let attention;
   beforeEach(function () {
    webExtensionStorage = {};
    getPageURL.mockReset();
    attention = new AttentionStream();
   });
 
   describe('.initialize()', function () {
     it('listens for web extension tab, window, and connection events', function () {
       expect(browser.tabs.onActivated.addListener.calledOnce).toBeTruthy();
       expect(browser.tabs.onUpdated.addListener.calledOnce).toBeTruthy();
       expect(browser.tabs.onRemoved.addListener.calledOnce).toBeTruthy();
       expect(browser.runtime.onConnect.addListener.calledOnce).toBeTruthy();
     });
   });

   describe('_onPortConnected()', function () {
    it('rejects unknown sender addon', function () {
      const fakePort = {
         sender: {
          id: "unknown-addon",
         },
         disconnect: sinon.spy(),
      };
      attention._onPortConnected(fakePort);
      expect(fakePort.disconnect.calledOnce).toBeTruthy();
    });

    it('rejects unknown sender url', function () {
      // Mock the URL of the options page.
      const TEST_OPTIONS_URL = "install.sample.html";
      browser.runtime.getURL.returns(TEST_OPTIONS_URL);

      const fakePort = {
         sender: {
          id: "~~~~~~",
          url: "unknown-url.html"
         },
         disconnect: sinon.spy(),
      };

      // Provide an unknown message type and a valid origin:
      // it should fail due to the unexpected type.
      attention._onPortConnected(fakePort);
      expect(fakePort.disconnect.calledOnce).toBeTruthy();
    });
  });

   describe('.onChange()', function () {
     it('adds an onChange callback', function() {
      attention.onChange(jest.fn());
      expect(attention._onChangeHandlers.length).toBe(1);
     })
     it('calls all of the _onChangeHandlers callbacks', function() {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      attention.onChange(callback1);
      attention.onChange(callback2);
      attention._handleChange();

      expect(callback1.mock.calls.length).toBe(1);
      expect(callback2.mock.calls.length).toBe(1);
     });
     it('tab-updated: updating the active tab creates a new event', async function() {
      const callback = jest.fn();
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

      const [firstEvent, secondEvent] = await attention.storage.get();
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

     it('tab-updated: updating a non-active tab does not create a new event', async function() {
      const callback = jest.fn();
      attention.onChange(callback);

      getPageURL.mockResolvedValue("https://example.com/");
      await updatePage('Example.com', "https://example.com/");
      await delay(1);

      await updatePage('News Site', "https://news.com/", false);
      await delay(1);

      // FIXME: create an active: false case.
      getPageURL.mockResolvedValue("https://socialmedia.com/test/path?q=test");
      await updatePage('Social Media Site', "https://socialmedia.com/test/path?q=test");

      const events = await attention.storage.get();
      const [firstEvent] = events;
      expect(firstEvent.url).toBe('https://example.com/');
      expect(firstEvent.reason).toBe('tab-updated');
      expect(firstEvent.status).toBe('complete');

      expect(events.length).toBe(1);

      expect(attention._current.url).toBe("https://socialmedia.com/test/path?q=test");
      expect(attention._current.reason).toBe('tab-updated');
      expect(attention._current.status).toBe('complete');

      // FIXME: test that callback was called.
     })

     it('tab-activated: switching tabs creates new event', async function() {
      const callback = jest.fn();
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

      const [event1, event2] = await attention.storage.get();
      expect(event1.url).toBe('https://example.com/');
      expect(event1.reason).toBe('tab-updated');
      expect(event1.status).toBe('complete');

      expect(event2.url).toBe('https://news.com/');
      expect(event2.reason).toBe('tab-activated');

      expect(attention._current.url).toBe("https://example2.com/");
     })

     it('tab-removed: removing a tab creates a new event', async function() {
      const callback = jest.fn();
      const attention = new AttentionStream();
      attention.onChange(callback);
  
      getPageURL.mockResolvedValue("https://example1.com/");
      await updatePage('Example1.com', "https://example1.com/");
  
      getPageURL.mockResolvedValue("https://example2.com/")
      browser.tabs.onRemoved.dispatch();
      await delay(0);
  
      getPageURL.mockResolvedValue("https://example3.com/");
      await updatePage('Example1.com', "https://example3.com/");
      
      const [event1, event2] = await attention.storage.get();
      expect(event1.url).toBe('https://example1.com/');
      expect(event1.reason).toBe('tab-updated');
      expect(event1.status).toBe('complete');
  
      expect(event2.url).toBe('https://example2.com/');
      expect(event2.reason).toBe('tab-removed');
  
     })
   })
  
  afterEach(function () {
    browser.flush();
    jest.resetModules();
  });
});