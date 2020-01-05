// TODO -- all of the below generation is just for testing

// To test, add a call like WebScience.Utilities.StudyTelemetry.reportEvent(<whatever>); to some module
const studyId = "42";
var pioneerKeyPublic = null;
var studyKeyPublic = null;
var studyKeyPrivate = null; // temp
export async function initialize() {
    async function getPioneerKey() {
        //TODO, probably: crypto.subtle.importKey(...);
        // temp:
        await crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 4096,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            },
            true,
            ["encrypt", "decrypt"]
        ).then((keypair) => {
            pioneerKeyPublic = keypair.publicKey;
        });
    }

    async function getStudyKey() {
        //TODO, probably: crypto.subtle.importKey(...);
        // temp:
        await crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 4096,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            },
            true,
            ["encrypt", "decrypt"]
        ).then((keypair) => {
            studyKeyPublic = keypair.publicKey;
            studyKeyPrivate = keypair.privateKey;
        });
    }
    await getPioneerKey();
    await getStudyKey();
}

async function telemetryEncrypt(key, payload) {
    return await crypto.subtle.encrypt({ "name": "RSA-OAEP" }, key, payload);
}

// TODO
/* Takes in an object `content`, encodes and encrypts it and sends
 *  it out in a Telemetry custom ping.
 */
export async function reportEvent(content) {
    //if (!browser.telemetry.canUpload()) return;

    var encoder = new TextEncoder("utf-8");
    var decoder = new TextDecoder("utf-8");
    var encodedStudyId = encoder.encode(studyId);
    var encodedContent = encoder.encode(JSON.stringify(content));

    // TODO -- per-message nonce, getAndIncrement or something
    var report = {
        "studyId": await telemetryEncrypt(pioneerKeyPublic, encodedStudyId),
        "content": await telemetryEncrypt(studyKeyPublic, encodedContent)
    };

    //TODO: something like: TelemetryController.submitExternalPing("pioneer-study-update", report);

    // testing
    var decryptedContent = JSON.parse(decoder.decode(await crypto.subtle.decrypt({ "name": "RSA-OAEP" }, studyKeyPrivate, report.content)));
    console.log("testing decrypted", decryptedContent);
}