import { Socket, isIPv4 } from "net";
import { PLC } from "./eip";
import { randrange } from "./utils/helperFunctions";
const struct = require("python-struct");

interface Route {
  path: number;
  slot: number | string;
}

class Connection {
  private parent: PLC;
  private port = 44818;
  private VendorID = 0x1337;
  private Context = 0x00;
  private ContextPointer = 0;
  private SocketConnected = false;
  private Socket = new Socket({ writable: true });

  private _registered = false;
  private _connected = false;
  private OTNetworkConnectionID = null;
  private SessionHandle = 0x0000;
  private SessionRegistered = false;
  private SerialNumber = 0;
  private OriginatorSerialNumber = 42;
  private SequenceCounter = 1;
  private ConnectionSize: number | null = null; // Default to try Large, then Small Fwd Open.

  constructor(parent: PLC) {
    this.parent = parent;
  }

  public connect(connected = true, conn_class = 3) {
    // Connect to the PLC
    return this._connect(connected, conn_class);
  }

  // public send()

  public close() {
    this._closeConnection();
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
    } catch (error) {
      this.SocketConnected = false;
      this.SequenceCounter = 1;
      return { connected: false, status: error };
    }

    // register the session
    this.Socket.write(this._buildRegisterSession());
    const ret_data = this.recv_data();

    if (ret_data) {
      this.SessionHandle = struct.unpack("<I", ret_data, 4)[0];
      this._registered = true;
    } else {
      this.SocketConnected = false;
      return { connected: false, status: "Register session failed" };
    }

