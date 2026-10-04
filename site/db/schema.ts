import {sqliteTable,text,integer,primaryKey} from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('rooms',{id:text('id').primaryKey(),name:text('name').notNull(),owner:text('owner').notNull(),elo:integer('elo').notNull(),pgn:text('pgn').notNull().default(''),version:integer('version').notNull().default(0),status:text('status').notNull().default('waiting')});
export const members=sqliteTable('members',{roomId:text('room_id').notNull().references(()=>rooms.id),userId:text('user_id').notNull(),name:text('name').notNull()},t=>[primaryKey({columns:[t.roomId,t.userId]})]);

export const user=sqliteTable('user',{
 id:text('id').primaryKey(),name:text('name').notNull(),email:text('email').notNull().unique(),emailVerified:integer('emailVerified',{mode:'boolean'}).notNull().default(false),image:text('image'),
 createdAt:integer('createdAt',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updatedAt',{mode:'timestamp_ms'}).notNull(),
});
export const session=sqliteTable('session',{
 id:text('id').primaryKey(),expiresAt:integer('expiresAt',{mode:'timestamp_ms'}).notNull(),token:text('token').notNull().unique(),
 createdAt:integer('createdAt',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updatedAt',{mode:'timestamp_ms'}).notNull(),
 ipAddress:text('ipAddress'),userAgent:text('userAgent'),userId:text('userId').notNull().references(()=>user.id,{onDelete:'cascade'}),
});
export const account=sqliteTable('account',{
 id:text('id').primaryKey(),accountId:text('accountId').notNull(),providerId:text('providerId').notNull(),userId:text('userId').notNull().references(()=>user.id,{onDelete:'cascade'}),
 accessToken:text('accessToken'),refreshToken:text('refreshToken'),idToken:text('idToken'),
 accessTokenExpiresAt:integer('accessTokenExpiresAt',{mode:'timestamp_ms'}),refreshTokenExpiresAt:integer('refreshTokenExpiresAt',{mode:'timestamp_ms'}),scope:text('scope'),password:text('password'),
 createdAt:integer('createdAt',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updatedAt',{mode:'timestamp_ms'}).notNull(),
});
export const verification=sqliteTable('verification',{
 id:text('id').primaryKey(),identifier:text('identifier').notNull(),value:text('value').notNull(),expiresAt:integer('expiresAt',{mode:'timestamp_ms'}).notNull(),
 createdAt:integer('createdAt',{mode:'timestamp_ms'}).notNull(),updatedAt:integer('updatedAt',{mode:'timestamp_ms'}).notNull(),
});
export const rateLimit=sqliteTable('rateLimit',{id:text('id').primaryKey(),key:text('key').notNull().unique(),count:integer('count').notNull(),lastRequest:integer('lastRequest').notNull()});
