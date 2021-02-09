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
    //let part = this.Socket.recv(4096);
    let part = this.Socket.read(4096);
    const payload_len = struct.unpack("<H", part, 2)[0];
    data += part;

    while (data.length - 24 < payload_len) {
      part = this.Socket.read(4096);
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
    const { path_size, path } = this._connectedPath(); // need destructuring
    connection_path = struct.pack("<B", path_size);
    connection_path += path;

    return ForwardOpen + connection_path;
  }

  private _buildCIPUnconnectedSend() {
    // build unconnected send to request tag database
    const CIPService = 0x52;
    const CIPPathSize = 0x02;
    const CIPClassType = 0x2;
    const CIPClass = 0x06;
    const CIPInstanceType = 0x2;
    const CIPInstance = 0x01;
    const CIPPriority = 0x0a;
    const CIPTimeoutTicks = 0x0e;
    const ServiceSize = 0x06;

    return struct.pack(
      "<BBBBBBBBH",
      CIPService,
      CIPPathSize,
      CIPClassType,
      CIPClass,
      CIPInstanceType,
      CIPInstance,
      CIPPriority,
      CIPTimeoutTicks,
      ServiceSize
    );
  }

  private _buildEIPHeader(ioi) {
    /*
     The EIP Header contains the tagIOI and the
     commands to perform the read or write.  This request
     will be followed by the reply containing the data
    */
    if (this.ContextPointer == 155) {
      this.ContextPointer = 0;
    }

    const EIPPayloadLength = 22 + len(ioi);
    const EIPConnectedDataLength = len(ioi) + 2;

    const EIPCommand = 0x70;
    const EIPLength = 22 + len(ioi);
    const EIPSessionHandle = this.SessionHandle;
    const EIPStatus = 0x00;
    const EIPContext = context_dict[this.ContextPointer];
    this.ContextPointer += 1;

    const EIPOptions = 0x0000;
    const EIPInterfaceHandle = 0x00;
    const EIPTimeout = 0x00;
    const EIPItemCount = 0x02;
    const EIPItem1ID = 0xa1;
    const EIPItem1Length = 0x04;
    const EIPItem1 = this.OTNetworkConnectionID;
    const EIPItem2ID = 0xb1;
    const EIPItem2Length = EIPConnectedDataLength;
    const EIPSequence = this.SequenceCounter;
    this.SequenceCounter += 1;
    this.SequenceCounter = this.SequenceCounter % 0x10000;

    const EIPHeaderFrame = struct.pack(
      "<HHIIQIIHHHHIHHH",
      EIPCommand,
      EIPLength,
      EIPSessionHandle,
      EIPStatus,
      EIPContext,
      EIPOptions,
      EIPInterfaceHandle,
      EIPTimeout,
      EIPItemCount,
      EIPItem1ID,
      EIPItem1Length,
      EIPItem1,
      EIPItem2ID,
      EIPItem2Length,
      EIPSequence
    );

    return EIPHeaderFrame + ioi;
  }

  private _buildEIPSendRRDataHeader(frameLen) {
    // Build the EIP Send RR Data Header
    const EIPCommand = 0x6f;
    const EIPLength = 16 + frameLen;
    const EIPSessionHandle = this.SessionHandle;
    const EIPStatus = 0x00;
    const EIPContext = this.Context;
    const EIPOptions = 0x00;
    const EIPInterfaceHandle = 0x00;
    const EIPTimeout = 0x00;
    const EIPItemCount = 0x02;
    const EIPItem1Type = 0x00;
    const EIPItem1Length = 0x00;
    const EIPItem2Type = 0xb2;
    const EIPItem2Length = frameLen;

    return struct.pack(
      "<HHIIQIIHHHHHH",
      EIPCommand,
      EIPLength,
      EIPSessionHandle,
      EIPStatus,
      EIPContext,
      EIPOptions,
      EIPInterfaceHandle,
      EIPTimeout,
      EIPItemCount,
      EIPItem1Type,
      EIPItem1Length,
      EIPItem2Type,
      EIPItem2Length
    );
  }

  private _buildForwardClose() {
    // Forward Close packet for closing the connection
    const CIPService = 0x4e;
    const CIPPathSize = 0x02;
    const CIPClassType = 0x20;
    const CIPClass = 0x06;
    const CIPInstanceType = 0x24;

    const CIPInstance = 0x01;
    const CIPPriority = 0x0a;
    const CIPTimeoutTicks = 0x0e;
    const CIPConnectionSerialNumber = this.SerialNumber;
    const CIPVendorID = this.VendorID;
    const CIPOriginatorSerialNumber = this.OriginatorSerialNumber;

    let connection_path;

    const ForwardClose = struct.pack(
      "<BBBBBBBBHHI",
      CIPService,
      CIPPathSize,
      CIPClassType,
      CIPClass,
      CIPInstanceType,
      CIPInstance,
      CIPPriority,
      CIPTimeoutTicks,
      CIPConnectionSerialNumber,
      CIPVendorID,
      CIPOriginatorSerialNumber
    );

    // add the connection path
    const { path_size, path } = this._connectedPath();
    connection_path = struct.pack("<BB", path_size, 0x00);
    connection_path += path;
    return ForwardClose + connection_path;
  }

  private _buildForwardClosePacket() {
    // Forward Close packet for closing the connection

    const CIPService = 0x4e;
    const CIPPathSize = 0x02;
    const CIPClassType = 0x20;
    const CIPClass = 0x06;
    const CIPInstanceType = 0x24;

    const CIPInstance = 0x01;
    const CIPPriority = 0x0a;
    const CIPTimeoutTicks = 0x0e;
    const CIPConnectionSerialNumber = this.SerialNumber;
    const CIPVendorID = this.VendorID;
    const CIPOriginatorSerialNumber = this.OriginatorSerialNumber;

    let connection_path;

    const ForwardClose = struct.pack(
      "<BBBBBBBBHHI",
      CIPService,
      CIPPathSize,
      CIPClassType,
      CIPClass,
      CIPInstanceType,
      CIPInstance,
      CIPPriority,
      CIPTimeoutTicks,
      CIPConnectionSerialNumber,
      CIPVendorID,
      CIPOriginatorSerialNumber
    );

    // add the connection path
    const { path_size, path } = this._connectedPath();
    connection_path = struct.pack("<BB", path_size, 0x00);
    connection_path += path;
    return ForwardClose + connection_path;
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
          path.push(segment);
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

    return { path_size, path: connection_path };
  }
}

