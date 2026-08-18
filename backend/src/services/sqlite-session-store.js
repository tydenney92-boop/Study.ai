const session = require("express-session");

function expiryFor(sessionValue, defaultTtlMs) {
    const cookieExpiry = sessionValue?.cookie?.expires;
    const parsed = cookieExpiry ? new Date(cookieExpiry).getTime() : NaN;
    return Number.isFinite(parsed) ? parsed : Date.now() + defaultTtlMs;
}

class SqliteSessionStore extends session.Store {
    constructor({ sessionsRepository, defaultTtlMs }) {
        super();
        this.sessionsRepository = sessionsRepository;
        this.defaultTtlMs = defaultTtlMs;
        this.cleanupTimer = setInterval(() => {
            try {
                this.sessionsRepository.deleteExpired();
            } catch (error) {
                this.emit("disconnect", error);
            }
        }, Math.min(defaultTtlMs, 60 * 60 * 1000));
        this.cleanupTimer.unref();
    }

    get(sid, callback) {
        try {
            const row = this.sessionsRepository.find(sid);
            callback(null, row ? JSON.parse(row.dataJson) : null);
        } catch (error) {
            callback(error);
        }
    }

    set(sid, value, callback = () => {}) {
        try {
            this.sessionsRepository.upsert(
                sid,
                value,
                expiryFor(value, this.defaultTtlMs)
            );
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    destroy(sid, callback = () => {}) {
        try {
            this.sessionsRepository.delete(sid);
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    touch(sid, value, callback = () => {}) {
        try {
            this.sessionsRepository.touch(
                sid,
                expiryFor(value, this.defaultTtlMs)
            );
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    clear(callback = () => {}) {
        try {
            this.sessionsRepository.clear();
            callback(null);
        } catch (error) {
            callback(error);
        }
    }

    close() {
        clearInterval(this.cleanupTimer);
    }
}

module.exports = { SqliteSessionStore };
