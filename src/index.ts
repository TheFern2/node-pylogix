const struct = require("python-struct");

const example1 = struct.sizeOf(">iixxQ10sb"); // --> 29
console.log(example1);

struct.pack(">iixxQ10sb", [
  1234,
  5678,
  require("long").fromString("12345678901234567890"),
  "abcdefg",
  true
]); // --> <Buffer 00 00 04 d2 00 00 16 2e 00 00 ab 54 a9 8c eb 1f 0a d2 61 62 63 64 65 66 67 00 00 00 01>

struct.unpack(
  ">iixxQ10sb",
  Buffer.from(
    "000004d20000162e0000ab54a98ceb1f0ad26162636465666700000001",
    "hex"
  )
); // --> [ 1234, 5678, 12345678901234567890, 'abcdefg', 1 ]
