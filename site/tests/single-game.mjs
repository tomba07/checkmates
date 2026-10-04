import {localIdentity} from './local-identity.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Run against the built local Worker with real email/password sessions.
// These unique users and rooms isolate the test from the developer's own games.
const base = process.env.CHESSCOOP_TEST_URL || 'http://127.0.0.1:5180';
if (!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname)) throw new Error('Tests require a local Worker.');
const prefix = 'single-game-' + randomUUID();
const users = Object.fromEntries(await Promise.all(['alice','bob','carol','dave','erin'].map(async name=>[name, await localIdentity(prefix+'-'+name)])));
const created = [];
async function request(user, action, data={}) {
  const response = await fetch(base+'/api/rooms', {
    method:'POST', headers:{'content-type':'application/json',cookie:user.cookie},
    body:JSON.stringify({action,...data}),
  });
  return {status:response.status,...await response.json()};
}
async function read(user,id='') {
  const response=await fetch(base+'/api/rooms'+(id?'?id='+id:''),{headers:{cookie:user.cookie}});
  assert.equal(response.status,200);
  return response.json();
}
async function create(user,name) {
  const result=await request(user,'create',{name,elo:1500});
  assert.equal(result.status,200,JSON.stringify(result));
  created.push({id:result.room.id,user});return result.room;
}
async function start(user,room) { return request(user,'start',{id:room.id,version:room.version,elo:1500}); }
async function finish(user,id) { const {room}=await read(user,id); const result=await request(user,'finish',{id,version:room.version});assert.equal(result.status,200,JSON.stringify(result)); }
const {alice,bob,carol,dave,erin}=users;
try {
  // Two tabs racing to start different games for the same person: exactly one wins.
  const a=await create(alice,'Alice A'),b=await create(alice,'Alice B');
  const starts=await Promise.all([start(alice,a),start(alice,b)]);
  assert.deepEqual(starts.map(r=>r.status).sort(),[200,409]);
  const active=starts.find(r=>r.status===200).room;
  const idle=active.id===a.id?b:a;
  assert.equal((await read(alice)).activeRoomId,active.id);
  assert.equal((await request(alice,'join',{id:active.id})).status,200,'rejoining own game is idempotent');
  const blockedCreate=await request(alice,'create',{name:'Extra',elo:1500});
  assert.equal(blockedCreate.status,409);assert.equal(blockedCreate.activeRoomId,active.id);
  assert.equal((await read(alice)).rooms.length,2,'blocked create leaves no empty room');

  const c=await create(bob,'Bob'),d=await create(carol,'Carol');
  assert.equal((await start(bob,c)).status,200);assert.equal((await start(carol,d)).status,200);
  assert.equal((await request(alice,'join',{id:c.id})).status,409,'cannot join a second active game');
  assert.equal((await request(alice,'join',{id:idle.id})).status,409,'cannot switch to another group while playing');

  // Different hosts with the same teammate cannot start overlapping games.
  const shared=await create(dave,'Shared');
  assert.equal((await request(alice,'join',{id:shared.id})).status,409);
  await finish(alice,active.id);
  assert.equal((await request(alice,'join',{id:shared.id})).status,200);
  assert.equal((await start(dave,shared)).status,200);
  const hostBusy=await start(alice,idle);assert.equal(hostBusy.status,409);
  await finish(dave,shared.id);
  assert.equal((await start(alice,idle)).status,200);
  const teammateBusy=await start(dave,(await read(dave,shared.id)).room);
  assert.equal(teammateBusy.status,409);assert.equal(teammateBusy.code,'TEAM_BUSY');
  assert.equal(teammateBusy.activeRoomId,undefined,'do not disclose another teammate’s private game');

  // Race two live invitations for the same user: only one membership is inserted.
  const joined=await Promise.all([request(erin,'join',{id:c.id}),request(erin,'join',{id:d.id})]);
  assert.deepEqual(joined.map(r=>r.status).sort(),[200,409]);
  assert.equal((await read(erin)).rooms.length,1);

  // Finishing immediately frees every member, including non-host teammates.
  await finish(alice,idle.id);
  assert.equal((await start(dave,(await read(dave,shared.id)).room)).status,200);
  await finish(dave,shared.id);

  // Normal checkmate also releases the game; no explicit Finish action required.
  const mate=await create(alice,'Checkmate');let running=(await start(alice,mate)).room;
  for (const [from,to,bot] of [['f2','f3',false],['e7','e5',true],['g2','g4',false],['d8','h4',true]]) {
    const result=await request(alice,'move',{id:running.id,version:running.version,from,to,bot});assert.equal(result.status,200);running=result.room;
  }
  assert.equal(running.status,'finished');assert.equal((await read(alice)).activeRoomId,null);
  assert.equal((await start(alice,running)).status,200,'rematch works');
  await finish(alice,mate.id);
  await finish(carol,d.id);
  const raceA=await create(dave,'Shared race A'),raceB=await create(carol,'Shared race B');
  assert.equal((await request(alice,'join',{id:raceA.id})).status,200);
  assert.equal((await request(alice,'join',{id:raceB.id})).status,200);
  const sharedRace=await Promise.all([start(dave,raceA),start(carol,raceB)]);
  assert.deepEqual(sharedRace.map(r=>r.status).sort(),[200,409]);
  assert.equal(sharedRace.find(r=>r.status===409).code,'TEAM_BUSY');
  console.log('PASS: concurrent starts and joins, one game per teammate, rejoin, no orphan groups, active-game lookup, privacy, finish, checkmate, rematch.');
} finally {
  for (const {id,user} of created) {
    const {room}=await read(user,id);
    if(room.status==='playing') await finish(user,id);
  }
}
