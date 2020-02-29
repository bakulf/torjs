import {Component} from "./component.js";
import {Logger} from "./logger.js";

import {SocketServer, SocketServerManager, TcpSocketWrapper} from "./tcp.js";
import {Controller} from "./controller.js";

const log = Logger.logger("TorManager");

export class TorManager extends Component {
  constructor(receiver) {
    log("constructor");

    super(receiver);
  }

  async init() {
    log("init");

    SocketServerManager.init({
      onListenFailure: () => this.startTor(),
    });

    await this.preFetchTorData();

    await this.generatePassword();

    this.startTor();
  }

  async preFetchTorData() {
    const url = browser.runtime.getURL("tor/tor.data");
    log(`Resource URL: ${url}`);

    try {
      const resp = await fetch(url);
      this.torData = await resp.arrayBuffer();
    } catch (e) {
      log("Error fetching an internal resource");
    }
  }

  async generatePassword() {
    log("generating password");

    const password = [];
    const set = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (let i = 0; i <16; ++i) {
      password.push(set.charAt(Math.floor(Math.random() * set.length)));
    }

    this.password = password.join("");

    // Let's use TOR to obtain an hashed password.
    return new Promise(resolve => {
      const instance = Module({
        arguments: [
          "--hash-password",
          this.password,
        ],
        getPreloadedPackage: (file, size) => this.getPreloadedPackage(file, size),
        print: what => {
          if (what.startsWith("16:")) {
            this.hashedPassword = what.trim();
            resolve();
          }
        }
      });
    });
  }

  startTor() {
    log("start tor");

    if (this.instance) {
      delete this.instance;
    }

    GlobalState.generateTorPorts();

    this.instance = Module({
      CustomSocketServer: SocketServer,
      CustomSocket: TcpSocketWrapper,
      getPreloadedPackage: (file, size) => this.getPreloadedPackage(file, size),
      arguments: [
        "SocksPort",
        "127.0.0.1:" + GlobalState.port.toString(),
        "HashedControlPassword",
        this.hashedPassword,
        "+__ControlPort", "127.0.0.1:" + GlobalState.controlPort.toString(),
        "GeoIPFile", "/geoip",
        "GeoIPv6File", "/geoip6",
      ],
      print: what => log("TOR: " + what),
    });

    this.scheduleControlChannel();
  }

  getPreloadedPackage(file, size) {
    if (file != "tor.data") {
      throw new Error(`Unknown preloaded file ${file}`);
    }

    return this.torData;
  }

  scheduleControlChannel() {
    log("Scheduling control channel");
    setTimeout(() => this.controlChannel(), 100);
  }

  async controlChannel() {
    log("Control channel");
    const controller = new Controller(this.password, {
      bootstrap: state => this.bootstrapState(state),
      failure: () => this.scheduleControlChannel(),
    });

    try {
      await controller.init(GlobalState.controlPort);
      this.controller = controller;
    } catch (e) {
      this.scheduleControlChannel();
    }
  }

  bootstrapState(state) {
    log("bootstrap: " + state);
    GlobalState.state = state;
    this.sendMessage("bootstrap", {state});
  }

  async getCircuit(circuit) {
    if (!this.controller) {
      return null;
    }

    return this.controller.getCircuit(circuit);
  }
}
