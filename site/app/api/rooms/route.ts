import { getCurrentUser } from '@/lib/current-user';
import {getAuthOrigins} from '@/lib/auth-origins';
import {roomDatabase} from '@/db/sqlite';
import { Chess } from 'chess.js';
import { activeRoomSql, createRoomSql, joinRoomSql, startRoomSql } from '@/db/room-queries';

type Room = {id:string; name:string; owner:string; elo:number; pgn:string; version:number; status:string};
function db() {
  return roomDatabase;
}
const reply = (data:unknown, status=200) => Response.json(data, {status, headers:{'Cache-Control':'no-store'}});
async function getRoom(id:string) {
  const room = await db().prepare('SELECT * FROM rooms WHERE id=?').bind(id).first<Room>();
  if (!room) return null;
  const members = await db().prepare('SELECT user_id AS id,name FROM members WHERE room_id=?').bind(id).all();
  return {...room, members:members.results};
}
async function isMember(id:string, user:string) {
  return !!await db().prepare('SELECT 1 FROM members WHERE room_id=? AND user_id=?').bind(id,user).first();
}
async function activeRoom(user:string) {
  return (await db().prepare(activeRoomSql).bind(user).first<{id:string}>())?.id ?? null;
}
async function activeGameConflict(user:string) {
  return reply({code:'ACTIVE_GAME', activeRoomId:await activeRoom(user), error:'Leave or finish your current game before joining or starting another.'},409);
}
function validElo(elo:number) { return Number.isInteger(elo) && elo>=500 && elo<=2400; }

export async function GET(req:Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return reply({error:'Please sign in first.'},401);
    const id = new URL(req.url).searchParams.get('id');
    if (id) {
      if (!await isMember(id,user.userId)) return reply({error:'Join this group before opening its board.'},403);
      return reply({room:await getRoom(id), activeRoomId:await activeRoom(user.userId)});
    }
    const rows = await db().prepare('SELECT r.* FROM rooms r JOIN members m ON m.room_id=r.id WHERE m.user_id=? ORDER BY r.name').bind(user.userId).all();
    return reply({rooms:rows.results, activeRoomId:await activeRoom(user.userId)});
  } catch (error) {
    console.error(error);
    return reply({error:'Your groups could not be loaded. Please try again.'},503);
  }
}

export async function POST(req:Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return reply({error:'Please sign in first.'},401);
    if (req.headers.get('origin') && !getAuthOrigins().includes(req.headers.get('origin')!)) return reply({error:'Invalid request origin.'},403);
    let body:Record<string,unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed!=='object' || Array.isArray(parsed)) return reply({error:'Invalid request.'},400);
      body = parsed as Record<string,unknown>;
    } catch { return reply({error:'Invalid request.'},400); }
    const {action} = body;
    let id = typeof body.id==='string' ? body.id : '';
    const display = user.fullName || user.email.split('@')[0];

    if (action==='create') {
      const name = typeof body.name==='string' ? body.name.trim() : '';
      const elo = Number(body.elo);
      if (!name || name.length>48 || !validElo(elo)) return reply({error:'Choose a name and an Elo between 500 and 2400.'},400);
      id = crypto.randomUUID();
      const results = await db().batch([
        db().prepare(createRoomSql).bind(id,name,user.userId,elo,user.userId),
        db().prepare('INSERT INTO members(room_id,user_id,name) SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM rooms WHERE id=?)').bind(id,user.userId,display,id),
      ]);
      if (!results[0].meta.changes) return activeGameConflict(user.userId);
      return reply({room:await getRoom(id)});
    }
    if (action==='join') {
      if (!id || id.length>100 || !await getRoom(id)) return reply({error:'That invite could not be found. Check the link and try again.'},404);
      const joined = await db().prepare(joinRoomSql).bind(id,user.userId,display,user.userId,id).run();
      if (!joined.meta.changes) return activeGameConflict(user.userId);
      return reply({room:await getRoom(id)});
    }
    if (!await isMember(id,user.userId)) return reply({error:'You are not a member of this group.'},403);
    const room = await getRoom(id);
    if (!room) return reply({error:'Group not found.'},404);
    if (body.version!==room.version) return reply({error:'The board changed. Your group’s latest move has been loaded.'},409);

    if (action==='leave') {
      const results = await db().batch([
        db().prepare('DELETE FROM members WHERE room_id=? AND user_id=? AND EXISTS (SELECT 1 FROM rooms WHERE id=? AND version=?)').bind(id,user.userId,id,room.version),
        db().prepare(`UPDATE rooms SET
          owner=CASE WHEN owner=? THEN COALESCE((SELECT user_id FROM members WHERE room_id=? ORDER BY user_id LIMIT 1),owner) ELSE owner END,
          status=CASE WHEN NOT EXISTS (SELECT 1 FROM members WHERE room_id=?) THEN 'finished' ELSE status END,
          version=version+1 WHERE id=? AND changes()>0`).bind(user.userId,id,id,id),
      ]);
      if (!results[0].meta.changes) return reply({error:'The board changed. Please try leaving again.'},409);
      return reply({left:true,activeRoomId:await activeRoom(user.userId)});
    }

    if (action==='start') {
      if (room.owner!==user.userId) return reply({error:'Only the host can start a new game.'},403);
      if (room.status==='playing') return reply({error:'Finish the current game first.'},409);
      const elo = Number(body.elo);
      if (!validElo(elo)) return reply({error:'Choose an Elo between 500 and 2400.'},400);
      const started = await db().prepare(startRoomSql).bind(elo,id,room.version).run();
      if (!started.meta.changes) {
        const ownGame = await activeRoom(user.userId);
        if (ownGame && ownGame!==id) return activeGameConflict(user.userId);
        const latest = await getRoom(id);
        if (latest?.version!==room.version) return reply({error:'The board changed. Please try again.'},409);
        return reply({code:'TEAM_BUSY',error:'A teammate is already playing another game. Wait for it to finish.'},409);
      }
      return reply({room:await getRoom(id)});
    }

    let pgn = room.pgn, status = room.status;
    if (action==='finish') {
      if (room.owner!==user.userId) return reply({error:'Only the host can finish the game.'},403);
      status = 'finished';
    } else if (action==='move') {
      if (status!=='playing') return reply({error:'Start a game first.'},400);
      const game = new Chess();
      if (pgn) game.loadPgn(pgn);
      if (game.isGameOver()) return reply({error:'This game is over.'},400);
      if ((game.turn()==='b')!==(body.bot===true)) return reply({error:'Wait for your team’s turn.'},400);
      try { game.move({from:String(body.from),to:String(body.to),promotion:typeof body.promotion==='string'?body.promotion:'q'}); }
      catch { return reply({error:'That move is not legal.'},400); }
      pgn = game.pgn();
      if (game.isGameOver()) status = 'finished';
    } else return reply({error:'Unknown action.'},400);

    const updated = await db().prepare('UPDATE rooms SET pgn=?,status=?,version=version+1 WHERE id=? AND version=?').bind(pgn,status,id,room.version).run();
    if (!updated.meta.changes) return reply({error:'Another teammate moved first. The board has been refreshed.'},409);
    return reply({room:await getRoom(id)});
  } catch (error) {
    console.error(error);
    return reply({error:'Could not save your game. Please try again.'},503);
  }
}
