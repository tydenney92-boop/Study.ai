(function(root, factory) {
    const api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (root) root.StudySignalTimePicker = api;
})(typeof window !== "undefined" ? window : null, function() {
    function from24Hour(value) {
        const match = String(value || "").match(/^([01]\d|2[0-3]):([0-5]\d)$/);
        if (!match) return null;
        const hour24 = Number(match[1]);
        return {
            hour: hour24 % 12 || 12,
            minute: Number(match[2]),
            period: hour24 >= 12 ? "PM" : "AM"
        };
    }

    function to24Hour(hour, minute, period) {
        const normalizedHour = Number(hour);
        const normalizedMinute = Number(minute);
        const normalizedPeriod = String(period || "").toUpperCase();
        if (!Number.isInteger(normalizedHour) || normalizedHour < 1 || normalizedHour > 12 ||
            !Number.isInteger(normalizedMinute) || normalizedMinute < 0 || normalizedMinute > 59 ||
            !["AM", "PM"].includes(normalizedPeriod)) return null;
        const hour24 = normalizedHour % 12 + (normalizedPeriod === "PM" ? 12 : 0);
        return `${String(hour24).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`;
    }

    function format12Hour(selection) {
        if (!selection) return null;
        const value = to24Hour(selection.hour, selection.minute, selection.period);
        if (!value) return null;
        return `${selection.hour}:${String(selection.minute).padStart(2, "0")} ${selection.period}`;
    }

    function defaultSelection(date = new Date()) {
        const rounded = new Date(date);
        rounded.setSeconds(0, 0);
        rounded.setMinutes(Math.ceil(rounded.getMinutes() / 5) * 5);
        const hour24 = rounded.getHours();
        return { hour: hour24 % 12 || 12, minute: rounded.getMinutes(), period: hour24 >= 12 ? "PM" : "AM" };
    }

    function createPicker({ input, trigger, display, overlay, background = null }) {
        if (!input || !trigger || !display || !overlay) throw new Error("Time picker elements are required.");
        const wheels = {
            hour: overlay.querySelector("#time-hour-wheel"),
            minute: overlay.querySelector("#time-minute-wheel"),
            period: overlay.querySelector("#time-period-wheel")
        };
        const values = {
            hour: Array.from({ length: 12 }, (_, index) => index + 1),
            minute: Array.from({ length: 60 }, (_, index) => index),
            period: ["AM", "PM"]
        };
        const summary = overlay.querySelector("#time-picker-summary");
        const scrollTimers = {};
        const typeahead = {};
        let draft = defaultSelection();

        function optionId(name, value) {
            return `time-${name}-${String(value).toLowerCase()}`;
        }

        function optionLabel(name, value) {
            return name === "minute" ? String(value).padStart(2, "0") : String(value);
        }

        function centerOption(name, smooth = false) {
            const wheel = wheels[name];
            const option = wheel.querySelector(`[data-value="${draft[name]}"]`);
            if (!option) return;
            const wheelBox = wheel.getBoundingClientRect();
            const optionBox = option.getBoundingClientRect();
            const top = wheel.scrollTop + optionBox.top + optionBox.height / 2 - wheelBox.top - wheelBox.height / 2;
            wheel.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
        }

        function announce() {
            summary.textContent = `${format12Hour(draft)} selected`;
        }

        function select(name, value, { center = true, smooth = false, speak = true } = {}) {
            const normalized = name === "period" ? String(value) : Number(value);
            if (!values[name].includes(normalized)) return;
            draft[name] = normalized;
            const wheel = wheels[name];
            wheel.querySelectorAll("[role='option']").forEach(option => {
                const selected = option.dataset.value === String(normalized);
                option.classList.toggle("selected", selected);
                option.setAttribute("aria-selected", String(selected));
            });
            wheel.setAttribute("aria-activedescendant", optionId(name, normalized));
            if (center) centerOption(name, smooth);
            if (speak) announce();
        }

        function selectCentered(name) {
            const wheel = wheels[name];
            const center = wheel.getBoundingClientRect().top + wheel.clientHeight / 2;
            const options = [...wheel.querySelectorAll("[role='option']")];
            const nearest = options.reduce((best, option) => {
                const box = option.getBoundingClientRect();
                const distance = Math.abs(box.top + box.height / 2 - center);
                return !best || distance < best.distance ? { option, distance } : best;
            }, null);
            if (nearest) select(name, nearest.option.dataset.value, { center: false });
        }

        function move(name, offset) {
            const entries = values[name];
            const current = entries.indexOf(draft[name]);
            const next = Math.max(0, Math.min(entries.length - 1, current + offset));
            select(name, entries[next], { smooth: true });
        }

        function buildWheel(name) {
            const wheel = wheels[name];
            values[name].forEach(value => {
                const option = document.createElement("div");
                option.id = optionId(name, value);
                option.className = `time-wheel-option${name === "minute" && value % 5 === 0 ? " common-minute" : ""}`;
                option.dataset.value = String(value);
                option.setAttribute("role", "option");
                option.setAttribute("aria-selected", "false");
                option.textContent = optionLabel(name, value);
                wheel.appendChild(option);
            });
            wheel.addEventListener("click", event => {
                const option = event.target.closest("[role='option']");
                if (!option) return;
                wheel.focus({ preventScroll: true });
                select(name, option.dataset.value, { smooth: true });
            });
            wheel.addEventListener("scroll", () => {
                clearTimeout(scrollTimers[name]);
                scrollTimers[name] = setTimeout(() => selectCentered(name), 90);
            }, { passive: true });
            wheel.addEventListener("keydown", event => {
                const moves = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
                if (event.key in moves) {
                    event.preventDefault();
                    move(name, moves[event.key]);
                } else if (event.key === "Home" || event.key === "End") {
                    event.preventDefault();
                    select(name, values[name][event.key === "Home" ? 0 : values[name].length - 1], { smooth: true });
                } else if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    announce();
                } else if (/^\d$/.test(event.key) && name !== "period") {
                    event.preventDefault();
                    clearTimeout(typeahead[`${name}Timer`]);
                    typeahead[name] = `${typeahead[name] || ""}${event.key}`.slice(-2);
                    const typed = Number(typeahead[name]);
                    if (values[name].includes(typed)) select(name, typed, { smooth: true });
                    typeahead[`${name}Timer`] = setTimeout(() => { typeahead[name] = ""; }, 700);
                } else if ((event.key === "a" || event.key === "p") && name === "period") {
                    event.preventDefault();
                    select(name, event.key.toUpperCase() === "A" ? "AM" : "PM", { smooth: true });
                }
            });
        }

        function syncTrigger() {
            const parsed = from24Hour(input.value);
            const label = format12Hour(parsed);
            display.textContent = label || "Select time";
            trigger.setAttribute("aria-label", label ? `Due time ${label}. Change time` : "Select due time");
        }

        function setBackgroundInactive(inactive) {
            if (!background) return;
            background.inert = Boolean(inactive);
            background.setAttribute("aria-hidden", String(Boolean(inactive)));
        }

        function close() {
            overlay.classList.remove("open");
            setBackgroundInactive(false);
            window.requestAnimationFrame(() => trigger.focus());
        }

        function open() {
            if (trigger.disabled) return;
            draft = from24Hour(input.value) || defaultSelection();
            overlay.classList.add("open");
            setBackgroundInactive(true);
            window.requestAnimationFrame(() => {
                Object.keys(wheels).forEach(name => select(name, draft[name], { center: true, speak: false }));
                announce();
            });
        }

        Object.keys(wheels).forEach(buildWheel);
        trigger.addEventListener("click", open);
        overlay.querySelector("#cancel-time-picker").addEventListener("click", close);
        overlay.querySelector("#confirm-time-picker").addEventListener("click", () => {
            input.value = to24Hour(draft.hour, draft.minute, draft.period) || "";
            syncTrigger();
            input.dispatchEvent(new Event("change", { bubbles: true }));
            close();
        });
        overlay.querySelector("#clear-task-time").addEventListener("click", () => {
            input.value = "";
            syncTrigger();
            input.dispatchEvent(new Event("change", { bubbles: true }));
            close();
        });
        overlay.addEventListener("studyai:modal-close", () => {
            setBackgroundInactive(false);
            window.requestAnimationFrame(() => trigger.focus());
        });
        input.addEventListener("change", syncTrigger);
        syncTrigger();

        return {
            open,
            sync: syncTrigger,
            setDisabled(disabled) {
                input.disabled = Boolean(disabled);
                trigger.disabled = Boolean(disabled);
                trigger.setAttribute("aria-disabled", String(Boolean(disabled)));
            },
            setValue(value) {
                input.value = from24Hour(value) ? value : "";
                syncTrigger();
            }
        };
    }

    return { createPicker, defaultSelection, format12Hour, from24Hour, to24Hour };
});
