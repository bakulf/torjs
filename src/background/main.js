import {SocketServer, TcpSocketWrapper} from "./tcp.js";
import {Controller} from "./controller.js";

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
    this.controlPort = 10000 + Math.floor(Math.random() * 50000);

    browser.proxy.onRequest.addListener(
      requestInfo => this.proxyRequestCallback(requestInfo),
      {urls: ["<all_urls>"]});

    browser.runtime.onConnect.addListener(port => this.portConnected(port));
  }

  async init() {
    this.instance = Module({
      CustomSocketServer: SocketServer,
      CustomSocket: TcpSocketWrapper,
      logReadFiles: true, // TODO
      arguments: [
        "SocksPort",
        "127.0.0.1:" + this.port.toString(),
        "HashedControlPassword",
        "16:C7191F6762FF41186002DE18CA9B9B088847890EE32023BA13EF5453D7",
        "+__ControlPort", "127.0.0.1:" + this.controlPort.toString(),
        "Log", "debug",
        "GeoIPFile", "/geoip",
        "GeoIPv6File", "/geoip6",
      ],
    });

    this.scheduleControlChannel();
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

  bootstrapState(state) {
    this.state = state;
    this.portUpdate();
  }

  async controlChannel() {
    const controller = new Controller({
      bootstrap: state => this.bootstrapState(state),
    });

    try {
      await controller.init(this.controlPort);
      this.controller = controller;
    } catch (e) {
      this.scheduleControlChannel();
    }
  }

  scheduleControlChannel() {
    setTimeout(() => this.controlChannel(), 500);
  }
}

let main = new Main();
main.init();
