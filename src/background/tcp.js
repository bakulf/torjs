import {Logger} from "./logger.js";

const log = Logger.logger("TCP");

// Simple object to propagate errors.
const SocketServerManager = {
  callbacks: null,

  init(callbacks) {
    this.callbacks = callbacks;
  },

  listenFailure() {
    this.callbacks.onListenFailure();
  },
};

// This is our WebSocket implementation.
class TCPSocket {
  static get CONNECTING() { return 0; }
  static get OPEN() { return 1; }
  static get CLOSING() { return 2; }
  static get CLOSED() { return 3; }

  constructor(socket, remoteAddress, remotePort) {
    log("TCPSocket contructor");

    this.socket = socket;

    // This makes the WASM module happy.
    this._socket = {
      remoteAddress,
      remotePort,
    };


    // Seems that WebSockets have these both in prototype and as 'static' properties.
    this.CONNECTING = 0;
    this.OPEN = 1;
    this.CLOSING = 2;
    this.CLOSED = 3;

    this.readyState = TCPSocket.CONNECTING;
  }

  open() {
    log("TCPSocket open");

    this.readyState = TCPSocket.OPEN;
    if (this.onopen) {
      this.onopen();
    }
  }

  close() {
    log("TCPSocket close");

    if (this.readyState === TCPSocket.CLOSED) {
      return;
    }

    this.readyState = TCPSocket.CLOSED;

    if (this.onclose) {
      this.onclose();
    }

    if (this.socket instanceof Promise) {
      log("TCPSocket postpone close call");
      return;
    }

    browser.experiments.TCPSocket.close({ socketId: this.socket.id });
  }

  dataReceived(data) {
    log("TCPSocket data received");

    if (this.onmessage) {
      this.onmessage({data});
    }
  }

  async send(data) {
    return browser.experiments.TCPSocket.write({ socketId: this.socket.id, data });
  }
};

// When TCPSocket needs to be constructed by the WASM module, we need to create
// the underlying socket asynchronously. This class has a special constructor
// for this purpose.
class TCPSocketWrapper extends TCPSocket {
  constructor(options) {
    log("TCPSocketWrapper contructor");

    let host;
    let port;

    if (typeof options === "string") {
      if (options.indexOf('ws://') === 0) {
        const sp = (options.slice(5).split('/')[0] || '').split(':');
        host = sp[0];
        port = parseInt(sp[1], 10);
      }
    } else {
      host = options.host;
      port = options.port;
    }

    if (!host || !Number.isInteger(port)) {
      throw new Error('Invalid host or port for socket');
    }

    const socket = browser.experiments.TCPSocket.connect({ host, port });
    super(socket, host, port);

    socket.then(s => this.socketReady(s));
  }

  socketReady(socket) {
    log("TCPSocketWrapper socket ready");

    if (this.readyState != TCPSocket.CLOSED) {
      this.socket = socket;
      EventManager.registerSocket(socket, this);
      return;
    }

    log("TCPSocketWrapper socket ready - closing");
    browser.experiments.TCPSocket.close({ socketId: socket.id });
  }
};

// This class reads events from the TCPSocket API calling pollEventQueue(). The
// promise is resolved when we have data.
const EventManager = {
  servers: new Map(),
  sockets: new Map(),

  registerServer(socket, server) {
    log(`Register server ${socket.id}`);
    this.servers.set(socket.id, server);
  },

  registerSocket(socket, obj) {
    log(`Register socket ${socket.id}`);
    this.sockets.set(socket.id, obj);
  },

  async pollEvents() {
    log("Polling events");
    const events = await browser.experiments.TCPSocket.pollEventQueue();

    log("Event received: " + events.length);
    events.forEach(event => this.processEvent(event));

    setTimeout(() => this.pollEvents(), 0);
  },

  processEvent(event) {
    log("Event: " + event.op);

    switch (event.op) {

      // Server events

      case "connect":
        this.serverConnectEvent(event);
        break;

      case "serverError":
        this.serverErrorEvent(event);
        break;

      // Socket events

      case "open":
        this.socketOpenEvent(event);
        break;

      case "close":
        this.socketCloseEvent(event);
        break;

      case "data":
        this.socketDataEvent(event);
        break;

      // Others

      default:
        console.error(`Invalid event op: ${event.op}`);
        break;
    }
  },

  serverConnectEvent(event) {
    log("Connection event");

    const server = this.servers.get(event.server.id);
    if (!server) {
      throw new Error("Invalid server request!");
    }

    let remoteAddress = event.socket.host;
    if (remoteAddress.indexOf('::ffff:') === 0) {
      remoteAddress = remoteAddress.slice(7);
    }

    const socket = new TCPSocket(event.socket, remoteAddress, event.socket.port);
    this.registerSocket(event.socket, socket);

    server.listeners.connection(socket);

    socket.open();
  },

  serverErrorEvent(event) {
    log("Error event: " + event.server.id);
    const server = this.servers.get(event.server.id);
    if (!server) {
      throw new Error("Invalid server request!");
    }

    this.servers.delete(event.server.id);
    SocketServerManager.listenFailure();
  },

  socketOpenEvent(event) {
    log(`Open event: ${event.socket.id}`);
    const socket = this.sockets.get(event.socket.id);
    if (!socket) {
      throw new Error("Invalid socket request");
    }

    socket.open();
  },

  socketCloseEvent(event) {
    log(`Close event: ${event.socket.id}`);
    const socket = this.sockets.get(event.socket.id);
    if (socket) {
      this.sockets.delete(event.socket.id);
      socket.close();
    }
  },

  socketDataEvent(event) {
    log(`Data event: ${event.socket.id}`);
    const socket = this.sockets.get(event.socket.id);
    if (!socket) {
      throw new Error("Invalid socket request");
    }

    socket.dataReceived(event.data);
  },
};

// Let's start!
EventManager.pollEvents();

// This is our SocketServer class.
class SocketServer {
  constructor(config) {
    log("SocketServer contructor");

    if (!config || config.host !== '127.0.0.1' || typeof config.port !== 'number') {
      throw new Error(`Wrong listening server ${(config && config.port)}`);
    }

    this.closed = false;
    this.listeners = {};

    setTimeout(() => this.startServer(config), 0);
  }

  async startServer(config) {
    log("Server starting...");

    try {
      this.server = await browser.experiments.TCPSocket.listen({ port: config.port });
    } catch (e) {
      SocketServerManager.listenFailure();
      return;
    }

    EventManager.registerServer(this.server, this);
  }

  on(name, cb) {
    this.listeners[name] = cb;
  }

  close() {
    if (this.closed) {
      return;
    }

    if (this.server) {
      browser.experiments.TCPSocket.closeServer({ serverId: this.server.id });
    }

    this.closed = true;
    delete this.server;
    delete this.listeners;
  }
}

export {
  SocketServer,
  SocketServerManager,
  TCPSocketWrapper,
}
