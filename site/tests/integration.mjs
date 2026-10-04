import {localIdentity} from './local-identity.mjs';
import assert from 'node:assert/strict';
const base=process.env.CHESSCOOP_TEST_URL||'http://127.0.0.1:5180';
if(!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname))throw new Error('Tests require a local Worker.');
const identity={cookie:(await localIdentity('integration-'+crypto.randomUUID())).cookie};
async function request(action,data={},auth=true){const response=await fetch(base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json',...(auth?identity: {})},body:JSON.stringify({action,...data})});return {status:response.status,...await response.json()}}
assert.equal((await request('create',{name:'Unauthorized',elo:500},false)).status,401);
let result=await request('create',{name:'Integration test',elo:500});assert.equal(result.status,200,JSON.stringify(result));let room=result.room;
assert.equal((await request('start',{id:room.id,version:0,elo:2500})).status,400);
result=await request('start',{id:room.id,version:0,elo:500});room=result.room;assert.equal(room.status,'playing');
assert.equal((await request('move',{id:room.id,version:room.version,from:'e2',to:'e5'})).status,400);
const moves=await Promise.all(['e4','e3'].map(to=>request('move',{id:room.id,version:room.version,from:'e2',to})));assert.deepEqual(moves.map(m=>m.status).sort(),[200,409]);room=moves.find(m=>m.status===200).room;
assert.equal((await request('move',{id:room.id,version:room.version,from:'e7',to:'e5'})).status,400);
room=(await request('move',{id:room.id,version:room.version,from:'e7',to:'e5',bot:true})).room;assert.ok(room.pgn.includes('e5'));
assert.equal((await request('join',{id:'missing'})).status,404);
const saved=await fetch(base+'/api/rooms?id='+room.id,{headers:identity}).then(r=>r.json());assert.equal(saved.room.pgn,room.pgn);
await request('finish',{id:room.id,version:room.version});console.log('PASS: authentication enforcement, create, start, Elo bounds, illegal moves, concurrent moves, turn enforcement, bot moves, invalid invites, persistence, finish.');

const guestUser=await localIdentity('guest-'+crypto.randomUUID());
const guest={cookie:guestUser.cookie};
async function guestRequest(action,data){const r=await fetch(base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json',...guest},body:JSON.stringify({action,...data})});return {status:r.status,...await r.json()};}
room=(await request('create',{name:'Leave test',elo:500})).room;
assert.equal((await guestRequest('join',{id:room.id})).status,200);
room=(await request('start',{id:room.id,version:room.version,elo:500})).room;
assert.equal((await request('leave',{id:room.id,version:room.version})).status,200);
const remaining=await fetch(base+'/api/rooms?id='+room.id,{headers:guest}).then(r=>r.json());
assert.equal(remaining.room.owner,guestUser.id);
assert.equal(remaining.room.status,'playing');
assert.equal(remaining.room.members.length,1);
assert.equal((await request('move',{id:room.id,version:remaining.room.version,from:'e2',to:'e4'})).status,403);
assert.equal((await request('create',{name:'Freed slot',elo:500})).status,200);
assert.equal((await guestRequest('leave',{id:room.id,version:remaining.room.version})).status,200);
const rejoined=await request('join',{id:room.id});
assert.equal(rejoined.room.status,'finished');
console.log('PASS: 500 Elo, leave frees slot, host transfer, departed member denied, last departure ends game.');
