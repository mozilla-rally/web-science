import browser from 'webextension-polyfill';

export async function getTitle() {
    const [tab] = await browser.tabs.query({ currentWindow: true, active:true });
    return tab.title;
}