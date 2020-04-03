let db;
onmessage = event => {
    let data = event.data;
    switch(data) {
        case "run":
            sendMessageToCaller("status", "started");
            setTimeout(function () {
                let req = indexedDB.open("analytics", 1);
                req.onsuccess = function (event) {
                    db = event.target.result;
                    sendMessageToCaller("result", "db opened measurements");
                };
            }, 5000)
            break;
    }
  }

  function sendMessageToCaller(messageType, data) {
      postMessage({
          type: messageType,
          data: data
      });
  }
  
  onerror = event => {
    console.error(event.message)
  }