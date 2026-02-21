export const LogLevel = {
    ERROR: 0,
    WARN: 1,
    INFO: 2,
    DEBUG: 3
};

Object.freeze(LogLevel);

export class Logger {
    #name;
    static #logFunctions = [
        console.error,
        console.warn,
        console.info,
        console.debug
    ];

    static #defaultLogLevel = LogLevel.INFO;    

    constructor(name, logLevel = LogLevel.INFO) {
        this.logLevel = logLevel;
        this.#name = name;
    }

    /**
     * @param {() => string} msg
     */
    error(msg) {
        this.log(msg, LogLevel.ERROR);
    }

    /**
     * @param {() => string} msg
     */
    debug(msg) {
        this.log(msg, LogLevel.DEBUG);
    }

    /**
     * @param {() => string} msg
     */
    warn(msg) {
        this.log(msg, LogLevel.WARN);
    }

    /**
     * @param {() => string} msg
     */
    info(msg) {
        this.log(msg, LogLevel.INFO);
    }

    /**
     * @param {() => string} msg
     * @param {number} [level]
     */
    log(msg, level = this.logLevel) {
        if (level <= Logger.#defaultLogLevel) {
            Logger.#logFunctions[level](this.#prepareMsg(msg()));
        }
    }

    #prepareMsg(msg) {
        return `${this.#name}: ${msg}`;
    }
    
    /**
     * @param {() => string} msg
     * @param {number} [level]
     */
    static log(msg, level = LogLevel.INFO) {
        if (level <= Logger.#defaultLogLevel) {
            Logger.#logFunctions[level](msg());
        }
    }

}
