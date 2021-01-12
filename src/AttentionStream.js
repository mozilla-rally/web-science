
import browser from 'webextension-polyfill';
import getPageURL from './get-page-url';
import { getTitle } from './page-info'
import EventStreamStorage from "./EventStreamStorage";

import {
    registerPageAttentionStartListener,
    registerPageAttentionStopListener  
  } from './PageEvents';

  export default class AttentionStream {
    constructor() {
        this._connectionPort = {};
        this._onAttentionStartHandlers = [];
        this._onAttentionEndHandlers = [];
        this._current = { firstRun: true };
        this.storage = new EventStreamStorage();
        this.initialize();
    }

    initialize() {
        browser.runtime.onMessage.addListener(this._handlePageContent);

        // this will create a new event.
        registerPageAttentionStartListener(async event => {
            // create the new event.
            // send to currently active tab.
            //browser.tabs.sendMessage(event.tabId, {type: "page-details"});
            const { inboundReason } = event;
            const url = await getPageURL();
            const title = await getTitle();
            this._resetCurrentEvent();
            this._setURL(url);
            this._setStart();
            this._current.tabTitle = title;
            this._current.inboundReason = inboundReason;
            const newEvent = { ...this._current };
            this._onAttentionStartHandlers.forEach(fcn => { fcn(newEvent, this); } );
        });


        // this will emit the finished event along with
        // a timestamp.
        registerPageAttentionStopListener(event => {
            // this is where we tie things off.
            const { outboundReason } = event;
            this._setEnd();
            this._current.outboundReason = outboundReason;
            const finishedEvent = {... this._current };
            this._submitEvent();
            this._onAttentionEndHandlers.forEach(fcn => { fcn(finishedEvent); } );
        });
        browser.runtime.onConnect.addListener(
            p => this._onPortConnected(p));
    }

    _handlePageContent(message) {
        if (message.type === 'page-details') {
            this._current.description = message.description;
            this._current.ogType = message.ogType;
            this._current.headerTitle = message.title;
        }
    }

    _onPortConnected(port) {
        const sender = port.sender;
        if ((sender.id != browser.runtime.id)) {
          console.error("Rally Study - received message from unexpected sender");
          port.disconnect();
          return;
        }
    
        this._connectionPort = port;
    
        this._connectionPort.onMessage.addListener(
          m => this._handleMessage(m, sender));
        // The onDisconnect event is fired if there's no receiving
        // end or in case of any other error. Log an error and clear
        // the port in that case.
        this._connectionPort.onDisconnect.addListener(e => {
          console.error("Rally Study - there was an error connecting to the page", e);
          this._connectionPort = null;
        });
      }

    async _handleMessage(message, sender) {
        // We only expect messages coming from the embedded options page
        // at this time. We check for the sender in `_onPortConnected`.
        switch (message.type) {
            case "page-details": {
                const activeWindow = await browser.windows.getCurrent();
                // console.log(activeWindow, sender.tab);
                if (sender.tab.active && sender.tab.windowId === activeWindow.id) {
                    this._current.description = message.description;
                    this._current.ogType = message.ogType;
                }
                break;
            }
            case "get-data":
            this._sendDataToUI();
            break;
            case "reset":
            this._reset();
            break;
            default:
            return Promise.reject(
                new Error(`Rally Study - unexpected message type ${message.type}`));
        }
    }
    
      async _sendDataToUI() {
        // Send a message to the UI to update the list of studies.
        const events = await this.storage.get();
        this._connectionPort.postMessage(
          {type: "receive-data", data: events });
      }

    async _reset() {
        this._resetCurrentEvent();
        await this.storage.reset();
        this._connectionPort.postMessage(
            { type: "reset-finished" });
        // set the firstRun event to true.
        this._current.firstRun = true;
    }

    // FIXME: tests
    _finishEventAndStartNew(event) {
        this._setEnd();
        const evt = { ...this._current };
        if (!this._current.firstRun) {
            this._submitEvent();
        }
        this._resetCurrentEvent();
        return evt;
    }

    // FIXME: tests
    _addReason(reason) {
        this._current.reason = reason;
    }

    // FIXME: tests
    async _submitEvent() {
        const nextEvent = {...this._current};
        nextEvent.start = nextEvent.start.toISOString();
        nextEvent.end = nextEvent.end.toISOString();
        await this.storage.push(nextEvent);
      }
      
    // FIXME: tests
    _setDomain(domain) {
        this._current.domain = domain;
    }

    // FIXME: tests
    _setStart() {
        this._current.start = new Date();
    }

    // FIXME: tests
    _setURL(url) {
        this._current.url = url;
    }

    // FIXME: tests
    _setEnd() {
        this._current.end = new Date();
        this._current.elapsedMS = this._current.end - this._current.start;
    }

    // FIXME: tests
    _resetCurrentEvent() {
        this._current = { };
    }

    // FIXME: tests
    _urlIsNew(url) {
        // MOCK
        return url !== this._current.url;
    }

    onAttentionStart(fcn) {
        this._onAttentionStartHandlers.push(fcn);
    }

    onAttentionEnd(fcn) {
        this._onAttentionEndHandlers.push(fcn);
    }

}