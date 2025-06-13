import { getPeers } from "./src/tracker.js";
import { open, size } from "./src/torrent-parser.js";
import { iteratePeers } from "./src/download.js";
import {
  updateTorrentName,
  updateError,
  updateStatus,
  updatePeers,
  updateSize,
} from "./screen/ui.js";

import { log } from "./src/util.js";

const showErrorAndExit = (message) => {
  updateError(message + "\nExiting in 5 seconds...");
};

const input = "./torrents/CentOS Stream 8 Boot ISO.torrent";
if (!input.endsWith(".torrent")) {
  showErrorAndExit("Please provide a valid torrent file");
  await new Promise((resolve) => setTimeout(resolve, 5000));
  process.exit(1);
}

let torrent;

try {
  torrent = open(input);
} catch (err) {
  showErrorAndExit(
    "Could not open torrent file. Please check the file path and try again."
  );
  await new Promise((resolve) => setTimeout(resolve, 5000));
  process.exit(1);
}

//https://linuxtracker.org/
//CentOS Stream 8 Boot ISO
//"./torrents/linuxmint-22.1-cinnamon-64bit.iso.torrent"
// "./torrents/Sniper Elite 5 [DODI Repack].torrent"
// "./torrents/1torr.torrent"
//const torrent = torrentParser.open(process.argv[2]);
//node index.js /file/path/to/name-of-torrent.torrent

const pieceSize = torrent.info["piece length"];

getPeers(torrent, (callback) => {
  updateStatus("Connecting with peers...");
  let path = new Buffer.from(torrent.info.name).toString("utf-8");
  updateTorrentName(path);
  updateSize(Number(size(torrent).readBigUInt64BE()));
  updatePeers(callback.length);
  iteratePeers(callback, torrent, path);
});

// download(torrent, torrent.info.name);

// log("Torrent Info Structure:");
// for (let key in torrent.info) {
//   if (key === "pieces") {
//     log(`${key}: <Binary data of length ${torrent.info[key].length}>`);
//     log(typeof torrent.info[key]);
//   } else if (Buffer.isBuffer(torrent.info[key])) {
//     log(`${key}: ${torrent.info[key].toString("utf8")}`);
//   } else {
//     log(`${key}: ${JSON.stringify(torrent.info[key])}`);
//   }
// }

export { torrent, pieceSize };
