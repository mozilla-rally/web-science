// const browser = require("webextension-polyfill");

// export function matchURL(url, method) {
//     //
// }

module.exports = class AttentionStream {
    constructor() {
        this._events = [];
        this._onChangeHandlers = [];
        this._activationHandlers = [];
        this._removedHandlers = [];
        this._updateHandlers = [];
        this._current = { firstRun: true };
        this.initialize();
        // supported patterns are full URI, URI minus qs, domain, TLD+1?
    }

    initialize() {
        browser.tabs.onActivated.addListener(this._handleActivation.bind(this))
        browser.tabs.onUpdated.addListener(this._handleUpdate.bind(this));
        browser.tabs.onRemoved.addListener(this._handleRemove.bind(this));
    }

    // registers a change.
    onChange(fcn) {
        this._onChangeHandlers.push(fcn);
    }

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

    _handleActivation(_, changeInfo, everything) {
        // https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onActivated
        // handler executes when the active tab has changed.
        const url = '???';
        console.log('activation', changeInfo, everything);
        if (this._urlIsNew(url)) {
            const finishedEvent = this._finishEventAndStartNew({ reason: "activation", url: "url" });
            if (!finishedEvent.firstRun) {
                this._handleChange(finishedEvent);
            }
        }
    }

    _handleUpdate(_, changeInfo, everything) {
        console.log('update', changeInfo, everything);
        // update status flag if loading.
    
        // first meaningful event on new page load.
        if ((changeInfo.status === 'loading' && changeInfo.url)) {
            // split off new one?
            if (this._urlIsNew(changeInfo.url)) {
                const finishedEvent = this._finishEventAndStartNew({ reason: "update", url: changeInfo.url });
                if (!finishedEvent.firstRun) {
                    this._handleChange(finishedEvent);
                }
            }
        }
        // update the new object.
        if (changeInfo.status) this._current.status = changeInfo.status;
        if (changeInfo.title) this._current.title = changeInfo.title;
        if (changeInfo.url) this._current.url = changeInfo.url;
    }

    _handleRemove(_, changeInfo, everything) {
        console.log('remove', changeInfo, everything);
        const finishedEvent = this._finishEventAndStartNew({reason: "remove" });
        this._handleChange(finishedEvent);
    }

}