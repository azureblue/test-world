export const Precondition = {
    check: (condition, message) => {
        if (!condition) {
            throw new Error(message);
        }
    }
};

export class PreconditionError extends Error {
    constructor(message) {
        super(message);
        this.name = "PreconditionError";
    }
}

Object.freeze(Precondition);
