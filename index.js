#!/usr/bin/env node

import { getPeers } from "./src/tracker.js";
import { open, size } from "./src/torrent-parser.js";
import { iteratePeers } from "./src/download.js";
import { infoHash } from "./src/torrent-parser.js";
import { buildDHT } from "./src/dht.js";
import {
  updateTorrentName,
  updateError,
  updateStatus,
  updatePeers,
  updateSize,
  setOnTorrentFileSelected,
  setDownloadStarted,
} from "./screen/ui.js";
import dns from "node:dns";
import { log } from "./src/util.js";
import path from "path";
import fs from "fs";
import os from "os";

const homeDir = os.homedir();
let outputPath;
let downloadsDir = path.join(homeDir, "Downloads");
let peerMap;

if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

const showErrorAndExit = (message) => {
  updateError(message + "\nExiting in 5 seconds...");
};

//backup check, might remove later
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

function startDownloadWithFile(filePath) {
  setDownloadStarted(true);
  input = filePath;
  main();
}

setOnTorrentFileSelected(startDownloadWithFile);

function checkForTorrentFile() {
  if (!input) {
    updateStatus(
      `{yellow-fg}No torrent file selected. Press 'o' to pick a file.{/yellow-fg}`
    );
  } else {
    main();
  }
}

const main = async () => {
  const online = await checkInternetConnection();
  if (!online) return;

  //backup check, might remove later
  if (!input.endsWith(".torrent")) {
    showErrorAndExit("Please provide a valid torrent file");
    await new Promise((resolve) => setTimeout(resolve, 5000));
    process.exit(1);
  }
  // log(`input: ${input}`);
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

let peers = [];
function startDownload() {
  peerMap = new Map();
  //start getting peers from dht in the background
  buildDHT(infoHash(torrent), (peer, totalPeers) => {
    // log(`New peer found (${totalPeers} total): ${peer.host}:${peer.port}`);
    updatePeers(peerMap.size);
  });
  getPeers(torrent, (callback) => {
    updateStatus("Connecting with peers...");
    let fileName = new Buffer.from(torrent.info.name).toString("utf-8");
    outputPath = path.join(downloadsDir, fileName);
    // log(`path: ${outputPath}`);
    updateTorrentName(fileName);
    updateSize(Number(size(torrent).readBigUInt64BE()));
    peers = callback;
    updateStatus(`{yellow-fg}Preparing to download{/yellow-fg}`);
    updatePeers(peerMap.size);
    iteratePeers(peers, torrent, outputPath);
  });
}

checkForTorrentFile();

export default function checkInstall() {
  console.log("BitLit is installed successfully.");
}

export { torrent, pieceSize, peers, outputPath, peerMap };
