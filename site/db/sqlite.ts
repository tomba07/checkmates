import Database from 'better-sqlite3';
import {mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';

let connection: Database.Database | undefined;
export function getDatabase() {
  if(!connection) {
    const filename=resolve(process.env.DATABASE_PATH||'.data/checkmates.sqlite');
    mkdirSync(dirname(filename),{recursive:true});
    connection=new Database(filename);
    connection.pragma('journal_mode = WAL');
    connection.pragma('foreign_keys = ON');
    connection.pragma('busy_timeout = 5000');
  }
  return connection;
}

class Statement {
  constructor(private sql:string,private values:unknown[]=[]){}
  bind(...values:unknown[]){return new Statement(this.sql,values);}
  first<T=Record<string,unknown>>(){return (getDatabase().prepare(this.sql).get(...this.values) as T|undefined)??null;}
  all(){return {results:getDatabase().prepare(this.sql).all(...this.values)};}
  run(){const result=getDatabase().prepare(this.sql).run(...this.values);return {meta:{changes:result.changes}};}
}
export const roomDatabase={
  prepare(sql:string){return new Statement(sql);},
  batch(statements:Statement[]){return getDatabase().transaction(()=>statements.map(statement=>statement.run()))();}
};
