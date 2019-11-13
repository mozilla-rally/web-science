var portToBG = browser.runtime.connect({name:"portFromNewsSites"});

portToBG.postMessage({
    type:"newsSiteCS",
    referer: document.referrer
});
/*
$( document ).ready(function() {

});
*/
