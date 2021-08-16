import { Connection } from './lgx_comm'

export class PLC {
  public IPAddress;
  public ProcessorSlot;
  public SocketTimeout;
  public Micro800 = false;
  public Route = null;
  private _ConnectionSize: number | null;

  private conn = new Connection(this)

  private Offset= 0;

  constructor(IPAddress = "", slot = 0, timeout = 5.0) {
    this.IPAddress = IPAddress;
    this.ProcessorSlot = slot;
    this.SocketTimeout = timeout;
    this._ConnectionSize = this.conn.ConnectionSize || 508;
  }

  public set ConnectionSize(connSize:number){
    this._ConnectionSize = connSize;
  }

  public Read(tag:string, count=1, datatype=null){

  }

  private _Read(tag_name:string, elements:number, data_type:number){
    // Processes the read request
    this.Offset = 0;
    const conn = this.conn.connect()
    if(!conn?.connected){
      
    }
  }
}
