class Pos01 {
    #x;
    #y;
    constructor(x, y) {
        this.#x = x;
        this.#y = y;
    }

    get x() {
        return this.#x;
    }

    set x(v) {
        this.#x = v;
    }

    get y() {
        return this.#y;
    }

    set y(v) {
        this.#y = v;
    }

    setTo(pos) {
        this.x = pos.x;
        this.y = pos.y;
    }

    set(x, y) {
        this.x = x;
        this.y = y;
    }
}

function pos(x = 0, y = 0) {
    return new Pos01(x, y);
}

export class Curve {
    getControlPoints() {

    }

    /**
     * @param {number} pointId 
     * @param {Pos01} pos 
     */
    movePoint(pointId, pos) {

    }

    interpolate01(x) {

    }

    draw(ctx, w, h, pointRadius) {
    }
}

class LinearCurve extends Curve {

    constructor(a, b) {
        super();
        this.points = [a, b];
    }

    getControlPoints() {
        return this.points;
    }

    movePoint(pointId, pos) {
        if (pointId == 0) {
            pos.x = Math.min(pos.x, this.points[1].x);
        } else if (pointId == 1) {
            pos.x = Math.max(pos.x, this.points[0].x);
        }
        this.points[pointId].setTo(pos);
        return pos;
    }

    /**
     * @param {Pos01} pos 
     */
    interpolate01(x) {
        if (x <= this.points[0].x)
            return this.points[0].y
        else if (x >= this.points[1].x)
            return this.points[1].y;
        return this.#lerp(x);
    }

    #lerp(x) {
        return (this.points[0].y * (this.points[1].x - x) + this.points[1].y * (x - this.points[0].x)) / (this.points[1].x - this.points[0].x);
    }

    /**
     * 
     * @param {CanvasRenderingContext2D} ctx 
     * @param {*} w 
     * @param {*} h 
     */
    draw(ctx, w, h, pointRadius) {
        for (let i = 0; i < this.points.length; i++) {
            ctx.beginPath();
            ctx.arc(this.points[i].x * w, this.points[i].y * h, pointRadius, 0, Math.PI * 2);
            ctx.fillStyle = i === 0 || i === 3 ? 'green' : 'blue';
            ctx.fill();
        }

        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.points[0].x * w, this.points[0].y * h);
        ctx.lineTo(0, this.points[0].y * h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.points[0].x * w, this.points[0].y * h);
        ctx.lineTo(this.points[1].x * w, this.points[1].y * h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.points[1].x * w, this.points[1].y * h);
        ctx.lineTo(w, this.points[1].y * h);
        ctx.stroke();
    }

}

class BezierCurve extends Curve  {

