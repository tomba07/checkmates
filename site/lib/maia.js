// Maia 3 encoding and move decoding, adapted from Chessquestia.
// Upstream: CSSLab/maia-platform-frontend (GPL-3.0).
import { Chess } from "chess.js";

const PIECE_TYPES = "PNBRQKpnbrqk";
const DEFAULT_MOVE_COUNT = 4352;

async function fetchMap(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load Maia’s move map.');
  return response.json();
}

export async function loadMaiaMoveMaps() {
  const [allMoves, allMovesReversed] = await Promise.all([
    fetchMap("/engine/maia/all_moves_maia3.json"),
    fetchMap("/engine/maia/all_moves_maia3_reversed.json"),
  ]);
  return { allMoves, allMovesReversed };
}

export function mirrorSquare(square) {
  return square[0] + (9 - parseInt(square[1], 10));
}

export function mirrorMove(uci) {
  return mirrorSquare(uci.slice(0, 2)) + mirrorSquare(uci.slice(2, 4)) + uci.slice(4);
}

export function mirrorFEN(fen) {
  const [pos, , castling, ep, hm, fm] = fen.split(" ");
  const flip = { K: "k", Q: "q", k: "K", q: "Q" };
  const mirroredPos = pos.split("/").reverse()
    .map(row => row.replace(/[A-Za-z]/g, c => /[A-Z]/.test(c) ? c.toLowerCase() : c.toUpperCase()))
    .join("/");
  const mirroredCastling = castling === "-" ? "-" : castling.replace(/[KQkq]/g, c => flip[c]);
  return `${mirroredPos} w ${mirroredCastling} ${ep !== "-" ? mirrorSquare(ep) : "-"} ${hm} ${fm}`;
}

export function boardToTokens(fen) {
  const tensor = new Float32Array(64 * 12);
  fen.split(" ")[0].split("/").forEach((row, rank) => {
    let file = 0;
    for (const c of row) {
      const n = parseInt(c, 10);
      if (Number.isNaN(n)) {
        const pi = PIECE_TYPES.indexOf(c);
        if (pi >= 0) tensor[((7 - rank) * 8 + file) * 12 + pi] = 1;
        file += 1;
      } else {
        file += n;
      }
    }
  });
  return tensor;
}

export function buildLegalMask(workingFen, allMoves, moveCount = DEFAULT_MOVE_COUNT) {
  const mask = new Float32Array(moveCount);
  for (const move of new Chess(workingFen).moves({ verbose: true })) {
    const idx = allMoves[move.from + move.to + (move.promotion || "")];
    if (idx !== undefined) mask[idx] = 1;
  }
  return mask;
}

export function decodeMoves(logitsMove, legalMask, isBlack, allMovesReversed) {
  const legalIdx = Array.from(legalMask.keys()).filter(i => legalMask[i] > 0);
  if (!legalIdx.length) throw new Error('No legal moves available.');
  const logits = legalIdx.map(i => logitsMove[i]);
  if (logits.some(value => !Number.isFinite(value))) throw new Error('Invalid Maia prediction.');
  const max = Math.max(...logits);
  const exps = logits.map(logit => Math.exp(logit - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return Object.fromEntries(legalIdx.map((idx, j) => {
    let move = allMovesReversed[String(idx)];
    if (isBlack) move = mirrorMove(move);
    return [move, exps[j] / sum];
  }));
}

export function sampleMove(probs, random = Math.random) {
  const moves = Object.keys(probs);
  const weights = Object.values(probs);
  let r = random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < moves.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return moves[i];
  }
  return moves[moves.length - 1];
}

export function prepareMaiaPosition(fen) {
  const isBlack = fen.split(" ")[1] === "b";
  const workingFen = isBlack ? mirrorFEN(fen) : fen;
  return {
    isBlack,
    workingFen,
    tokens: boardToTokens(workingFen),
  };
}
