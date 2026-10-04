// Run inside the deployed container. Uses only a uniquely named Resend test account.
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import Database from 'better-sqlite3';
const base='http://127.0.0.1:3000',origin=process.env.BETTER_AUTH_URL;
assert.equal(origin,'https://checkmates.mteschke.com');
const email='delivered+checkmates-smoke-'+randomUUID()+'@resend.dev';
const password=randomUUID()+'-Test';
const db=new Database(process.env.DATABASE_PATH);
db.pragma('foreign_keys = ON');
let cookie='';
async function post(path,body) {
 const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',origin,cookie,'x-real-ip':'192.0.2.250'},body:JSON.stringify(body)});
 return {status:r.status,data:await r.json(),headers:r.headers};
}
try {
 assert.equal((await fetch(base+'/api/health')).status,200);
 assert.equal((await fetch(base+'/api/rooms')).status,401);
 let result=await post('/api/auth/sign-up/email',{email,password,name:'Deployment test',callbackURL:origin+'/'});
 assert.equal(result.status,200,JSON.stringify(result.data));
 const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const payload=encode({alg:'HS256'})+'.'+encode({email,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+300});
 const token=payload+'.'+createHmac('sha256',process.env.BETTER_AUTH_SECRET).update(payload).digest('base64url');
 const r=await fetch(base+'/api/auth/verify-email?token='+token+'&callbackURL='+encodeURIComponent(origin+'/'),{redirect:'manual'});
 assert.equal(r.status,302);
 cookie=r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 assert.ok(cookie.includes('__Secure-'),'production cookies must be secure');
 result=await post('/api/rooms',{action:'create',name:'Deployment test',elo:500});
 assert.equal(result.status,200,JSON.stringify(result.data));
 let room=result.data.room;
 result=await post('/api/rooms',{action:'start',id:room.id,version:room.version,elo:500});
 assert.equal(result.status,200);room=result.data.room;
 assert.equal((await post('/api/rooms',{action:'leave',id:room.id,version:room.version})).status,200);
 assert.equal((await post('/api/auth/sign-out',{})).status,200);
 assert.equal((await fetch(base+'/api/rooms',{headers:{cookie}})).status,401);
 result=await post('/api/auth/sign-in/email',{email,password});
 assert.equal(result.status,200);
 console.log('PASS: deployed Linux runtime, Resend email, verification, secure session cookie, 500 Elo game creation/start/leave, sign-out, password login.');
} finally {
 const user=db.prepare('SELECT id FROM user WHERE email=?').get(email);
 if(user)db.transaction(()=>{
  db.prepare('DELETE FROM members WHERE user_id=? OR room_id IN (SELECT id FROM rooms WHERE owner=?)').run(user.id,user.id);
  db.prepare('DELETE FROM rooms WHERE owner=?').run(user.id);
  db.prepare('DELETE FROM verification WHERE value=?').run(user.id);
  db.prepare('DELETE FROM user WHERE id=? AND email=?').run(user.id,email);
 })();
 db.close();
}
