import {getDatabase} from '@/db/sqlite';
export const dynamic='force-dynamic';
export async function GET(){
 try {getDatabase().prepare('SELECT 1 FROM user LIMIT 1').get();return Response.json({status:'ok'});}
 catch{return Response.json({status:'unavailable'},{status:503});}
}
