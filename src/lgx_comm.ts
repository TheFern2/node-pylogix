import { Socket } from "net";

class Connection {
  //const parent
  private port = 44818;
  private VendorID = 0x1337;
  private Context = 0x00;
  private ContextPointer = 0;
  private SocketConnected = false;
  private Socket = Socket; // ?

  private _registered = false;
  private _connected = false;
  private OTNetworkConnectionID = null;
  private SessionHandle = 0x0000;
  private SessionRegistered = false;
  private SerialNumber = 0;
  private OriginatorSerialNumber = 42;
  private SequenceCounter = 1;
  private ConnectionSize = null; // Default to try Large, then Small Fwd Open.
}
