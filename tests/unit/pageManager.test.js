jest.mock("../../src/pageManager.js", () => {
    return {
        initialize: jest.fn()
    }
});
jest.mock("../../src/messaging.js", () => {
    return {
        registerListener: jest.fn(),
        unregisterListener: jest.fn()
    }
});
jest.mock("webextension-polyfill", () => require("sinon-chrome/webextensions"));

import * as AttentionReporter from "./attention-reporter";

import PageManager from "../../src/pageManager.js";
import Messaging from "../../src/messaging.js";
import browser from "webextension-polyfill";

describe("attention-reporter", function() {
    let unregisterFn;
    beforeEach(function() {
        unregisterFn = jest.fn();
        browser.contentScripts = {
            register: jest.fn(() => {
                return { unregister: unregisterFn };
            }),
        }
    })
    describe("startMeasurement", function() {
        it("initializes the PageManager module", async function(){
            const pm = PageManager;
            await AttentionReporter.startMeasurement({matchPatterns: [], privateWindows: false});
            expect(pm.initialize.mock.calls.length).toBe(1);
        })
        it("registers a new content script", async function() {
            await AttentionReporter.startMeasurement({matchPatterns: [], privateWindows: false});
            expect(browser.contentScripts.register.mock.calls.length).toBe(1);
        })
        it("registers the RS01.attentionCollection and RS01.audioCollection events", async function() {
            const m = Messaging;
            await AttentionReporter.startMeasurement({matchPatterns: [], privateWindows: false});
            const [attentionCollection, audioCollection] = m.registerListener.mock.calls.slice(-2)
            expect(attentionCollection[0]).toBe("RS01.attentionCollection");
            expect(audioCollection[0]).toBe("RS01.audioCollection");
        })
    })
    describe("stopMeasurement", function() {
        it("unregisters the RS01.attentionCollection and RS01.audioCollection events", async function() {
            const m = Messaging;
            await AttentionReporter.startMeasurement({matchPatterns: [], privateWindows: false});
            await AttentionReporter.stopMeasurement();
            expect(m.unregisterListener.mock.calls.length).toBe(2);
        })
        it("unregisters the content script", async function() {
            await AttentionReporter.startMeasurement({matchPatterns: [], privateWindows: false});
            await AttentionReporter.stopMeasurement();
            expect(unregisterFn.mock.calls.length).toBe(1);
        })
    })
    afterEach(function () {
        browser.flush();
        jest.resetModules();
      });
})
