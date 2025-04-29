import { getPeers } from "./tracker.js";
import { open } from "./torrent-parser.js";

const torrent = open("Sniper Elite 5 [DODI Repack].torrent");

getPeers(torrent, (peers) => {
  console.log("list of peers:", peers);
});
