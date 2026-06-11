import React, { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { Square } from "chess.js";
import { createStockfish } from "./utils/stockfishWorker";
import ChessBoard from "./components/ChessBoard";
import SetupBoard, { type SetupPiece, type SetupPosition } from "./components/SetupBoard";

interface DifficultyOption {
  rating: number;
  label: string;
  depth: number;
}

type AppMode = "menu" | "classic" | "customSetup" | "customPlay";
type PlayerColor = "white" | "black";
type TurnColor = "w" | "b";

const difficultyOptions: DifficultyOption[] = [
  { rating: 400, label: "Beginner", depth: 2 },
  { rating: 800, label: "Casual", depth: 4 },
  { rating: 1200, label: "Intermediate", depth: 8 },
  { rating: 1600, label: "Advanced", depth: 12 },
  { rating: 2000, label: "Expert", depth: 16 },
  { rating: 2500, label: "Grandmaster", depth: 20 },
];

const files = "abcdefgh";
const ranks = "12345678";

const fenToSetupPiece: Record<string, SetupPiece> = {
  P: "wP",
  N: "wN",
  B: "wB",
  R: "wR",
  Q: "wQ",
  K: "wK",
  p: "bP",
  n: "bN",
  b: "bB",
  r: "bR",
  q: "bQ",
  k: "bK",
};

const setupPieceToFen: Record<SetupPiece, string> = {
  wP: "P",
  wN: "N",
  wB: "B",
  wR: "R",
  wQ: "Q",
  wK: "K",
  bP: "p",
  bN: "n",
  bB: "b",
  bR: "r",
  bQ: "q",
  bK: "k",
};

const EMPTY_SETUP_POSITION: SetupPosition = {};
const START_SETUP_POSITION = fenToPositionObject(new Chess().fen());

function getEngineColor(opponentColor: PlayerColor): TurnColor {
  return opponentColor === "white" ? "b" : "w";
}

function getOpponentTurn(opponentColor: PlayerColor): TurnColor {
  return opponentColor === "white" ? "w" : "b";
}

function fenToPositionObject(fen: string): SetupPosition {
  const [boardFen] = fen.split(" ");
  const position: SetupPosition = {};
  const rows = boardFen.split("/");

  rows.forEach((row, rowIndex) => {
    let fileIndex = 0;
    for (const symbol of row) {
      if (/\d/.test(symbol)) {
        fileIndex += Number(symbol);
        continue;
      }

      const square = `${files[fileIndex]}${8 - rowIndex}` as Square;
      position[square] = fenToSetupPiece[symbol];
      fileIndex += 1;
    }
  });

  return position;
}

function positionToFen(position: SetupPosition, turn: TurnColor): string {
  const fenRows: string[] = [];

  for (let rankIndex = 7; rankIndex >= 0; rankIndex -= 1) {
    let row = "";
    let emptySquares = 0;

    for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
      const square = `${files[fileIndex]}${ranks[rankIndex]}` as Square;
      const piece = position[square];

      if (!piece) {
        emptySquares += 1;
        continue;
      }

      if (emptySquares > 0) {
        row += emptySquares.toString();
        emptySquares = 0;
      }

      row += setupPieceToFen[piece];
    }

    if (emptySquares > 0) {
      row += emptySquares.toString();
    }

    fenRows.push(row);
  }

  return `${fenRows.join("/")} ${turn} - - 0 1`;
}

function findKingSquare(chess: Chess, color: TurnColor): Square | null {
  const board = chess.board();
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const square = board[rank][file];
      if (square?.type === "k" && square.color === color) {
        const fileChar = files[file];
        const rankChar = (8 - rank).toString();
        return (fileChar + rankChar) as Square;
      }
    }
  }
  return null;
}

function countPieces(position: SetupPosition, piece: SetupPiece): number {
  return Object.values(position).filter((entry) => entry === piece).length;
}

