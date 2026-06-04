import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";

let db = null;

export async function getDb() {
  if (db) return db;

  const dbPath = path.resolve(process.cwd(), "chord_ninja.db");
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE,
      title TEXT,
      artist TEXT,
      content TEXT,
      transpose INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  return db;
}

export async function saveSong(url, title, artist, content) {
  const database = await getDb();
  
  // Check if exists
  const existing = await database.get("SELECT * FROM songs WHERE url = ?", [url]);
  if (existing) {
    return existing;
  }

  // Insert new
  const contentStr = typeof content === "string" ? content : JSON.stringify(content);
  const result = await database.run(
    "INSERT INTO songs (url, title, artist, content, transpose, is_favorite) VALUES (?, ?, ?, ?, 0, 0)",
    [url, title, artist, contentStr]
  );
  
  return await database.get("SELECT * FROM songs WHERE id = ?", [result.lastID]);
}

export async function getSongs(search = "", favoritesOnly = false) {
  const database = await getDb();
  let query = "SELECT * FROM songs WHERE 1=1";
  const params = [];

  if (favoritesOnly) {
    query += " AND is_favorite = 1";
  }

  if (search) {
    query += " AND (title LIKE ? OR artist LIKE ?)";
    const term = `%${search}%`;
    params.push(term, term);
  }

  query += " ORDER BY is_favorite DESC, title ASC";
  
  const songs = await database.all(query, params);
  return songs.map(s => ({
    ...s,
    content: JSON.parse(s.content)
  }));
}

export async function updateSong(id, transpose, isFavorite) {
  const database = await getDb();
  
  if (transpose !== undefined && isFavorite !== undefined) {
    await database.run("UPDATE songs SET transpose = ?, is_favorite = ? WHERE id = ?", [transpose, isFavorite, id]);
  } else if (transpose !== undefined) {
    await database.run("UPDATE songs SET transpose = ? WHERE id = ?", [transpose, id]);
  } else if (isFavorite !== undefined) {
    await database.run("UPDATE songs SET is_favorite = ? WHERE id = ?", [isFavorite, id]);
  }

  return await database.get("SELECT * FROM songs WHERE id = ?", [id]);
}

export async function deleteSong(id) {
  const database = await getDb();
  await database.run("DELETE FROM songs WHERE id = ?", [id]);
}

export async function getSetting(key, defaultVal) {
  const database = await getDb();
  const row = await database.get("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : defaultVal;
}

export async function saveSetting(key, value) {
  const database = await getDb();
  await database.run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
    [key, String(value), String(value)]
  );
}
