browser.runtime.onMessage.addListener(request => {
    console.log(JSON.stringify(request));
});