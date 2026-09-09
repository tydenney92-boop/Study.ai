(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.StudySignalCalendar = api;
})(typeof window !== "undefined" ? window : null, function() {
    function localDay(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    }

    function dateFromLocalDay(value) {
        const [year, month, day] = String(value).split("-").map(Number);
        return new Date(year, month - 1, day);
    }

    function monthGrid(anchor) {
        const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
        const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
        return Array.from({ length: 42 }, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            return date;
        });
    }

    function moveMonth(anchor, offset) {
        return new Date(anchor.getFullYear(), anchor.getMonth() + offset, 1);
    }

    function tasksForDay(tasks, day) {
        const key = typeof day === "string" ? day : localDay(day);
        return tasks.filter(task => localDay(new Date(task.dueAt)) === key);
    }

    function visibleTasks(tasks, courseId, type) {
        return tasks.filter(task =>
            (!courseId || task.courseId === Number(courseId)) &&
            (!type || task.type === type)
        );
    }

    return { dateFromLocalDay, localDay, monthGrid, moveMonth, tasksForDay, visibleTasks };
});
