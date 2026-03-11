// src/utils/stockfishWorker.ts
export function createStockfish(): Worker {
  return new Worker("/stockfish-worker.js"); 
}
