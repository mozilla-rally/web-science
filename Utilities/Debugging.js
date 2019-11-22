var debug = false;

export function enableDebugging() {
    debug = true;
}

export function getDebuggingLog(moduleName) {
    return ((text) => {
        console.debug("WebScience." + moduleName + ": " + text);
    });
}