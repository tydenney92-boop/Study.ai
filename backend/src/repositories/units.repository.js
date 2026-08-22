function createUnitsRepository(database) {
    const selectFields = `
        units.id,
        units.course_id AS courseId,
        units.name,
        units.unit_number AS unitNumber,
        units.created_at AS createdAt
    `;

    return {
        listOwned(courseId, userId) {
            return database.prepare(`
                SELECT ${selectFields}
                FROM units
                JOIN courses ON courses.id = units.course_id
                WHERE units.course_id = ? AND courses.user_id = ?
                ORDER BY units.unit_number, units.id
            `).all(courseId, userId);
        },

        findOwned(unitId, courseId, userId) {
            return database.prepare(`
                SELECT ${selectFields}
                FROM units
                JOIN courses ON courses.id = units.course_id
                WHERE units.id = ?
                  AND units.course_id = ?
                  AND courses.user_id = ?
            `).get(unitId, courseId, userId);
        },

        findByNumberOwned(courseId, userId, unitNumber) {
            return database.prepare(`
                SELECT ${selectFields}
                FROM units
                JOIN courses ON courses.id = units.course_id
                WHERE units.course_id = ?
                  AND courses.user_id = ?
                  AND units.unit_number = ?
            `).get(courseId, userId, unitNumber);
        },

        create({ courseId, name, unitNumber }) {
            const result = database.prepare(`
                INSERT INTO units (course_id, name, unit_number)
                VALUES (?, ?, ?)
            `).run(courseId, name, unitNumber);

            return Number(result.lastInsertRowid);
        },

        updateOwned(unitId, courseId, userId, changes) {
            const current = this.findOwned(unitId, courseId, userId);

            if (!current) {
                return undefined;
            }

            database.prepare(`
                UPDATE units
                SET name = ?, unit_number = ?
                WHERE id = ? AND course_id = ?
            `).run(
                changes.name ?? current.name,
                changes.unitNumber ?? current.unitNumber,
                unitId,
                courseId
            );

            return this.findOwned(unitId, courseId, userId);
        },

        reorderOwned(courseId, userId, orderedUnitIds) {
            const reorder = database.transaction(() => {
                const current = this.listOwned(courseId, userId);
                const maximum = current.reduce(
                    (value, unit) => Math.max(value, unit.unitNumber),
                    0
                );
                const temporaryStart = maximum + orderedUnitIds.length + 1;
                const update = database.prepare(`
                    UPDATE units
                    SET unit_number = ?
                    WHERE id = ? AND course_id = ?
                `);

                orderedUnitIds.forEach((unitId, index) => {
                    update.run(temporaryStart + index, unitId, courseId);
                });
                orderedUnitIds.forEach((unitId, index) => {
                    update.run(index + 1, unitId, courseId);
                });

                return this.listOwned(courseId, userId);
            });

            return reorder();
        },

        deleteOwned(unitId, courseId, userId) {
            const unit = this.findOwned(unitId, courseId, userId);

            if (!unit) {
                return false;
            }

            const remove = database.transaction(() => {
                const deleted = database.prepare(`
                    DELETE FROM units
                    WHERE id = ? AND course_id = ?
                `).run(unitId, courseId).changes > 0;
                if (deleted) {
                    this.reorderOwned(
                        courseId,
                        userId,
                        this.listOwned(courseId, userId).map(item => item.id)
                    );
                }
                return deleted;
            });
            return remove();
        }
    };
}

module.exports = {
    createUnitsRepository
};
