import {Component} from "./component.js";
import {Logger} from "./logger.js";

const log = Logger.logger("UI");

export class UI extends Component {
  constructor(receiver) {
    log("constructor");

    super(receiver);

    this.currentPort = null;
  }

  async init() {
    log("init");
    browser.runtime.onConnect.addListener(port => this.portConnected(port));
  }

  portConnected(port) {
    log("port connected");
    this.currentPort = port;

    port.onMessage.addListener(async msg => {
      this.sendMessage("setMode", { mode: msg.mode });
    });

    this.portUpdate();

    this.getCurrentCircuit();
  }

  portUpdate() {
    log("Port update!");
    if (this.currentPort) {
      this.currentPort.postMessage({
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
    const circuitInfo = await this.sendMessage("getCircuit", { circuit: cookieStoreId });
    this.currentPort.postMessage({circuitInfo});
  }
}
