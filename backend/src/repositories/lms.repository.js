const FIELDS = `
    lms_connections.id,
    lms_connections.user_id AS userId,
    lms_connections.provider,
    lms_connections.base_url AS baseUrl,
    lms_connections.access_token_encrypted AS accessTokenEncrypted,
    lms_connections.refresh_token_encrypted AS refreshTokenEncrypted,
    lms_connections.token_expires_at AS tokenExpiresAt,
    lms_connections.provider_user_id AS providerUserId,
    lms_connections.last_synced_at AS lastSyncedAt,
    lms_connections.status,
    lms_connections.created_at AS createdAt,
    (SELECT COUNT(*) FROM lms_course_mappings mappings
        WHERE mappings.connection_id = lms_connections.id) AS mappedCourseCount
`;

function createLmsRepository(database) {
    function listMappings(connectionId, userId) {
        return database.prepare(`
            SELECT mappings.id,
                   mappings.connection_id AS connectionId,
                   mappings.external_course_id AS externalCourseId,
                   mappings.external_course_name AS externalCourseName,
                   mappings.course_id AS courseId,
                   mappings.last_synced_at AS lastSyncedAt
            FROM lms_course_mappings mappings
            JOIN lms_connections connections ON connections.id = mappings.connection_id
            JOIN courses ON courses.id = mappings.course_id
            WHERE mappings.connection_id = ?
              AND connections.user_id = ?
              AND courses.user_id = ?
            ORDER BY mappings.id
        `).all(connectionId, userId, userId);
    }

    return {
        findOwned(id, userId) {
            return database.prepare(`SELECT ${FIELDS} FROM lms_connections WHERE id = ? AND user_id = ?`)
                .get(id, userId);
        },

        listOwned(userId) {
            return database.prepare(`
                SELECT ${FIELDS}
                FROM lms_connections
                WHERE user_id = ? AND status != 'disconnected'
                ORDER BY id
            `).all(userId);
        },

        saveConnection(userId, connection) {
            database.prepare(`
                INSERT INTO lms_connections (
                    user_id, provider, base_url, access_token_encrypted,
                    refresh_token_encrypted, token_expires_at, provider_user_id, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'connected')
                ON CONFLICT(user_id, provider, base_url) DO UPDATE SET
                    access_token_encrypted = excluded.access_token_encrypted,
                    refresh_token_encrypted = excluded.refresh_token_encrypted,
                    token_expires_at = excluded.token_expires_at,
                    provider_user_id = excluded.provider_user_id,
                    status = 'connected',
                    updated_at = CURRENT_TIMESTAMP
            `).run(
                userId,
                connection.provider,
                connection.baseUrl,
                connection.accessTokenEncrypted,
                connection.refreshTokenEncrypted,
                connection.tokenExpiresAt,
                connection.providerUserId
            );
            return database.prepare(`
                SELECT ${FIELDS}
                FROM lms_connections
                WHERE user_id = ? AND provider = ? AND base_url = ?
            `).get(userId, connection.provider, connection.baseUrl);
        },

        updateTokens(id, userId, credentials) {
            return database.prepare(`
                UPDATE lms_connections
                SET access_token_encrypted = ?,
                    refresh_token_encrypted = ?,
                    token_expires_at = ?,
                    status = 'connected',
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `).run(
                credentials.accessTokenEncrypted,
                credentials.refreshTokenEncrypted,
                credentials.tokenExpiresAt,
                id,
                userId
            ).changes > 0;
        },

        disconnect(id, userId) {
            return database.prepare(`
                UPDATE lms_connections
                SET status = 'disconnected',
                    access_token_encrypted = '',
                    refresh_token_encrypted = NULL,
                    token_expires_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `).run(id, userId).changes > 0;
        },

        markStatus(id, userId, status, updateLastSynced = false) {
            const timestamp = updateLastSynced ? "last_synced_at = CURRENT_TIMESTAMP," : "";
            database.prepare(`
                UPDATE lms_connections
                SET ${timestamp} status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND user_id = ?
            `).run(status, id, userId);
        },

        listMappings,

        saveMappings(id, userId, items) {
            const run = database.transaction(() => {
                const existing = listMappings(id, userId);
                const selected = new Set(items.map(item => String(item.externalCourseId)));
                for (const mapping of existing) {
                    const replacement = items.find(item => String(item.externalCourseId) === mapping.externalCourseId);
                    if (!selected.has(mapping.externalCourseId) || Number(replacement.courseId) !== mapping.courseId) {
                        database.prepare(`
                            UPDATE course_tasks
                            SET removed_at = CURRENT_TIMESTAMP,
                                external_status = 'unmapped',
                                updated_at = CURRENT_TIMESTAMP
                            WHERE course_id = ?
                              AND external_provider = 'canvas'
                              AND external_course_id = ?
                              AND removed_at IS NULL
                        `).run(mapping.courseId, mapping.externalCourseId);
                    }
                    if (!selected.has(mapping.externalCourseId)) {
                        database.prepare("DELETE FROM lms_course_mappings WHERE id = ?").run(mapping.id);
                    }
                }
                for (const mapping of items) {
                    database.prepare(`
                        INSERT INTO lms_course_mappings (
                            connection_id, external_course_id, external_course_name, course_id
                        )
                        SELECT ?, ?, ?, ?
                        WHERE EXISTS (
                            SELECT 1 FROM lms_connections WHERE id = ? AND user_id = ?
                        ) AND EXISTS (
                            SELECT 1 FROM courses WHERE id = ? AND user_id = ?
                        )
                        ON CONFLICT(connection_id, external_course_id) DO UPDATE SET
                            external_course_name = excluded.external_course_name,
                            course_id = excluded.course_id,
                            updated_at = CURRENT_TIMESTAMP
                    `).run(
                        id,
                        mapping.externalCourseId,
                        mapping.externalCourseName,
                        mapping.courseId,
                        id,
                        userId,
                        mapping.courseId,
                        userId
                    );
                }
            });
            run();
            return listMappings(id, userId);
        },

        syncMapping(mapping, userId, remoteTasks) {
            const run = database.transaction(() => {
                const seen = new Set();
                const summary = { created: 0, updated: 0, unchanged: 0, skipped: 0, removed: 0 };
                for (const task of remoteTasks) {
                    if (!task) {
                        summary.skipped += 1;
                        continue;
                    }
                    seen.add(task.externalId);
                    const existing = database.prepare(`
                        SELECT tasks.id, tasks.title, tasks.due_at AS dueAt,
                               tasks.description, tasks.type, tasks.start_at AS startAt,
                               tasks.external_url AS externalUrl,
                               tasks.external_updated_at AS externalUpdatedAt,
                               tasks.external_status AS externalStatus,
                               tasks.external_submission_type AS externalSubmissionType
                        FROM course_tasks tasks
                        JOIN courses ON courses.id = tasks.course_id
                        WHERE tasks.course_id = ?
                          AND tasks.external_provider = 'canvas'
                          AND tasks.external_id = ?
                          AND courses.user_id = ?
                    `).get(mapping.courseId, task.externalId, userId);
                    if (existing) {
                        const changed = existing.title !== task.title ||
                            existing.dueAt !== task.dueAt ||
                            existing.description !== task.description ||
                            existing.type !== task.type ||
                            existing.startAt !== (task.startAt || null) ||
                            existing.externalUrl !== (task.externalUrl || null) ||
                            existing.externalUpdatedAt !== (task.externalUpdatedAt || null) ||
                            existing.externalStatus !== task.externalStatus ||
                            existing.externalSubmissionType !== (task.externalSubmissionType || null);
                        database.prepare(`
                            UPDATE course_tasks
                            SET title = ?, type = ?, description = ?, due_at = ?, start_at = ?,
                                external_course_id = ?, external_url = ?, external_status = ?,
                                external_submission_type = ?, external_updated_at = ?,
                                removed_at = NULL, updated_at = CURRENT_TIMESTAMP
                            WHERE id = ?
                        `).run(
                            task.title,
                            task.type,
                            task.description,
                            task.dueAt,
                            task.startAt,
                            task.externalCourseId,
                            task.externalUrl,
                            task.externalStatus,
                            task.externalSubmissionType || null,
                            task.externalUpdatedAt || null,
                            existing.id
                        );
                        summary[changed ? "updated" : "unchanged"] += 1;
                    } else {
                        database.prepare(`
                            INSERT INTO course_tasks (
                                course_id, title, type, description, due_at, start_at,
                                external_provider, external_id, external_course_id,
                                external_url, external_status, external_submission_type,
                                external_updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, 'canvas', ?, ?, ?, ?, ?, ?)
                        `).run(
                            mapping.courseId,
                            task.title,
                            task.type,
                            task.description,
                            task.dueAt,
                            task.startAt,
                            task.externalId,
                            task.externalCourseId,
                            task.externalUrl,
                            task.externalStatus,
                            task.externalSubmissionType || null,
                            task.externalUpdatedAt || null
                        );
                        summary.created += 1;
                    }
                }
                const imported = database.prepare(`
                    SELECT id, external_id AS externalId
                    FROM course_tasks
                    WHERE course_id = ?
                      AND external_provider = 'canvas'
                      AND external_course_id = ?
                      AND removed_at IS NULL
                `).all(mapping.courseId, mapping.externalCourseId);
                for (const item of imported) {
                    if (seen.has(item.externalId)) continue;
                    database.prepare(`
                        UPDATE course_tasks
                        SET removed_at = CURRENT_TIMESTAMP,
                            external_status = 'removed',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `).run(item.id);
                    summary.removed += 1;
                }
                database.prepare(`
                    UPDATE lms_course_mappings
                    SET last_synced_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).run(mapping.id);
                return summary;
            });
            return run();
        }
    };
}

module.exports = { createLmsRepository };
