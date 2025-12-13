export class Pos {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    *[Symbol.iterator]() {
        yield this.x;
        yield this.y;
    }

    toIntKey() { return (this.x << 16)  | this.y; }
    toString() { return "(" + this.x + ", " + this.y + ")"; }
    toStringKey() { return "pos:" + this.x + ":" + this.y; }
    samePos(pos) { return pos.x === this.x && pos.y === this.y; }

    manhattanDist(pos) {
        return Math.abs(pos.x - this.x) + Math.abs(pos.y - this.y);
    }
    /**
     * @param {Pos} pos
     */
    distSquare(pos) {
        const dx = this.x - pos.x;
        const dy = this.y - pos.y;
        return dx * dx + dy * dy;
    }
    /**
     *
     * @param {number | Pos} x
     * @param {number} y
     */
    set(x, y = null) {
        if (y == null) {
            this.x = x.x;
            this.y = x.y;
        } else {
            this.x = x;
            this.y = y;
        }
    }
}


export class Rect extends Pos {
    /**@param {DOMRect} boundingRect  */
    static fromRect(boundingRect) {
        return new Rect(boundingRect.x, boundingRect.y, boundingRect.width, boundingRect.height);
    }
    constructor(x, y, width, height) {
        super(x, y);
        this.w = width;
        this.h = height;
    }

    *[Symbol.iterator]() {
        yield this.x;
        yield this.y;
        yield this.w;
        yield this.h;
    }


    get width() {
        return this.w;
    }

    get height() {
        return this.h;
    }

    set width(w) {
        return this.w = w;
    }

    set height(h) {
        return this.h = h;
    }


    inside(pos) {
        return this.insideXY(pos.x, pos.y);
    }

    middle() {
        return new Pos(this.x + this.w / 2, this.y + this.h / 2);
    }

    insideXY(x, y) {
        return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h;
    }
    toStringKey() { return "rect:" + this.x + ":" + this.y + ":" + this.w + ":" + this.h; }
    toString() { return "(" + this.x + ", " + this.y + ", " + this.w + ", " + this.h + ")"; }
}
