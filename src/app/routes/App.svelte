<script>
  import browser from 'webextension-polyfill';
  import { onMount } from 'svelte';
    import Main from "./Main.svelte";

async function sendToCore(port, type, payload) {
  const msg = {
    type,
    data: payload
  };

  port.postMessage(msg);
}

/**
 * Wait for a message coming on a port.
 *
 * @param {runtime.Port} port
 *        The communication port to expect the message on.
 * @param {String} type
 *        The name of the message to wait for.
 * @returns {Promise} resolved with the content of the response
 *          when the message arrives.
 */
async function waitForCoreResponse(port, type) {
  return await new Promise(resolve => {
    let handler = msg => {
      if (msg.type === type) {
        port.onMessage.removeListener(handler);
        resolve(msg.data);
      }
    };
    port.onMessage.addListener(handler);
  });
};

let _stateChangeCallbacks = []
let _connectionPort;

async function _handleMessage(message) {
    switch (message.type) {
      case "receive-data": {
        // update the UI.
        console.log('data received by the frontend', message.data)
        _stateChangeCallbacks.forEach(callback => callback(message.data));
      } break;
      case "reset-finished": {
        data = [];
        break;
      }
      default:
        return Promise.reject(
          new Error(`Rally Study - unexpected message type ${message.type}`));
    }
  }

async function initialize() {
    // _stateChangeCallbacks holds all the callbacks we want to execute
    // once the background sends a message with a new state.
    _stateChangeCallbacks = [];

    // initialize the connection port.
    _connectionPort =
      browser.runtime.connect({name: "rally-study-options-page"});

    _connectionPort.onMessage.addListener(
      m => _handleMessage(m));

    // The onDisconnect event is fired if there's no receiving
    // end or in case of any other error. Log an error and clear
    // the port in that case.
    _connectionPort.onDisconnect.addListener(e => {
      console.error("Rally Study - there was an error connecting to the background script", e);
      _connectionPort = null;
    });
  }
  async function getAvailableData() {
    try {
      let response =
        waitForCoreResponse(_connectionPort, "receive-data");

      await sendToCore(_connectionPort, "get-data", {});
      return await response;
    } catch(err) {
      console.error(err);
    } 
  }

  async function resetData() {
    try {
      let response =
        waitForCoreResponse(_connectionPort, "reset-finished");

      await sendToCore(_connectionPort, "reset", {});
      return await response;
    } catch(err) {
      console.error(err);
    } 
  }

  let data = [];

  async function update() {
    data = await getAvailableData();
  }

onMount(async () => {
  // get the data.
  await initialize();
  await update();
})

    // set up event listener + send event
</script>

<svelte:window on:focus={update} />

<Main {data} on:reset-data={resetData} />
