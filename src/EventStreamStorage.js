/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 module.exports = class EventStreamStorage {
    /**
     * Gets the stored value from the local browser storage.
     *
     * @param {String} key
     *        The name of the key to retrieve data from.
     */
    constructor() {
      this._initialize();
    }
    async get() {
      try {
        const data = await browser.storage.local.get(null);
        delete data.index;
        // objects respect integer index order, so just return 
        return Object.values(data);
      } catch (err) {
        console.error(`Storage - failed to read from the local storage`, err);
        return Promise.resolve();
      }
    }

    async push(value) {
      const index = (await browser.storage.local.get("index")).index;
      await browser.storage.local.set({ [index]: value });
      const next = index + 1;
      await browser.storage.local.set({ index: next });
      return next; // return the size of the list.
    }
  
    async reset() {
      browser.storage.local.clear();
      this._initialize();
    }

    async length() {
      return (await browser.storage.local.get('index')).index;
    }

    async _initialize() {
        await browser.storage.local.set({ index: 0 });
    }
  };
  