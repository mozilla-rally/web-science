/**
 * Content script for the VideoConsumption module.
 * 
 * # Known Issues
 *   * When sending page data during a page visit stop event, sometimes
 *     Firefox generates an error ("Promise resolved while context is inactive")
 *     because the content script execution environment is terminating while the
 *     message sending Promise remains open. This error does not affect functionality,
 *     because we do not depend on resolving the Promise (i.e., a response to the
 *     page visit stop message).
 * @module WebScience.Measurements.content-scripts.videoConsumption
 * 
 * # Note
 * 	 * The console.log represent the proper functionality (if an expected console.log does not appear, there is a bug). 
 * 	 * After the testing infrastructure is added, all the console.log statements can be removed. 
 */


/* Outer function encapsulation to maintain unique variable scope for each content script */
(function () {
    console.log("videoConsumption content script running");

    /**
     * The ID for a timer to periodically check for new videos on the page.
     * @type {number}
     */
    let timerId = 0;

    /**
     * How often (in milliseconds) to periodically check for new videos on the page.
     * @constant
     * @type {number}
     */
    const updateInterval = 5000;

    /**
     * @typedef VideoConsumption
     * @type {object}
     * @property {object} video - the video element from the DOM.
     * @property {number} playbackStart - the timestamp when the playback started, or -1 if the playback hasn't started yet.
     * @property {number} playbackDuration - the total amount of time this video has played on this page. 
     */

    /**
     * Array of objects that contain details about the consumption of a particular video. 
     * @type {VideoConsumption[]}
     */
    let videoConsumptions = [];

    /**
     * Set of video DOM elements seen. If a video DOM element has been seen, then a listener has already been attached to it. 
     * @type{Set<video>}
     */
    let videosSeen = new Set();

    /**
     * Attaches a listener to every video on the page to track playback duration per video. 
     */
    function attachVideoListeners() {
        /** Gets every video element on a page 
            Sometimes the videos have not been populated on the page by the time this code runs. */
        let videos = document.body.querySelectorAll("video");
        console.log("Number of videos found on page: " + videos.length);
        for (let i = 0; i < videos.length; i++) {
            let video = videos[i];
            /** Check if the video has been seen before, and if so, don't duplicate the listeners 
                Note that the DOM element for a video on YouTube will NOT change when going from one video page to the next,
                which is why we don't clear this set at the end of a page visit. */
            if(!videosSeen.has(video)) {
                videosSeen.add(video);
                /* Video consumption object */
                let vc = {
                    video,
                    playbackStart: -1,
                    playbackDuration: 0
                };
                videoConsumptions.push(vc);

                video.addEventListener("play", (event) =>  {
                    /** Sometimes the video element fires this event even though the previous video was already playing (for example, when you press "Skip ads" on YouTube) 
                        So only update playbackStart if we haven't already started recording playback time. */  
                    if(vc.playbackStart === -1) {
                        vc.playbackStart = Date.now();
                        console.log("Video (" + video.src + ") started (playbackStart updated)");
                    }
                    else {
                        console.log("Video (" + video.src + ") started (playbackStart not updated)");
                    }
                });

                video.addEventListener("pause", (event) =>  {
                    updatePlaybackDuration(vc);
                    console.log("Video (" + video.src + ") paused. Playback duration: " + vc.playbackDuration);
                });

                /* Listener for the user to reach the end of the video. */
                video.addEventListener("complete", (event) =>  {
                    updatePlaybackDuration(vc);
                    console.log("Video completed");
                });

                // TODO: this method name doesn't represent the fact we check for the missed play event
                /** Set the playback start to right now if we missed the play event firing.
                    This happens when the video starts playing, and then the listeners try to attach to the in progress video */
                if(vc.playbackStart === -1 && !video.paused) {
                    console.log("Video (" + video.src + ") started (missed event)");
                    vc.playbackStart = Date.now();
                }
            }             
        }
    }

    /**
     * Helper function that adds the amount of time that has elapsed since videoConsumption.playbackStart to the playbackDuration
     */
    function updatePlaybackDuration(videoConsumption) {
        videoConsumption.playbackDuration += Date.now() - videoConsumption.playbackStart;
    }

    /**
     * Helper function to update the playback duration for any videos that are still playing at the end of the page visit 
     */
    function cleanupPlayingVideos() {
        for (let i = 0; i < videoConsumptions.length; i++) {
            let vc = videoConsumptions[i];
            if(!(vc.video.paused)) {
                console.log("Stopping in progress video: " + vc.videoSrc);
                updatePlaybackDuration(vc);
            }
        }
    }

    /**
     * Helper function to aggregate the amount of time any video was playing on the page 
     * @returns {number} the total number of milliseconds of video playback during a page visit from all videos on page
     */
    function aggregatePlaybackDuration() {
        let playbackDuration = 0;
        for(var i = 0; i < videoConsumptions.length; i++) {
            playbackDuration += videoConsumptions[i].playbackDuration;
        }
        console.log("Total playback duration: " + playbackDuration);
        return playbackDuration;
    }

    /**
     * Helper function to parse the uploader channel's URL from the DOM of a YouTube page
     * @returns {(string|boolean)} either a string of the URL or false if the DOM hasn't loaded that element yet
     */
    function getChannelURL() {
        let currentHostname = (new URL(PageManager.url)).hostname;
        if(currentHostname === "www.youtube.com") { // TODO: make this a youtube match pattern
            /* Selector for the document element that provides a link to the uploader's YT channel */
            let channelURLElement = document.querySelectorAll("#upload-info.ytd-video-owner-renderer .ytd-channel-name a");

            /* If the element hasn't been populated yet, the query selector will return an empty array */
            if(channelURLElement.length > 0) {
                return channelURLElement[0].href;
            }
            else {
                console.log("Video being played is on youtube, but the channel URL couldn't be found");
                return "";
            }
        }
    }

    /**
     * Helper function that transmits message with all information from page visit 
     */
    function sendVideoDataMessage(playbackDuration, timeStamp) {
        /* Don't bother sending a message for pages where no video was played. */
        if(playbackDuration > 0) {
            let ytChannel = getChannelURL();
            /* Send message to background page with information about video consumption. */
            let videoDataMessage = {
                type: "webScience.videoConsumption.videoData",
                pageId: pageManager.pageId,
                url: pageManager.url,
                referrer: pageManager.referrer,
                pageVisitStartTime: pageManager.pageVisitStartTime,
                pageVisitStopTime: timeStamp,
                playbackDuration,
                ytChannel,
                privateWindow: browser.extension.inIncognitoContext
            };
            pageManager.sendMessage(videoDataMessage);
        }
    }

    /**
     * Helper function to reset any global variables for the script at the end of a page visit.
     */
    function cleanupVariables() {
        /* Clear the timer in order to stop checking for videos */
        if(timerId !== 0)
            clearInterval(timerId);
        timerId = 0;

        /* Clear the data we have about videos on the page */
        for (let i = 0; i < videoConsumptions.length; i++) {
            let vc = videoConsumptions[i];
            vc.playbackStart = -1;
            vc.playbackDuration = 0;
        }
    }

    let pageVisitStartListener = function ({ timeStamp }) {
        /* Look for new videos to start listening to, and start the timer ticking to do so continuously */
        attachVideoListeners();
        timerId = setInterval(attachVideoListeners, updateInterval);
    };

    let pageVisitStopListener = function({ timeStamp }) {
        cleanupPlayingVideos();

        let playbackDuration = aggregatePlaybackDuration();

        sendVideoDataMessage(playbackDuration, timeStamp);

        cleanupVariables();
    };

    let pageAttentionUpdateListener = function({ timeStamp }) {
        // console.log("[VC] page attention update");
    }

    /* Wait for PageManager load */
    let pageManagerLoaded = function () {
        pageManager.onPageVisitStart.addListener(pageVisitStartListener);
        if(pageManager.pageVisitStarted)
            pageVisitStartListener({timeStamp: pageManager.pageVisitStartTime});

        pageManager.onPageVisitStop.addListener(pageVisitStopListener);

        pageManager.onPageAttentionUpdate.addListener(pageAttentionUpdateListener);
    };

    if (("webScience" in window) && ("pageManager" in window.webScience)) {
        pageManagerLoaded();
    }
    else {
        if(!("pageManagerHasLoaded" in window)){
            window.pageManagerHasLoaded = [];
        }
        window.pageManagerHasLoaded.push(pageManagerLoaded);
    }

})();
