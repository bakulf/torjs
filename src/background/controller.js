import {Logger} from "./logger.js";

const log = Logger.logger("Controller");

const CONNECTING = 0;
const CONNECTED = 1;
const AUTHENTICATED = 2;
const OWNERSHIP = 3;
const EVENTS = 4;
const READY = 5;
const CLOSED = 99;

export class Controller {
  constructor(password, callbacks) {
    log("constructor");

    this.password = password;
    this.state = CONNECTING;
    this.bootstrapState = 0;

    this.callbacks = callbacks;

    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();

    this.circuits = [];

    this.pendingOps = [];
  }

  async init(port) {
    log("init");

    this.controlSocket = await browser.experiments.TCPSocket.connect({
      host: "127.0.0.1", port,
    });

    this.controlSocket.opened.then(() => {
      this.state = CONNECTED;
      this.write("AUTHENTICATE \"" + this.password + "\"\n");
    });

    this.controlSocket.closed.then(() => {
      this.controlSocket = null;
      this.state = CLOSED;
    });

    // Async read.
    setTimeout(async () => {
      while (this.controlSocket) {
        await this.controlSocket.read().then(data => {
          this.dataAvailable(data);
        });
      }
    }, 0);
  }

  async write(str) {
    log("write: " + str);

    const buffer = this.encoder.encode(str).buffer;
    try {
      await this.controlSocket.write(buffer);
    } catch(e) {
      this.callbacks.failure();
    }
  }

  parsePayload(payload) {
    const lines = payload.trim().split("\n");
    return lines.map(line => {
      const parts = line.trim().split(" ");
      return {
        code: parseInt(parts[0]),
        type: parts[1],
        extra: parts.slice(2).join(" "),
      };
    });
  }

  dataAvailable(data) {
    log("data received");

    if (!this.dataAvailableInternal(data)) {
      this.callbacks.failure();
    }
  }

  dataAvailableInternal(data) {
    const payload = this.decoder.decode(data);
    log("Payload: " + payload);

    const messages = this.parsePayload(payload);
    if (messages.length === 0) {
      return true;
    }

    if (this.state === CONNECTED) {
      if (messages[0].code !== 250) {
        return false;
      }

      this.state = AUTHENTICATED;
      this.write("TAKEOWNERSHIP\n");
      return true;
    }

    if (this.state === AUTHENTICATED) {
      if (messages[0].code !== 250) {
        return false;
      }

      this.state = OWNERSHIP;
      this.write("RESETCONF __OwningControllerProcess\n");
      return true;
    }

    if (this.state === OWNERSHIP) {
      if (messages[0].code !== 250) {
        return false;
      }

      this.state = EVENTS;
      this.write("SETEVENTS STATUS_CLIENT NOTICE WARN ERR STREAM\n");
      return true;
    }

    if (this.state === EVENTS) {
      if (messages[0].code !== 250) {
        return false;
      }

      this.state = READY;
      return true;
    }

    if (this.state === READY) {
      messages.forEach(message => {
        if (message.code !== 650) {
          return;
        }

        if (message.type === "STREAM") {
          this.processStream(message);
          return;
        }

        if (message.type === "STATUS_CLIENT") {
          this.processStatusClient(message);
          return;
        }
      });
    }

    return true;
  }

  processStatusClient(message) {
    if (!message.extra.startsWith("NOTICE BOOTSTRAP PROGRESS=")) {
      return;
    }

    const parts = [];

    let part = "";
    let quote = false;

    for (let i = 0; i < message.extra.length; ++i) {
      const c = message.extra.charAt(i);
      if (c == ' ' && !quote) {
        parts.push(part);
        part = "";
        continue;
      }

      if (c == '"') {
        quote = !quote;
      }

      part += c;
    }

    if (part.length > 0) {
      parts.push(part);
    }

    const progress = parseInt(parts.find(p => p.startsWith("PROGRESS=")).split("=")[1]);
    if (!progress) {
      return;
    }

    this.bootstrapState = progress;
    this.callbacks.bootstrap(progress);

    // Process the pending ops.
    if (this.bootstrapState === 100) {
      this.pendingOps.forEach(r => r());
      this.pendingOps = [];
    }
  }

  processStream(message) {
    const parts = message.extra.split(" ");
    const streamId = parts[0]
    const status = parts[1];
    const circuitId = parts[2];
    const target = parts[3];

    log(`Stream: id(${streamId}) - status(${status}) - circuitId(${circuitId}) - target(${target})`);

    if (status === "SENTCONNECT" &&
        !this.circuits.find(circuit => circuit.id === circuitId)) {
      this.addCircuit(circuitId);
    }
  }

  addCircuit(circuitId) {
    log(`New circuit: ${circuitId}`);

    this.circuits.push({
      id: circuitId,
    });

    this.write("GETINFO circuit-status");
    // TODO: parse the multi-line circuit message
  }

  async getCircuit(circuit) {
    log(`get circuit ${circuit}`);

    // We are not ready yet. Let's wait.
    if (this.bootstrapState < 100) {
      await new Promise(resolve => this.pendingOps.push(resolve));
    }

    // TODO
    return 42;
  }
};