    if (connected) {
      if (this.ConnectionSize !== null) {
        const ret = this._forward_open();
      } else {
        // try a larage forward open by default
        this.ConnectionSize = 4002;
        const ret = this._forward_open();

        // use ret return status value here
        if (!this.SocketConnected) {
          this.ConnectionSize = 508;
          const ret = this._forward_open();
        }
      }
    }
  }

  private _closeConnection() {}

  private recv_data() {
    /*
        When receiving data from the socket, it is possible to receive
        incomplete data.  The initial packet that comes in contains
        the length of the payload.  We can use that to keep calling
        recv() until the entire payload is received.  This only happnens
        when using LargeForwardOpen
    */

    let data = 0b0;
    let part = this.Socket.recv(4096);
    const payload_len = struct.unpack("<H", part, 2)[0];
    data += part;

    // Unsure if ArrayBuffer is the right type here
    while (data.length - 24 < payload_len) {
      part = this.Socket.recv(4096);
      data += part;
    }

    return data;
  }

  private _buildRegisterSession() {
    // Register our CIP connection
    const EIPCommand = 0x0065;
    const EIPLength = 0x0004;
    const EIPSessionHandle = this.SessionHandle;
    const EIPStatus = 0x0000;
    const EIPContext = this.Context;
    const EIPOptions = 0x0000;

    const EIPProtocolVersion = 0x01;
    const EIPOptionFlag = 0x00;

    return struct.pack(
      "<HHIIQIHH",
      EIPCommand,
      EIPLength,
      EIPSessionHandle,
      EIPStatus,
      EIPContext,
      EIPOptions,
      EIPProtocolVersion,
      EIPOptionFlag
    );
  }

  private _buildUnregisterSession() {
    const EIPCommand = 0x66;
    const EIPLength = 0x0;
    const EIPSessionHandle = this.SessionHandle;
    const EIPStatus = 0x0000;
    const EIPContext = this.Context;
    const EIPOptions = 0x0000;

    return struct.pack(
      "<HHIIQI",
      EIPCommand,
      EIPLength,
      EIPSessionHandle,
      EIPStatus,
      EIPContext,
      EIPOptions
    );
  }

  private _forward_open() {
    // ForwardOpen connection
    let ret_data;
    this.Socket.write(this._buildForwardOpenPacket());
    try {
      ret_data = this.recv_data();
    } catch (error) {
      return { connected: false, status: error };
    }
    const sts = struct.unpack("<b", ret_data, 42)[0];
    if (!sts) {
      this.OTNetworkConnectionID = struct.unpack("<I", ret_data, 44)[0];
      this._connected = true;
    } else {
      this.SocketConnected = false;
      return { connected: false, status: "Forward open failed" };
    }

    this.SocketConnected = true;
    return { connected: this.SocketConnected, status: "Success" };
  }

  private _buildForwardOpenPacket() {
    // Assemble the forward open packet
    const forwardOpen = this._buildCIPForwardOpen();
    const rrDataHeader = this._buildEIPSendRRDataHeader(len(forwardOpen));
    return rrDataHeader + forwardOpen;
  }

  private _buildCIPForwardOpen() {
    // Forward Open happens after a connection is made,
    // this will sequp the CIP connection parameters
    const CIPPathSize = 0x02;
    const CIPClassType = 0x20;

    const CIPClass = 0x06;
    const CIPInstanceType = 0x24;

    const CIPInstance = 0x01;
    const CIPPriority = 0x0a;
    const CIPTimeoutTicks = 0x0e;
    const CIPOTConnectionID = 0x20000002;
    const CIPTOConnectionID = randrange(65000);
    this.SerialNumber = randrange(65000);
    const CIPConnectionSerialNumber = this.SerialNumber;
    const CIPVendorID = this.VendorID;
    const CIPOriginatorSerialNumber = this.OriginatorSerialNumber;
    const CIPMultiplier = 0x03;
    const CIPOTRPI = 0x00201234;
    let CIPConnectionParameters = 0x4200;
    const CIPTORPI = 0x00204001;
    const CIPTransportTrigger = 0xa3;

    let CIPService;
    let pack_format;
    let connection_path;

    // decide whether to use the standard ForwardOpen
    // or the large format
    // unsure if ! is the best use
    if (this.ConnectionSize! <= 511) {
      CIPService = 0x54;
      CIPConnectionParameters += this.ConnectionSize!;
      pack_format = "<BBBBBBBBIIHHIIIHIHB";
    } else {
      CIPService = 0x5b;
      CIPConnectionParameters = CIPConnectionParameters << 16;
      CIPConnectionParameters += this.ConnectionSize!;
      pack_format = "<BBBBBBBBIIHHIIIIIIB";
    }

    const CIPOTNetworkConnectionParameters = CIPConnectionParameters;
    const CIPTONetworkConnectionParameters = CIPConnectionParameters;

    const ForwardOpen = struct.pack(
      pack_format,
      CIPService,
      CIPPathSize,
      CIPClassType,
      CIPClass,
      CIPInstanceType,
      CIPInstance,
      CIPPriority,
      CIPTimeoutTicks,
      CIPOTConnectionID,
      CIPTOConnectionID,
      CIPConnectionSerialNumber,
      CIPVendorID,
      CIPOriginatorSerialNumber,
      CIPMultiplier,
      CIPOTRPI,
      CIPOTNetworkConnectionParameters,
      CIPTORPI,
      CIPTONetworkConnectionParameters,
      CIPTransportTrigger
    );

    // add the connection path
    path_size, (path = this._connectedPath()); // need destructuring
    connection_path = struct.pack("<B", path_size);
    connection_path += path;

    return ForwardOpen + connection_path;
  }

  private _connectedPath() {
    // Build the connected path partition? of the packet
    //if a route was provided, use it, otherwise use
    // the default route
    let route: Array<Route> | null;
    if (this.parent.Route) {
      route = this.parent.Route;
    } else {
      if (this.parent.Micro800) {
        route = [];
      } else {
        route = [{ path: 0x01, slot: this.parent.ProcessorSlot }]; // FAB Added Route interface
      }
    }

    let path = [];
    if (route) {
      route.forEach((segment) => {
        if (typeof segment.slot === "number") {
          // port segment
          path += segment;
        } else {
          // port segment with link
          path.push(segment.path + 0x10);
          path.push(segment.slot.length);

          const chars = segment.slot.split("");
          chars.forEach((char) => {
            path.push(char.charCodeAt(0));
          });

          // byte align
          if (path.length % 2) {
            path.push(0x00);
          }
        }
      });
    }

    path.push([0x20, 0x02, 0x24, 0x01]);

    const path_size = path.length / 2;
    const pack_format = `<${path.length}B`;
    const connection_path = struct.pack(pack_format, path);

    return { path_size, connection_path };
  }
}
