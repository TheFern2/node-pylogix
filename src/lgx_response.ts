import {Dictionary} from 'lodash'

export class Response{
    private TagName;
    private Value;
    private Status;

    // value can be anything but need to make it into an enum?
    constructor(tag_name:string, value:any, status:number){
        this.TagName = tag_name
        this.Value = value
        this.Status = cip_error_codes[status]
    }

    public toString(){
        return `${this.TagName} ${this.Value} ${this.Status}`
    }
}

const cip_error_codes:Dictionary<string>  = {0x00: 'Success',
                   0x01: 'Connection failure',
                   0x02: 'Resource unavailable',
                   0x03: 'Invalid parameter value',
                   0x04: 'Path segment error',
                   0x05: 'Path destination unknown',
                   0x06: 'Partial transfer',
                   0x07: 'Connection lost',
                   0x08: 'Service not supported',
                   0x09: 'Invalid Attribute',
                   0x0A: 'Attribute list error',
                   0x0B: 'Already in requested mode/state',
                   0x0C: 'Object state conflict',
                   0x0D: 'Object already exists',
                   0x0E: 'Attribute not settable',
                   0x0F: 'Privilege violation',
                   0x10: 'Device state conflict',
                   0x11: 'Reply data too large',
                   0x12: 'Fragmentation of a premitive value',
                   0x13: 'Not enough data',
                   0x14: 'Attribute not supported',
                   0x15: 'Too much data',
                   0x16: 'Object does not exist',
                   0x17: 'Service fragmentation sequence not in progress',
                   0x18: 'No stored attribute data',
                   0x19: 'Store operation failure',
                   0x1A: 'Routing failure, request packet too large',
                   0x1B: 'Routing failure, response packet too large',
                   0x1C: 'Missing attribute list entry data',
                   0x1D: 'Invalid attribute value list',
                   0x1E: 'Embedded service error',
                   0x1F: 'Vendor specific',
                   0x20: 'Invalid Parameter',
                   0x21: 'Write once value or medium already written',
                   0x22: 'Invalid reply received',
                   0x23: 'Buffer overflow',
                   0x24: 'Invalid message format',
                   0x25: 'Key failure in path',
                   0x26: 'Path size invalid',
                   0x27: 'Unexpected attribute in list',
                   0x28: 'Invalid member ID',
                   0x29: 'Member not settable',
                   0x2A: 'Group 2 only server general failure',
                   0x2B: 'Unknown Modbus error',
                   0x2C: 'Attribute not gettable'}