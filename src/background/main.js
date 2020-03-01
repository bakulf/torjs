import {Logger} from "./logger.js";
import {Network} from "./network.js";
import {TorManager} from "./torManager.js";
import {UI} from "./ui.js";

const log = Logger.logger("Main");

class Main {
  constructor() {
    log("constructor");

    // We want to avoid the processing of events during the initialization.
    // Setting handlingEvent to true, we simulate the processing of an event
    // and, because of this, any new incoming event will be stored in a queue
    // and processed only at the end of the initialization, when
    // this.processPendingEvents() is called.
    this.handlingEvent = true;
    this.pendingEvents = [];

    this.observers = new Set();

    // All the modules, at the end.
    this.logger = new Logger(this);
    this.network = new Network(this);
    this.torManager = new TorManager(this);
    this.ui = new UI(this);
  }

  async init() {
    log("init");

    // This should be the first to be initialized.
    await GlobalState.init();

    // Let's initialize the observers.
    for (let observer of this.observers) {
      await observer.init();
    }

    // Inititialization completed. Let's process any pending event received in
    // the meantime.
    this.handlingEvent = false;
    this.processPendingEvents();
  }

  registerObserver(observer) {
    this.observers.add(observer);
  }

  // Provides an async response in most cases
  async handleEvent(type, data) {
    log(`handling event ${type}`);

    // In order to avoid race conditions generated by multiple events running
    // at the same time, we process them 1 by 1. If we are already handling an
    // event, we wait until it is concluded.
    if (this.handlingEvent) {
      log(`Queuing event ${type}`);
      await new Promise(resolve => this.pendingEvents.push(resolve));
      log(`Event ${type} resumed`);
    }

    this.handlingEvent = true;

    let returnValue;
    try {
      returnValue = await this.handleEventInternal(type, data);
    } catch (e) {}

    this.handlingEvent = false;
    this.processPendingEvents();

    return returnValue;
  }

  processPendingEvents() {
    if (this.pendingEvents.length) {
      log(`Processing the first of ${this.pendingEvents.length} events`);
      this.pendingEvents.shift()();
    }
  }

  async handleEventInternal(type, data) {
    switch (type) {
      case "bootstrap":
        return this.ui.portUpdate();

      case "setMode":
        return this.setMode(data.mode);

      case "getCircuit":
        return this.torManager.getCircuit(data.circuit);

      case "circuitReady":
        return this.ui.circuitReady(data);

      case "torLog":
        return this.torManager.getTorLog();

      default:
        console.error("Invalid event: " + type);
        throw new Error("Invalid event: " + type);
    }
  }

  async setMode(mode) {
    log("changing mode to: " + mode);

    GlobalState.mode = mode;
    await browser.storage.local.set({mode});

    this.network.modeChanged();
  }
}

let main = new Main();
main.init();
