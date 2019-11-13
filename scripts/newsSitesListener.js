function updateOldURL(hostname, oldURL, oldReferer, startTime, endTime, cumul) {
    newContentsStore.getItem(hostname).then( (obj) => {
        if (obj == null) {
            obj = {
                "path" : []
            };
        }
        obj["path"].push({
            "url" : oldURL,
            "referer" : oldReferer,
            "startTime" : startTime,
            "endTime" : endTime,
            "cumulative" : cumul
        });
        newContentsStore.setItem(hostname, obj).then(() => {
            //printNewContentsStats();
        });
    });
}

function newsSitesListener(p) {
    portFromCS = p;
    if (portFromCS.name === "portFromNewsSites") {
        var tabID = portFromCS.sender.tab.id;
        var hostname = extractHostnameUrl(portFromCS.sender.url);
        clearTabIdCumul(hostname, tabID);
        portFromCS.onMessage.addListener(function(m) {
            var timeNowStart = new Date();
            var currURL = portFromCS.sender.url;
            var currReferer = m.referer;
            portFromCS.onDisconnect.addListener((p) => {
                var timeNowEnd = new Date();
                var cumul = getAndResetCumulTime(tabID);
                updateOldURL(hostname, currURL, currReferer, timeNowStart, timeNowEnd, cumul);
                if (p.error) {
                    console.log("disconnect due to an error: ", p.error.message);
                }

            });
        });

    }
}
