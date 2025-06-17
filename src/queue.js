import { blocksPerPiece, BLOCK_LEN, blockLen } from "./torrent-parser.js";

class Queue {
  #torrent;
  #queue;
  #queuedBlocks;

  constructor(torrent) {
    this.#torrent = torrent;
    this.#queue = [];
    this.#queuedBlocks = new Set();
    this.choked = true;
  }

  queue(pieceIndex) {
    const nBlocks = blocksPerPiece(this.#torrent, pieceIndex);
    for (let i = 0; i < nBlocks; i++) {
      const pieceBlock = {
        index: pieceIndex,
        begin: i * BLOCK_LEN,
        length: blockLen(this.#torrent, pieceIndex, i),
      };
      const key = `${pieceBlock.index}:${pieceBlock.begin}`;
      if (!this.#queuedBlocks.has(key)) {
        if (this.#queue.length < 10000) {
          this.#queue.push(pieceBlock);
          this.#queuedBlocks.add(key);
        } else {
          break;
        }
      }
      this.#queue.push(pieceBlock);
      this.#queuedBlocks.add(key);
    }
  }

  // queueBlock(pieceBlock) {
  //   const key = `${pieceBlock.index}:${pieceBlock.begin}`;
  //   if (!this.#queuedBlocks.has(key)) {
  //     if (this.#queue.length < 10000) {
  //       this.#queue.push(pieceBlock);
  //       this.#queuedBlocks.add(key);
  //     }
  //   }
  // }

  queueBlock(pieceBlock, allowDuplicate = false) {
    const key = `${pieceBlock.index}:${pieceBlock.begin}`;
    if (allowDuplicate || !this.#queuedBlocks.has(key)) {
      if (this.#queue.length < 10000) {
        this.#queue.push(pieceBlock);
        if (!allowDuplicate) {
          this.#queuedBlocks.add(key);
        }
      }
    }
  }

  dequeue() {
    const block = this.#queue.shift();
    if (block) {
      const key = `${block.index}:${block.begin}`;
      this.#queuedBlocks.delete(key);
    }
    return block;
  }

  peek() {
    return this.#queue[0];
  }

  length() {
    return this.#queue.length;
  }
}

export default Queue;
