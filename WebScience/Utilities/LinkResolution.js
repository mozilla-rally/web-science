// Helper function to resolve short urls
// TODO : Doesn't work for twitter links yet 
// fetch("http://goo.gl/l6MS").then(function (res) { console.log(res.url)}) ==> resolves fine
// fetch("https://t.co/P4Q3cs2s0n").then(function (res) { console.log(res)}) ==> resolves to same url
// Response
////body: ReadableStream { locked: false }
//bodyUsed: false
//hasCacheInfoChannel: false
//headers: Headers { guard: "response" }
//ok: true
//redirected: false
//status: 200
//statusText: "OK"
//type: "basic"
//url: "https://t.co/P4Q3cs2s0n"

// However, curl request from command link follows correctly
/*
curl -H -L https://t.co/P4Q3cs2s0n -si
HTTP/2 301 
cache-control: private,max-age=300
content-length: 0
date: Sun, 24 Nov 2019 21:53:31 GMT
expires: Sun, 24 Nov 2019 21:58:31 GMT
****location: https://twitter.com/i/events/1198601837617672192***
server: tsa_b
set-cookie: muc=5ec7b62f-0d3c-4d3a-9a67-b5daf0491586; Max-Age=63072000; Expires=Tue, 23 Nov 2021 21:53:31 GMT; Domain=t.co
strict-transport-security: max-age=0
vary: Origin
x-connection-hash: 1240360da0612bdfc3d3117a16b1b4fd
x-response-time: 8
*/

export function resolveURL(link) {
      return fetch(link, {
        // Manual mode doesn't seem to return the URL to follow 
        // https://fetch.spec.whatwg.org/#atomic-http-redirect-handling
        // TODO  : Is there a better way to get the url
        //redirect: "manual",
      })
        .then(
          function (response) {
                if (response.ok) {
                    if (response.redirected) {
                        return response.url
                    }
                    return link;
                }
          }).catch(
              function (error) {
                  console.log(error);
              }
          );
}