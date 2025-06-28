#!/usr/bin/env node

import { getPeers } from "./src/tracker.js";
import { open, size } from "./src/torrent-parser.js";
import { iteratePeers } from "./src/download.js";
import {
  updateTorrentName,
  updateError,
  updateStatus,
  updatePeers,
  updateSize,
  setOnTorrentFileSelected,
  setOnMagnetLinkSelected,
  setDownloadStarted,
} from "./screen/ui.js";
import dns from "node:dns";
import { log } from "./src/util.js";
import path from "path";
import fs from "fs";
import os from "os"
import { handleMagnet } from "./src/magnet-handler.js";

const homeDir = os.homedir()
let outputPath;

let downloadsDir = path.join(homeDir, "Downloads");
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

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
        // log("Failed to connect");
        setTimeout(() => {
          process.exit(1);
        }, 5000);
        resolve(false);
      } else {
        // log("Internet connection is available.");
        resolve(true);
      }
    });
  });
};

let input;
let torrent;
let pieceSize;
let peers = [];
let peerMap = new Map(); //to store unique peers

// function startDownloadWithFile(filePath) {
//   setDownloadStarted(true);
//   input = filePath;
//   main();
// }
// log(`input link: ${input}`)
// setOnTorrentFileSelected(startDownloadWithFile);

setOnMagnetLinkSelected((magnetLink) => {
  setDownloadStarted(true)
  input = magnetLink;
  main();
});

// Set up the torrent file handler
setOnTorrentFileSelected((filePath) => {
  setDownloadStarted(true)
  input = filePath;
  main();
});

function checkForTorrentFile() {
  if (!input) {
    updateStatus(
      `{yellow-fg}No torrent file selected. Press 'o' to pick a .torrent file or 'm' to paste magnet link{/yellow-fg}.`
    );
  } else {
    main();
  }
}

const main = async () => {
  log('Starting main with input:', input ? input.substring(0, 100) + (input.length > 100 ? '...' : '') : 'empty');

  const online = await checkInternetConnection();
  if (!online) return;

  if (!input) {
    showErrorAndExit("No input provided");
    return;
  }

  if (!input.endsWith(".torrent") && !input.startsWith('magnet:')) {
    showErrorAndExit("Please provide a valid torrent file or magnet link");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    process.exit(1);
  }

  if(input.endsWith(".torrent")){
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
  }else if (input.startsWith('magnet:')) {
    log('Processing magnet link:', input.substring(0, 100) + (input.length > 100 ? '...' : ''));
    handleMagnet(input, peerMap);
  }
};

function startDownload() {
  getPeers(torrent, peerMap, (callback) => {
    updateStatus("Connecting with peers...");
    let fileName = new Buffer.from(torrent.info.name).toString("utf-8");
    outputPath = path.join(downloadsDir, fileName);
    // log(`path: ${outputPath}`);
    updateTorrentName(fileName);
    updateSize(Number(size(torrent).readBigUInt64BE()));
    peers = callback;
    updateStatus(`{yellow-fg}Preparing to download{/yellow-fg}`);
    updatePeers(peers.length);
    iteratePeers(peers, torrent, outputPath);
  });
}

checkForTorrentFile();

export default function checkInstall() {
  console.log("BitLit is installed successfully.");
}

export { torrent, pieceSize, peers, outputPath };