import { genId } from "./util.js";
import { infoHash } from "./torrent-parser.js";

//https://wiki.theory.org/BitTorrentSpecification#Messages

const buildHandShake = (torrent) => {
  //handshake: <pstrlen><pstr><reserved><info_hash><peer_id>
  // pstrlen: string length of <pstr>, as a single raw byte
  // pstr: string identifier of the protocol
  // reserved: eight (8) reserved bytes. All current implementations use all zeroes.
  // peer_id: 20-byte string used as a unique ID for the client.
  // In version 1.0 of the BitTorrent protocol, pstrlen = 19, and pstr = "BitTorrent protocol".

  const buf = Buffer.alloc(68); // 1 + 19 + 20 + 8 + 20

  //pstrlen
  buf.writeUInt8(19, 0); //length of pstr

  //pstr
  buf.write("BitTorrent protocol", 1);

  //reserved 4+4 bytes
  buf.writeUInt32BE(0, 20);
  buf.writeUInt32BE(0, 24);

  //info_hash
  infoHash(torrent).copy(buf, 28); //info_hash is a 20-byte buffer, so we copy it to the handshake buffer starting at byte 28

  //peer_id
  genId().copy(buf, 48);

  return buf;
};

const buildKeepAlive = () => Buffer.alloc(4); // 4 bytes for keep-alive message

const buildChoke = () => {
  const buf = Buffer.alloc(5);

  //length prefix
  buf.writeUInt32BE(1, 0); // 1 byte for the message ID + 4 bytes for the length prefix
  buf.writeUInt8(0, 4); // 0 for choke message ID
  return buf;
};

const buildUnchoke = () => {
  const buf = Buffer.alloc(5);

  //length prefix
  buf.writeUInt32BE(1, 0); // 1 byte for the message ID + 4 bytes for the length prefix
  buf.writeUInt8(1, 4); // 1 for unchoke message ID
  return buf;
};

const buildInterested = () => {
  const buf = Buffer.alloc(5);
  //length prefix
  buf.writeUInt32BE(1, 0); // 1 byte for the message ID + 4 bytes for the length prefix
  buf.writeUInt8(2, 4); // 2 for interested message ID
  return buf;
};

const buildUninterested = () => {
  const buf = Buffer.alloc(5);
  //length prefix
  buf.writeUInt32BE(1, 0); // 1 byte for the message ID + 4 bytes for the length prefix
  buf.writeUInt8(3, 4); // 3 for uninterested message ID
  return buf;
};

const buildHave = (payload) => {
  const buf = Beffer.alloc(9); // 1 byte for the message ID + 4 bytes for the length prefix + 4 bytes for the payload

  //length
  buf.writeUInt32BE(5, 0);

  //message ID
  buf.writeUInt8(4, 4); // 4 for have message ID

  //piece index
  buf.writeUInt32BE(payload, 5); // 4 bytes for the payload

  return buf;
};

const buildBitfield = (bitfield) => {
  const buf = Buffer.alloc(bitfield.length + 1 + 4); // 1 byte for the message ID + 4 bytes for the length prefix + bitfield length

  //length
  buf.writeUint32BE(payload.length + 1, 0); //length of the message + 1 for the message ID

  //message ID
  buf.writeUInt8(5, 4); // 5 for bitfield message ID

  //bitfield
  bitfield.copy(buf, 5);

  return buf;
};

const buildRequest = (payload) => {
  const buf = Buffer.alloc(17);

  // length
  buf.writeUInt32BE(13, 0);

  // id
  buf.writeUInt8(6, 4);

  // piece index
  buf.writeUInt32BE(payload.index, 5);

  // begin
  buf.writeUInt32BE(payload.begin, 9);

  // length
  buf.writeUInt32BE(payload.length, 13);

  return buf;
};

const buildPiece = (payload) => {
  const buf = Buffer.alloc(payload.block.length + 13);

  // length
  buf.writeUInt32BE(payload.block.length + 9, 0);

  // id
  buf.writeUInt8(7, 4);

  // piece index
  buf.writeUInt32BE(payload.index, 5);

  // begin
  buf.writeUInt32BE(payload.begin, 9);

  // block
  payload.block.copy(buf, 13);

  return buf;
};

const buildCancel = (payload) => {
  const buf = Buffer.alloc(17);

  // length
  buf.writeUInt32BE(13, 0);

  // id
  buf.writeUInt8(8, 4);

  // piece index
  buf.writeUInt32BE(payload.index, 5);

  // begin
  buf.writeUInt32BE(payload.begin, 9);

  // length
  buf.writeUInt32BE(payload.length, 13);

  return buf;
};

const buildPort = (payload) => {
  const buf = Buffer.alloc(7);

  // length
  buf.writeUInt32BE(3, 0);

  // id
  buf.writeUInt8(9, 4);

  // listen-port
  buf.writeUInt16BE(payload, 5);

  return buf;
};

const parse = (msg) => {
  // 6: request, structure: {index, begin, length}
  // 7: piece, structure: {index, begin, block}
  // 8: cancel, structure: {index, begin, length}

  const id = msg.length > 4 ? msg.readInt8(4) : null; //message ID at index 4
  let payload = msg.length > 5 ? msg.slice(5) : null; //payload is the rest of the message after the message ID
  if (id === 6 || id === 7 || id === 8) {
    const rest = payload.slice(8);
    payload = {
      index: payload.readUInt32BE(0),
      begin: payload.readUInt32BE(4),
    };
    payload[id === 7 ? "block" : "length"] = rest;
  }
  return {
    size: msg.readInt32BE(0),
    id: id,
    payload: payload,
  };
};

export {
  buildHandShake,
  buildKeepAlive,
  buildChoke,
  buildUnchoke,
  buildInterested,
  buildUninterested,
  buildHave,
  buildBitfield,
  buildRequest,
  buildPiece,
  buildCancel,
  buildPort,
  parse,
};
