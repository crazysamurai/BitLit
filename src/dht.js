import DHT from "bittorrent-dht";
import { log } from "./util.js";
import { peerMap } from "../index.js";
import { updateStatus } from "../screen/ui.js";

const buildDHT = (infoHash, onPeerFound) => {
  // log(`infoHash: ${infoHash.toString("hex")}`);

  const dht = new DHT({
    maxPeers: 2000, // Increase the maximum number of peers
    nodeId: null, // Let the library generate a random node ID
    bootstrap: true, // Use default bootstrap nodes
  });

  dht.listen(6881, function () {
    // log("listening");
  });

  dht.on("error", (err) => {
    log(`DHT error: ${err.message}`);
    updateStatus(`{red-fg}DHT error: ${err.message}{/red-fg}`);
  });

  dht.on("peer", function (peer, infoHash, from) {
    // log(
    //   `potential peer: ${peer.host} : ${peer.port} : through: ${from.address} : ${from.port}`
    // );
    if (peer?.host && peer?.port) {
      const key = `${peer.host}:${peer.port}`;
      if (peerMap.has(key)) log(`${key} already exists`);
      else if (!peerMap.has(key)) {
        // log(`New peer added: ${key}`);
        const normalizedPeer = {
          ip: peer.host, // Use 'ip' instead of 'host' to match tracker format
          port: peer.port,
        };
        peerMap.set(key, normalizedPeer);
        if (onPeerFound) onPeerFound(normalizedPeer, peerMap.size);
      }
    }
  });

  try {
    dht.lookup(infoHash, (err, peers) => {
      if (err) {
        // log(`DHT lookup error: ${err.message}`);
        updateStatus(`{red-fg}DHT lookup error: ${err.message}{/red-fg}`);
      } else {
        // log(`DHT lookup completed. Total peers: ${peerMap.size}`);
        updateStatus(
          `{green-fg}DHT lookup completed. Total peers: ${peerMap.size}{/green-fg}`
        );
      }
    });
  } catch (err) {
    updateStatus(`{red-fg}DHT error: ${err.message}{/red-fg}`);
  }
};

export { buildDHT };
