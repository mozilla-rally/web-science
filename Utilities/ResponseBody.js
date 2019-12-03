/* A library for receiving the body of responses to a request.
 * Note that:
 *  1. You need the webRequestBlocking permission
 *  2. Assuming you're calling this from the listener for onBeforeRequest, it needs to
 *      have the "blocking" option passed in its extraInfoSpec
 */

 /* Given the ID of a request and a listener to call, collect together the 
  *  pieces of the body of the response and call the listener on the whole thing. Optionally,
  *  JSON parse the reply before giving it back (defaults to off).
  */
export function registerResponseBodyListener(requestId, listener, jsonParse = false) {
    var decoder = new TextDecoder("utf-8");
    var filter = browser.webRequest.filterResponseData(requestId);
    var data = [];

    // Each time there's data, add it to our array
    filter.ondata = event => {
        // We don't want to modify the response, so immediately pass it along
        filter.write(event.data);

        var eventData = event.data;
        data.push(new Uint8Array(eventData));
    }

    // When there's no more data, stick the whole response together and give it back to the caller
    filter.onstop = event => {
        filter.disconnect();
        let combinedLength = 0;
        for (let buffer of data) {
            combinedLength += buffer.length;
        }
        let combinedArray = new Uint8Array(combinedLength);
        let writeOffset = 0;
        while (writeOffset < combinedLength) {
            let buffer = data.shift();
            combinedArray.set(buffer, writeOffset);
            writeOffset += buffer.length;
        }
        let decoded = decoder.decode(combinedArray);
        if (!jsonParse) listener(decoded);
        else listener(JSON.parse(decoded));
    }
}