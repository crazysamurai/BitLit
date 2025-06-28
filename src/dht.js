import DHT from "bittorrent-dht"
import { log } from './util.js'

const buildDHT = (infoHash, peerMap, onPeerFound) => {

    const dht = new DHT()

    dht.listen(20000, function(){
        log('listening')
    })

    dht.on('peer', function(peer, infoHash, from){
        // log(`potential peer: ${peer.host} : ${peer.port} : through: ${from.address} : ${from.port}`)
        if(!peerMap.has(`${peer.host}:${peer.port}`)) peerMap.set(`${peer.host}:${peer.port}`, peer);
        if (onPeerFound) {
            onPeerFound(peer, peerMap.size);
        }
    })

    try {
        dht.lookup(infoHash, (err, peers) => {
            if (err) {
                log(`DHT lookup error: ${err.message}`);
            } else {
                log(`DHT lookup completed. Found ${peerMap.size} peers.`);
            }
        });
    } catch (err) {
        log(`DHT error: ${err.message}`);
    }
}

export { buildDHT }