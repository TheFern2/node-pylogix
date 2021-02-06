import { Socket, isIPv4 } from "net";
import { PLC } from "./eip";

class Connection {
  private parent;
  private port = 44818;
  private VendorID = 0x1337;
  private Context = 0x00;
  private ContextPointer = 0;
  private SocketConnected = false;
  private Socket = new Socket();

  private _registered = false;
  private _connected = false;
  private OTNetworkConnectionID = null;
  private SessionHandle = 0x0000;
  private SessionRegistered = false;
  private SerialNumber = 0;
  private OriginatorSerialNumber = 42;
  private SequenceCounter = 1;
  private ConnectionSize = null; // Default to try Large, then Small Fwd Open.

  constructor(parent: PLC) {
    this.parent = parent;
  }

  public connect(connected = true, conn_class = 3) {
    // Connect to the PLC
    return this._connect(connected, conn_class);
  }

  private _connect(connected: boolean, conn_class: number) {
    // Open a connection to the PLC
    if (this.SocketConnected) {
      if (connected && !this._connected) {
        this._closeConnection();
      } else if (!connected && this._connected) {
        this._closeConnection();
      } else {
        return { connected: true, status: "Success" };
      }
    }

    try {
      this.Socket.setTimeout(this.parent.SocketTimeout);
      this.Socket.connect(this.port, this.parent.IPAddress);
    } catch (error) {}
  }

  private _closeConnection() {}
}
