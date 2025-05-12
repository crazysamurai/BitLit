import {pieceIndex, blocksPerPiece, BLOCK_LEN} from "./torrent-parser"
import {torrent} from "../index"

class Queue {
    #torrent;
    #queue;
    constructor(torrent){
        this.#torrent = torrent;
        this.#queue = [];
        this.choked = true;
    }

    queue(pieceIndex) {
        const nBlocks = blocksPerPiece(this.#torrent, pieceIndex);
        for (let i = 0; i < nBlocks; i++) {
          const pieceBlock = {
            index: pieceIndex,
            begin: i * BLOCK_LEN,
            length: this.blockLen(this.#torrent, pieceIndex, i)
          };
          this.#queue.push(pieceBlock);
          //pieceBlock objects have the same structure as the payload when we send a request message so we can pass them to the request builder directly.
        }
    }
    
    dequeue() { return this.#queue.shift(); }
    
    peek() { return this.#queue[0]; }
    
    length() { return this.#queue.length; }
} 

export default Queue;