import net from "node:net";
import fs from "fs";
import speedometer from "speedometer";
import { fileTypeFromFile } from "file-type";
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
  peerTable,
} from "../screen/ui.js";
import { size } from "./torrent-parser.js";
import { log } from "./util.js";
import { torrent, outputPath } from "../index.js";
import { BLOCK_LEN, blocksPerPiece, blockLen } from "./torrent-parser.js";
import { getPeers } from "./tracker.js";

let pieces = null;
let queue = null;
let file = null;
let torrentInfo = null;
let filePath = null;
let downloadComplete = false;
let peerInfos = [];
let speedUpdateInterval = null;

let activeSockets = [];
let isPaused = false;

let lastDataTime = Date.now();
let NETWORK_TIMEOUT = 10000;

//if there's a network disruption during download
function handleNetworkTimeout() {
  setInterval(() => {
    if (Date.now() - lastDataTime > NETWORK_TIMEOUT) {
      updateDownloadSpeed(0);
    }
  }, NETWORK_TIMEOUT);
}

//handles pause and resume functionality
const togglePause = () => {
  if (downloadComplete) return;
  isPaused = !isPaused;
  // log(`isPaused: ${isPaused}`);
  updateStatus(
    isPaused
      ? `{yellow-fg}Paused{/yellow-fg}`
      : `{cyan-fg}Downloading...{/cyan-fg}`
  );
  if (isPaused) {
    for (const socket of activeSockets) {
      if (socket && !socket.destroyed) socket.destroy(); //close all sockets
    }
  } else {
    getPeers(torrentInfo, (peers) => {
      iteratePeers(peers, torrentInfo, filePath);
    });
  }
};

let fileClosed = false;
let pendingWrites = 0; //tracks how many asynchronous file write operations are currently in progress.

const iteratePeers = (peers, torrent, path) => {
  peerInfos = peers.map((peer) => ({
    ip: peer.ip,
    port: peer.port,
    status: "Connecting",
    speed: 0,
    speedometer: speedometer(), //to measure the download speed of each peer
    socket: null, // will be set in download()
  }));
  peerTable.setData({
    headers: [" Peer IP", " Port", " Status", " Speed"],
    data: peerInfos.map((peer) => [
      peer.ip,
      peer.port,
      peer.status,
      peer.speed,
    ]),
  });
  startSpeedUpdates();
  handleNetworkTimeout();
  //to avoid losing data upon resume only create these once during download
  if (!pieces) pieces = new Pieces(torrent);
  if (!queue) queue = new Queue(torrent);

  // Set up the endgame timer once for all peers
  setupEndgameTimer(peers, pieces, queue, torrent);

  if (!file) file = fs.openSync(path, "w");
  fs.ftruncateSync(file, Number(size(torrent).readBigUInt64BE())); //preallocates download space
  if (!torrentInfo) torrentInfo = torrent;
  if (!filePath) filePath = path;
  peers.forEach((peer) => download(peer, torrent, pieces, file, peers, path));
};

const download = (peer, torrent, pieces, file, peers, filePath) => {
  updateStatus(`{cyan-fg}Downloading...{/cyan-fg}`);

  const socket = new net.Socket();
  activeSockets.push(socket);

  socket.on("close", () => {
    activeSockets = activeSockets.filter((s) => s !== socket);
    updatePeerInfo(peer.ip, peer.port, "Disconnected", 0);
  });
  socket.on("error", (err) => {
    // log(`Socket error: ${err}`);
    activeSockets = activeSockets.filter((s) => s !== socket);
    updatePeerInfo(peer.ip, peer.port, "Socket Error", 0);
  });

  socket.connect(peer.port, peer.ip, () => {
    socket.peer = peer;
    peer.socket = socket;
    updatePeerInfo(peer.ip, peer.port, "Connected", 0);
    socket.write(message.buildHandShake(torrent)); //send handshake message to peer
  });

  const queue = new Queue(torrent);

  if (!pieces.expireTimer) {
    pieces.expireTimer = setInterval(() => {
      pieces.expireOldRequests();
    }, 2000);
  }

  onWholeMessage(peers, socket, (msg) =>
    msgHandler(msg, socket, pieces, queue, torrent, file, peers, filePath)
  );
};

