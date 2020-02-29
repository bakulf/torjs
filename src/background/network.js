import {Component} from "./component.js";
import {Logger} from "./logger.js";

const log = Logger.logger("Network");

export class Network extends Component {
  constructor(receiver) {
    log("constructor");

    super(receiver);

    this.requestListener = null;
  }

  async init() {
    log("init");

    // Let's set the listener if needed.
    this.maybeResetProxyListener();
  }

  proxyRequestCallback(requestInfo) {
    log(`proxy request for ${requestInfo.url} - mode: ${GlobalState.mode}`);

    if (GlobalState.mode == MODE_PB && !requestInfo.incognito) {
      return null;
    }

    // XXX: This can be improved.
    const circuitId = requestInfo.cookieStoreId || "default";

    return {
      type: "socks",
      username: circuitId,
      password: circuitId,
      host: "127.0.0.1",
      port: GlobalState.port,
      proxyDNS: true,
    };
  }

  maybeResetProxyListener() {
    log("Reset proxy listener - Current mode: " + GlobalState.mode);

    if (GlobalState.mode === MODE_OFF) {
      log("Maybe disabling");

      if (this.requestListener) {
        log("Disabling");
        browser.proxy.onRequest.removeListener(this.requestListener);
        this.requestListener = null;
      }
      return;
    }

    log("Maybe enabling");

    if (!this.requestListener) {
      log("Enabling");

      this.requestListener = requestInfo => {
        return this.proxyRequestCallback(requestInfo);
      };

      browser.proxy.onRequest.addListener(this.requestListener,
                                          { urls: ["<all_urls>"] });
    }
  }

  modeChanged() {
    log("Mode changed!");
    this.maybeResetProxyListener();
  }
}
