function wrapSocket(socketPromise) {
  let closed = false;
  let _socket = null
  let callbacks = new Map();

  function call(what, ...args) {
    (callbacks.get(what) || (() => {}))(...args);
  }

  function onopen() {
    call('connect');
  }

  function onerror(e) {
    call('error', e);
    closed = true;
    if (_socket) {
      _socket.close();
    }
  }

  function onclose() {
    call('close');
    closed = true;
    if (_socket) {
      _socket.close();
    }
  }

  function ondata(data) {
    call('data', data);
  }

  Promise.resolve(socketPromise)
    .then(async (socket) => {
      if (closed) {
        socket.close();
      } else {
        _socket = socket;
        socket.opened.then(onopen).catch(onerror);
        socket.closed.then(onclose).catch(onerror);
        while (!closed) await socket.read().then(ondata).catch(onerror);
      }
    })
    .catch(onerror);

  return {
    on(what, cb) {
      callbacks.set(what, cb);
    },
    end() {
      closed = true;
      if (_socket) {
        _socket.close();
        _socket = null;
      }
    },
    write(data) {
      _socket.write(data);
    }
  }
}

function makeSocket(host, port) {
  return wrapSocket(browser.experiments.TCPSocket.connect({ host, port }));
}

class TcpSocket {
  static get CONNECTING() {
    return 0;
  }
  static get OPEN() {
    return 1;
  }
  static get CLOSING() {
    return 2;
  }
  static get CLOSED() {
    return 3;
  }

  constructor(socket, remoteAddress, remotePort) {
    // Seems that WebSockets have these both in prototype and as 'static' properties.
    this.CONNECTING = 0;
    this.OPEN = 1;
    this.CLOSING = 2;
    this.CLOSED = 3;

    this.socket = socket;
    this.readyState = TcpSocket.CONNECTING;
    this._socket = {
      remoteAddress,
      remotePort,
    };

    this.socket.on('data', (data) => {
      if (this.onmessage) {
        this.onmessage({ data });
      }
    });

    this.socket.on('close', () => {
      this.close();
    });

    this.socket.on('error', (e) => {
      if (this.onerror) {
        this.onerror(e);
      }
    });

    this.socket.on('connect', () => {
      this.readyState = TcpSocket.OPEN;
      if (this.onopen) {
        this.onopen();
      }
    });

    // error?
  }

  send(data) {
    this.socket.write(data);
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.readyState = TcpSocket.CLOSED; // Should be CLOSING?
    this.socket.end(); // Half-closed?
    delete this.socket;
    if (this.onclose) {
      this.onclose();
    }
  }
}

// Externally, this behaves like a WebSocket, but internally
// it does direct TCP connections.
class TcpSocketWrapper extends TcpSocket {
  constructor(url) {
    let host;
    let port;
    if (url.indexOf('ws://') === 0) {
      const sp = (url.slice(5).split('/')[0] || '').split(':');
      host = sp[0];
      port = parseInt(sp[1], 10);
    }

    if (!host || !Number.isInteger(port)) {
      throw new Error('Invalid host or port for socket');
    }
    const socket = makeSocket(host, port);
    super(socket, host, port);
  }
}

class SocketServer {
  constructor(config) {
    if (!config || config.host !== '127.0.0.1' || typeof config.port !== 'number') {
      throw new Error(`Wrong listening server ${(config && config.port)}`);
    }
    this.config = config;
    this.listeners = {};

    const onconnect = (socket) => {
      let remoteAddress = socket.host;
      if (remoteAddress.indexOf('::ffff:') === 0) {
        remoteAddress = remoteAddress.slice(7);
      }
      const _socket = new TcpSocket(wrapSocket(socket), remoteAddress, socket.port);
      _socket.readyState = TcpSocket.OPEN;
      this.listeners.connection(_socket);
    }

    const startServer = async () => {
      this.server = await browser.experiments.TCPSocket.listen({ port: config.port });
      for await (const client of this.server.connections) {
        onconnect(client)
      }
    }
    startServer();
  }

  on(name, cb) {
    this.listeners[name] = cb;
  }

  close() {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.server.close();
    delete this.server;
    delete this.listeners;
    delete this.config;
  }
}

export {
  SocketServer,
  TcpSocketWrapper,
}
