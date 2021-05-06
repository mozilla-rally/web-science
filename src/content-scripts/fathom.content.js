/**
 * Content script for the Fathom module. Uses Mozilla Fathom
 * to classify the DOM elements of a page.
 * @module webScience.fathom.content
 *
 * TODO:
 * High priority:
 * - rerun fathom on mutation observer?
 * - keep track of viewTime of classified elements using intersection observer?
 * - memoizations
 * - fallbacks?
 * - add documentation
 *
 *
 * - draw borders as an option
 * - implement results sending
 */

import {ruleset, type} from "fathom-web";

(function() {

    // Check if content script is already running
    if ("webScience" in window) {
        if ("fathom" in window.webScience) {
            return;
        }
        else {
            window.webScience.fathom = {
                trainees: new Map(),
                addTrainees: addTrainees,
            }
        }
    }
    else {
        // Else, this is the first webScience initialization
        window.webScience = {};
        window.webScience.fathom = {
            trainees: new Map(),
            addTrainees: addTrainees,
        }
    }

    /**
     * Whether the elements of this page have been classified.
     * @type {boolean}
     */
    let pageClassified = false;

    // Fathom cannot be started before trainees are added by user
    let traineesAdded = false;

    // Fathom cannot be started before pageManager is loaded
    let pageManagerLoaded = false;


    // Function to initalize fathom once conditions are fulfilled 
    function fathomInit() {

        // Sanity check
        if (!pageManagerLoaded || !traineesAdded) {
            console.log("fathomInit called before conditions are fulfilled");
            return;
        }

        console.log("Initializing fathom");
        const pageManager = window.webScience.pageManager;

        // Listen for messages from background script
        // Background script will tell us if this page should be classified
        // and what Fathom rulesets to use
        // TODO: Is it possible to miss these messages due to race conditions?
        browser.runtime.onMessage.addListener((message) => {

            // Don't do anything if isClassifiable == false
            if (message.type !== "webScience.fathom.isClassifiable" ||
                !message.isClassifiable) {
                return;
            }

            // Don't do anything if this page already ran fathom once
            if (pageClassified) {
                console.log("Page already classified, returning");
                return;
            }
            
            // Set to true before the run to avoid parallel runs
            pageClassified = true;

            console.log("Running fathom");

            // run Fathom here
            let results = runAllTrainees(message.trainees);

            // Send results to background script
            console.log("Sending fathom results");
            console.log(results);
            pageManager.sendMessage({
                type: "webScience.fathom.fathomData",
                results: results
            });
            console.log("Fathom results sent");
        });
    }

    // Handle race conditions 
    // Flags are only set to true through this function
    // When trainees are added or pageManager is loaded, set the flag to true
    // If all flags are set to true then initialize fathom
    function fathomInitWrapper(traineesAddedIn, pageManagerLoadedIn) {
        traineesAdded = traineesAddedIn;
        pageManagerLoaded = pageManagerLoadedIn;
        if (traineesAdded && pageManagerLoaded) {
            fathomInit();
        }
    }

    // Add user rulesets to the window global
    function addTrainees(trainees, runFathom = true) {
        for (const [name, rules] of trainees) {
            window.webScience.fathom.trainees.set(name, rules);
        }
        fathomInitWrapper(true, pageManagerLoaded);
    }

    // Run a specific ruleset from the window global
    function runTrainee(ruleName, results, color = "red") { 
        const trainees = window.webScience.fathom.trainees;
        const trainee = trainees.get(ruleName);
        const facts = trainee.rulesetMaker().against(document);
        facts.setCoeffsAndBiases(trainee.coeffs, [[ruleName, trainee.bias]]); // check bias code

        // Run the ruleset
        const allNodes = facts.get(type(ruleName)); 

        // For all candidate nodes, observe/borderize those with high scores
        for (const fnode of allNodes) {
            let score = fnode.scoreFor(ruleName);
            // TODO: Allow configuration of confidence threshold
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

    // Run all rulesets in the window global
    function runAllTrainees() {
        const trainees = window.webScience.fathom.trainees;
        let results = new Map();
        for (const [ruleName, rules] of trainees) {
            runTrainee(ruleName, results)
        }
        return results;
    }

    // If pageManager is loaded, set the flag as true
    if ("webScience" in window && "pageManager" in window.webScience) {
        fathomInitWrapper(traineesAdded, true);
    }

    // If pageManager is not loaded, push our main function to queue
    else {
        if (!("pageManagerHasLoaded" in window)) {
            window.pageManagerHasLoaded = [];
        }
        window.pageManagerHasLoaded.push(fathomInitWrapper(traineesAdded, true));
    }

    console.log("content script initialized");
})();

