/**
 * This module is a library for receiving the body of responses to a request.
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
 * @module WebScience.Utilities.ResponseBody
 */

/**
 * Given the ID of a request and the response headers, detects the type of the encoding,
 *  collects together the pieces of the body of the response and resolves the promise
 *  with that data. If it fails to detect the type of the encoding, rejects the promise.
 * @param {string} requestId - ID of the request whose response body should be tracked
 * @param {Object[]} responseHeaders - headers on the response body, used for detecting charset. If null, optional `charset` param is used instead
 * @param {string} [charset=null] - optional, used instead of the responseHeaders if that param is null
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
                        var charsetLocation = headerToken.indexOf("charset=");
                        if (charsetLocation >= 0) charset = headerToken.substring(charsetLocation+8);
                    }
                    break;
                }
            }
        }
        try {
            // trim crud from charset
            charset = charset.replace(/"/g, "").replace(/'/g, "").trim();
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