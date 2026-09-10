module.exports={id:14,name:"lms-import",up(db){db.exec(`
ALTER TABLE course_tasks ADD COLUMN external_course_id TEXT;
ALTER TABLE course_tasks ADD COLUMN external_url TEXT;
ALTER TABLE course_tasks ADD COLUMN external_status TEXT;
ALTER TABLE course_tasks ADD COLUMN removed_at TEXT;
CREATE TABLE lms_connections(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,provider TEXT NOT NULL,base_url TEXT NOT NULL,access_token_encrypted TEXT NOT NULL,refresh_token_encrypted TEXT,token_expires_at TEXT,provider_user_id TEXT,last_synced_at TEXT,status TEXT NOT NULL DEFAULT 'connected' CHECK(status IN('connected','expired','disconnected','error')),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,UNIQUE(user_id,provider,base_url));
CREATE INDEX lms_connections_user_idx ON lms_connections(user_id);
CREATE TABLE lms_course_mappings(id INTEGER PRIMARY KEY AUTOINCREMENT,connection_id INTEGER NOT NULL,external_course_id TEXT NOT NULL,external_course_name TEXT NOT NULL DEFAULT '',course_id INTEGER NOT NULL,last_synced_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(connection_id) REFERENCES lms_connections(id) ON DELETE CASCADE,FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,UNIQUE(connection_id,external_course_id));
CREATE INDEX lms_mappings_course_idx ON lms_course_mappings(course_id);
`);}};
