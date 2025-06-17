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
import dns from "node:dns";
import { log } from "./src/util.js";

const showErrorAndExit = (message) => {
  updateError(message + "\nExiting in 5 seconds...");
};

const checkInternetConnection = () => {
  return new Promise((resolve) => {
    dns.lookup("google.com", (err) => {
      if (err) {
        showErrorAndExit(
          "No internet connection. Please check your network and try again."
        );
        log("Failed to connect");
        setTimeout(() => {
          process.exit(1);
        }, 5000);
        resolve(false);
      } else {
        log("Internet connection is available.");
        resolve(true);
      }
    });
  });
};

const input =
  "./torrents/kali-linux-2025.2-cloud-genericcloud-arm64-tar-xz.torrent";
let torrent;
let pieceSize;

const main = async () => {
  const online = await checkInternetConnection();
  if (!online) return;

  if (!input.endsWith(".torrent")) {
    showErrorAndExit("Please provide a valid torrent file");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    process.exit(1);
  }

  try {
    torrent = open(input);
    pieceSize = torrent.info["piece length"];
    startDownload();
  } catch (err) {
    showErrorAndExit(
      "Could not open torrent file. Please check the file path and try again."
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
    process.exit(1);
  }
};
// const input = "./torrents/linuxmint-22.1-cinnamon-64bit.iso.torrent";
// if (!input.endsWith(".torrent")) {
//   showErrorAndExit("Please provide a valid torrent file");
//   await new Promise((resolve) => setTimeout(resolve, 5000));
//   process.exit(1);
// }
let peers = [];
function startDownload() {
  getPeers(torrent, (callback) => {
    updateStatus("Connecting with peers...");
    let path = new Buffer.from(torrent.info.name).toString("utf-8");
    log(`path: ${path}`);
    updateTorrentName(path);
    updateSize(Number(size(torrent).readBigUInt64BE()));
    peers = callback;
    updatePeers(peers.length);
    iteratePeers(peers, torrent, path);
  });
}

main();
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

//https://linuxtracker.org/
//kali-linux-2025.2-cloud-genericcloud-arm64-tar-xz
//kali-nethunter-2025.2-es2-pie-minimal-zip
//CentOS Stream 8 Boot ISO
//"./torrents/linuxmint-22.1-cinnamon-64bit.iso.torrent"
// "./torrents/Sniper Elite 5 [DODI Repack].torrent"
// "./torrents/1torr.torrent"
//const torrent = torrentParser.open(process.argv[2]);
//node index.js /file/path/to/name-of-torrent.torrent
export { torrent, pieceSize, peers };
