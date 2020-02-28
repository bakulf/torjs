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
  constructor(callbacks) {
    log("constructor");

    this.state = CONNECTING;
    this.bootstrapState = 0;

    this.callbacks = callbacks;

    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
  }

  async init(port) {
    log("init");

    this.controlSocket = await browser.experiments.TCPSocket.connect({
      host: "127.0.0.1", port,
    });

    this.controlSocket.opened.then(() => {
      this.state = CONNECTED;
      this.write("AUTHENTICATE \"ciao\"\n");
    });

    this.controlSocket.closed.then(() => {
      this.controlSocket = null;
      this.state = CLOSED;
    });

    while (this.controlSocket) {
      await this.controlSocket.read().then(data => {
        this.dataAvailable(data);
      });
    }
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

    const payload = this.decoder.decode(data);
    const messages = this.parsePayload(payload);
    if (messages.length === 0) {
      return;
    }

    if (this.state === CONNECTED) {
      if (messages[0].code !== 250) {
        return; // TODO
      }

      this.state = AUTHENTICATED;
      this.write("TAKEOWNERSHIP\n");
      return;
    }

    if (this.state === AUTHENTICATED) {
      if (messages[0].code !== 250) {
        return; // TODO
      }

      this.state = OWNERSHIP;
      this.write("RESETCONF __OwningControllerProcess\n");
      return;
    }

    if (this.state === OWNERSHIP) {
      if (messages[0].code !== 250) {
        return; // TODO
      }

      this.state = EVENTS;
      this.write("SETEVENTS STATUS_CLIENT NOTICE WARN ERR\n");
      return;
    }

    if (this.state === EVENTS) {
      if (messages[0].code !== 250) {
        return; // TODO
      }

      this.state = READY;
      return;
    }

    if (this.state === READY) {
      messages.forEach(message => {
        if (message.code !== 650) {
          return;
        }

        if (message.type !== "STATUS_CLIENT") {
          return;
        }

        if (!message.extra.startsWith("NOTICE BOOTSTRAP PROGRESS=")) {
          return;
        }

        this.parseBootstrap(message.extra);
      });
    }
  }

  parseBootstrap(msg) {
    const parts = [];

    let part = "";
    let quote = false;

    for (let i = 0; i < msg.length; ++i) {
      const c = msg.charAt(i);
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
  }
};
