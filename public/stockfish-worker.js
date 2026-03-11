importScripts('/stockfish.wasm.js');

let stockfishInstance = null;

Module().then((sf) => {
  stockfishInstance = sf;

  sf.onmessage = function (line) {
    postMessage(line);
  };
});

onmessage = function (e) {
  if (stockfishInstance) {
    stockfishInstance.postMessage(e.data);
  } else {
    console.warn("Stockfish module not ready yet.");
  }
};
