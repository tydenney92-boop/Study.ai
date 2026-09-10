module.exports={id:15,name:"syllabus-schedule-import",up(db){db.exec(`
ALTER TABLE course_tasks ADD COLUMN schedule_source_material_id INTEGER;
ALTER TABLE course_tasks ADD COLUMN schedule_source_snippet TEXT;
ALTER TABLE course_tasks ADD COLUMN schedule_import_key TEXT;
ALTER TABLE course_tasks ADD COLUMN schedule_imported_at TEXT;
CREATE UNIQUE INDEX course_tasks_schedule_import_key_idx ON course_tasks(course_id,schedule_import_key) WHERE schedule_import_key IS NOT NULL;
CREATE INDEX course_tasks_schedule_material_idx ON course_tasks(schedule_source_material_id) WHERE schedule_source_material_id IS NOT NULL;
CREATE TRIGGER course_tasks_schedule_material_insert BEFORE INSERT ON course_tasks WHEN NEW.schedule_source_material_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM materials WHERE id=NEW.schedule_source_material_id AND course_id=NEW.course_id) BEGIN SELECT RAISE(ABORT,'Schedule source must belong to task course'); END;
`);}};
