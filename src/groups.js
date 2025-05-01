export const group = (data, groupSize) =>{
    let groups = []
    for(let i = 0; i<data.length; i+=groupSize){
        groups.push(data.slice(i, i+groupSize))
    }
    return groups
}