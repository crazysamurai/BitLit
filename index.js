import { getPeers } from "./src/tracker.js";
import { open } from "./src/torrent-parser.js";
import { iteratePeers } from "./src/download.js";
import {download} from "./src/download.js"
import {updatetorrentName, updateError} from "./screen/ui.js"

const showErrorAndExit = (message) => {
    updateError(message + "\nExiting in 5 seconds...");
};

const input = "./torrents/linuxmint-22.1-cinnamon-64bit.iso.torrent"
if(!input.endsWith(".torrent")){
    showErrorAndExit("Please provide a valid torrent file")
    await new Promise(resolve => setTimeout(resolve, 5000));
    process.exit(1)
}

let torrent;

try{
    torrent = open(input)
}catch(err){
    showErrorAndExit("Could not open torrent file. Please check the file path and try again.")
    await new Promise(resolve => setTimeout(resolve, 5000));
    process.exit(1)
}

// "./torrents/Sniper Elite 5 [DODI Repack].torrent"
// "./torrents/1torr.torrent"
//const torrent = torrentParser.open(process.argv[2]);
//node index.js /file/path/to/name-of-torrent.torrent

getPeers(torrent, (callback)=>{
    // console.log(callback)
    let path = new Buffer.from(torrent.info.name).toString('utf-8')
    updatetorrentName(path)
    iteratePeers(callback, torrent, path);
});

// download(torrent, torrent.info.name);

export {torrent}