import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('rooms',{id:text('id').primaryKey(),name:text('name').notNull(),owner:text('owner').notNull(),elo:integer('elo').notNull(),pgn:text('pgn').notNull().default(''),version:integer('version').notNull().default(0),status:text('status').notNull().default('waiting')});
export const members=sqliteTable('members',{roomId:text('room_id').notNull().references(()=>rooms.id),userId:text('user_id').notNull(),name:text('name').notNull()},t=>[primaryKey({columns:[t.roomId,t.userId]})]);
