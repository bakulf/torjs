const port = browser.runtime.connect({name: "torLog"});
const pre = document.getElementById("torLog");

port.onMessage.addListener(msg => {
  if (msg.torLog) {
    pre.textContent = msg.torLog.join("\n") + "\n";
    return;
  }

  if (msg.newTorLog) {
    pre.textContent += msg.newTorLog + "\n";
  }
});
