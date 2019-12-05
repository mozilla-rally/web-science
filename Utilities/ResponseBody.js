/* A library for receiving the body of responses to a request.
 * Note that:
 *  1. You need the webRequestBlocking permission
 *  2. You have to pass in the responseHeaders so that we can detect the
 *      encoding type. The easiest way to do that is to call this from a listener
 *      for onResponseStarted.
 *     If you don't have the response headers, but are confident in the type of the encoding,
 *      pass in a null for the headers, and set the optional parameter charset to a
 *      string containing the type.
 *  3. Assuming you're calling this from the listener for onResponseStarted, it needs to
 *      have the "blocking" option passed in its extraInfoSpec
 */

/* Given the ID of a request and the response headers, detect the type of the encoding,
 *  collect together the pieces of the body of the response and resolve the promise
 *  with that data. If we fail to detect the type of the encoding, reject the promise.
 */
export function processResponseBody(requestId, responseHeaders, charset = null) {
    return new Promise((resolve, reject) => {
        /* Assuming the client gave us the response headers, parse them to find the 
         *  encoding type. If we didn't get the headers, use the value of charset
         *  that the client passed in.
         */
        if (responseHeaders != null) {
            var contentType = null;
            // Find the content-type header and pull the charset value out
            for (var header of responseHeaders) {
                if (header.name.toLowerCase() === "content-type") {
                    contentType = header.value;
                    var headerTokens = contentType.split(";");
                    for (var headerToken of headerTokens) {
                        if (headerToken.startsWith("charset=")) charset = headerToken.substring(8);
                    }
                    break;
                }
            }
        }
        try {
            var decoder = new TextDecoder(charset);
        } catch (error) {
            reject(error);
        }

        var filter = browser.webRequest.filterResponseData(requestId);
        var data = [];

        filter.onerror = () => { reject(filter.error); }

        // Each time there's data, add it to our array
        filter.ondata = event => {
            // We don't want to modify the response, so immediately pass it along
            filter.write(event.data);
            // Save data for processing later, when response has completed
            data.push(new Uint8Array(event.data));
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
            resolve(decoded);
        }
    });
}