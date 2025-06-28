import magnet from "magnet-uri";
import { log } from "./util.js";
import { buildDHT } from "./dht.js";
import net from "node:net";
import { buildHandShake } from "./message.js";

const handleMagnet = (magnetLink, peerMap) => {
  const parsedMagnet = magnet(magnetLink);
  let isProcessingPeers = false;

  log('Parsed Magnet Link:', {
    'Info Hash': parsedMagnet.infoHash,
    'Name': parsedMagnet.name || 'N/A',
    'Trackers': parsedMagnet.tr?.length ? parsedMagnet.tr : 'No trackers',
    'Exact Topic': parsedMagnet.xt || 'N/A',
    'Display Name': parsedMagnet.dn || 'N/A'
  });

  buildDHT(parsedMagnet.infoHash, peerMap, (peer, totalPeers) => {
    log(`New peer found (${totalPeers} total): ${peer.host}:${peer.port}`);
  });

  if (!isProcessingPeers) {
    isProcessingPeers = true;
    //small delay to allow more peers to be discovered
    setTimeout(() => {
      peerMap.forEach((peer) => {
        log(`Connecting to peer: ${peer.host}:${peer.port}`);
        getMetadata(parsedMagnet, peer);
      });
    }, 2000);
  }
};

const getMetadata = (parsedMagnet, peer) => {
    const socket = net.createConnection({
        host: peer.ip || peer.host,
        port: peer.port,
      });

      socket.on("connect", () => {
        // log(`Connected to peer: ${peer.host}:${peer.port}`);
        socket.write(buildHandShake(parsedMagnet));
        // log(`return value: ${buildHandShake(parsedMagnet)}`);
      });

      let handshakeBuffer = Buffer.alloc(0);

socket.on("data", (chunk) => {
  handshakeBuffer = Buffer.concat([handshakeBuffer, chunk]);

  if (handshakeBuffer.length >= 68) {
    log("Got response:");
    log("Raw hex:", handshakeBuffer.toString("hex"));
    if (isHandShake(handshakeBuffer)) {
      log("✅ Valid handshake received");
      // proceed to extended handshake...
    } else {
      log("❌ Invalid handshake format");
    }
    socket.removeAllListeners("data"); // prevent duplicate
  }
});
 

      socket.on("close", () => {
        log(`Connection closed to peer: ${peer.host}:${peer.port}`);
      })

      socket.on("error", (err) => {
        log(`Error connecting to peer: ${peer.host}:${peer.port} : ${err}`);
      });
}


export {handleMagnet}