import { Connection } from './lgx_comm'
import { Response } from './lgx_response';

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

  private _ReadTag(tag_name:string, elements:number, data_type:number){
    // Processes the read request
    this.Offset = 0;
    const conn = this.conn.connect()
    if(!conn?.connected){
      return new Response(tag_name, null, conn?.status)
    }
  }
}

function parse_tag_name(tag_name:string){
  /**
    Parse the tag name into it's base tag (remove array index and/or
    bit) and get the array index if it exists

    ex: MyTag.Name[42] returns:
    MyTag.Name[42], MyTag.Name, 42
  **/
    const bit_end_pattern = /\.\d+$/ // this finds tag names with bits BaseBITS.4
    const array_pattern = /\[([\d]|[,]|[\s])*\]$/ // this patterns grab whatever is inside [ ]
    let reIndex:number;
    let base_tag_index:number;
    let base_tag:string = "";

    let index:number | number[];
    let indexStr:string;
    // let indexArr:number[] = []

    // get the array index
    try {
      reIndex = tag_name.search(array_pattern) // MyTag.Name[33,33,44] => 10 where 10 is the bracket [ index
      indexStr = tag_name.substring(reIndex + 1,  tag_name.length -1) // 33,33,44
      index = Number(indexStr)
      if(indexStr.toString().includes(',')){
        index = indexStr.toString().split(',').map(i => Number(i))
      }
    } catch (error) {
      index = 0;
    }

    //  get the base tag name
    base_tag_index = tag_name.search(bit_end_pattern)
    if(base_tag_index != -1){
      base_tag = tag_name.substring(0, base_tag_index)
    }
    base_tag_index = tag_name.search(array_pattern)
    if(base_tag_index != -1){
      base_tag = tag_name.substring(0, base_tag_index)
    }
    if(base_tag_index == -1){
      base_tag = tag_name
    }

    return {tag_name, base_tag, index}
}
