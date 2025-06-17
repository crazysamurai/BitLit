import { BLOCK_LEN, blocksPerPiece } from "./torrent-parser.js";

import { log } from "./util.js";

class Pieces {
  #requested;
  #received;
  constructor(torrent) {
    function buildPiecesArray() {
      const nPieces = torrent.info.pieces.length / 20;
      const arr = new Array(nPieces).fill(null);
      return arr.map((_, i) =>
        new Array(blocksPerPiece(torrent, i)).fill(false)
      );
    }

    this.requestTimestamps = {};
    this.REQUEST_TIMEOUT = 10000;

    this.#requested = buildPiecesArray();
    this.#received = buildPiecesArray();
  }

  addRequested(pieceBlock) {
    const blockIndex = pieceBlock.begin / BLOCK_LEN;
    this.#requested[pieceBlock.index][blockIndex] = true;
    this.requestTimestamps[
      `${pieceBlock.index}:${pieceBlock.begin / BLOCK_LEN}`
    ] = Date.now();
  }

  addReceived(pieceBlock) {
    const blockIndex = pieceBlock.begin / BLOCK_LEN;

    log(
      `Received block for piece ${pieceBlock.index}, block index ${blockIndex}`
    );

    this.#received[pieceBlock.index][blockIndex] = true;
    delete this.requestTimestamps[
      `${pieceBlock.index}:${pieceBlock.begin / BLOCK_LEN}`
    ];
  }

  needed(pieceBlock) {
    if (this.#requested.every((blocks) => blocks.every((i) => i))) {
      this.#requested = this.#received.map((blocks) => blocks.slice());
    }
    const blockIndex = pieceBlock.begin / BLOCK_LEN;
    return !this.#requested[pieceBlock.index][blockIndex];
  }

  getMissingPieces() {
    // Count pieces where not all blocks are received
    return this.#received.filter((blocks) => !blocks.every(Boolean)).length;
  }

  expireOldRequests() {
    const now = Date.now();
    for (const key in this.requestTimestamps) {
      if (now - this.requestTimestamps[key] > this.REQUEST_TIMEOUT) {
        // Parse key
        const [pieceIndex, blockIndex] = key.split(":").map(Number);
        // Mark as not requested
        this.#requested[pieceIndex][blockIndex] = false;
        delete this.requestTimestamps[key];
      }
    }
  }

  isDone() {
    for (let i = 0; i < this.#received.length; i++) {
      if (!this.#received[i].every(Boolean)) {
        log(`Piece ${i} not complete:`, this.#received[i]);
        return false;
      }
    }
    return true;
  }

  getMissingBlocksForPeer(peerBitfield) {
    const missingBlocks = [];
    for (let pieceIndex = 0; pieceIndex < this.#received.length; pieceIndex++) {
      if (peerBitfield && peerBitfield[pieceIndex]) {
        const blocks = this.#received[pieceIndex];
        for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
          if (!blocks[blockIndex]) {
            missingBlocks.push({ pieceIndex, blockIndex });
          }
        }
      }
    }
    return missingBlocks;
  }
}
export default Pieces;
