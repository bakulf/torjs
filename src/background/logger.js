import {Component} from "./component.js";

// This should be tuned.
const MAX_LOG_MESSAGES = 2000;

let self;

export class Logger extends Component {
  constructor(receiver) {
    super(receiver);
    this.debuggingMode = false;
    this.logMessages = [];

    this.filteredCategories = [
      //"Controller",
      //"Main",
      //"Network",
      //"TCP",
      //"TorManager",
      //"UI",
    ];

    self = this;
  }

  async init() {
    this.debuggingMode = true;
  }

  getLogs() {
    return this.logMessages;
  }

  static logger(category) {
    return (msg, ...rest) => {
      if (self) {
        self.logInternal(category, msg, rest);
      }
    }
  }

  logInternal(category, msg, rest) {
    const options = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    };
    const dateTimeFormat = new Intl.DateTimeFormat("en-US", options).format;

    const now = dateTimeFormat(Date.now());
    const r = rest.map(r => JSON.stringify(r)).join(", ");

    const m = `*** SPB *** [${now}] [${category}] - ${msg} ${r}`;

    if (this.debuggingMode && !this.filteredCategories.includes(category)) {
      console.log(m);
    }

    this.logMessages.push(m);
    while (this.logMessages.length > MAX_LOG_MESSAGES) {
      this.logMessages.shift();
    }
  }
}
