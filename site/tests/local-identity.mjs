// Test-only fixture: seed isolated users in the local D1 database, then use real login.
import {DatabaseSync} from 'node:sqlite';
import {readdirSync} from 'node:fs';
import {hashPassword} from 'better-auth/crypto';
import assert from 'node:assert/strict';
export async function localIdentity(id) {
 const base=process.env.CHESSCOOP_TEST_URL||'http://127.0.0.1:5180';
 assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname));
 const db=new DatabaseSync('.data/checkmates.sqlite');
 const email=id+'@test.invalid',password=crypto.randomUUID()+'-Test',now=new Date().toISOString();
 db.prepare('INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt) VALUES (?,?,?,1,?,?)').run(id,id,email,now,now);
 db.prepare('INSERT INTO account (id,accountId,providerId,userId,password,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,'credential',id,await hashPassword(password),now,now);
 db.close();
 const r=await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{'content-type':'application/json',origin:base,'x-real-ip':'192.0.2.'+(Math.floor(Math.random()*240)+1)},body:JSON.stringify({email,password})});
 assert.equal(r.status,200);
 return {id,email,cookie:r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};
}
