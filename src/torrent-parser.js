import fs from "fs";
import bencode from "bencode";
import crypto from "node:crypto";

const open = (filePath) => {
  const fileData = fs.readFileSync(filePath);
  const torrent = bencode.decode(fileData);
  return torrent;
};

//we must send the info hash as part of the request to the tracker, we’re saying we want the list of peers that can share this exact torrent.
const infoHash = (torrent) => {
  const info = bencode.encode(torrent.info); //torrent object has an info property same as it has announce
  return crypto.createHash("sha1").update(info).digest(); // SHA1 is one of many hashing functions but it’s the one used by bittorrent so in our case no other hashing function will do. We want to use a hash because it’s a compact way to uniqely identify the torrent. A hashing function returns a fixed length buffer (in this case 20-bytes long).
};

const size = (torrent) => {
  const size = torrent.info.files
    ? torrent.info.files.map((file) => file.length).reduce((a, b) => a + b) //if multiple files, traverse the array of files and sum their lengths
    : torrent.info.length; //if just one file

  const buf = Buffer.allocUnsafe(8);
  buf.writeBigInt64BE(BigInt(size)); //file size may increase 32bits so we need to use 64bits
  return buf;
};

const BLOCK_LEN = Math.pow(2,14)

const pieceLen = (torrent, pieceIndex) => {
  const totalLength = Number(size(torrent).readBigUInt64BE());
  const pieceLength = torrent.info['piece length'];
  const lastPieceLength = totalLength % pieceLength;
  const lastPieceIndex = Math.floor(totalLength/pieceLength);
  return lastPieceIndex === pieceIndex ? lastPieceIndex : lastPieceLength;
}

const blocksPerPiece = (torrent, pieceIndex)=>{
  const pieceLength = pieceLen(torrent, pieceIndex);
  return Math.ceil(pieceLength / BLOCK_LEN);
}

const blockLen = (torrent, pieceIndex, blockIndex)=>{
  const pieceLength = pieceLen(torrent, pieceIndex);

  const lastPieceLength = pieceLength % BLOCK_LEN;
  const lastPieceIndex = Math.floor(pieceLength / BLOCK_LEN);

  return blockIndex === lastPieceIndex ? lastPieceLength : BLOCK_LEN;
}

export { open, size, infoHash, BLOCK_LEN, pieceLen, blocksPerPiece, blockLen };
