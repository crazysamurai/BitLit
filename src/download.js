import net from "node:net"; //for TCP connections
import fs from "fs";
import * as message from "./message.js";
import torrent from "../index.js";
import Pieces from "./pieces.js";
import Queue from "./queue.js";

const iteratePeers = (peers, torrent, path) => {
  const pieces = new Pieces(torrent);
  const file = fs.openSync(path, 'w');
  peers.forEach((peer) => download(peer, torrent, pieces, file));
};

const onWholeMessage = (socket, callback) => {
  let buf = Buffer.alloc(0); // Initialize an empty buffer
  let handshake = true; //the handshake message can only be identified if it is the first message sent by the peer, it doesn't have a length prefix like others. Also because we're using closure here it'll be true only once and then false for the rest of the messages

  socket.on("data", (receivedBuffer) => {
    const msgLen = 0;

    if (handshake) {
      buf.readUInt8(0) + 49; // 49 is the length of the handshake message, so we can read it from the buffer
    } else {
      buf.readInt32BE(0) + 4; // 4 is the length of the message ID + length prefix for the rest of the messages
    }

    while (buf.length >= 4 && buf.length >= msgLen) {
      callback(buf.slice(0, msgLen)); // Call the callback with the message
      buf = buf.slice(msgLen); // Remove the message from the buffer
      handshake = false; // Set handshake to false after the first message
    }
  });
};

const download = (peer, torrent, pieces, file) => {
  //   console.log("downloading from peer:", peer);
  const socket = new net.socket();
  socket.on("error", console.log);

  socket.connect(peer.port, peer.ip, () => {
    socket.write(message.buildHandShake(torrent)); //send handshake message to peer
  });

  const queue = new Queue(torrent)

  onWholeMessage(socket, (msg) => msgHandler(msg, socket, pieces, queue, torrent, file));
};

const msgHandler = (msg, socket, pieces, queue, torrent, file) => {
  if (isHandShake(msg)) socket.write(message.buildInterested());
  //checks if the message is a handshake response, and if so it sends the interested message and hopefully the peer will send an unchoke message.
  else {
    const m = parse(msg);
    if (m.id === 0) chokeHandler(socket);
    if (m.id === 1) unchokeHandler(socket, pieces, queue);
    if (m.id === 4) haveHandler(socket, pieces, queue, m.payload);
    if (m.id === 5) bitfieldHandler(socket, pieces, queue, m.payload);
    if (m.id === 7) pieceHandler(socket, pieces, queue, torrent, file, m.payload);
  }
};

const chokeHandler = (socket) => {
  socket.end();
};

const unchokeHandler = (socket, pieces, queue) => {
  queue.choked = false;
  requestPiece(socket, pieces, queue);
};

const haveHandler = (socket, pieces, queue, payload) => {
  const pieceIndex = payload.readUINT32BE(0);
  const queueEmpty = queue.length === 0;
  queue.queue(pieceIndex);
  if (queueEmpty) requestPiece(socket, pieces, queue);
};

const bitfieldHandler = (socket, pieces, queue, payload) => {
  //The payload here is a buffer, which you can think of as a long string of bits. If the peer has the index-0 piece, then the first bit will be a 1. If not it will be 0. If they have the index-1 piece, then the next bit will be 1, 0 if not. And so on. So we need a way to read individual bits out of the buffer.
  const queueEmpty = queue.length === 0;
  payload.forEach((byte, i) => {
    for (let j = 0; j < 8; j++) {
      if (byte % 2) queue.queue(i * 8 + 7 - j); // if LSB (we're reading the byte from R to L) is 1 i.e. peer has that piece then queue it for downloading by calculating its piece index
      byte = Math.floor(byte / 2); //shift right by one bit
    }
  });
  if (queueEmpty) requestPiece(socket, pieces, queue);
};

const pieceHandler = (socket, pieces, queue, torrent, file, pieceResp) => {
  console.log(pieceResp);
  pieces.addReceived(pieceResp);

  const offset = pieceResp.index * torrent.info['piece length'] + pieceResp.begin;
  fs.write(file, pieceResp.block, 0, pieceResp.block.length, offset, () => {});

  if(pieces.isDone()){
    socket.end();
    console.log("Finished downloading")
    try{
      fs.closeSync(file);
      console.log("Finished Writing")
    }
    catch(err){console.log("Error writing file: " + err)}
  }else{
    requestPiece(socket, pieces, queue);
  }
};

const requestPiece = (socket, pieces, queue) => {
  if (queue.choked) return null;

  while (queue.length()) {
    const pieceBlock = queue.dequeue();
    if (pieces.needed(pieceBlock)) {
      socket.write(message.buildRequest(pieceBlock));
      pieces.addRequested(pieceBlock);
      break;
    }
  }
};

const isHandShake = (msg) => {
  return (
    msg.length === msg.readUInt8(0) + 49 &&
    msg.toString("utf-8", 1) === "BitTorrent protocol"
  );
};

export { download, iteratePeers };
