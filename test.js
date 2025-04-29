import fs from "fs";
import bencode from "bencode";

// Read and decode the torrent file
const torrentFile = "1torr.torrent"; // Replace with your torrent file path
const torrentData = bencode.decode(fs.readFileSync(torrentFile));

// const buf = new Buffer.from(torrentData["announce-list"]);

// console.log(torrentData["announce-list"].length);

for (let i = 0; i < torrentData["announce-list"].length; i++) {
  let buf = new Buffer.from(torrentData["announce-list"][i][0]);

  console.log(buf.toString("utf-8"));
}
