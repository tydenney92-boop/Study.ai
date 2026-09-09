module.exports = {
    id: 13,
    name: "course-tasks",
    up(database) {
        database.exec(`
            CREATE TABLE IF NOT EXISTS course_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                course_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                type TEXT NOT NULL CHECK (type IN (
                    'assignment', 'exam', 'quiz', 'reading', 'project', 'paper', 'other'
                )),
                description TEXT NOT NULL DEFAULT '',
                due_at TEXT NOT NULL,
                start_at TEXT,
                completed_at TEXT,
                priority TEXT CHECK (priority IS NULL OR priority IN ('low', 'normal', 'high')),
                unit_id INTEGER,
                material_id INTEGER,
                estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
                external_provider TEXT,
                external_id TEXT,
                external_updated_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL,
                FOREIGN KEY (material_id) REFERENCES materials(id) ON DELETE SET NULL
            );

            CREATE INDEX course_tasks_course_due_idx ON course_tasks(course_id, due_at);
            CREATE INDEX course_tasks_due_incomplete_idx ON course_tasks(due_at)
                WHERE completed_at IS NULL;
            CREATE UNIQUE INDEX course_tasks_external_identity_idx
                ON course_tasks(course_id, external_provider, external_id)
                WHERE external_provider IS NOT NULL AND external_id IS NOT NULL;

            CREATE TRIGGER course_tasks_unit_course_insert
            BEFORE INSERT ON course_tasks
            WHEN NEW.unit_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM units WHERE id = NEW.unit_id AND course_id = NEW.course_id
            ) BEGIN SELECT RAISE(ABORT, 'Task unit must belong to its course'); END;

            CREATE TRIGGER course_tasks_material_course_insert
            BEFORE INSERT ON course_tasks
            WHEN NEW.material_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM materials WHERE id = NEW.material_id AND course_id = NEW.course_id
            ) BEGIN SELECT RAISE(ABORT, 'Task material must belong to its course'); END;

            CREATE TRIGGER course_tasks_links_course_update
            BEFORE UPDATE OF course_id, unit_id, material_id ON course_tasks
            WHEN (NEW.unit_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM units WHERE id = NEW.unit_id AND course_id = NEW.course_id
            )) OR (NEW.material_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM materials WHERE id = NEW.material_id AND course_id = NEW.course_id
            )) BEGIN SELECT RAISE(ABORT, 'Task links must belong to its course'); END;
        `);
    }
};
