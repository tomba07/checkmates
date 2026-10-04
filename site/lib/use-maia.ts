'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import modelManifest from '../public/engine/maia/model.json';
import { buildLegalMask, decodeMoves, loadMaiaMoveMaps, prepareMaiaPosition, sampleMove } from './maia.js';

type Pending = { resolve: (logits: Float32Array) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
type EngineState = { status: 'loading' | 'downloading' | 'ready' | 'error'; progress: number; message?: string };

export function useMaia() {
  const [state, setState] = useState<EngineState>({ status: 'loading', progress: 0 });
  const [attempt, setAttempt] = useState(0);
  const worker = useRef<Worker | null>(null);
  const maps = useRef<Awaited<ReturnType<typeof loadMaiaMoveMaps>> | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const nextId = useRef(0);

  useEffect(() => {
    let active = true;
    let ready = false;
    const w = new Worker('/engine/maia-worker.js');
    worker.current = w;
    maps.current = null;
    setState({ status: 'loading', progress: 0 });
    const fail = (message: string) => {
      if (!active) return;
      ready = false;
      setState({ status: 'error', progress: 0, message });
      for (const request of pending.current.values()) {
        clearTimeout(request.timer);
        request.reject(new Error(message));
      }
      pending.current.clear();
      w.terminate();
    };
    const timeout = setTimeout(() => fail('Maia took too long to load. Check your connection and retry.'), 180_000);
    const markReady = () => {
      if (active && ready && maps.current) {
        clearTimeout(timeout);
        setState({ status: 'ready', progress: 100 });
      }
    };
    w.onmessage = ({ data }) => {
      if (!active) return;
      if (data.type === 'status') {
        if (data.status === 'no-cache') w.postMessage({ type: 'download' });
        if (data.status === 'downloading') setState({ status: 'downloading', progress: 0 });
        if (data.status === 'ready') { ready = true; markReady(); }
      } else if (data.type === 'progress') {
        setState({ status: 'downloading', progress: data.progress });
      } else if (data.type === 'inference-result') {
        const request = pending.current.get(data.id);
        if (request) {
          clearTimeout(request.timer);
          pending.current.delete(data.id);
          request.resolve(new Float32Array(data.logitsMove));
        }
      } else if (data.type === 'error') {
        clearTimeout(timeout);
        fail('Maia could not prepare a move. Please retry.');
      }
    };
    w.onerror = () => { clearTimeout(timeout); fail('Maia could not load. Please retry.'); };
    loadMaiaMoveMaps().then(value => {
      if (active) { maps.current = value; markReady(); }
    }).catch(() => { clearTimeout(timeout); fail('Maia’s move map could not load. Please retry.'); });
    w.postMessage({ type: 'init', modelUrl: '/engine/maia/model.json', modelVersion: modelManifest.version });
    return () => {
      active = false;
      clearTimeout(timeout);
      w.terminate();
      worker.current = null;
      for (const request of pending.current.values()) {
        clearTimeout(request.timer);
        request.reject(new Error('Maia session ended.'));
      }
      pending.current.clear();
    };
  }, [attempt]);

  const getMove = useCallback(async (fen: string, elo: number) => {
    if (!worker.current || !maps.current || state.status !== 'ready') throw new Error('Maia is not ready.');
    const { isBlack, workingFen, tokens } = prepareMaiaPosition(fen);
    const moveMaps = maps.current;
    const id = nextId.current++;
    const logits = await new Promise<Float32Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.current.delete(id);
        reject(new Error('Maia took too long to choose a move. Please retry.'));
      }, 30_000);
      pending.current.set(id, { resolve, reject, timer });
      worker.current!.postMessage({ type: 'inference', id, tokens: tokens.buffer, eloSelfs: [elo], eloOppos: [elo], batchSize: 1 }, [tokens.buffer]);
    });
    const legalMask = buildLegalMask(workingFen, moveMaps.allMoves);
    const probabilities = decodeMoves(logits, legalMask, isBlack, moveMaps.allMovesReversed);
    const move = sampleMove(probabilities);
    // Independently check the decoded move in the original, unmirrored position.
    new Chess(fen).move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] || 'q' });
    return move;
  }, [state.status]);

  return { ...state, getMove, retry: () => setAttempt(value => value + 1) };
}
