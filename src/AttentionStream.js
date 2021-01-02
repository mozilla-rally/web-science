// const browser = require("webextension-polyfill");

// export function matchURL(url, method) {
//     //
// }
const getPageURL = require('./get-page-url');

module.exports = class AttentionStream {
    constructor() {
        this._events = [];
        this._onChangeHandlers = [];
        this._current = { firstRun: true };
        this.initialize();
        // supported patterns are full URI, URI minus qs, domain, TLD+1?
    }

    initialize() {
        browser.tabs.onActivated.addListener(this._createGenericHandlerCase('tab-activated').bind(this))
        browser.tabs.onUpdated.addListener(this._handleUpdate.bind(this));
        browser.tabs.onRemoved.addListener(this._createGenericHandlerCase('tab-removed').bind(this));
        browser.tabs.onCreated.addListener(this._createGenericHandlerCase('tab-created').bind(this));

        browser.windows.onCreated.addListener(this._createGenericHandlerCase('window-created').bind(this));
        browser.windows.onRemoved.addListener(this._createGenericHandlerCase('window-removed').bind(this));
        browser.windows.onFocusChanged.addListener(this._createGenericHandlerCase('window-focus-changed').bind(this));
    }

    // FIXME: needs tests
    reset() {
        this._events = [];
        this._resetCurrentEvent();
        // set the firstRun event to true.
        this._current.firstRun = true;
    }

    // registers a change.
    onChange(fcn) {
        this._onChangeHandlers.push(fcn);
    }

    // FIXME: needs tests
    _finishEventAndStartNew({ reason, url }) {
        this._setEnd();
        // console.info('Site', currentlyFocusedTab);
        const evt = { ...this._current };
        if (!this._current.firstRun) {
            this._appendToHistory();
            this._submitEvent();
        }
        this._resetCurrentEvent();
        // set the start time.
        this._setStart();
        this._setURL(url);
        // add the reason the new event has been created.
        this._addReason(reason);
        return evt;
    }

    _addReason(reason) {
        this._current.reason = reason;
    }

    _submitEvent() {
        // fill in details here.
      }
      
    _setDomain(domain) {
        this._current.domain = domain;
    }
    
    _setStart() {
        this._current.start = new Date();
    }

    _setURL(url) {
        this._current.url = url;
    }
    
    _setEnd() {
        this._current.end = new Date();
        this._current.elapsed = this._current.end - this._current.start;
    }
    
    _appendToHistory() {
        this._events.push({...this._current});
    }
    
    _resetCurrentEvent() {
        this._current = { };
    }

    _handleChange(event) {
        this._onChangeHandlers.forEach(fcn => { fcn(event); } );
    }

    _urlIsNew(url) {
        // MOCK
        return url !== this._current.url;
    }

    _createGenericHandlerCase(reason) {
        // this is the case that most of these functions use.
        return async function() {
            const url = await getPageURL();
            if (this._urlIsNew(url)) {
                const finishedEvent = this._finishEventAndStartNew({ reason, url });
                if (!finishedEvent.firstRun) {
                    this._handleChange(finishedEvent);
                }
            }
        }
    }

    async _handleUpdate(_, changeInfo, everything = {}) {
        // skip this update if it is not in an active tab.
        if (everything.active === false) return;
        // reset on the loading event.
        if (changeInfo.status === 'loading' && changeInfo.url) {
            const fcn = this._createGenericHandlerCase('tab-updated').bind(this);
            await fcn('tab-updated');
        }
        if (changeInfo.status) this._current.status = changeInfo.status;
        if (changeInfo.title) this._current.title = changeInfo.title;
    }
}