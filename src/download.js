import net from "node:net"; //for TCP connections
import fs from "fs";
import * as message from "./message.js";
import Pieces from "./pieces.js";
import Queue from "./queue.js";
import {
  updateStatus,
  updateDownloadSpeed,
  updateRemaining,
  updateDiskUtilization,
  updateAverageDownloadSpeed,
} from "../screen/ui.js";
import speedometer from "speedometer";

const iteratePeers = (peers, torrent, path) => {
  updateStatus("Connecting with peers...");
  const pieces = new Pieces(torrent);

  const file = fs.openSync(path, "w");
  peers.forEach((peer) => download(peer, torrent, pieces, file));
};

const download = (peer, torrent, pieces, file) => {
  updateStatus("Trying to download from peers...");
  const socket = new net.Socket();
  socket.on("error", () => {});

  socket.connect(peer.port, peer.ip, () => {
    socket.write(message.buildHandShake(torrent)); //send handshake message to peer
    // console.log("connected to: " + peer.ip)
  });

  const queue = new Queue(torrent);
  // console.log(queue)
  onWholeMessage(socket, (msg) =>
    msgHandler(msg, socket, pieces, queue, torrent, file)
  );
};

let lastSpeedUpdate = 0;
const onWholeMessage = (socket, callback) => {
  let savedBuf = Buffer.alloc(0);
  let handshake = true;

  const downSpeed = speedometer();
  const UPDATE_INTERVAL = 3000;

  socket.on("data", (recvBuf) => {
    // msgLen calculates the length of a whole message
    const msgLen = () => {
      if (handshake) {
        if (savedBuf.length < 1) return Infinity; // Not enough data for handshake
        return savedBuf.readUInt8(0) + 49;
      } else {
        if (savedBuf.length < 4) return Infinity; // Not enough data for message length
        return savedBuf.readInt32BE(0) + 4;
      }
    };
    savedBuf = Buffer.concat([savedBuf, recvBuf]);

    const currentSpeed = downSpeed(msgLen()); // bytes per second
    const now = Date.now();
    if (now - lastSpeedUpdate >= UPDATE_INTERVAL) {
      // let speedInKB = (currentSpeed / 1024).toFixed(2);
      updateDownloadSpeed(currentSpeed);
      updateAverageDownloadSpeed(currentSpeed);
      lastSpeedUpdate = now;
    }

    while (savedBuf.length >= 4 && savedBuf.length >= msgLen()) {
      callback(savedBuf.slice(0, msgLen()));
      savedBuf = savedBuf.slice(msgLen());
      handshake = false;
    }
  });
};

const msgHandler = (msg, socket, pieces, queue, torrent, file) => {
  if (isHandShake(msg)) socket.write(message.buildInterested());
  //checks if the message is a handshake response, and if so it sends the interested message and hopefully the peer will send an unchoke message.
  else {
    const m = message.parse(msg);
    if (m.id === 0) chokeHandler(socket);
    if (m.id === 1) unchokeHandler(socket, pieces, queue);
    if (m.id === 4) haveHandler(socket, pieces, queue, m.payload);
    if (m.id === 5) bitfieldHandler(socket, pieces, queue, m.payload);
    if (m.id === 7)
      pieceHandler(socket, pieces, queue, torrent, file, m.payload);
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
  const pieceIndex = payload.readUInt32BE(0);
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

let lastDiskUtilUpdate = 0;
const pieceHandler = (socket, pieces, queue, torrent, file, pieceResp) => {
  // console.log('called pieceHandler');
  pieces.addReceived(pieceResp);

  updateRemaining(pieceResp.block.length);

  const offset =
    pieceResp.index * torrent.info["piece length"] + pieceResp.begin;
    
  const start = Date.now(); // Start time for speed calculation
  fs.write(file, pieceResp.block, 0, pieceResp.block.length, offset, () => {
    const duration = Date.now() - start; // ms
    const speed = pieceResp.block.length / (duration / 1000); // bytes/sec
    const now = Date.now();
    if (now - lastDiskUtilUpdate >= 3000) {
      updateDiskUtilization((speed / 2 ** 20).toFixed(2));
      lastDiskUtilUpdate = now;
    }
  });

  if (pieces.isDone()) {
    socket.end();
    updateStatus("Finished downloading");
    try {
      fs.closeSync(file);
      updateStatus("Finished Writing");
    } catch (err) {
      updateError("Error writing file: " + err);
    }
  } else {
    requestPiece(socket, pieces, queue);
  }
};

const requestPiece = (socket, pieces, queue) => {
  if (queue.choked) return null;

  if (socket.destroyed || !socket.writable) return null;
  while (queue.length()) {
    const pieceBlock = queue.dequeue();
    // console.log(pieceBlock);
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
    msg.toString("utf-8", 1, 1 + msg.readUInt8(0)) === "BitTorrent protocol"
  );
};

export { download, iteratePeers };
