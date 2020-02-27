const MODE_OFF = "off";
const MODE_ON = "on";
const MODE_PB = "pb";

const GlobalState = {
  state: 0,
  mode: null,

  port: 0,
  currentPort: 0,

  async init() {
    // Let's read the mode.
    const {mode} = await browser.storage.local.get("mode");
    this.mode = mode === undefined ? MODE_OFF : mode;

    // TODO: what if port is used?
    this.port = 10000 + Math.floor(Math.random() * 50000);
    this.controlPort = 10000 + Math.floor(Math.random() * 50000);
  }
};
