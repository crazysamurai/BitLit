import blessed from "blessed";

const state = {
  torrentName: 'abc.torrent',
  size: 0,
  remaining: 0,
  peers: 0,
  totalPieces: 0,
  missingPieces: 0,
  progress: 0,
}

const screen = blessed.screen({ smartCSR: true })

screen.title = "BitLit"

const layout = blessed.layout({
  parent: screen,
  width: '100%',
  height: '100%',
  layout: 'inline'
});


const logoBox = blessed.text({
  parent: layout,
  top: 0,
  left: 3,
  content: `
    ____     _    __     __     _    __ 
   / __ )   (_)  / /_   / /    (_)  / /_
  / __  |  / /  / __/  / /    / /  / __/
 / /_/ /  / /  / /_   / /___ / /  / /_  
/_____/  /_/   \\__/  /_____//_/   \\__/                                         
`,
  style: {
    fg: 'yellow',
    bg: 'black',
    width: 'shrink',
    height: 'shrink'
  }
});

const contentBox = blessed.box({
  parent: layout,
  top: 7, 
  left: 0,
  width: '100%',
  height: '100%-7',
  tags:true,
  style: {
    fg: 'white',
    bg: 'black'
  }
});

const updateUI = () => {
  contentBox.setContent(
    ` Torrent Name: ${state.torrentName}\n
      File Size: ${state.size}\n
      Remaining Download: ${state.remaining}
      Number of Peers: ${state.peers}
      Total Pieces: ${state.totalPieces}
      Missing Pieces: ${state.missingPieces}
    `
  )
  screen.render()
}

function updateError(newError) {
  contentBox.setContent(`{red-fg}{bold}Error: ${newError}{/bold}{/red-fg}`)
  screen.render()
}

function updatetorrentName(newtorrentName) {
  state.torrentName = newtorrentName;
  updateUI();
  screen.render()
}

function updatePeers(newPeers) {
  state.peers = newPeers;
  updateUI();
  screen.render()
}

function updateProgress(newProgress) {
  state.progress = newProgress;
  updateUI();
}

function updateSize(newSize) {
  state.size = newSize;
  updateUI();
}

function updateTotalPieces(newTotalPieces) {
  state.totalPieces = newTotalPieces;
  updateUI();
}

function updateMissingPieces(newMissingPieces) {
  state.missingPieces = newMissingPieces;
  updateUI();
}


screen.append(layout)

// Quit on Escape, q, or Control-C.
screen.key(['escape', 'q', 'C-c'], function (ch, key) {
  return process.exit(0);
});

screen.render()

export { updateError, updateMissingPieces, updatePeers, updateProgress, updateSize, updateTotalPieces, updatetorrentName }