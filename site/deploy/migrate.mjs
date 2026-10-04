import Database from 'better-sqlite3';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const filename=resolve(process.env.DATABASE_PATH||'.data/checkmates.sqlite');
mkdirSync(dirname(filename),{recursive:true});
const db=new Database(filename);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.exec('CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)');
const journal=JSON.parse(readFileSync('drizzle/meta/_journal.json','utf8'));
for(const entry of journal.entries){
 const sql=readFileSync('drizzle/'+entry.tag+'.sql','utf8');
 const checksum=createHash('sha256').update(sql).digest('hex');
 const applied=db.prepare('SELECT checksum FROM app_migrations WHERE name=?').get(entry.tag);
 if(applied){if(applied.checksum!==checksum)throw new Error('Applied migration changed: '+entry.tag);continue;}
 db.transaction(()=>{
  db.exec(sql);
  db.prepare('INSERT INTO app_migrations VALUES (?,?,?)').run(entry.tag,checksum,new Date().toISOString());
 })();
 console.log('Applied migration:',entry.tag);
}
db.close();
