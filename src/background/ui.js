import {Component} from "./component.js";
import {Logger} from "./logger.js";

const log = Logger.logger("UI");

export class UI extends Component {
  constructor(receiver) {
    log("constructor");

    super(receiver);

    this.currentPanelPort = null;
    this.currentLogPort = null;
  }

  async init() {
    log("init");
    browser.runtime.onConnect.addListener(port => this.portConnected(port));
  }

  portConnected(port) {
    log("port connected");

    if (port.name === "torLog") {
      this.currentLogPort = port;

      port.onDisconnect.addListener(_ => {
        log("TorLog port disconnected");
        this.currentLogPort = null;
      });

      this.sendMessage("torLog").then(torLog => {
        port.postMessage(torLog);
      });
      return;
    }

    if (port.name === "panel") {
      this.currentPanelPort = port;

      port.onDisconnect.addListener(_ => {
        log("Panel port disconnected");
        this.currentPanelPort = null;
      });

      port.onMessage.addListener(async msg => {
        log(`Message received: ${msg.op}`);
        switch (msg.op) {
          case "mode":
            this.sendMessage("setMode", { mode: msg.mode });
            break;

          case "restart":
            this.sendMessage("restartTor");
            break;

          default:
            console.log(`Invalid UI request: ${msg.op}`);
            break;
        }
      });

      this.portUpdate();

      this.getCurrentCircuit();
      return;
    }

    log(`Unknown port type: ${port.name}`);
  }

  portUpdate() {
    log("Port update!");
    if (this.currentPanelPort) {
      this.currentPanelPort.postMessage({
        mode: GlobalState.mode,
        state: GlobalState.state,
      });
    }
  }

  async getCurrentCircuit() {
    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (tabs.length === 0) {
      return;
    }

    const cookieStoreId = tabs[0].cookieStoreId || "default";
    log(`Circuit request for ${cookieStoreId}`);

    this.sendMessage("getCircuit", { circuit: cookieStoreId });
  }

  async circuitReady(circuit) {
    log(`Circuit ready: ${JSON.stringify(circuit)}`);

    const tabs = await browser.tabs.query({active: true, currentWindow: true});
    if (tabs.length === 0) {
      return;
    }

    const cookieStoreId = tabs[0].cookieStoreId || "default";
    if (circuit.uniqueId === cookieStoreId) {
      this.currentPanelPort.postMessage({circuit});
    }
  }

  newTorLog(what) {
    if (this.currentLogPort) {
      this.currentLogPort.postMessage({newTorLog: what});
    }
  }
}
