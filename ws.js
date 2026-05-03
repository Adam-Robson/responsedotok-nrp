import http from "node:http";
import crypto from "node:crypto";

const server = http.createServer((req, res) => res.end());

server.on("upgrade", (req, socket) => {
  // Complete the WebSocket handshake manually
  const key = req.headers["sec-websocket-key"];
  const accept = crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  console.info("Client connected via WebSocket");

  socket.on("data", (buf) => {
    const fin = (buf[0] & 0x80) !== 0;
    const opcode = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f;
    let offset = 2;
    if (len === 126) { len = buf.readUInt16BE(offset); offset += 2; }
    else if (len === 127) { len = Number(buf.readBigUInt64BE(offset)); offset += 8; }

    let payload;
    if (masked) {
      const mask = buf.subarray(offset, offset + 4);
      offset += 4;
      payload = Buffer.alloc(len);
      for (let i = 0; i < len; i++) payload[i] = buf[offset + i] ^ mask[i % 4];
    } else {
      payload = buf.subarray(offset, offset + len);
    }

    if (opcode === 0x8) { socket.end(); return; } // close
    console.info(`Received ${len} bytes — echoing back`);

    // Re-frame unmasked
    const header = len < 126
      ? Buffer.from([0x80 | opcode, len])
      : len < 65536
        ? Buffer.concat([Buffer.from([0x80 | opcode, 126]), Buffer.from([len >> 8, len & 0xff])])
        : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b; })();
    socket.write(Buffer.concat([header, payload]));
    if (!fin) console.info("(note: fragmented frame — this echo only handles single frames)");
  });

  socket.on("end", () => console.info("Client disconnected"));
});

server.listen(4000, () => console.info("WS upstream on :4000"));