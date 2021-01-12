import browser from 'webextension-polyfill';

function getContent(str) {
    const e = document.querySelector(str);
    return e === null ? undefined : e.content;
}

function getDescription() {
    return getContent('meta[name="description"]');
}

function getOGDescription() {
    return getContent('meta[property="og:description"]');
}

function getOGType() {
    return getContent('meta[property="og:type"]');
}

function getTitle() {
    return getContent('title');
}

// const description = getDescription() || getOGDescription();
// const ogType = getOGType();
//browser.runtime.sendMessage({ type: "page-details", description, ogType, title });

// browser.runtime.onMessage.addListener(async message => {
//         // listen here
//         if (message.type === 'page-details') {
//             const description = getDescription() || getOGDescription();
//             const ogType = getOGType();
//             const title = getTitle();
//             browser.runtime.sendMessage({ type: "page-details", description, ogType, title });
//             //myPort.postMessage({ type: "page-details", description, ogType, title });
//         }
//     });

// const description = getDescription() || getOGDescription();
// const ogType = getOGType();

// const myPort = browser.runtime.connect({name:"attention-stream"});
// myPort.postMessage({ type: "page-details", description, ogType });

// function grabAndSend(response) {
//     const description = getDescription() || getOGDescription();
//     const ogType = getOGType();
//     console.log('sending response from content script');
//     response({ type: "page-details", description, ogType });
// }

function pageDetails() {
    const description = getDescription() || getOGDescription();
    const ogType = getOGType();
    return { type: "page-details", description, ogType };
}

browser.runtime.onConnect.addListener((port) => {
    port.postMessage(pageDetails());
});

// send message on first connect?
browser.runtime.sendMessage(pageDetails());
// needs to send update message.

// // listen for future messages
// myPort.onMessage.addListener(async (message, sender, response) => {
//     console.log('message received by content script', message)
//     if (message.type === 'page-details') {
//         grabAndSend(response);
//     }
// });

// send future grab and send messages
// browser.runtime.onMessage.addListener((message, sender, response) => {
//     grabAndSend(response);
// });

// browser.runtime.onMessage.addListener(async message => {
//         // listen here
//         if (message.type === 'page-details') {
//             grabAndSend();
//         }
//     });