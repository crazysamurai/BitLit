import dgram from "node:dgram"; // for udp communication
import crypto from "node:crypto";
import * as torrentParser from "./torrent-parser.js";
import { genId } from "./util.js";
import { group } from "./groups.js";
import { updateStatus } from "../screen/ui.js";
import { log } from "./util.js";
import { promises as dns } from "node:dns";
import { updateSeedersLeechers } from "../screen/ui.js";

export const getPeers = async (torrent, callback) => {
  updateStatus("Looking for trackers...");
  const socket = dgram.createSocket("udp4");

  let rawUrl;
  let listLength = 0; //length of announce-list
  let flag = false; //flag to check if announce-list is present

  let peerMap = new Map(); //to store unique peers
  let trackerMap = new Map(); //to store resolve status of trackers

  if (torrent["announce-list"]) {
    flag = true;
    listLength = torrent["announce-list"].length;
  } else {
    listLength = 1;
  }

  socket.on("message", (res, info) => {
    log(`Got response from ${info.address}:${info.port}`);

    const type = respType(res);

    if (type === "connect") {
      const connResp = parsedConnResp(res);
      const key = info.address + ":" + info.port;
      const resolve = trackerMap.get(key);

      if (resolve) {
        trackerMap.delete(key);
        resolve({ connResp, info });
      }
    }

    if (type === "announce") {
      const announceResp = parsedAnnounceResp(res);
      const trackerSource = `${info.address}:${info.port}`;

      log(
        `Tracker ${trackerSource} gave ${
          announceResp.peers.length
        } peers:\n${JSON.stringify(announceResp.peers, null, 2)}`
      );

      announceResp.peers.forEach((peer) => {
        if (peer?.ip && peer?.port) {
          //check to avoid adding malformed peers
          const key = `${peer.ip}:${peer.port}`;
          peerMap.set(key, peer);
        }
      });
    }
  });

  for (let i = 0; i < listLength; i++) {
    try {
      if (flag) {
        rawUrl = new URL(
          new Buffer.from(torrent["announce-list"][i][0]).toString("utf-8")
        );
        if (!rawUrl.port) rawUrl.port = "6969";
        // log(`tracker ${i}: ${rawUrl}`);
      } else {
        rawUrl = new URL(new Buffer.from(torrent.announce).toString("utf-8"));
        if (!rawUrl.port) rawUrl.port = "6969";
      }
      log(`Trying tracker: ${rawUrl.href}`);

      const { address: ip } = await dns.lookup(rawUrl.hostname);
      const trackerKey = `${ip}:${rawUrl.port}`;
      rawUrl.ip = ip; //add ip to rawUrl for later use

      const response = await new Promise((resolve, reject) => {
        let timeout;

        trackerMap.set(trackerKey, resolve);
        udpSend(socket, buildConnReq(), rawUrl, () => {}); //send connection request to tracker

        timeout = setTimeout(() => {
          trackerMap.delete(trackerKey);
          reject(new Error("No response from tracker"));
        }, 2000);
      });

      const announceReq = buildAnnounceReq(
        response.connResp.connectionId,
        torrent
      );
      udpSend(socket, announceReq, rawUrl, () => {});

      log(
        `Connected to tracker: 
          ${rawUrl.href.slice(rawUrl.href.indexOf("://") + 3)}`
      );
    } catch (err) {
      log(`err.message: ${rawUrl.href.slice(rawUrl.href.indexOf("://") + 3)}`);
      continue;
    }
  }

  // Wait a bit to allow announce responses to come in
  await new Promise((res) => setTimeout(res, 2000));

  log(
    `values: ${JSON.stringify(Array.from(peerMap.values()), null, 2)}, size: ${
      peerMap.size
    }`
  );
  callback(Array.from(peerMap.values())); //convert map to array and return unique peers
};

function udpSend(socket, message, rawUrl, callback = () => {}) {
  log(`Sending UDP packet to ${rawUrl.hostname}:${rawUrl.port}`);
  socket.send(
    message,
    0,
    message.length,
    rawUrl.port,
    rawUrl.ip || rawUrl.hostname,
    callback
  );
}

