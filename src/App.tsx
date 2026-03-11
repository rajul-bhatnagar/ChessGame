import React, { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { createStockfish } from "./utils/stockfishWorker";
import ChessBoard from "./components/ChessBoard";

interface DifficultyOption {
  rating: number;
  label: string;
  depth: number;
}

const difficultyOptions: DifficultyOption[] = [
  { rating: 400, label: "Beginner", depth: 2 },
  { rating: 800, label: "Casual", depth: 4 },
  { rating: 1200, label: "Intermediate", depth: 8 },
  { rating: 1600, label: "Advanced", depth: 12 },
  { rating: 2000, label: "Expert", depth: 16 },
  { rating: 2500, label: "Grandmaster", depth: 20 },
];

const App: React.FC = () => {
  const [game, setGame] = useState(() => new Chess());
  const [bestMove, setBestMove] = useState<string | null>(null);
  const stockfishRef = useRef<Worker | null>(null);
  const [opponentColor, setOpponentColor] = useState<"white" | "black" | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyOption | null>(null);
  const [checkmate, setCheckmate] = useState(false);
  const [inCheckSquare, setInCheckSquare] = useState<Square | null>(null);
  const [boardFlipped, setBoardFlipped] = useState(false);

  useEffect(() => {
    stockfishRef.current = createStockfish();
    stockfishRef.current.onmessage = (e) => {
      const line = (e.data as string).trim();
      if (line.startsWith("bestmove")) {
        const move = line.split(" ")[1];
        setBestMove(move);
      }
    };
    return () => stockfishRef.current?.terminate();
  }, []);

  function getBestMove(fen: string) {
    const depth = difficulty?.depth ?? 10;
    stockfishRef.current?.postMessage("position fen " + fen);
    stockfishRef.current?.postMessage(`go depth ${depth}`);
  }

  function isPromotionMove(from: string, to: string): boolean {
    const piece = game.get(from as Square);
    if (!piece || piece.type !== "p") return false;
    const targetRank = to[1];
    return (piece.color === "w" && targetRank === "8") || (piece.color === "b" && targetRank === "1");
  }

  function applyMove(from: string, to: string): boolean {
    const move = game.move({
      from: from as Square,
      to: to as Square,
      promotion: isPromotionMove(from, to) ? "q" : undefined,
    });

    if (move) {
      const newGame = new Chess(game.fen());
      setGame(newGame);

      if (newGame.isCheckmate()) {
        setCheckmate(true);
      } else {
        setCheckmate(false);
      }

      if (newGame.inCheck()) {
        const kingSquare = findKingSquare(newGame, newGame.turn());
        setInCheckSquare(kingSquare);
      } else {
        setInCheckSquare(null);
      }

      return true;
    }
    return false;
  }

  const onOpponentMove = (from: string, to: string): boolean => {
    const turn = game.turn();
    const expected = opponentColor === "white" ? "w" : "b";
    if (turn !== expected) {
      console.warn("It's not the opponent's turn.");
      return false;
    }

    const piece = game.get(from as Square);
    if (!piece || piece.color !== expected) {
      console.warn("That is not your opponent's piece.");
      return false;
    }

    const moves = game.moves({ verbose: true });
    const isLegal = moves.some((m) => m.from === from && m.to === to);
    if (!isLegal) {
      console.warn("Illegal move.");
      return false;
    }

    const moved = applyMove(from, to);
    if (moved) {
      getBestMove(game.fen());
    }
    return moved;
  };

  useEffect(() => {
    if (!bestMove || !opponentColor) return;
    const engineTurn = opponentColor === "white" ? "b" : "w";
    if (game.turn() !== engineTurn) return;

    const from = bestMove.slice(0, 2);
    const to = bestMove.slice(2, 4);
    const moved = applyMove(from, to);
    if (moved) setBestMove(null);
  }, [bestMove, game, opponentColor]);

  const handleStart = (color: "white" | "black") => {
    const newGame = new Chess();
    setGame(newGame);
    setOpponentColor(color);
    setCheckmate(false);
    setInCheckSquare(null);
    setBestMove(null);

    if (color === "black") {
      getBestMove(newGame.fen());
    }
  };

  const findKingSquare = (chess: Chess, color: "w" | "b"): Square | null => {
    const board = chess.board();
    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const square = board[rank][file];
        if (square?.type === "k" && square.color === color) {
          const fileChar = "abcdefgh"[file];
          const rankChar = (8 - rank).toString();
          return (fileChar + rankChar) as Square;
        }
      }
    }
    return null;
  };

  return (
    <div style={{ maxWidth: 520, margin: "auto", padding: 20 }}>
    

      {!difficulty ? (
        <>
          <p>Select difficulty level:</p>
          {difficultyOptions.map((opt) => (
            <button key={opt.rating} onClick={() => setDifficulty(opt)} style={{ margin: 5 }}>
              {opt.label} ({opt.rating})
            </button>
          ))}
        </>
      ) : !opponentColor ? (
        <>
          <p>
            Selected difficulty: <strong>{difficulty.label}</strong> ({difficulty.rating})
          </p>
          <p>Which color is your opponent playing on chess.com?</p>
          <button onClick={() => handleStart("white")} style={{ marginRight: 10 }}>
            Opponent is White
          </button>
          <button onClick={() => handleStart("black")}>Opponent is Black</button>
        </>
      ) : (
        <>
          <ChessBoard
            position={game.fen()}
            onOpponentMove={onOpponentMove}
            boardOrientation={
              boardFlipped
                ? opponentColor
                : opponentColor === "white"
                ? "black"
                : "white"
            }
            game={game}
            inCheckSquare={inCheckSquare}
          />
          <button onClick={() => setBoardFlipped(!boardFlipped)} style={{ marginTop: 10 }}>
            Flip Board
          </button>

          <div style={{ marginTop: 20 }}>
            {/* <strong>Suggested Move:</strong> {bestMove || "–"} */}
          </div>

          {checkmate && (
            <div style={{ marginTop: 20, fontSize: 18, color: "red", fontWeight: "bold" }}>
              ♟️ Checkmate! Game Over.
            </div>
          )}
          {inCheckSquare && !checkmate && (
            <div style={{ marginTop: 10, color: "orange", fontWeight: "bold" }}>
              ⚠️ Your king is in check!
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default App;
