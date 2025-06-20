import blessed from "blessed";
import contrib from "blessed-contrib";
import { pieceSize } from "../index.js";
import { togglePause } from "../src/download.js";
import { getDiskInfoSync } from "node-disk-info";
import dns from "node:dns"

const state = {
  torrentName: "Unavailable",
  size: 0, //total size of the torrent
  totalSizeInBytes: 0, // total size in bytes
  remaining: 0, //remaining size to download
  downloadedBytes: 0, // bytes downloaded so far
  peers: 0,
  seeders: 0,
  leechers: 0,
  totalPieces: 0,
  missingPieces: 0,
  availablePieces: 0,
  progress: 0, //progress percentage
  downloadSpeed: 0, //current download speed in B/s
  uploadSpeed: 0, //current upload speed in B/s
  averageDownloadSpeed: 0, //average download speed in B/s
  totalSpeed: 0,
  count: 0,
  avgSpeedCount: 0,
  diskUtilization: 0, //disk utilization in MB/s
  remainingTime: "∞",
  elapsedTime: 0, // elapsed time
  elapsedSeconds: 1, // elapsed time in seconds
  lastDownloadedBytes: 0,
  lastSpeedCheckTime: Date.now(),
  pausedForNoInternet: false,
};

let hasError = false;

const screen = blessed.screen({
  smartCSR: true,
  style: { bg: "black" },
});

screen.program.hideCursor();

screen.title = "BitLit";

const background = blessed.box({
  width: "100%",
  height: "100%",
  style: {
    bg: "black",
  },
});

const layout = blessed.layout({
  parent: screen,
  width: "80%",
  height: "100%",
  layout: "grid",
  left: "center",
  style: { bg: "black" },
});

const logoBox = blessed.box({
  parent: layout,
  width: "shrink",
  height: 5,
  row: 0,
  col: 0,
  rowSpan: 1,
  colSpan: 12,
  align: "center",
  content: `
┳┓• ┓ • 
┣┫┓╋┃ ┓╋
┻┛┗┗┗┛┗┗        
  `,
  style: {
    fg: "cyan",
    bg: "black",
  },
});

const contentBox = blessed.box({
  parent: layout,
  row: 1,
  col: 0,
  rowSpan: 6,
  colSpan: 12,
  width: "80%",
  tags: true,
  style: {
    fg: "white",
    bg: "black",
    content: {
      left: "center",
      align: "center",
    },
  },
});

const helpContainer = blessed.box({
  parent: layout,
  row: 7,
  col: 0,
  rowSpan: 1,
  colSpan: 12,
  width: "80%",
  height: 2,
  tags: true,
  content: `{bold}Press 'p' to pause/resume, 'q' to quit{/bold}`,
  style: {
    fg: "white",
    bg: "black",
  },
});

const progressContainer = blessed.layout({
  parent: layout,
  width: "80%",
  row: 8,
  col: 0,
  rowSpan: 1,
  colSpan: 12,
  height: 3,
  style: {
    bg: "black",
  },
});

const progressBar = blessed.progressbar({
  parent: progressContainer,
  width: "100%",
  height: 3,
  left: "center",
  // top: "100%-2",
  orientation: "horizontal",
  ch: "░",
  border: "line",
  filled: 0,
  label: "Download Progress",
  style: {
    fg: "cyan",
    bg: "black",
    bar: {
      bg: "cyan",
      fg: "black",
    },
    border: { fg: "white", bg: "black" },
    label: { fg: "white", bg: "black" },
  },
});

const peerTable = contrib.table({
  parent: layout,
  interactive: false,
  keys: false,
  mouse: false,
  row: 9,
  col: 0,
  rowSpan: 3,
  colSpan: 12,
  width: "80%",
  border: { type: "line" },
  columnSpacing: 2,
  columnWidth: [25, 25, 25, 25],
  style: {
    header: { fg: "white" },
    cell: { fg: "white" },
  },
  scrollbar: {
    ch: "░",
    track: {
      bg: "gray",
    },
    style: {
      inverse: true,
    },
  },
});

const updateUI = () => {
  if (hasError) return;
  contentBox.setContent(`
      Torrent Name:             ${state.torrentName}\n
      Status:                   ${state.status}\n
      File Size:                ${state.size}\n
      Remaining Download:       ${state.remaining}\n
      Estimated Time Left:      ${state.remainingTime}\n
      Elapsed Time:             ${state.elapsedTime || "00:00"}\n
      Peers:                    ${state.peers} ( Seeders: ${
    state.seeders
  }  Leechers: ${state.leechers} )\n
      Total Pieces:             ${state.totalPieces}\n
      Missing Pieces:           ${state.missingPieces}\n
      Network Activity:         ↑ ${(
        (state.uploadSpeed * 8) /
        1_000_000
      ).toFixed(2)} Mb/s    ↓ ${colorSpeed(state.downloadSpeed)}\n
      Average Download Speed:   ${colorSpeed(state.averageDownloadSpeed)}\n
      Disk Utilization:         ${state.diskUtilization} MB/s\n
    `);
  const percent = state.totalSizeInBytes
    ? Math.min(100, (state.downloadedBytes / state.totalSizeInBytes) * 100)
    : 0;
  progressBar.setProgress(percent);
  progressBar.setLabel(` ${Math.floor(percent)}% `);
  // percentText.setContent(`${Math.floor(percent)}%`);
  screen.render();
  if (screen.focused && typeof screen.focused.blur === "function") {
    screen.focused.blur();
  }
  screen.program.hideCursor();
};

