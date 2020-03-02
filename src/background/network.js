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

    let captivePortalUrl;
    if (browser.captivePortal.canonicalURL) {
      captivePortalUrl = (await browser.captivePortal.canonicalURL.get({})).value;

      const url = new URL(captivePortalUrl);
      this.captivePortalOrigin = url.origin;
    }

    this.proxyPassthrough = new Set();
    await this.checkProxyPassthrough();

    // Let's set the listener if needed.
    this.maybeResetProxyListener();
  }

  async checkProxyPassthrough() {
    log("Check proxy passthrough");

    const proxySettings = await browser.proxy.settings.get({});

    // eslint-disable-next-line verify-await/check
    this.proxyPassthrough.clear();
    // eslint-disable-next-line verify-await/check
    proxySettings.value.passthrough.split(",").forEach(host => {
      // eslint-disable-next-line verify-await/check
      this.proxyPassthrough.add(host.trim());
    });
  }

  proxyRequestCallback(requestInfo) {
    const shouldProxyRequest = this.shouldProxyRequest(requestInfo);
    log(`proxy request for ${requestInfo.url} - mode: ${GlobalState.mode} => ${shouldProxyRequest}`);
    if (!shouldProxyRequest) {
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

  shouldProxyRequest(requestInfo) {
    function isProtocolSupported(url) {
      return url.protocol === "http:" ||
             url.protocol === "https:" ||
             url.protocol === "ftp:" ||
             url.protocol === "wss:" ||
             url.protocol === "ws:";
    }

    function isLocal(url) {
      let hostname = url.hostname;
      return (/^(.+\.)?localhost$/.test(hostname) ||
        /^(.+\.)?localhost6$/.test(hostname) ||
        /^(.+\.)?localhost.localdomain$/.test(hostname) ||
        /^(.+\.)?localhost6.localdomain6$/.test(hostname) ||
        // https://tools.ietf.org/html/rfc2606
        /\.example$/.test(hostname) ||
        /\.invalid$/.test(hostname) ||
        /\.test$/.test(hostname) ||
        // https://tools.ietf.org/html/rfc8375
        /^(.+\.)?home\.arpa$/.test(hostname) ||
        // https://tools.ietf.org/html/rfc6762
        /\.local$/.test(hostname) ||
        // Loopback
        /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        // Link Local
        /^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        // Private use
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        // Private use
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        // Private use
        /^172\.1[6-9]\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^172\.2[0-9]\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^172\.3[0-1]\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /\[[0:]+1\]/.test(hostname));
    }

    if (GlobalState.mode == MODE_PB && !requestInfo.incognito) {
      return null;
    }

    // Just to avoid recreating the URL several times, let's cache it.
    const url = new URL(requestInfo.url);

    // Let's skip captive portal URLs.
    if (this.captivePortalOrigin && this.captivePortalOrigin === url.origin) {
      return false;
    }

    // Only http/https/ftp requests
    if (!isProtocolSupported(url)) {
      return false;
    }

    // If the request is local, ignore
    if (isLocal(url)) {
      return false;
    }

    // Whitelisted.
    // eslint-disable-next-line verify-await/check
    if (this.proxyPassthrough.has(url.hostname)) {
      return false;
    }

    return true;
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
