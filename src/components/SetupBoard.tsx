import React from "react";
import type { Square } from "chess.js";
import { Chessboard, ChessboardDnDProvider, SparePiece } from "react-chessboard";

export type SetupPiece =
  | "wP"
  | "wN"
  | "wB"
  | "wR"
  | "wQ"
  | "wK"
  | "bP"
  | "bN"
  | "bB"
  | "bR"
  | "bQ"
  | "bK";

export type SetupPosition = Partial<Record<Square, SetupPiece>>;

interface Props {
  position: SetupPosition;
  onPositionChange: (position: SetupPosition) => void;
  boardOrientation: "white" | "black";
}

const sparePieceGroups: Array<{ label: string; pieces: SetupPiece[] }> = [
  { label: "White pieces", pieces: ["wK", "wQ", "wR", "wB", "wN", "wP"] },
  { label: "Black pieces", pieces: ["bK", "bQ", "bR", "bB", "bN", "bP"] },
];

const SetupBoard: React.FC<Props> = ({ position, onPositionChange, boardOrientation }) => {
  const movePieceOnBoard = (sourceSquare: Square, targetSquare: Square, piece: SetupPiece) => {
    if (sourceSquare === targetSquare) {
      return true;
    }

    const nextPosition = { ...position };
    delete nextPosition[sourceSquare];
    nextPosition[targetSquare] = piece;
    onPositionChange(nextPosition);
    return true;
  };

  const placeSparePiece = (piece: SetupPiece, targetSquare: Square) => {
    onPositionChange({
      ...position,
      [targetSquare]: piece,
    });
    return true;
  };

  const removePiece = (sourceSquare: Square) => {
    const nextPosition = { ...position };
    delete nextPosition[sourceSquare];
    onPositionChange(nextPosition);
  };

  return (
    <ChessboardDnDProvider>
      <div style={{ display: "grid", gap: 16, justifyItems: "center" }}>
        <div style={{ display: "grid", gap: 12, width: "100%" }}>
          {sparePieceGroups.map((group) => (
            <div key={group.label}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{group.label}</div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  justifyContent: "center",
                }}
              >
                {group.pieces.map((piece) => (
                  <div
                    key={piece}
                    style={{
                      background: "#f4efe5",
                      border: "1px solid #d8c4a8",
                      borderRadius: 10,
                      padding: 6,
                    }}
                  >
                    <SparePiece piece={piece} width={46} dndId={`setup-${piece}`} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <Chessboard
          id="custom-position-board"
          position={position}
          boardOrientation={boardOrientation}
          dropOffBoardAction="trash"
          onPieceDrop={(sourceSquare, targetSquare, piece) =>
            movePieceOnBoard(sourceSquare, targetSquare, piece as SetupPiece)
          }
          onSparePieceDrop={(piece, targetSquare) =>
            placeSparePiece(piece as SetupPiece, targetSquare)
          }
          onPieceDropOffBoard={(sourceSquare) => removePiece(sourceSquare)}
          showBoardNotation={true}
        />
      </div>
    </ChessboardDnDProvider>
  );
};

export default SetupBoard;
