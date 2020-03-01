let port = browser.runtime.connect({name: "torLog"});

port.onMessage.addListener(msg => {
  document.getElementById("torLog").textContent = msg.torLog.join("\n");
});
