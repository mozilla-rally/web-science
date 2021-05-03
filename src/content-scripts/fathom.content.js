/**
 * Content script for the Fathom module. Uses Mozilla Fathom
 * to classify the DOM elements of a page.
 * @module webScience.fathom.content
 *
 * TODO: 
 * - rerun fathom on mutation observer?
 * - keep track of viewTime of classified elements using intersection observer?
 * - draw borders as an option?
 * - memoizations
 */

import {ruleset, type} from "fathom-web";


function runTrainee(trainees, ruleName, color = "red", results) {
    let trainee = trainees[ruleName];
    let rulesetMaker = Function('"use strict";return (' + trainee.rulesetMaker + ')')();

    let rules = rulesetMaker().rules();
    let coeffs = trainees.get(ruleName).coeffs;
    let bias = [[rulenName, trainees.get(ruleName).bias]];
    let finalRuleset = ruleset(rules, coeffs, bias);

    // Run the ruleset
    const facts = finalRuleset.against(document);
    const allNodes = facts.get(type(ruleName)); 

    // For all candidate nodes, observe/borderize those with high scores
    for (fnode of allNodes) {
        let score = fnode.scoreFor(ruleName);
        if (score >= 0.5) {
            fnode.element.style.border = "5px solid " + color;
            console.log("*** Found " + ruleName + " node ***\n" +
                        "Confidence: " + score.toString(10));
			fnode.element.dataset.totalViewTime = 0;
			fnode.element.dataset.lastViewStarted = 0;

            results.set(fnode.element, {
                "score": score,
                "type": ruleName,
                "fnode": fnode,
                "vector": fnode._types.get(ruleName).score,
                "clicked": false,
            });
        }
    }

    console.log("Finished ruleset " + ruleName);
}

function runAllTrainees(trainees) {
    let results = new Map();
    for (const ruleName in trainees) {
        runTrainee(trainees, ruleName, results)
    }
    return results;
}


(function() {
    // Check if content script is already running
    if ("webScience" in window) {
        if ("fathomActive" in window.webScience) {
            return;
        }
        window.webScience.fathomActive = true;
    }
    else {
        // Else, this is the first webScience initialization
        window.webScience = {
            fathomActive: true
        }
    }

    /**
     * Whether the elements of this page have been classified.
     * @type {boolean}
     */
    let pageClassified = false;

    
    // Function to call once pageManager is loaded
    function pageManagerLoaded() {
        console.log("pageManager loaded, running fathom content script");
        const pageManager = window.webScience.pageManager;

        // Listen for messages from background script
        // Background script will tell us if this page should be classified
        // and what Fathom rulesets to use
        browser.runtime.onMessage.addListener((message) => {
            if (message.type !== "webScience.fathom.isClassifiable" ||
                !message.isClassifiable) {
                return;
            }

            if (pageClassified) {
                console.log("Page already classified, returning");
                return;
            }

            console.log("Running fathom");

            // Set to true before we run to avoid parallel runs
            pageClassified = true;

            // run Fathom here
            results = runAllTrainees(message.trainees);

            // Send results to background script
            console.log("Sending fathom results");
            console.log(results);
            pageManager.sendMessage({
                type: "webScience.fathom.fathomData",
                test: "hello from content script",
                results: results
            });
            console.log("Fathom results sent");
        });
    }

    // If pageManager is loaded, call our main function
    if ("webScience" in window && "pageManager" in window.webScience) {
        pageManagerLoaded();
    }
    // If pageManager is not loaded, push our main function to queue
    else {
        if (!("pageManagerHasLoaded" in window)) {
            window.pageManagerHasLoaded = [];
        }
        window.pageManagerHasLoaded.push(pageManagerLoaded());
    }

    console.log("content script initialized");
})();

