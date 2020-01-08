(function () {
    var eles = Array.from(document.body.getElementsByTagName("div"));
    for (var ele of eles) {
        if (ele.hasAttribute("id")) {
            if (ele.getAttribute("id").startsWith("jumper")) {
                console.log("ele id", ele.getAttribute("id"));
                console.log(ele);
                console.log(ele.innerHTML);
            }
        }
    }
})();