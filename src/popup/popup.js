let port = browser.runtime.connect({name: "panel"});

let mode = document.getElementById("mode");
mode.onchange = () => port.postMessage({mode: mode.value});

port.onMessage.addListener(msg => {
  document.getElementById("state").textContent = msg.state + "%";
  mode.value = msg.mode;
});
