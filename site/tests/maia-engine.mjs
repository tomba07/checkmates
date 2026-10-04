import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Chess } from 'chess.js';
import { buildLegalMask, decodeMoves, prepareMaiaPosition, sampleMove } from '../lib/maia.js';

// Exercise the shipped worker and real ONNX/WASM model without a browser.
// IndexedDB is intentionally absent: cache failures must not block play.
const publicRoot = new URL('../public/', import.meta.url);
const map = JSON.parse(await readFile(new URL('engine/maia/all_moves_maia3.json', publicRoot)));
const reverse = JSON.parse(await readFile(new URL('engine/maia/all_moves_maia3_reversed.json', publicRoot)));
const sandbox = {
  console, WebAssembly, Float32Array, Float64Array, Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array, BigInt64Array, BigUint64Array, ArrayBuffer, DataView,
  TextDecoder, TextEncoder, URL, Blob, Request, Response, AbortController, crypto, performance,
  setTimeout, clearTimeout, navigator: { hardwareConcurrency: 1 }, location: { href: 'http://localhost/engine/maia-worker.js' },
  fetch: async input => {
    if (typeof input === 'string' && input.startsWith('/')) {
      try { return new Response(await readFile(new URL(input.slice(1), publicRoot)), {headers:{'Content-Type': input.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'}}); }
      catch { return new Response('Not found', { status: 404 }); }
    }
    return fetch(input);
  }
};
sandbox.self = sandbox;
const context = vm.createContext(sandbox);
sandbox.importScripts = path => vm.runInContext(readFileSync(new URL(path.slice(1), publicRoot), 'utf8'), context, {filename:path});
const waiters = [];
const messages = [];
sandbox.postMessage = data => {
  messages.push(data);
  for (let i = waiters.length - 1; i >= 0; i--) {
    if (waiters[i].match(data)) { waiters[i].resolve(data); waiters.splice(i, 1); }
  }
};
function waitFor(match) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for Maia')), 60_000);
    waiters.push({match: data => match(data) || data.type === 'error', resolve: data => {clearTimeout(timer); data.type === 'error' ? reject(new Error(data.message)) : resolve(data);}});
  });
}
vm.runInContext(await readFile(new URL('engine/maia-worker.js', publicRoot), 'utf8'), context);
await sandbox.onmessage({ data: {type:'init', modelUrl:'/engine/maia/model.json', modelVersion:'test'} });
assert.ok(messages.some(m=>m.status==='no-cache'));
let ready = waitFor(m=>m.status==='ready');
await sandbox.onmessage({data:{type:'download'}});
await ready;
assert.ok(messages.some(m=>m.type==='progress'&&m.progress===100));
let sequence=0;
async function predict(fen,elo) {
  const {tokens,isBlack,workingFen}=prepareMaiaPosition(fen);
  const id=sequence++;
  const answer=waitFor(m=>m.type==='inference-result'&&m.id===id);
  await sandbox.onmessage({data:{type:'inference',id,tokens:tokens.buffer,eloSelfs:[elo],eloOppos:[elo],batchSize:1}});
  const {logitsMove}=await answer;
  const logits=new Float32Array(logitsMove);
  assert.equal(logits.length,4352);
  const mask=buildLegalMask(workingFen,map);
  const probabilities=decodeMoves(logits,mask,isBlack,reverse);
  for(const move of Object.keys(probabilities)) assert.ok(new Chess(fen).move({from:move.slice(0,2),to:move.slice(2,4),promotion:move[4]||'q'}));
  assert.ok(Math.abs(Object.values(probabilities).reduce((a,b)=>a+b,0)-1)<1e-5);
  return {logits,move:sampleMove(probabilities,()=>0.5)};
}
const game=new Chess();game.move('e4');
const low=await predict(game.fen(),500), high=await predict(game.fen(),2400);
assert.ok(low.logits.some((v,i)=>Math.abs(v-high.logits[i])>1e-5),'Elo changes actual model predictions');
for(let i=0;i<8;i++) {const result=await predict(game.fen(),1500);game.move({from:result.move.slice(0,2),to:result.move.slice(2,4),promotion:result.move[4]||'q'});}
// Verify policy encoding/decoding for castling, en passant, and promotions.
for(const fen of ['r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1','4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1','4k3/8/8/8/8/8/1p6/4K3 b - - 0 1']) await predict(fen,1500);
assert.throws(()=>decodeMoves(new Float32Array(4352).fill(NaN),buildLegalMask(prepareMaiaPosition(game.fen()).workingFen,map),false,reverse));
console.log('PASS: real Maia 3 WASM inference, cache-unavailable fallback, verified model chunks, Elo-conditioned predictions, legal moves for both colors, castling, en passant, promotions, invalid logits.');
