module.exports = async function getPageURL() {
    const [tab] = await browser.tabs.query({currentWindow: true, active:true});
    return tab.url;
}