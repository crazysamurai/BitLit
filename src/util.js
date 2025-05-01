import crypto from 'node:crypto'

let id = null;

export const genId = () =>{
    if(!id){
        id = crypto.randomBytes(20)
        Buffer.from('-BL0001-').copy(id,0) //BitLit
    }
    return id
}
//“peer id” is used to uniquely identify your client. I created a new file called util.js to generate an id for me. A peer id can basically be any random 20-byte stringAs you can see the id is only generated once. Normally an id is set every time the client loads and should be the same until it’s closed