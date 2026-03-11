import React, { useState } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";
import type { Square } from "chess.js";


interface Props {
  position: string;
  onOpponentMove: (from: string, to: string) => boolean;
  boardOrientation: "white" | "black";
  game: Chess;
  inCheckSquare: Square | null;
}

const ChessBoard: React.FC<Props> = ({
  position,
  onOpponentMove,
  boardOrientation,
  game,
  inCheckSquare,
}) => {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [moveSquares, setMoveSquares] = useState<{ [square: string]: React.CSSProperties }>({});

  const handleSquareClick = (square: Square) => {
    const piece = game.get(square);
    if (piece && piece.color === game.turn()) {
      const moves = game.moves({ square, verbose: true });
      const highlights: { [square: string]: React.CSSProperties } = {};
      moves.forEach((m) => {
        highlights[m.to] = {
          background:
            game.get(m.to) != null
              ? "radial-gradient(circle, red 36%, transparent 40%)"
              : "radial-gradient(circle, lightgray 36%, transparent 40%)",
          borderRadius: "50%",
        };
      });
      highlights[square] = {
        backgroundColor: "#fffc90",
      };

      setSelectedSquare(square);
      setMoveSquares(highlights);
    } else {
      setSelectedSquare(null);
      setMoveSquares({});
    }
  };

  const labeledSquareStyles: { [square: string]: React.CSSProperties } = {};
  const files = "abcdefgh";
  const ranks = "12345678";
  for (let f of files) {
    for (let r of ranks) {
      labeledSquareStyles[`${f}${r}`] = { position: "relative" };
    }
  }

  const finalSquareStyles = {
    ...labeledSquareStyles,
    ...moveSquares,
    ...(inCheckSquare && {
      [inCheckSquare]: {
        ...labeledSquareStyles[inCheckSquare],
        backgroundColor: "#ff4d4f",
      },
    }),
  };

  return (
    <>
      <style>{`
        .chessboard .board-square::after {
          content: attr(data-square);
          position: absolute;
          bottom: 2px;
          right: 4px;
          font-size: 10px;
          color: rgba(0, 0, 0, 0.5);
          pointer-events: none;
        }
        .chessboard .board-square {
          position: relative;
        }
      `}</style>

      <Chessboard
        position={position}
        boardOrientation={boardOrientation}
        onPieceDrop={(sourceSquare, targetSquare) => {
          const success = onOpponentMove(sourceSquare, targetSquare);
          if (success) {
            setSelectedSquare(null);
            setMoveSquares({});
          }
          return success;
        }}
        onSquareClick={handleSquareClick}
        customSquareStyles={finalSquareStyles}
        showBoardNotation={true}
      />
    </>
  );
};

export default ChessBoard;
