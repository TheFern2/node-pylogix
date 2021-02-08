export class PLC {
  public IPAddress;
  public ProcessorSlot;
  public SocketTimeout;
  public Micro800 = false;
  public Route = null;

  constructor(IPAddress = "", slot = 0, timeout = 5.0) {
    this.IPAddress = IPAddress;
    this.ProcessorSlot = slot;
    this.SocketTimeout = timeout;
  }
}
