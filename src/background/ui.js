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
}
