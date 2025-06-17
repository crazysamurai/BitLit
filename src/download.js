import net from "node:net"; //for TCP connections
import fs from "fs";
import speedometer from "speedometer";
import * as message from "./message.js";
import Pieces from "./pieces.js";
import Queue from "./queue.js";
import {
  updateStatus,
  updateDownloadSpeed,
  updateDiskUtilization,
  updateAverageDownloadSpeed,
  updateRemainingPieces,
  stopElapsedTimer,
  updateError,
} from "../screen/ui.js";
import { size } from "./torrent-parser.js";
import { log } from "./util.js";
import { torrent } from "../index.js";
import { BLOCK_LEN, blocksPerPiece, blockLen } from "./torrent-parser.js";

const iteratePeers = (peers, torrent, path) => {
  updateStatus("Connecting with peers...");
  const pieces = new Pieces(torrent);

  const file = fs.openSync(path, "w");
  fs.ftruncateSync(file, Number(size(torrent).readBigUInt64BE()));
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

  if (!pieces.expireTimer) {
    pieces.expireTimer = setInterval(() => {
      pieces.expireOldRequests();
    }, 2000);
  }

  onWholeMessage(socket, (msg) =>
    msgHandler(msg, socket, pieces, queue, torrent, file)
  );
};

let lastSpeedUpdate = 0;
const onWholeMessage = (socket, callback) => {
  let savedBuf = Buffer.alloc(0);
  let handshake = true;

  const downSpeed = speedometer();
  const UPDATE_INTERVAL = 2000;

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
      updateDownloadSpeed(currentSpeed);
      // updateAverageDownloadSpeed();
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
  // queue.queue(pieceIndex);
  const nBlocks = blocksPerPiece(torrent, pieceIndex);
  for (let i = 0; i < nBlocks; i++) {
    const pieceBlock = {
      index: pieceIndex,
      begin: i * BLOCK_LEN,
      length: blockLen(torrent, pieceIndex, i),
    };
    if (pieces.needed(pieceBlock)) {
      queue.queueBlock(pieceBlock);
    }
  }
  if (queueEmpty) requestPiece(socket, pieces, queue);
};

const bitfieldHandler = (socket, pieces, queue, payload) => {
  //The payload here is a buffer, which you can think of as a long string of bits. If the peer has the index-0 piece, then the first bit will be a 1. If not it will be 0. If they have the index-1 piece, then the next bit will be 1, 0 if not. And so on. So we need a way to read individual bits out of the buffer.
  const bitfield = [];
  const queueEmpty = queue.length === 0;
  payload.forEach((byte) => {
    for (let j = 0; j < 8; j++) {
      bitfield.push((byte >> (7 - j)) & 1);
    }
  });
  // Attach the bitfield to the socket (or peer) for later use
  socket.peerBitfield = bitfield;
  // payload.forEach((byte, i) => {
  //   for (let j = 0; j < 8; j++) {
  //     if (byte % 2) queue.queue(i * 8 + 7 - j); // if LSB (we're reading the byte from R to L) is 1 i.e. peer has that piece then queue it for downloading by calculating its piece index
  //     byte = Math.floor(byte / 2); //shift right by one bit
  //   }
  // });
  if (queueEmpty) requestPiece(socket, pieces, queue);
};

let lastDiskUtilUpdate = 0;
const pieceHandler = (socket, pieces, queue, torrent, file, pieceResp) => {
  // console.log('called pieceHandler');
  pieces.addReceived(pieceResp);

  // updateRemaining(pieces.getDownloadedBytes(torrent));
  let remainingPieces = pieces.getMissingPieces();
  updateRemainingPieces(remainingPieces);

  const offset =
    pieceResp.index * torrent.info["piece length"] + pieceResp.begin;

  const start = Date.now(); // Start time for speed calculation
  fs.write(file, pieceResp.block, 0, pieceResp.block.length, offset, () => {
    const duration = Date.now() - start; // ms
    const speed = pieceResp.block.length / (duration / 1000); // bytes/sec
    const now = Date.now();
    if (now - lastDiskUtilUpdate >= 2000) {
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
    updateAverageDownloadSpeed();
    updateRemainingPieces(0);
    updateDiskUtilization(0);
    stopElapsedTimer();
    if (pieces.expireTimer) {
      clearInterval(pieces.expireTimer);
      pieces.expireTimer = null;
    }
  } else {
    requestPiece(socket, pieces, queue);
  }
};

const requestPiece = (socket, pieces, queue) => {
  if (queue.choked) return null;
  log(`queue length: ${queue.length()}`);

  if (socket.destroyed || !socket.writable) return null;

  if (queue.length() === 0 && !pieces.isDone()) {
    refillQueueForPeer(queue, pieces, socket.peerBitfield, torrent);
  }

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
    msg.toString("utf-8", 1, 1 + msg.readUInt8(0)) === "BitTorrent protocol"
  );
};

// function refillQueueForPeer(queue, pieces, peerBitfield, torrent) {
//   const missingBlocks = pieces.getMissingBlocksForPeer(peerBitfield);
//   for (const { pieceIndex, blockIndex } of missingBlocks) {
//     // Build a pieceBlock object as expected by your queue/request logic
//     const blocksPerPiece = torrent.info["piece length"] / BLOCK_LEN; // or use your actual block count logic
//     const pieceBlock = {
//       index: pieceIndex,
//       begin: blockIndex * BLOCK_LEN,
//       length: BLOCK_LEN,
//     };
//     if (pieces.needed(pieceBlock)) {
//       queue.queue(pieceIndex); // or queue.queue(pieceBlock) if your queue supports blocks
//     }
//   }
// }

function refillQueueForPeer(queue, pieces, peerBitfield, torrent) {
  log(`refill called`);
  const missingBlocks = pieces.getMissingBlocksForPeer(peerBitfield);
  for (const { pieceIndex, blockIndex } of missingBlocks) {
    const pieceBlock = {
      index: pieceIndex,
      begin: blockIndex * BLOCK_LEN,
      length: BLOCK_LEN,
    };
    if (pieces.needed(pieceBlock)) {
      queue.queueBlock(pieceBlock);
    }
  }
}

export { download, iteratePeers };
