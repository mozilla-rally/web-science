browser.runtime.onMessage.addListener(request => {
    console.log(request.message);
});