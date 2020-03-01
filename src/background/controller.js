import {Logger} from "./logger.js";

const log = Logger.logger("Controller");

const HANDLER_COMPLETED = "completed";
const HANDLER_FAILURE = "failure";
const HANDLER_IGNORED = "ignored";
const HANDLER_CONTINUE = "continue";

export class Controller {
  constructor(password, callbacks) {
    log("constructor");

    this.password = password;
    this.bootstrapState = 0;

    this.callbacks = callbacks;

    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();

    this.circuits = [];

    this.pendingOps = [];

    // What is in charge to control the protocol flow.
    this.handler = null;
    this.nextHandlers = [];
  }

  async init(port) {
    log("init");

    this.controlSocket = await browser.experiments.TCPSocket.connect({
      host: "127.0.0.1", port,
    });

    this.controlSocket.opened.then(() => this.protocolFlow());

    this.controlSocket.closed.then(() => {
      this.controlSocket = null;
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

  async protocolFlow() {
    log("Authentication...");
    await this.addHandler(
      {
        write: "AUTHENTICATE \"" + this.password + "\"\n",
        process: line => {
          const message = this.parseProtocolLine(line);
          if (message.code == 250) {
            return HANDLER_COMPLETED;
          }

          if (message.code == 515) {
            return HANDLER_FAILURE;
          }

          return HANDLER_IGNORED;
        }
      }
    );

    log("Take ownership...");
    await this.addHandler(
      {
        write: "TAKEOWNERSHIP\n",
        process: line => {
          const message = this.parseProtocolLine(line);
          return message.code === 250 ? HANDLER_COMPLETED : HANDLER_IGNORED;
        }
      }
    );

    log("Owning control process");
    await this.addHandler(
      {
        write: "RESETCONF __OwningControllerProcess\n",
        process: line => {
          const message = this.parseProtocolLine(line);
          return message.code === 250 ? HANDLER_COMPLETED : HANDLER_IGNORED;
        }
      }
    );

    log("Events");
    await this.addHandler(
      {
        write: "SETEVENTS STATUS_CLIENT NOTICE WARN ERR STREAM\n",
        process: line => {
          const message = this.parseProtocolLine(line);
          return message.code === 250 ? HANDLER_COMPLETED : HANDLER_IGNORED;
        }
      }
    );

    log("Completed!");
  }

  async addHandler(handler) {
    if (this.handler) {
      await new Promise(resolve => this.nextHandlers.push(resolve));
    }

    this.handler = handler;
    this.write(this.handler.write);

    await new Promise(resolve => this.handler.resolve = resolve);
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

  parseProtocolLine(line) {
    const parts = line.split(" ");
    return {
      code: parseInt(parts[0]),
      type: parts[1],
      extra: parts.slice(2).join(" "),
    };
  }

  dataAvailable(data) {
    log("data received");

    const payload = this.decoder.decode(data);
    log("Payload: " + payload);

    const lines = payload.trim().split("\n");
    lines.forEach(line => {
      line = line.trim();

      if (!this.handler) {
        this.unknownLine(line);
        return;
      }

      const op = this.handler.process(line);
      switch (op) {
        case HANDLER_COMPLETED:
          this.handler.resolve();
          this.nextHandler();
          break;

        case HANDLER_FAILURE:
          this.callbacks.failure();
          break;

        case HANDLER_IGNORED:
          this.unknownLine(line);
          break;

        case HANDLER_CONTINUE:
          break;
      }
    });
  }

  nextHandler() {
    this.handler = null;
    if (this.nextHandlers.length) {
      this.nextHandlers.shift()();
    }
  }

  unknownLine(line) {
    log(`Unknown line handler: ${line}`);

    const message = this.parseProtocolLine(line);
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

  async addCircuit(circuitId) {
    log(`Add circuit ${circuitId}`);

    const CIRCUIT_PRE = "pre"; // before 250+circuit-status=...
    const CIRCUIT_IN = "in"; // collecting lines.
    const CIRCUIT_POST = "post"; // waiting for a 250.

    let state = CIRCUIT_PRE;
    const circuits = [];

    await this.addHandler(
      {
        write: "GETINFO circuit-status\n",
        process: line => {
          if (state === CIRCUIT_PRE) {
            if (line.startsWith("250+circuit-status=")) {
              state = CIRCUIT_IN;
              return HANDLER_CONTINUE;
            }

            if (line.startsWith("250-circuit-status=")) {
              circuits.push(this.parseCircuitLine(line.substring(19)));
              state = CIRCUIT_POST;
              return HANDLER_CONTINUE;
            }

            return HANDLER_IGNORED;
          }

          if (state === CIRCUIT_IN) {
            if (line === ".") {
              state = CIRCUIT_POST;
            } else {
              circuits.push(this.parseCircuitLine(line));
            }
            return HANDLER_CONTINUE;
          }

          if (state == CIRCUIT_POST) {
            const message = this.parseProtocolLine(line);
            return message.code === 250 ? HANDLER_COMPLETED : HANDLER_IGNORED;
          }
        }
      }
    );

    log("Circuit collected");

    const oldCircuits = this.circuits;
    this.circuits = [];

    circuits.forEach(circuit => {
      if (circuit.state === "BUILT") {
        const c = oldCircuits.find(c => c.id === circuit.id);
        if (c) {
          log("Known circuit found!");
          this.circuits.push(c);
        } else {
          log("new circuit");
          this.circuits.push({
            id: circuit.id,
            circuitId: circuit.circuitId,
            uniqueId: circuit.uniqueId,
            ips: [],
          });

          if (circuit.uniqueId) {
            this.processCircuit(circuit.circuitId);
          }
        }
      }
    });

    log("Circuits:");
    this.circuits.forEach(circuit => {
      log(` - ${JSON.stringify(circuit)}`);
    });
  }

  async processCircuit(circuitId) {
    log(`Processing circuit ${circuitId}`);

    const ips = [];

    const parts = circuitId.split(",");
    for (let i = 0; i < parts.length; ++i) {
      let id = parts[i];
      if (id.startsWith("$")) {
        id = id.substring(1);
      }
      if (id.includes("~")) {
        id = id.substring(0, id.indexOf("~"));
      }

      log(`Request data for node ${id}`);

      const CIRCUIT_PRE = "pre"; // before 250+circuit-status=...
      const CIRCUIT_IN = "in"; // collecting lines.
      const CIRCUIT_POST = "post"; // waiting for a 250.

      let state = CIRCUIT_PRE;
      const lines = [];

      await this.addHandler(
        {
          write: `GETINFO ns/id/${id}\n`,
          process: line => {
            if (state === CIRCUIT_PRE) {
              if (line.startsWith(`250+ns/id/${id}=`)) {
                state = CIRCUIT_IN;
                return HANDLER_CONTINUE;
              }

              return HANDLER_IGNORED;
            }

            if (state === CIRCUIT_IN) {
              if (line === ".") {
                state = CIRCUIT_POST;
              } else {
                lines.push(line);
              }
              return HANDLER_CONTINUE;
            }

            if (state == CIRCUIT_POST) {
              const message = this.parseProtocolLine(line);
              return message.code === 250 ? HANDLER_COMPLETED : HANDLER_IGNORED;
            }
          }
        });

      const data = {};

      lines.forEach(line => {
        const parts = line.trim().split(" ");
        switch (parts[0]) {
          case "r":
            data.ip = parts[6];
            break;

          case "a":
            data.ip6 = parts[1];
            break;

          default:
            // we don't care about the rest.
            break;
        }
      });

      if (!data.ip && !data.ip6) {
        log("No IP found!");
        continue;
      }

      if (data.ip) {
        log(`Requesting country name for ip ${data.ip}`);

        state = CIRCUIT_PRE;

        await this.addHandler(
          {
            write: `GETINFO ip-to-country/${data.ip}\n`,
            process: line => {
              if (state === CIRCUIT_PRE) {
                if (line.startsWith(`250-ip-to-country/${data.ip}=`)) {
                  data.country = line.split("=")[1];
                  state = CIRCUIT_POST;
                  return HANDLER_CONTINUE;
                }

                return HANDLER_IGNORED;
              }

              if (state == CIRCUIT_POST) {
                const message = this.parseProtocolLine(line);
                return message.code === 250 ? HANDLER_COMPLETED : HANDLER_IGNORED;
              }
            }
          }
        );
      }

      if (data.ip6) {
        log(`Requesting country name for ipv6 ${data.ip6}`);

        state = CIRCUIT_PRE;

        await this.addHandler(
          {
            write: `GETINFO ip-to-country/${data.ip6}\n`,
            process: line => {
              if (state === CIRCUIT_PRE) {
                if (line.startsWith(`250-ip-to-country/${data.ip6}=`)) {
                  data.country = line.split("=")[1];
                  state = CIRCUIT_POST;
                  return HANDLER_CONTINUE;
                }

                return HANDLER_IGNORED;
              }

              if (state == CIRCUIT_POST) {
                const message = this.parseProtocolLine(line);
                return message.code === 250 ? HANDLER_COMPLETED : HANDLER_IGNORED;
              }
            }
          }
        );
      }

      log(`Country for ${data.ip} or ${data.ip6} is ${data.country}`);
      ips.push(data);
    }

    const circuit = this.circuits.find(circuit => circuit.circuitId === circuitId);
    if (!circuit) {
      return;
    }

    circuit.ips = ips;

    log(`Country: ${JSON.stringify(circuit)}`);
  }

  parseCircuitLine(line) {
    log(`Parsing circuit line: ${line}`);

    const parts = line.split(" ");
    const circuit = {
      id: parts[0],
      state: parts[1],
      circuitId: parts[2],
      uniqueId: null,
    }

    const username = parts.find(p => p.startsWith("SOCKS_USERNAME="));
    if (username) {
      const p = username.split("=");
      circuit.uniqueId = p[1].substring(1, p[1].length -1);
    }

    return circuit;
  }

  async getCircuit(uniqueId) {
    log(`get circuit ${uniqueId}`);

    // We are not ready yet. Let's wait.
    if (this.bootstrapState < 100) {
      await new Promise(resolve => this.pendingOps.push(resolve));
    }

    const circuit = this.circuits.find(circuit => circuit.uniqueId === uniqueId);
    if (!circuit) {
      return null;
    }

    return circuit.ips;
  }
};