//frequently checks for endgame mode
function setupEndgameTimer(peers, pieces, queue, torrent) {
  setInterval(() => {
    if (isEndgameMode(pieces)) {
      endgameRequest(peers, pieces, queue, torrent);
    }
  }, 2000);
}

let lastSpeedUpdate = 0;
const onWholeMessage = (peers, socket, callback) => {
  let savedBuf = Buffer.alloc(0);
  let handshake = true;

  //for network activity ui
  const downSpeed = speedometer();
  const UPDATE_INTERVAL = 2000;

  socket.on("data", (recvBuf) => {
    // msgLen calculates the length of a whole message
    const msgLen = () => {
      if (handshake) {
        if (savedBuf.length < 1) return Infinity; //not enough data for handshake
        return savedBuf.readUInt8(0) + 49;
      } else {
        if (savedBuf.length < 4) return Infinity; //not enough data for message length
        return savedBuf.readInt32BE(0) + 4;
      }
    };
    savedBuf = Buffer.concat([savedBuf, recvBuf]);

    //per peer speed for table ui
    if (!socket.peer) return;
    const peerInfo = peerInfos.find(
      (p) => p.ip === socket.peer.ip && p.port === socket.peer.port
    );
    if (peerInfo && peerInfo.speedometer) {
      peerInfo.speedometer(recvBuf.length); //feed received bytes to speedometer
    }

    //overall speed
    const currentSpeed = downSpeed(msgLen()); //bytes per second
    const now = Date.now();
    lastDataTime = now;
    if (now - lastSpeedUpdate >= UPDATE_INTERVAL) {
      updateDownloadSpeed(currentSpeed);
      lastSpeedUpdate = now;
    }

    while (savedBuf.length >= 4 && savedBuf.length >= msgLen()) {
      callback(savedBuf.slice(0, msgLen()));
      savedBuf = savedBuf.slice(msgLen());
      handshake = false;
    }
  });
};

