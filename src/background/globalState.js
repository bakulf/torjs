const MODE_OFF = "off";
const MODE_ON = "on";
const MODE_PB = "pb";

const STATE_OOM = -1;

const GlobalState = {
  state: 0,
  mode: null,

  port: 0,
  currentPort: 0,

  async init() {
    // Let's read the mode.
    const {mode} = await browser.storage.local.get("mode");
    this.mode = mode === undefined ? MODE_OFF : mode;
  },

  generateTorPorts() {
    this.port = 10000 + Math.floor(Math.random() * 50000);
    this.controlPort = 10000 + Math.floor(Math.random() * 50000);

    // In the remote case this happens...
    if (this.port == this.controlPort) {
      this.generateTorPorts();
    }
  },

  setState(state) {
    if (state === STATE_OOM) {
      this.state = STATE_OOM;
      return;
    }

    if (this.state < state) {
      this.state = state;
    }
  },
};
