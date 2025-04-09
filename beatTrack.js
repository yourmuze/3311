// beatTrack.js
export function updateBeatTrack(timestamp) {
    if (!appState.trackStartTime) appState.trackStartTime = timestamp;
    const elapsed = timestamp - appState.trackStartTime;
    
    document.getElementById('progressBar').style.width = 
      `${(elapsed % appState.trackDuration) / appState.trackDuration * 100}%`;
    
    appState.beatTrack.forEach(entry => {
      const expectedTime = entry.time * 1000;
      if (Math.abs(elapsed - expectedTime) < 50) {
        playSound(entry.sound, false, true);
      }
    });
    
    if (appState.isPlaying) {
      requestAnimationFrame(updateBeatTrack);
    }
  }