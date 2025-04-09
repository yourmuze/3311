self.importScripts('https://cdn.jsdelivr.net/npm/lamejs@1.2.0/lame.min.js');

self.onmessage = function(e) {
  const { channelData, sampleRate } = e.data;
  const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
  const mp3Data = mp3encoder.encodeBuffer(channelData);
  const mp3End = mp3encoder.flush();
  const mp3Blob = new Blob([mp3Data, mp3End], { type: 'audio/mp3' });
  self.postMessage(mp3Blob);
};