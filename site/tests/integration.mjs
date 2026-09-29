import assert from 'node:assert/strict';
const base='http://127.0.0.1:5173';
const login=await fetch(base+'/signin-with-chatgpt?return_to=/',{redirect:'manual'});const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'local sign-in cookie');
async function request(action,data={},auth=true){const response=await fetch(base+'/api/rooms',{method:'POST',headers:{'content-type':'application/json',...(auth?{cookie}: {})},body:JSON.stringify({action,...data})});return {status:response.status,...await response.json()}}
assert.equal((await request('create',{name:'Unauthorized',elo:1500},false)).status,401);
let result=await request('create',{name:'Integration test',elo:1500});assert.equal(result.status,200,JSON.stringify(result));let room=result.room;
assert.equal((await request('start',{id:room.id,version:0,elo:2500})).status,400);
result=await request('start',{id:room.id,version:0,elo:1500});room=result.room;assert.equal(room.status,'playing');
assert.equal((await request('move',{id:room.id,version:room.version,from:'e2',to:'e5'})).status,400);
const moves=await Promise.all(['e4','e3'].map(to=>request('move',{id:room.id,version:room.version,from:'e2',to})));assert.deepEqual(moves.map(m=>m.status).sort(),[200,409]);room=moves.find(m=>m.status===200).room;
assert.equal((await request('move',{id:room.id,version:room.version,from:'e7',to:'e5'})).status,400);
room=(await request('move',{id:room.id,version:room.version,from:'e7',to:'e5',bot:true})).room;assert.ok(room.pgn.includes('e5'));
assert.equal((await request('join',{id:'missing'})).status,404);
const saved=await fetch(base+'/api/rooms?id='+room.id,{headers:{cookie}}).then(r=>r.json());assert.equal(saved.room.pgn,room.pgn);
await request('finish',{id:room.id,version:room.version});console.log('PASS: sign-in, create, start, Elo bounds, illegal moves, concurrent moves, turn enforcement, bot moves, invalid invites, persistence, finish.');
