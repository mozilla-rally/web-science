import browser from 'webextension-polyfill';

export default async function getPageURL() {
    const [tab] = await browser.tabs.query({ currentWindow: true, active:true });
    // some active windows do not have urls, eg browser multiprocess consoles
    if (!tab.url) return undefined;
    return tab.url;
}