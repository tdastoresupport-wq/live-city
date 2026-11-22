import * as crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_CLIENT_FRAME_BYTES = 64 * 1024; // 64 KB limit for client messages

export interface WsClient {
  id: string;
  socket: Duplex;
  isAlive: boolean;
  send(data: unknown): void;
  ping(): void;
  close(): void;
}

/**
 * Performs RFC 6455 WebSocket upgrade on a Node.js HTTP server socket.
 */
export function upgradeToWebSocket(
  req: IncomingMessage,
  socket: Duplex,
  onMessage: (client: WsClient, text: string) => void,
  onClose: (client: WsClient) => void
): WsClient | null {
  const key = req.headers['sec-websocket-key'];
  if (!key || typeof key !== 'string') {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return null;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(key + WS_GUID)
    .digest('base64');

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${acceptKey}`,
    '\r\n',
  ];

  socket.write(responseHeaders.join('\r\n'));

  const client: WsClient = {
    id: `ws_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    socket,
    isAlive: true,
    send(data: unknown) {
      if (socket.destroyed || !socket.writable) return;
      const json = typeof data === 'string' ? data : JSON.stringify(data);
      const frame = encodeTextFrame(json);
      try {
        socket.write(frame);
      } catch {
        // socket closed
      }
    },
    ping() {
      if (socket.destroyed || !socket.writable) return;
      try {
        // Opcode 0x9 (Ping), 0 payload length
        socket.write(Buffer.from([0x89, 0x00]));
      } catch {
        // ignore
      }
    },
    close() {
      if (socket.destroyed) return;
      try {
        socket.write(Buffer.from([0x88, 0x00]));
      } catch {
        // ignore
      }
      socket.destroy();
    },
  };

  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (buffer.length > MAX_CLIENT_FRAME_BYTES * 2) {
      client.close();
      return;
    }

    while (buffer.length >= 2) {
      const parsed = tryDecodeFrame(buffer);
      if (!parsed) break;

      buffer = buffer.subarray(parsed.totalFrameBytes);
      client.isAlive = true;

      if (parsed.opcode === 0x8) {
        // Close frame
        client.close();
        onClose(client);
        return;
      } else if (parsed.opcode === 0x9) {
        // Ping -> send Pong
        if (!socket.destroyed && socket.writable) {
          socket.write(Buffer.from([0x8a, 0x00]));
        }
      } else if (parsed.opcode === 0xa) {
        // Pong
        client.isAlive = true;
      } else if (parsed.opcode === 0x1) {
        // Text frame
        const text = parsed.payload.toString('utf-8');
        onMessage(client, text);
      }
    }
  });

  let closed = false;
  const handleDisconnect = () => {
    if (closed) return;
    closed = true;
    onClose(client);
  };

  socket.on('close', handleDisconnect);
  socket.on('end', handleDisconnect);
  socket.on('error', handleDisconnect);

  return client;
}

export function encodeTextFrame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf-8');
  const len = payload.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + Text opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }

  return Buffer.concat([header, payload]);
}

function tryDecodeFrame(
  buf: Buffer
): { opcode: number; payload: Buffer; totalFrameBytes: number } | null {
  if (buf.length < 2) return null;

  const firstByte = buf[0];
  const secondByte = buf[1];
  const opcode = firstByte & 0x0f;
  const isMasked = (secondByte & 0x80) !== 0;
  let payloadLen = secondByte & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    const bigLen = buf.readBigUInt64BE(2);
    if (bigLen > BigInt(MAX_CLIENT_FRAME_BYTES)) {
      return { opcode: 0x8, payload: Buffer.alloc(0), totalFrameBytes: buf.length };
    }
    payloadLen = Number(bigLen);
    offset = 10;
  }

  if (payloadLen > MAX_CLIENT_FRAME_BYTES) {
    return { opcode: 0x8, payload: Buffer.alloc(0), totalFrameBytes: buf.length };
  }

  const maskBytes = isMasked ? 4 : 0;
  const totalFrameBytes = offset + maskBytes + payloadLen;
  if (buf.length < totalFrameBytes) {
    return null;
  }

  let maskKey: Buffer | null = null;
  if (isMasked) {
    maskKey = buf.subarray(offset, offset + 4);
    offset += 4;
  }

  const payload = Buffer.from(buf.subarray(offset, offset + payloadLen));
  if (isMasked && maskKey) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= maskKey[i % 4];
    }
  }

  return { opcode, payload, totalFrameBytes };
}
