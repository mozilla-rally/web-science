var debug = false;

export function enableDebugging() {
    debug = true;
}

export function debugLog(text) {
    console.debug(text);
}