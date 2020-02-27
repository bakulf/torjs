export class Component {
  constructor(receiver) {
    this.receiver = receiver;
    receiver.registerObserver(this);
  }

  // To overwrite, if needed.
  init() {}

  // Returns an async response from the main
  sendMessage(type, data = null) {
    return this.receiver.handleEvent(type, data);
  }
}
