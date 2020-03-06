const { promiseDocumentLoaded, promiseObserved, } = ExtensionUtils;

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.jsm",
});

// This object collects the network events and sends them when requested.
const EventQueue = {
  queue: [],
  pendingRequests: [],

  // This is the entrypoint for new events.
  emit(obj) {
    this.queue.push(obj);
    this.maybeFlushQueue();
  },

  // Add a callback request.
  addRequest(request) {
    this.pendingRequests.push(request);
    this.maybeFlushQueue();
  },

  // If we have both callbacks and events, we connect the dots.
  maybeFlushQueue() {
    if (this.queue.length > 0 && this.pendingRequests.length > 0) {
      this.pendingRequests.shift()(this.queue);
      this.queue = [];
    }
  },
};

// We need a window to have the TCPSocket API available. This class creates a
// windowless browser.
const WindowlessBrowser = {
  windowlessBrowser: null,
  ready: null,

  init() {
    this.ready = new Promise(async resolve => {
      let windowlessBrowser = Services.appShell.createWindowlessBrowser(true);

      let chromeShell = windowlessBrowser.docShell;
      chromeShell.QueryInterface(Ci.nsIWebNavigation);

      if (PrivateBrowsingUtils.permanentPrivateBrowsing) {
        let attrs = chromeShell.getOriginAttributes();
        attrs.privateBrowsingId = 1;
        chromeShell.setOriginAttributes(attrs);
      }

      chromeShell.useGlobalHistory = false;
      chromeShell.loadURI("chrome://extensions/content/dummy.xhtml", {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });

      await promiseObserved("chrome-document-global-created", win => {
        if (win.document == chromeShell.document) {
          this.window = win;
          return true;
        }
        return false;
      });

      await promiseDocumentLoaded(windowlessBrowser.document);

      this.windowlessBrowser = windowlessBrowser;
      resolve();
    });
  },
};

// Let's create our window.
WindowlessBrowser.init();

// This object contains all the active servers.
const ServerManager = {
  servers: new Map(),
  serverId: 0,

  registerServer(server) {
    const id = ++this.serverId;
    this.servers.set(id, server);

    const serializeServer = (server, id) => {
      return { id, }
    }

    server.onconnect = e => {
      EventQueue.emit({
        op: "connect",
        server: serializeServer(server, id),
        socket: SocketManager.registerSocket(e.socket),
      });
    };

    server.onerror = e => {
      EventQueue.emit({
        op: "serverError",
        server: serializeServer(server, id),
      });

      this.servers.delete(id);
      server.close();
    }

    return serializeServer(server, id);
  },

  close(serverId) {
    const server = this.servers.get(serverId);
    if (server) {
      server.close();
      this.servers.delete(serverId);
    }
  },
};

// This object keeps track of any active TCPSocket.
const SocketManager = {
  sockets: new Map(),
  socketId: 0,

  registerSocket(socket) {
    const id = ++this.socketId;
    const socketData = {
      socket,
      waitForDrain: false,
      buffers: [],
    };

    this.sockets.set(id, socketData);

    function serializeSocket(id, socket) {
      return {
        id,
        host: socket.host,
        port: socket.port,
        ssl: socket.ssl,
        readyState: socket.readyState,
        bufferedAmount: socket.bufferedAmount
      }
    }

    socket.onopen = () => {
      EventQueue.emit({
        op: "open",
        socket: serializeSocket(id, socket),
      });
    };

    socket.onclose = () => {
      EventQueue.emit({
        op: "close",
        socket: serializeSocket(id, socket),
      });

      this.sockets.delete(id);
    };

    socket.ondata = event => {
      EventQueue.emit({
        op: "data",
        socket: serializeSocket(id, socket),
        data: event.data,
      });
    };

    socket.ondrain = () => {
      socketData.waitForDrain = false;

      // Let's write what we have.
      while (socketData.buffers.length && !socketData.waitForDrain) {
        const buffer = socketData.buffers.shift();
        this.writeInternal(socketData, buffer);
      }
    };

    socket.onerror = () => {
      EventQueue.emit({
        op: "error",
        socket: serializeSocket(id, socket),
      });

      this.sockets.delete(id);
    };

    return serializeSocket(id, socket);
  },

  write(socketId, data) {
    const socketData = SocketManager.sockets.get(socketId);
    if (!socketData) {
      console.warn(`Invalid socket Id: ${socketId}`);
      console.trace();
      return false;
    }

    // We have to wait if we are waiting for drain, or if we have pending
    // messages.
    if (socketData.waitForDrain || socketData.buffers.length) {
      socketData.buffers.push(data);
      return true;
    }

    this.writeInternal(socketData, data);
    return true;
  },

  writeInternal(socketData, data) {
    const shouldContinue = socketData.socket.send(data);
    if (!shouldContinue) {
      socketData.waitForDrain = true;
    }
  },

  close(socketId) {
    const socketData = SocketManager.sockets.get(socketId);
    if (socketData) {
      socketData.socket.close();
      this.sockets.delete(socketId);
    }
  }
}

global.TCPSocket = class extends ExtensionAPI {
  getAPI(context) {
    return {
      experiments: {
        TCPSocket: {
          listen: options =>
            WindowlessBrowser.ready.then(() =>
              new context.cloneScope.Promise((resolve, reject) => {
                try {
                  const server = WindowlessBrowser.window.navigator.mozTCPSocket.listen(options.port, {
                    binaryType: "arraybuffer"
                  });

                  resolve(ServerManager.registerServer(server));
                } catch (e) {
                  reject(e);
                }
              })),

          connect: options =>
            WindowlessBrowser.ready.then(() =>
              new context.cloneScope.Promise((resolve, reject) => {
                try {
                  const socket = new WindowlessBrowser.window.TCPSocket(options.host, options.port, {
                    useSecureTransport: options.useSecureTransport,
                    binaryType: "arraybuffer"
                  });

                  resolve(SocketManager.registerSocket(socket));
                } catch (e) {
                  reject(e);
                }
              })),

          write: options =>
            WindowlessBrowser.ready.then(() =>
              new context.cloneScope.Promise((resolve, reject) => {
                if (SocketManager.write(options.socketId, options.data)) {
                  resolve()
                  return;
                }
                reject();
              })),

          closeServer: options =>
            WindowlessBrowser.ready.then(() =>
              new context.cloneScope.Promise((resolve, reject) => {
                ServerManager.close(options.serverId);
                resolve();
              })),

          close: options =>
            WindowlessBrowser.ready.then(() =>
              new context.cloneScope.Promise((resolve, reject) => {
                SocketManager.close(options.socketId);
                resolve();
              })),

          pollEventQueue: () =>
            new context.cloneScope.Promise(resolve => {
              EventQueue.addRequest(resolve);
            }),
        }
      }
    }
  }
}
