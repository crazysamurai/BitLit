import net from "node:net"; //for TCP connections

const iteratePeers = (peers) => {
  peers.forEach((peer) => download(peer));
};

const download = (peer) => {
  //   console.log("downloading from peer:", peer);
  const socket = net.socket();

  socket.on("error", (err) => {
    console.error("Socket error:", err.message);
  });

  socket.connect(peer.port, peer.ip, () => {});

  socket.on("data", (data) => {});
};

export { download, iteratePeers };
