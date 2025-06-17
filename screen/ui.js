import blessed from "blessed";
import { pieceSize } from "../index.js";
import { log } from "../src/util.js";

const state = {
  torrentName: "Getting torrent info...",
  size: 0, //total size of the torrent
  totalSizeInBytes: 0, // total size in bytes
  remaining: 0, //remaining size to download
  downloadedBytes: 0, // bytes downloaded so far
  peers: 0,
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
};

let hasError = false;

const screen = blessed.screen({
  smartCSR: true,
  style: { bg: "black" },
});

screen.program.hideCursor();

screen.title = "BitLit";

const background = blessed.box({
  top: 0,
  left: 0,
  width: "100%",
  height: "100%",
  style: {
    bg: "black",
  },
});

const logoBox = blessed.text({
  parent: screen,
  width: "shrink",
  height: 7,
  left: "center",
  align: "center",
  top: 0,
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

const progressContainer = blessed.box({
  parent: screen,
  width: "80%",
  height: 3,
  left: "center",
  top: "100%-5",
  style: {
    bg: "black",
  },
});

const progressBar = blessed.progressbar({
  parent: progressContainer,
  width: "100%",
  height: 3,
  left: "center",
  top: "100%-2",
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

const percentText = blessed.text({
  parent: progressContainer,
  width: "shrink",
  height: 1,
  top: "100%-1",
  left: "center",
  align: "center",
  content: "0%",
  style: {
    fg: "white",
    bg: "black",
  },
});

const contentBox = blessed.box({
  parent: screen,
  top: 5,
  left: "center",
  width: "80%",
  height: "100%-7",
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

const updateUI = () => {
  if (hasError) return;
  contentBox.setContent(`
      Torrent Name:             ${state.torrentName}\n
      Status:                   ${state.status}\n
      File Size:                ${state.size}\n
      Remaining Download:       ${state.remaining}\n
      Estimated Time Left:      ${state.remainingTime}\n
      Elapsed Time:             ${state.elapsedTime || "00:00"}\n
      Number of Peers:          ${state.peers}\n
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
  percentText.setContent(`${Math.floor(percent)}%`);
  screen.render();
};

//elapsed timer
let elapsedTimer;
function setTimer() {
  elapsedTimer = setInterval(() => {
    state.elapsedSeconds++;
    updateElapsedTime();
  }, 1000);
}

function updateError(newError) {
  hasError = true;
  contentBox.setContent(`{red-fg}{bold}Error: ${newError}{/bold}{/red-fg}`);
  screen.render();
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
  state.downloadSpeed = newDownloadSpeed; //bytes per second
  if (newDownloadSpeed > 0) updateAverageDownloadSpeed(newDownloadSpeed);
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
  state.avgSpeedCount++;
  state.totalSpeed += currentSpeed;
  state.averageDownloadSpeed = state.totalSpeed / state.avgSpeedCount;
  updateRemainingTime();
  updateUI();
}

function colorSpeed(speed) {
  // speed in B/s, convert to KB/s for thresholds
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

screen.append(background);
screen.append(logoBox);
screen.append(contentBox);
screen.append(progressContainer);

// Quit on Escape, q, or Control-C.
screen.key(["escape", "q", "C-c"], function (ch, key) {
  screen.program.showCursor();
  return process.exit(0);
});

screen.render();

export {
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
};
