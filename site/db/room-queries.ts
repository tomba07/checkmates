// Each write checks availability inside the same SQLite statement as the mutation.
// A separate read-then-write check would allow concurrent requests to overlap games.
export const activeRoomSql = `
  SELECT r.id FROM rooms r JOIN members m ON m.room_id = r.id
  WHERE m.user_id = ? AND r.status = 'playing'
  ORDER BY r.id LIMIT 1
`;

export const createRoomSql = `
  INSERT INTO rooms(id, name, owner, elo)
  SELECT ?, ?, ?, ?
  WHERE NOT EXISTS (
    SELECT 1 FROM rooms r JOIN members m ON m.room_id = r.id
    WHERE m.user_id = ? AND r.status = 'playing'
  )
`;

export const joinRoomSql = `
  INSERT INTO members(room_id, user_id, name)
  SELECT ?, ?, ?
  WHERE NOT EXISTS (
    SELECT 1 FROM rooms r JOIN members m ON m.room_id = r.id
    WHERE m.user_id = ? AND r.status = 'playing' AND r.id <> ?
  )
  ON CONFLICT(room_id, user_id) DO UPDATE SET name = excluded.name
`;

export const startRoomSql = `
  UPDATE rooms SET pgn = '', status = 'playing', elo = ?, version = version + 1
  WHERE id = ? AND version = ? AND status <> 'playing'
  AND NOT EXISTS (
    SELECT 1 FROM members team
    JOIN members other ON other.user_id = team.user_id AND other.room_id <> team.room_id
    JOIN rooms ongoing ON ongoing.id = other.room_id AND ongoing.status = 'playing'
    WHERE team.room_id = rooms.id
  )
`;
