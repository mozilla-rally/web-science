/**
 * This module is for sending data to be reported through the Telemetry system.
 * 
 * @module WebScience.Utilities.StudyTelemetry
 */
// TODO -- all of the below generation is just for testing

// To test, add a call like WebScience.Utilities.StudyTelemetry.reportEvent(<whatever>); to some module
//  and uncomment the testing lines at the bottom of reportEvent.
const studyId = "42";
var pioneerKeyPublic = null;
var studyKeyPublic = null;
var studyKeyPrivate = null; // temp

/**
 * Whether initialization (acquiring keys, etc) has occurred
 * @type {Boolean}
 * @private
 */
var initialized = false;
/**
 * Set up keys to encrypt outgoing data. Currently, just generates new keys
 * every time for testing.
 */
async function initialize() {
    if (initialized) return;
    initialized = true;
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

/**
 * Use the subtle crypto library to encrypt some data for Telemetry.
 * 
 * @param {CryptoKey} key - public key to use to encrypt
 * @param {BufferSource} payload - data to encrypt, encoded in a buffer
 * @returns {ArrayBuffer} - encrypted payload
 * @private
 */
async function telemetryEncrypt(key, payload) {
    await initialize();
    return await crypto.subtle.encrypt({ "name": "RSA-OAEP" }, key, payload);
}

/**
 * Sends an object out as an encrypted Telemetry ping.
 * 
 * @param {Object} content - an object to be sent
 */
// TODO
export async function reportEvent(content) {
    await initialize();
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
    //var decryptedContent = JSON.parse(decoder.decode(await crypto.subtle.decrypt({ "name": "RSA-OAEP" }, studyKeyPrivate, report.content)));
    //console.log("testing decrypted", decryptedContent);
}