//elapsed timer
let elapsedTimer;
function setTimer() {
  elapsedTimer = setInterval(() => {
    state.elapsedSeconds++;
    updateElapsedTime();
  }, 1000);
}

function updateSeedersLeechers(seeders, leechers) {
  state.seeders = seeders;
  state.leechers = leechers;
}

function updateError(newError) {
  hasError = true;
  contentBox.setContent(`{red-fg}{bold}Error: ${newError}{/bold}{/red-fg}`);
  screen.render();
  screen.program.hideCursor();
}

function updateTorrentName(newtorrentName) {
  state.torrentName = newtorrentName;
  updateUI();
}

function updateStatus(newStatus) {
  state.status = newStatus;
  updateUI();
}

function updateSize(newSize) {
  updateTotalPieces(newSize);
  state.totalSizeInBytes = newSize;
  state.size = formatSize(newSize);
  updateUI();
}

function updatePeers(newPeers) {
  state.peers = newPeers;
  setTimer();
  updateUI();
}

function updateDownloadSpeed(newDownloadSpeed) {
  if (!Number.isFinite(newDownloadSpeed)) newDownloadSpeed = 0;
  state.downloadSpeed = newDownloadSpeed; // bytes per second

  if (newDownloadSpeed === 0) {
    //check if internet is available
      dns.lookup("google.com", (err) => {
        if (err) {
          if (!downloadStarted) return;
          togglePause();
          state.pausedForNoInternet = true;
          updateStatus("{red-fg}Download Paused. No Internet Connection.{/red-fg}");
        }
        updateUI();
      });
    return;
  }
  updateAverageDownloadSpeed(newDownloadSpeed);
  updateUI();
}

function updateUploadSpeed(newUploadSpeed) {
  state.uploadSpeed = newUploadSpeed; //bytes per second
  updateUI();
}

function updateRemaining(count) {
  let downloaded = state.totalSizeInBytes - count * pieceSize;
  if (downloaded < 0) downloaded = 0; // Prevent negative
  state.downloadedBytes = downloaded;
  state.remaining = formatSize(state.totalSizeInBytes - downloaded);
}

function updateRemainingPieces(count) {
  state.missingPieces = count;
  updateRemaining(count);
  updateUI();
}

function updateTotalPieces(torrSize) {
  const newTotalPieces = Math.ceil(torrSize / pieceSize);
  state.totalPieces = newTotalPieces;
  state.missingPieces = newTotalPieces;
  updateUI();
}

function updateDiskUtilization(newDiskUtilization) {
  // When calculating disk utilization, check for Infinity or NaN
  state.diskUtilization = isFinite(newDiskUtilization) ? newDiskUtilization : 0;
  updateUI();
}

function updateProgress(newProgress) {
  state.progress = newProgress;
  updateUI();
}

function updateRemainingTime() {
  if (state.downloadedBytes >= state.totalSizeInBytes) {
    state.remainingTime = "00:00";
    updateUI();
    return;
  }
  const avgSpeed = state.averageDownloadSpeed;
  if (avgSpeed <= 0 || state.totalSizeInBytes <= 0) {
    state.remainingTime = "∞";
    updateUI();
    return;
  }
  const remainingBytes = state.totalSizeInBytes - state.downloadedBytes;
  const secondsLeft = remainingBytes / avgSpeed;
  state.remainingTime = formatTime(secondsLeft);
  updateUI();
}

function updateElapsedTime() {
  state.elapsedTime = formatTime(state.elapsedSeconds);
  updateUI();
}

function stopElapsedTimer() {
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
}

function formatSize(newSize) {
  let totalSize;
  if (newSize < 2 ** 10) {
    totalSize = `${newSize.toFixed(2)} B`;
  } else if (newSize < 2 ** 20) {
    totalSize = `${(newSize / 2 ** 10).toFixed(2)} KB`;
  } else if (newSize < 2 ** 30) {
    totalSize = `${(newSize / 2 ** 20).toFixed(2)} MB`;
  } else {
    totalSize = `${(newSize / 2 ** 30).toFixed(2)} GB`;
  }
  return totalSize;
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "Unknown";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [
    h > 0 ? String(h).padStart(2, "0") : null,
    String(m).padStart(2, "0"),
    String(s).padStart(2, "0"),
  ]
    .filter(Boolean)
    .join(":");
}

