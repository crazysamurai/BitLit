import { getPeers } from "./src/tracker.js";
import { open, size } from "./src/torrent-parser.js";
import { iteratePeers } from "./src/download.js";
import {download} from "./src/download.js"
import {updatetorrentName, updateError, updateStatus, updatePeers, updateSize} from "./screen/ui.js"

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

//"./torrents/linuxmint-22.1-cinnamon-64bit.iso.torrent"
// "./torrents/Sniper Elite 5 [DODI Repack].torrent"
// "./torrents/1torr.torrent"
//const torrent = torrentParser.open(process.argv[2]);
//node index.js /file/path/to/name-of-torrent.torrent

getPeers(torrent, (callback)=>{
    // console.log(callback)
    updateStatus("Connecting with peers...")
    let path = new Buffer.from(torrent.info.name).toString('utf-8')
    updatetorrentName(path)
    updateSize(Number(size(torrent).readBigUInt64BE()))
    updatePeers(callback.length)
    iteratePeers(callback, torrent, path);
});

// download(torrent, torrent.info.name);

export {torrent}