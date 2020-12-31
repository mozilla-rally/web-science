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
        this._current = {};
        // supported patterns are full URI, URI minus qs, domain, TLD+1?
    }
    initialize() {
        browser.tabs.onActivated.addListener(this._handleActivation)
        browser.tabs.onUpdated.addListener(this._handleUpdate);
        browser.tabs.onRemoved.addListener(this._handleRemove);
    }

    // registers a change.
    onChange(fcn) {
        this._onChangeHandlers.push(fcn);
    }

    _finishEventAndStartNew(reason) {
        // DO THE HEAVY LIFTING HERE
        this._setEnd();
        // console.info('Site', currentlyFocusedTab);
        const event = { ...this._current };
        this._appendToHistory();
        this._submitEvent();
        this._resetTimer();
        // add the reason the new event has been created.
        this._addReason(reason);
        return event;
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
    
    _setEnd() {
        this._current.end = new Date();
        this._current.elapsed = this._current.end - this._current.start;
    }
    
    _appendToHistory() {
        this._events.push({...this._current});
    }
    
    _resetTimer() {
        this._current = { };
    }

    _handleChange(event) {
        this._onChangeHandlers.forEach(fcn => { fcn(event); } );
    }

    _handleActivation(event) {
        const finishedEvent = this._finishEventAndStartNew("activation");
        this._handleChange(finishedEvent);
    }

    _handleUpdate(event) {
        const finishedEvent = this._finishEventAndStartNew("update");
        this._handleChange(finishedEvent);
    }

    _handleRemove(event) {
        const finishedEvent = this._finishEventAndStartNew("remove");
        this._handleChange(finishedEvent);
    }

}