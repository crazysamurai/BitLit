import { getPeers } from "./src/tracker.js";
import { open } from "./src/torrent-parser.js";
import { iteratePeers } from "./src/download.js";
import {download} from "./src/download.js"

const torrent = open("./torrents/linuxmint-22.1-cinnamon-64bit.iso.torrent");
//const torrent = torrentParser.open(process.argv[2]);
//node index.js /file/path/to/name-of-torrent.torrent

download(torrent, torrent.info.name);

getPeers(torrent, (peers) => {
  iteratePeers(peers);
});

export { torrent };
