import {SocketServer, TcpSocketWrapper} from "./tcp.js";
import {Controller} from "./controller.js";

const MODE_OFF = "off";
const MODE_ALL = "all";
const MODE_PB = "pb";

class Main {
  constructor() {
    this.mode = null;
    this.requestListener = null;

    this.state = 0;
    this.currentPort = null;

    // TODO: what if port is used?
    this.port = 10000 + Math.floor(Math.random() * 50000);
    this.controlPort = 10000 + Math.floor(Math.random() * 50000);

    browser.runtime.onConnect.addListener(port => this.portConnected(port));
  }

  async init() {
    // Let's read the mode.
    const {mode} = await browser.storage.local.get("mode");
    this.mode = mode === undefined ? MODE_OFF : mode;

    // Let's set the listener if needed.
    this.maybeResetProxyListener();

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

  async setMode(mode) {
    this.mode = mode;
    await browser.storage.local.set({mode});
    this.maybeResetProxyListener();
  }

  maybeResetProxyListener() {
    if (this.mode === MODE_OFF) {
      if (this.requestListener) {
        browser.proxy.onRequest.removeListener(this.requestListener);
        this.requestListener = null;
      }
      return;
    }

    if (!this.requestListener) {
      this.requestListener = requestInfo => {
        return this.proxyRequestCallback(requestInfo);
      };

      browser.proxy.onRequest.addListener(this.requestListener,
                                          { urls: ["<all_urls>"] });
    }
  }

  portConnected(port) {
    this.currentPort = port;

    port.onMessage.addListener(async msg => {
      this.setMode(msg.mode);
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
