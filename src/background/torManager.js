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

    this.startTor();
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
      logReadFiles: true, // TODO
      arguments: [
        "SocksPort",
        "127.0.0.1:" + GlobalState.port.toString(),
        "HashedControlPassword",
        "16:C7191F6762FF41186002DE18CA9B9B088847890EE32023BA13EF5453D7",
        "+__ControlPort", "127.0.0.1:" + GlobalState.controlPort.toString(),
        "GeoIPFile", "/geoip",
        "GeoIPv6File", "/geoip6",
      ],
      print: what => log("TOR: " + what),
    });

    this.scheduleControlChannel();
  }

  scheduleControlChannel() {
    log("Scheduling control channel");
    setTimeout(() => this.controlChannel(), 100);
  }

  async controlChannel() {
    log("Control channel");
    const controller = new Controller({
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
}