const msgHandler = (
  msg,
  socket,
  pieces,
  queue,
  torrent,
  file,
  peers,
  filePath
) => {
  if (isHandShake(msg)) socket.write(message.buildInterested());
  //checks if the message is a handshake response, and if so it sends the interested message and hopefully the peer will send an unchoke message.
  else {
    const m = message.parse(msg);
    if (m.id === 0) chokeHandler(socket);
    if (m.id === 1) unchokeHandler(socket, pieces, queue);
    if (m.id === 4) haveHandler(socket, pieces, queue, m.payload);
    if (m.id === 5) bitfieldHandler(socket, pieces, queue, m.payload);
    if (m.id === 7)
      pieceHandler(
        socket,
        pieces,
        queue,
        torrent,
        file,
        filePath,
        m.payload,
        peers
      );
    updatePeerInfo(
      socket.peer.ip,
      socket.peer.port,
      `Downloading`,
      socket.peer.speed
    );
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
  // Attach the bitfield to the socket (or peer) for later use in endgame mode
  socket.peerBitfield = bitfield;
  if (socket.peer) {
    socket.peer.peerBitfield = bitfield;
  }
  if (queueEmpty) requestPiece(socket, pieces, queue);
};

let lastDiskUtilUpdate = 0;
const pieceHandler = (
  socket,
  pieces,
  queue,
  torrent,
  file,
  filePath,
  pieceResp,
  peers
) => {
  if (fileClosed) return; //ignore if file is already closed
  pieces.addReceived(pieceResp);

  let remainingPieces = pieces.getMissingPieces();
  updateRemainingPieces(remainingPieces);

  const offset =
    pieceResp.index * torrent.info["piece length"] + pieceResp.begin;

  pendingWrites++;
  const start = Date.now();
  fs.write(file, pieceResp.block, 0, pieceResp.block.length, offset, () => {
    pendingWrites--;
    const duration = Date.now() - start;
    const speed = pieceResp.block.length / (duration / 1000);
    const now = Date.now();
    if (now - lastDiskUtilUpdate >= 2000) {
      updateDiskUtilization((speed / 2 ** 20).toFixed(2));
      lastDiskUtilUpdate = now;
    }

    //only close file when all pieces are done and all writes are finished
    if (pieces.isDone() && pendingWrites === 0 && !fileClosed) {
      try {
        fs.closeSync(file);
        fileClosed = true;
        updateStatus(`{yellow-fg}Finished Writing{/yellow-fg}`);

        fileTypeFromFile(filePath).then((fileType) => {
          if (fileType && fileType.ext) {
            const newPath = `${filePath}.${fileType.ext}`;
            fs.renameSync(filePath, newPath);
            updateStatus(
              `{green-fg}Download Complete! File saved to ${outputPath}{/green-fg}`
            );
          }
        });
        downloadComplete = true;
      } catch (err) {
        updateError(`{red-fg}Error writing file: ${err} {/red-fg}`);
      }
      updateAverageDownloadSpeed();
      updateRemainingPieces(0);
      updateDiskUtilization(0);
      stopElapsedTimer();
      if (pieces.expireTimer) {
        clearInterval(pieces.expireTimer);
        pieces.expireTimer = null;
      }
    }
  });

  if (!pieces.isDone()) {
    requestPiece(socket, pieces, queue);
  }
};

const requestPiece = (socket, pieces, queue) => {
  if (isPaused) return;
  if (queue.choked) return;
  // log(`queue length: ${queue.length()}`);

  if (socket.destroyed || !socket.writable) return;

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

//following two functions handle speed per peer to display in the table
function updatePeerInfo(ip, port, newStatus, newSpeed) {
  const peer = peerInfos.find((p) => p.ip === ip && p.port === port);
  if (peer) {
    if (typeof newStatus !== "undefined") peer.status = newStatus;
    if (typeof newSpeed !== "undefined") peer.speed = newSpeed;
    peerTable.setData({
      headers: [" Peer IP", " Port", " Status", " Speed"],
      data: peerInfos.map((peer) => [
        peer.ip,
        peer.port,
        peer.status,
        peer.speed,
      ]),
    });
    if (typeof screen !== "undefined" && screen.render) screen.render();
  }
}

function startSpeedUpdates() {
  if (speedUpdateInterval) return; // Prevent multiple intervals
  speedUpdateInterval = setInterval(() => {
    peerInfos.forEach((peer) => {
      if (peer.speedometer) {
        const speed = peer.speedometer();
        peer.speed = speed
          ? ((speed * 8) / 1_000_000).toFixed(2) + " Mb/s"
          : "0";
        updatePeerInfo(peer.ip, peer.port, undefined, peer.speed);
      }
    });
  }, 3000);
}

function refillQueueForPeer(queue, pieces, peerBitfield, torrent) {
  const missingBlocks = pieces.listMissingBlocksForPeer(peerBitfield);
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

function isEndgameMode(pieces) {
  const missingPieces = pieces.listMissingPieces();
  if (missingPieces.length === 0) return false;
  if (missingPieces.length > 10) return false;
  // log("endgamemode called");
  const lastPieceIndex = missingPieces[missingPieces.length - 1];
  if (lastPieceIndex === undefined) return false;
  const missingBlocks = pieces.listMissingBlocksForPiece(lastPieceIndex);
  return missingBlocks.length > 0;
}

//instead of sending block request to a peer and waiting for it's response that wheather it has the block or not, we just send the request to all the peers who have the block listed in their bitfields and take the response from the peer that answers first and ignore the rest of responses
function endgameRequest(peers, pieces, queue, torrent) {
  const missingPieces = pieces.listMissingPieces();
  if (missingPieces.length > 10) return;

  for (const pieceIndex of missingPieces) {
    // log(`Endgame mode: requesting missing blocks for piece ${pieceIndex}`);
    const missingBlocks = pieces.listMissingBlocksForPiece(pieceIndex);

    for (const block of missingBlocks) {
      for (const peer of peers) {
        if (
          peer.peerBitfield &&
          peer.peerBitfield[pieceIndex] === 1 &&
          peer.socket &&
          !peer.socket.destroyed
        ) {
          const pieceBlock = {
            index: pieceIndex,
            begin: block * BLOCK_LEN,
            length: blockLen(torrent, pieceIndex, block),
          };
          //send request directly to this peer's socket
          peer.socket.write(message.buildRequest(pieceBlock));
          pieces.addRequested(pieceBlock);
          // log(
          //   `Sent endgame request for block ${pieceIndex}:${block} to peer ${peer.ip}:${peer.port}`
          // );
        }
      }
    }
  }
}

export { download, iteratePeers, togglePause };
