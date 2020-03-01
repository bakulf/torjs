let port = browser.runtime.connect({name: "panel"});

let mode = document.getElementById("mode");
mode.onchange = () => port.postMessage({mode: mode.value});

document.getElementById("torLog").onclick = () => {
  const url = browser.runtime.getURL("pages/log.html");
  browser.tabs.create({ url });
  window.close();
}

port.onMessage.addListener(msg => {
  if (msg.state) {
    document.getElementById("state").textContent = msg.state + "%";
    mode.value = msg.mode;
  }

  if (msg.circuit) {
    console.log(msg.circuit.ips);

    const ul = document.getElementById("circuit");
    while (ul.firstChild) ul.firstChild.remove();

    msg.circuit.ips.forEach(node => {
      const li = document.createElement("li");
      li.textContent = `IPv4: ${node.ip} - IPv6 ${node.ip6} - Country: ${node.country}`;
      ul.appendChild(li);
    });
  }
});