function validateSetupPosition(position: SetupPosition, opponentColor: PlayerColor): string | null {
  if (countPieces(position, "wK") !== 1) {
    return "Add exactly one white king before starting from a custom position.";
  }

  if (countPieces(position, "bK") !== 1) {
    return "Add exactly one black king before starting from a custom position.";
  }

  const invalidPawnSquare = Object.entries(position).find(([square, piece]) => {
    return piece?.endsWith("P") && (square.endsWith("1") || square.endsWith("8"));
  });

  if (invalidPawnSquare) {
    return "Pawns cannot be placed on the first or eighth rank.";
  }

  const customFen = positionToFen(position, getEngineColor(opponentColor));

  try {
    const customGame = new Chess(customFen);
    if (customGame.isGameOver()) {
      return "This position is already game over. Adjust the board and try again.";
    }
  } catch {
    return "This custom position is not valid for chess play. Adjust the board and try again.";
  }

  return null;
}

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>("menu");
  const [game, setGame] = useState(() => new Chess());
  const [bestMove, setBestMove] = useState<string | null>(null);
  const [lastSuggestedMove, setLastSuggestedMove] = useState<string | null>(null);
  const [isCalculatingMove, setIsCalculatingMove] = useState(false);
  const [opponentColor, setOpponentColor] = useState<PlayerColor | null>(null);
  const [difficulty, setDifficulty] = useState<DifficultyOption | null>(null);
  const [checkmate, setCheckmate] = useState(false);
  const [inCheckSquare, setInCheckSquare] = useState<Square | null>(null);
  const [boardFlipped, setBoardFlipped] = useState(false);
  const [customSetupPosition, setCustomSetupPosition] = useState<SetupPosition>(EMPTY_SETUP_POSITION);
  const [customSetupError, setCustomSetupError] = useState<string | null>(null);
  const stockfishRef = useRef<Worker | null>(null);

  useEffect(() => {
    stockfishRef.current = createStockfish();
    stockfishRef.current.onmessage = (event) => {
      const line = (event.data as string).trim();
      if (!line.startsWith("bestmove")) {
        return;
      }

      setIsCalculatingMove(false);
      const move = line.split(" ")[1];
      if (!move || move === "(none)") {
        setBestMove(null);
        return;
      }

      setBestMove(move);
      setLastSuggestedMove(move);
    };

    return () => stockfishRef.current?.terminate();
  }, []);

  function syncGameState(nextGame: Chess) {
    setGame(new Chess(nextGame.fen()));
    setCheckmate(nextGame.isCheckmate());
    setInCheckSquare(nextGame.inCheck() ? findKingSquare(nextGame, nextGame.turn()) : null);
  }

  function resetPlayState(nextGame?: Chess) {
    const targetGame = nextGame ?? new Chess();
    syncGameState(targetGame);
    setBestMove(null);
    setLastSuggestedMove(null);
    setBoardFlipped(false);
    setIsCalculatingMove(false);
  }

  function getBestMove(fen: string) {
    const depth = difficulty?.depth ?? 10;
    setBestMove(null);
    setIsCalculatingMove(true);
    stockfishRef.current?.postMessage("position fen " + fen);
    stockfishRef.current?.postMessage(`go depth ${depth}`);
  }

  function isPromotionMove(chess: Chess, from: string, to: string): boolean {
    const piece = chess.get(from as Square);
    if (!piece || piece.type !== "p") {
      return false;
    }

    const targetRank = to[1];
    return (piece.color === "w" && targetRank === "8") || (piece.color === "b" && targetRank === "1");
  }

  function applyMove(from: string, to: string): Chess | null {
    const workingGame = new Chess(game.fen());
    const move = workingGame.move({
      from: from as Square,
      to: to as Square,
      promotion: isPromotionMove(workingGame, from, to) ? "q" : undefined,
    });

    if (!move) {
      return null;
    }

    syncGameState(workingGame);
    return workingGame;
  }

  const onOpponentMove = (from: string, to: string): boolean => {
    if (!opponentColor) {
      return false;
    }

    const turn = game.turn();
    const expected = getOpponentTurn(opponentColor);
    if (turn !== expected) {
      return false;
    }

    const piece = game.get(from as Square);
    if (!piece || piece.color !== expected) {
      return false;
    }

    const moves = game.moves({ verbose: true });
    const isLegal = moves.some((move) => move.from === from && move.to === to);
    if (!isLegal) {
      return false;
    }

    const updatedGame = applyMove(from, to);
    if (updatedGame) {
      getBestMove(updatedGame.fen());
    }

    return Boolean(updatedGame);
  };

  useEffect(() => {
    if (!bestMove || !opponentColor) {
      return;
    }

    const engineTurn = getEngineColor(opponentColor);
    if (game.turn() !== engineTurn) {
      return;
    }

    const from = bestMove.slice(0, 2);
    const to = bestMove.slice(2, 4);
    setBestMove(null);
    applyMove(from, to);
  }, [bestMove, game, opponentColor]);

  const handleStartClassicGame = (color: PlayerColor) => {
    const newGame = new Chess();
    setOpponentColor(color);
    setCustomSetupError(null);
    resetPlayState(newGame);
    if (getEngineColor(color) === "w") {
      getBestMove(newGame.fen());
    }
  };

  const openClassicMode = () => {
    setMode("classic");
    setDifficulty(null);
    setOpponentColor(null);
    setCustomSetupError(null);
    resetPlayState();
  };

  const openCustomSetupMode = (
    position: SetupPosition = EMPTY_SETUP_POSITION,
    preserveSelections = false,
  ) => {
    setMode("customSetup");
    if (!preserveSelections) {
      setDifficulty(null);
      setOpponentColor(null);
    }
    setCustomSetupError(null);
    setCustomSetupPosition({ ...position });
    resetPlayState();
  };

  const startCustomAnalysis = () => {
    if (!opponentColor) {
      setCustomSetupError("Select which color the opponent is playing as.");
      return;
    }

    if (!difficulty) {
      setCustomSetupError("Select a difficulty level before starting the custom position.");
      return;
    }

    const validationError = validateSetupPosition(customSetupPosition, opponentColor);
    if (validationError) {
      setCustomSetupError(validationError);
      return;
    }

    const customGame = new Chess(positionToFen(customSetupPosition, getEngineColor(opponentColor)));
    setMode("customPlay");
    setCustomSetupError(null);
    resetPlayState(customGame);
    getBestMove(customGame.fen());
  };

  const activeBoardOrientation: PlayerColor =
    boardFlipped
      ? opponentColor ?? "white"
      : opponentColor === "white"
        ? "black"
        : "white";

  const renderDifficultyButtons = () =>
    difficultyOptions.map((option) => {
      const isSelected = difficulty?.rating === option.rating;
      return (
        <button
          key={option.rating}
          onClick={() => setDifficulty(option)}
          style={{
            margin: 5,
            borderColor: isSelected ? "#2f7d32" : undefined,
            background: isSelected ? "#e6f4ea" : undefined,
          }}
        >
          {option.label} ({option.rating})
        </button>
      );
    });

  const renderPlayBoard = (title: string, secondaryAction?: React.ReactNode) => (
    <>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 8 }}>{title}</h2>
        {difficulty && (
          <div style={{ marginBottom: 6 }}>
            Difficulty: <strong>{difficulty.label}</strong> ({difficulty.rating})
          </div>
        )}
        {opponentColor && (
          <div>Opponent plays as: <strong>{opponentColor}</strong></div>
        )}
      </div>

      <ChessBoard
        position={game.fen()}
        onOpponentMove={onOpponentMove}
        boardOrientation={activeBoardOrientation}
        game={game}
        inCheckSquare={inCheckSquare}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 14 }}>
        <button onClick={() => setBoardFlipped((current) => !current)}>Flip Board</button>
        <button onClick={openClassicMode}>New Classic Game</button>
        <button onClick={() => openCustomSetupMode()}>New Custom Position</button>
        <button onClick={() => setMode("menu")}>Back To Modes</button>
        {secondaryAction}
      </div>

      <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
        {lastSuggestedMove && (
          <div>
            Suggested move: <strong>{lastSuggestedMove}</strong>
          </div>
        )}

        {checkmate ? (
          <div style={{ color: "#b42318", fontWeight: 700 }}>Checkmate. Game over.</div>
        ) : isCalculatingMove ? (
          <div style={{ color: "#1d4ed8", fontWeight: 600 }}>Calculating the best move...</div>
        ) : opponentColor && game.turn() === getOpponentTurn(opponentColor) ? (
          <div style={{ color: "#2f7d32", fontWeight: 600 }}>Place the opponent move on the board.</div>
        ) : (
          <div style={{ color: "#6b7280" }}>Waiting for the engine to finish its move.</div>
        )}

        {inCheckSquare && !checkmate && (
          <div style={{ color: "#b45309", fontWeight: 700 }}>Your king is in check.</div>
        )}
      </div>
    </>
  );

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: 20, textAlign: "center" }}>
      <h1 style={{ marginBottom: 10 }}>Chess Move Recommender</h1>

      {mode === "menu" && (
        <>
          <p style={{ marginBottom: 20 }}>
            Choose whether to continue with the existing game flow or start from a custom board setup.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            <button onClick={openClassicMode}>Classic Game</button>
            <button onClick={() => openCustomSetupMode()}>Custom Position Setup</button>
          </div>
        </>
      )}

      {mode === "classic" && !difficulty && (
        <>
          <p>Select difficulty level:</p>
          <div>{renderDifficultyButtons()}</div>
          <div style={{ marginTop: 16 }}>
            <button onClick={() => setMode("menu")}>Back To Modes</button>
          </div>
        </>
      )}

      {mode === "classic" && difficulty && !opponentColor && (
        <>
          <p>
            Selected difficulty: <strong>{difficulty.label}</strong> ({difficulty.rating})
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            <button onClick={() => handleStartClassicGame("white")}>Opponent Is White</button>
            <button onClick={() => handleStartClassicGame("black")}>Opponent Is Black</button>
            <button onClick={() => setDifficulty(null)}>Change Difficulty</button>
            <button onClick={() => setMode("menu")}>Back To Modes</button>
          </div>
        </>
      )}

      {(mode === "classic" && difficulty && opponentColor) && renderPlayBoard("Classic Game")}

      {mode === "customSetup" && !difficulty && (
        <>
          <p>Select difficulty level:</p>
          <div>{renderDifficultyButtons()}</div>
          <div style={{ marginTop: 16 }}>
            <button onClick={() => setMode("menu")}>Back To Modes</button>
          </div>
        </>
      )}

      {mode === "customSetup" && difficulty && !opponentColor && (
        <>
          <p>
            Selected difficulty: <strong>{difficulty.label}</strong> ({difficulty.rating})
          </p>
          <p>Select which color the opponent is playing in the real game.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
            <button onClick={() => setOpponentColor("white")}>Opponent Is White</button>
            <button onClick={() => setOpponentColor("black")}>Opponent Is Black</button>
            <button onClick={() => setDifficulty(null)}>Change Difficulty</button>
            <button onClick={() => setMode("menu")}>Back To Modes</button>
          </div>
        </>
      )}

      {mode === "customSetup" && difficulty && opponentColor && (
        <>
          <div style={{ marginBottom: 18 }}>
            <h2 style={{ marginBottom: 8 }}>Custom Position Setup</h2>
            <p style={{ margin: 0 }}>
              Drag white and black pieces onto the board. You can drag a placed piece off the board to remove it.
            </p>
            <div style={{ marginTop: 10 }}>
              Difficulty: <strong>{difficulty.label}</strong> ({difficulty.rating})
            </div>
            <div>
              Opponent plays as: <strong>{opponentColor}</strong>
            </div>
          </div>

          <SetupBoard
            position={customSetupPosition}
            onPositionChange={setCustomSetupPosition}
            boardOrientation={boardFlipped ? "black" : "white"}
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 20 }}>
            <button onClick={() => setBoardFlipped((current) => !current)}>Flip Board</button>
            <button onClick={startCustomAnalysis}>Start From This Position</button>
            <button onClick={() => setCustomSetupPosition({})}>Clear Board</button>
            <button onClick={() => setCustomSetupPosition(START_SETUP_POSITION)}>Load Start Position</button>
            <button onClick={() => setOpponentColor(null)}>Change Opponent Color</button>
            <button onClick={() => setDifficulty(null)}>Change Difficulty</button>
            <button onClick={() => setMode("menu")}>Back To Modes</button>
          </div>

          {customSetupError && (
            <div style={{ marginTop: 16, color: "#b42318", fontWeight: 600 }}>{customSetupError}</div>
          )}
        </>
      )}

      {mode === "customPlay" &&
        renderPlayBoard(
          "Custom Position Analysis",
          <button onClick={() => openCustomSetupMode(fenToPositionObject(game.fen()), true)}>Edit Position</button>,
        )}
    </div>
  );
};

export default App;
