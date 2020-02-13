import {SocketServer, TcpSocketWrapper} from "./tcp.js";

const MODE_OFF = "off";
const MODE_ALL = "all";
const MODE_PB = "pb";

class Main {
  constructor() {
    this.mode = MODE_PB;
    this.state = 0;
    this.currentPort = null;

    // TODO: what if port is used?
    this.port = 10000 + Math.floor(Math.random() * 50000);

    this.instance = Module({
      CustomSocketServer: SocketServer,
      CustomSocket: TcpSocketWrapper,
      arguments: ['SocksPort', "127.0.0.1:" + this.port.toString()],
      print: msg => this.torPrint(msg),
    });

    browser.proxy.onRequest.addListener(
      requestInfo => this.proxyRequestCallback(requestInfo),
      {urls: ["<all_urls>"]});

    browser.runtime.onConnect.addListener(port => this.portConnected(port));
  }

  proxyRequestCallback(requestInfo) {
    if (this.mode === MODE_OFF) {
      return null;
    }

    if (this.mode == MODE_PB && !requestInfo.incognito) {
      return null;
    }

    // TODO: circuit isolation
    return {
      type: "socks",
      host: "127.0.0.1",
      port: this.port,
      proxyDNS: true,
    };
  }

  torPrint(msg) {
    console.log("TOR", msg);

    if (this.state === 100 || !msg.includes("Bootstrapped")) {
      return;
    }

    this.state = parseInt(msg.match(/Bootstrapped \d+%/)[0].match(/\d+/)[0], 10);
    this.portUpdate();
  }

  portConnected(port) {
    this.currentPort = port;

    port.onMessage.addListener(msg => {
      this.mode = msg.mode;
    });

    this.portUpdate();
  }

  portUpdate() {
    if (this.currentPort) {
      this.currentPort.postMessage({
        mode: this.mode,
        state: this.state,
      });
    }
  }
}

let main = new Main();