    constructor(a, b) {
        super();
        this.points = [
            a,
            pos(BezierCurve.#lerp(a.x, b.x, 1 / 4), BezierCurve.#lerp(a.y, b.y, 1 / 4)),
            pos(BezierCurve.#lerp(a.x, b.x, 3 / 4), BezierCurve.#lerp(a.y, b.y, 3 / 4)),
            b
        ];
    }

    getControlPoints() {
        return this.points;
    }

    movePoint(pointId, pos) {
        if (pointId == 0) {
            pos.x = Math.min(pos.x, this.points[1].x);
            pos.x = Math.min(pos.x, this.points[2].x);
        } else if (this.dragIdx == 1) {
            pos.x = Math.min(pos.x, this.points[3].x);
            pos.x = Math.max(pos.x, this.points[0].x);
        } else if (this.dragIdx == 2) {
            pos.x = Math.min(pos.x, this.points[3].x);
            pos.x = Math.max(pos.x, this.points[0].x);
        } else if (this.dragIdx == 3) {
            pos.x = Math.max(pos.x, this.points[1].x);
            pos.x = Math.max(pos.x, this.points[2].x);
        }
        this.points[pointId].setTo(pos);
    }

    /**
     * @param {Pos01} pos 
     */
    interpolate01(x) {
        if (x <= this.points[0].x)
            return this.points[0].y
        else if (x >= this.points[3].x)
            return this.points[3].y;
        const t = (x - this.points[0].x) / (this.points[3].x - this.points[0].x)
        return this.bezier(t, this.points[0], this.points[1], this.points[2], this.points[3]).y;
    }


    bezier(t, P0, C0, C1, P1) {
        const mt = 1 - t;
        return {
            x:
                mt ** 3 * P0.x +
                3 * mt ** 2 * t * C0.x +
                3 * mt * t ** 2 * C1.x +
                t ** 3 * P1.x,
            y:
                mt ** 3 * P0.y +
                3 * mt ** 2 * t * C0.y +
                3 * mt * t ** 2 * C1.y +
                t ** 3 * P1.y
        };
    }

    static #lerp(a, b, t) {
        return a + (b - a) * t;
    }

    /**
     * 
     * @param {CanvasRenderingContext2D} ctx 
     * @param {*} w 
     * @param {*} h 
     */
    draw(ctx, w, h, pointRadius) {
        for (let i = 0; i < this.points.length; i++) {
            ctx.beginPath();
            ctx.arc(this.points[i].x * w, this.points[i].y * h, pointRadius, 0, Math.PI * 2);
            ctx.fillStyle = i === 0 || i === 3 ? 'green' : 'blue';
            ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(this.points[0].x * w, this.points[0].y * h);
        ctx.lineTo(this.points[1].x * w, this.points[1].y * h);
        ctx.lineTo(this.points[2].x * w, this.points[2].y * h);
        ctx.lineTo(this.points[3].x * w, this.points[3].y * h);
        ctx.stroke();

        ctx.strokeStyle = "black";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.points[0].x * w, this.points[0].y * h);
        ctx.lineTo(0, this.points[0].y * h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.points[3].x * w, this.points[3].y * h);
        ctx.lineTo(w, this.points[3].y * h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(this.points[0].x * w, this.points[0].y * h);
        ctx.bezierCurveTo(
            this.points[1].x * w, this.points[1].y * h,
            this.points[2].x * w, this.points[2].y * h,
            this.points[3].x * w, this.points[3].y * h
        );
        ctx.stroke();
    }
}


export class CurveEdit {
    /**
     * @param {HTMLCanvasElement} canvas 
     * @param {Curve} curve 
     */ 
    constructor(canvas) {
        this.curve = new LinearCurve(pos(0, 0), pos(1, 1));
        this.canvas = canvas;
        this.w = canvas.width;
        this.h = canvas.height;
        /**@type {CanvasRenderingContext2D} */
        this.ctx = canvas.getContext('2d');
        this.pointRadius = 5;
        this.margin = 10;
        this.wm = this.w - this.margin * 2;
        this.hm = this.h - this.margin * 2;
        this.dragIdx = -1;

        // Place points as per your request:
        this.points = this.curve.getControlPoints();
        
        canvas.addEventListener('mousedown', this.#onMouseDown.bind(this));
        window.addEventListener('mousemove', this.#onMouseMove.bind(this));
        window.addEventListener('mouseup', this.#onMouseUp.bind(this));
        
        this.draw();
    }

    changeType(linear) {
        this.linear = linear;
    }

    #getPosFromEvent(event) {
        const rect = this.canvas.getBoundingClientRect();
        const x = (event.clientX - rect.left) * this.canvas.width / rect.width;
        const y = (event.clientY - rect.top) * this.canvas.height / rect.height;
        return { x, y };
    }

    #clampAndNormalize(pt) {
        return {
            x: (Math.max(this.margin, Math.min(this.canvas.width - this.margin, pt.x)) - this.margin) / this.wm,
            y: 1 - (Math.max(this.margin, Math.min(this.canvas.height - this.margin, pt.y)) - this.margin) / this.hm
        };
    }

    #onMouseDown(event) {
        const mouse = this.#clampAndNormalize(this.#getPosFromEvent(event));
        for (let i = 0; i < this.points.length; i++) {
            const pt = this.points[i];
            if (Math.hypot(mouse.x * this.wm - pt.x * this.wm, mouse.y * this.hm - pt.y * this.hm) < this.pointRadius * 1.2) {
                this.dragIdx = i;
                break;
            }
        }
    }

    #onMouseMove(event) {
        if (this.dragIdx === -1) return;
        const mouse = this.#clampAndNormalize(this.#getPosFromEvent(event));
        this.curve.movePoint(this.dragIdx, pos(mouse.x, mouse.y));

        this.draw();
    }


    get width() {
        return this.canvas.width;
    }

    get height() {
        return this.canvas.height;
    }

    #onMouseUp() {
        this.dragIdx = -1;
    }


    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.strokeStyle = "#ccc";
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(this.margin, this.margin, this.canvas.width - this.margin * 2, this.canvas.height - this.margin * 2);
        this.ctx.save();
        this.ctx.translate(this.margin, this.margin + this.hm);
        this.ctx.scale(1, -1);
        this.curve.draw(this.ctx, this.wm, this.hm, this.pointRadius);
        this.ctx.restore();
        console.log(this.get256());
    }

    point01(point) {
        return { x: ((point.x - this.margin) / width), y: ((point.y - this.margin) / height) }
    }

    createFunction() {
        return x => this.curve.interpolate01(x);
    }

    get256() {
        const res = new Uint8Array(256);
        for(let i = 0; i <= 255; i++) {
            const ry = Math.floor(this.curve.interpolate01(i / 255) * 255);
            res[i] = ry;
        }
        return res;
    }

}