function updateAverageDownloadSpeed(currentSpeed) {
  if (!Number.isFinite(currentSpeed)) return;
  state.avgSpeedCount++;
  state.totalSpeed += currentSpeed;
  state.averageDownloadSpeed = state.totalSpeed / state.avgSpeedCount;
  updateRemainingTime();
  updateUI();
}

function colorSpeed(speed) {
  if (!Number.isFinite(speed)) speed = 0;
  // speed in B/s, convert to KB/s
  const kbps = speed / 1024;
  if (kbps < 100) {
    return `{red-fg}${((speed * 8) / 1_000_000).toFixed(2)} Mb/s{/red-fg}`;
  } else if (kbps < 1000) {
    return `{yellow-fg}${((speed * 8) / 1_000_000).toFixed(
      2
    )} Mb/s{/yellow-fg}`;
  } else {
    return `{green-fg}${((speed * 8) / 1_000_000).toFixed(2)} Mb/s{/green-fg}`;
  }
}

function getWindowsDrives() {
  try {
    const disks = getDiskInfoSync();
    return disks.map(disk => disk.mounted); 
  } catch (e) {
    return ["C:/"]; // fallback
  }
}


let downloadStarted = false;
function setDownloadStarted(val = true) {
  downloadStarted = val;
}

let fileManager = null;
function promptForTorrentFile() {
  if (downloadStarted) return;
  return new Promise((resolve) => {
    //remove background widgets
    screen.children.forEach((child) => child.hide());
    //fetch drives
    const drives = getWindowsDrives();
    const driveList = blessed.list({
      parent: screen,
      label: " Select Drive ",
      width: "30%",
      height: drives.length + 4,
      top: "center",
      left: "center",
      border: "line",
      style: {
        fg: "white",
        bg: "black",
        border: { fg: "cyan" },
        selected: { bg: "blue" },
        item: { fg: "white", bg: "black" },
        selected: { fg: "white", bg: "cyan" }
      },
      items: drives,
      keys: true,
      mouse: true,
      vi: true,
    });

    driveList.focus();
    screen.append(driveList);
    screen.render();

    driveList.on("select", (item, idx) => {
      const selectedDrive = drives[idx];
      screen.remove(driveList);
      showFileManager(selectedDrive);
    });

    driveList.on("cancel", () => {
      screen.remove(driveList);
      screen.render();
      resolve(null);
    });

    function showFileManager(selectedDrive) {
      const fileManager = blessed.filemanager({
        parent: screen,
        label: " Select a .torrent file ",
        width: "80%",
        height: "80%",
        top: "center",
        left: "center",
        border: "line",
        style: {
          fg: "white",
          bg: "black",
          border: { fg: "cyan" },
          selected: { bg: "blue" },
          item: { fg: "white", bg: "black" },
          selected: { fg: "white", bg: "cyan" }
        },
        cwd: selectedDrive,
        keys: true,
        vi: true,
        mouse: true,
        hidden: false,
      });
    
      fileManager.focus();
      screen.append(fileManager);
      fileManager.refresh();
      screen.render();
    
      fileManager.on("file", (file) => {
        if (file.endsWith(".torrent")) {
          screen.remove(fileManager);
          screen.children.forEach((child) => child.show());
          screen.render();
          resolve(file);
        } else {
          screen.children.forEach((child) => child.show());
          screen.render();
          fileManager.setLabel(" Please select a .torrent file ");
        }
      });
    
      fileManager.on("cancel", () => {
        screen.remove(fileManager);
        screen.children.forEach((child) => child.show());
        screen.render();
        resolve(null);
      });
    }
  });
}

let onTorrentFileSelected = null;

function setOnTorrentFileSelected(cb) {
  onTorrentFileSelected = cb;
}

screen.key("o", async () => {
  if (fileManager) {
    screen.remove(fileManager);
    fileManager = null;
    screen.children.forEach((child) => child.show());
    screen.render();
  } else {
    const file = await promptForTorrentFile();
    if (file && onTorrentFileSelected) {
      onTorrentFileSelected(file);
    }
  }
});

screen.render();
screen.program.hideCursor();

// Quit on Escape, q, or Control-C.
screen.key(["escape", "q", "C-c"], function (ch, key) {
  screen.program.showCursor();
  return process.exit(0);
});

screen.key("p", function (ch, key) {
  if(!downloadStarted)return
  togglePause();
});

export {
  updateSeedersLeechers,
  updateDownloadSpeed,
  updateUploadSpeed,
  updateStatus,
  updateError,
  updatePeers,
  updateProgress,
  updateSize,
  updateTotalPieces,
  updateTorrentName,
  updateRemaining,
  updateDiskUtilization,
  updateAverageDownloadSpeed,
  updateRemainingPieces,
  stopElapsedTimer,
  peerTable,
  promptForTorrentFile,
  setOnTorrentFileSelected,
  setDownloadStarted,
};
