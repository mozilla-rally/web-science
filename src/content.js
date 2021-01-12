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

const description = getDescription() || getOGDescription();
const ogType = getOGType();
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

const myPort = browser.runtime.connect({name:"attention-stream"});
myPort.postMessage({ type: "page-details", description, ogType });
// myPort.onMessage.addListener(async message => {
//     // listen here
//     if (message.type === 'page-details') {
//         const description = getDescription() || getOGDescription();
//         const ogType = getOGType();
//         const title = getTitle();
//         myPort.postMessage({ type: "page-details", description, ogType, title });
//     }
// });