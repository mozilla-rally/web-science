window.browser = require("webextension-polyfill");
const AttentionStream = require('./AttentionStream');
const attention = new AttentionStream();
attention.onChange(console.log);

browser.tabs.create({ url: "https://news.ycombinator.com", active: true});