const context_dict = {
  0: 0x6572276557,
  1: 0x6f6e,
  2: 0x676e61727473,
  3: 0x737265,
  4: 0x6f74,
  5: 0x65766f6c,
  6: 0x756f59,
  7: 0x776f6e6b,
  8: 0x656874,
  9: 0x73656c7572,
  10: 0x646e61,
  11: 0x6f73,
  12: 0x6f64,
  13: 0x49,
  14: 0x41,
  15: 0x6c6c7566,
  16: 0x74696d6d6f63,
  17: 0x7327746e656d,
  18: 0x74616877,
  19: 0x6d2749,
  20: 0x6b6e696874,
  21: 0x676e69,
  22: 0x666f,
  23: 0x756f59,
  24: 0x746e646c756f77,
  25: 0x746567,
  26: 0x73696874,
  27: 0x6d6f7266,
  28: 0x796e61,
  29: 0x726568746f,
  30: 0x797567,
  31: 0x49,
  32: 0x7473756a,
  33: 0x616e6e6177,
  34: 0x6c6c6574,
  35: 0x756f79,
  36: 0x776f68,
  37: 0x6d2749,
  38: 0x676e696c656566,
  39: 0x6174746f47,
  40: 0x656b616d,
  41: 0x756f79,
  42: 0x7265646e75,
  43: 0x646e617473,
  44: 0x726576654e,
  45: 0x616e6e6f67,
  46: 0x65766967,
  47: 0x756f79,
  48: 0x7075,
  49: 0x726576654e,
  50: 0x616e6e6f67,
  51: 0x74656c,
  52: 0x756f79,
  53: 0x6e776f64,
  54: 0x726576654e,
  55: 0x616e6e6f67,
  56: 0x6e7572,
  57: 0x646e756f7261,
  58: 0x646e61,
  59: 0x747265736564,
  60: 0x756f79,
  61: 0x726576654e,
  62: 0x616e6e6f67,
  63: 0x656b616d,
  64: 0x756f79,
  65: 0x797263,
  66: 0x726576654e,
  67: 0x616e6e6f67,
  68: 0x796173,
  69: 0x657962646f6f67,
  70: 0x726576654e,
  71: 0x616e6e6f67,
  72: 0x6c6c6574,
  73: 0x61,
  74: 0x65696c,
  75: 0x646e61,
  76: 0x74727568,
  77: 0x756f79,
  78: 0x6576276557,
  79: 0x6e776f6e6b,
  80: 0x68636165,
  81: 0x726568746f,
  82: 0x726f66,
  83: 0x6f73,
  84: 0x676e6f6c,
  85: 0x72756f59,
  86: 0x73277472616568,
  87: 0x6e656562,
  88: 0x676e69686361,
  89: 0x747562,
  90: 0x657227756f59,
  91: 0x6f6f74,
  92: 0x796873,
  93: 0x6f74,
  94: 0x796173,
  95: 0x7469,
  96: 0x656469736e49,
  97: 0x6577,
  98: 0x68746f62,
  99: 0x776f6e6b,
  100: 0x732774616877,
  101: 0x6e656562,
  102: 0x676e696f67,
  103: 0x6e6f,
  104: 0x6557,
  105: 0x776f6e6b,
  106: 0x656874,
  107: 0x656d6167,
  108: 0x646e61,
  109: 0x6572276577,
  110: 0x616e6e6f67,
  111: 0x79616c70,
  112: 0x7469,
  113: 0x646e41,
  114: 0x6669,
  115: 0x756f79,
  116: 0x6b7361,
  117: 0x656d,
  118: 0x776f68,
  119: 0x6d2749,
  120: 0x676e696c656566,
  121: 0x74276e6f44,
  122: 0x6c6c6574,
  123: 0x656d,
  124: 0x657227756f79,
  125: 0x6f6f74,
  126: 0x646e696c62,
  127: 0x6f74,
  128: 0x656573,
  129: 0x726576654e,
  130: 0x616e6e6f67,
  131: 0x65766967,
  132: 0x756f79,
  133: 0x7075,
  134: 0x726576654e,
  135: 0x616e6e6f67,
  136: 0x74656c,
  137: 0x756f79,
  138: 0x6e776f64,
  139: 0x726576654e,
  140: 0x6e7572,
  141: 0x646e756f7261,
  142: 0x646e61,
  143: 0x747265736564,
  144: 0x756f79,
  145: 0x726576654e,
  146: 0x616e6e6f67,
  147: 0x656b616d,
  148: 0x756f79,
  149: 0x797263,
  150: 0x726576654e,
  151: 0x616e6e6f67,
  152: 0x796173,
  153: 0x657962646f6f67,
  154: 0x726576654e,
  155: 0xa680e2616e6e6f67,
};