function respType(res) {
  const action = res.readUInt32BE(0);
  if (action === 0) return "connect";
  if (action === 1) return "announce";
}

function buildConnReq() {
  //connection request format
  // Offset  Size            Name            Value
  // 0       64-bit integer  connection_id   0x41727101980
  // 8       32-bit integer  action          0 // connect
  // 12      32-bit integer  transaction_id  ? // random
  // 16

  const buf = Buffer.allocUnsafe(16);

  //connection id : 0x41727101980 default 64bit magic number for bittorrent client incoming UDP packet identification by tracker
  buf.writeUInt32BE(0x417, 0); // we need to split the number into two because of js limitation
  buf.writeUInt32BE(0x27101980, 4); //(number, starting index)

  //action
  buf.writeUInt32BE(0, 8); //0 means connection request

  //transacation id
  crypto.randomBytes(4).copy(buf, 12); //transaction id can be any random 32 bit number that the tracker will respond to
  return buf; //message
}

function parsedConnResp(res) {
  // Offset  Size            Name            Value
  // 0       32-bit integer  action          0 // connect
  // 4       32-bit integer  transaction_id
  // 8       64-bit integer  connection_id
  // 16

  const action = res.readUInt32BE(0);
  const transactionId = res.readUInt32BE(4);
  const connectionId = res.slice(8); //leave it as buffer, will use in connId in buildAnnounceReq
  return { action, transactionId, connectionId };
}

function buildAnnounceReq(connId, torrent, port = 6881) {
  //port has to be between 6881-6889
  // Offset  Size    Name    Value
  // 0       64-bit integer  connection_id
  // 8       32-bit integer  action          1 // announce
  // 12      32-bit integer  transaction_id
  // 16      20-byte string  info_hash
  // 36      20-byte string  peer_id
  // 56      64-bit integer  downloaded
  // 64      64-bit integer  left
  // 72      64-bit integer  uploaded
  // 80      32-bit integer  event           0 // 0: none; 1: completed; 2: started; 3: stopped
  // 84      32-bit integer  IP address      0 // default
  // 88      32-bit integer  key             ? // random
  // 92      32-bit integer  num_want        -1 // default
  // 96      16-bit integer  port            ? // should be betwee
  // 98

  const buf = Buffer.allocUnsafe(98);

  //connection id
  connId.copy(buf, 0);

  //action
  buf.writeUInt32BE(1, 8);

  //transactionId
  crypto.randomBytes(4).copy(buf, 12);

  //info hash
  torrentParser.infoHash(torrent).copy(buf, 16);

  //peerId
  genId().copy(buf, 36);

  //downloaded
  Buffer.alloc(8).copy(buf, 56);

  //left
  torrentParser.size(torrent).copy(buf, 64);

  // uploaded
  Buffer.alloc(8).copy(buf, 72);

  // event
  buf.writeUInt32BE(0, 80);

  // ip address
  buf.writeUInt32BE(0, 84);

  // key
  crypto.randomBytes(4).copy(buf, 88);

  // num want
  buf.writeInt32BE(-1, 92);

  // port
  buf.writeUInt16BE(port, 96);

  return buf;
}

function parsedAnnounceResp(res) {
  // Offset      Size            Name            Value
  // 0           32-bit integer  action          1 // announce
  // 4           32-bit integer  transaction_id
  // 8           32-bit integer  interval
  // 12          32-bit integer  leechers
  // 16          32-bit integer  seeders
  // 20 + 6 * n  32-bit integer  IP address
  // 24 + 6 * n  16-bit integer  TCP port
  // 20 + 6 * N
  const action = res.readUInt32BE(0);
  const transactionId = res.readUInt32BE(4);
  const leechers = res.readUInt32BE(12);
  const seeders = res.readUInt32BE(16);
  const peers = group(res.slice(20), 6).map((address) => {
    //The addresses come in groups of 6 bytes, the first 4 represent the IP address and the next 2 represent the port
    return {
      ip: address.slice(0, 4).join("."),
      port: address.readUInt16BE(4),
    };
  });
  updateSeedersLeechers(seeders, leechers);
  return { action, transactionId, leechers, seeders, peers };
}
