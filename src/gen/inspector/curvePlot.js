import { CurveNode } from "../node.js";

/**
 * A curve node's curve: input across, output up, the control points, the inputs' histogram behind; a mark for an
 * input value (the mouse's column).
 */
export class CurvePlot {
    static W = 320;
    static H = 200;
    static PAD = 34;

    /**
     * @param {CurveNode} node
     * @param {number[]} inputs the input's values over the view
     */
    constructor(node, inputs) {
        this.node = node;
        this.source = node.srcNodes[0];
        const curve = node.curve, points = curve.controlPoints();
        // the input range: the control points' and the values'
        const xs = [...points.map(p => p.x), ...inputs];
        this.x0 = Math.min(...xs);
        this.x1 = Math.max(...xs);
        if (this.x1 - this.x0 < 1e-9)
            this.x1 = this.x0 + 1;
        const ys = [];
        for (let i = 0; i <= 200; i++)
            ys.push(curve.apply(this.x0 + (this.x1 - this.x0) * i / 200));
        const yMin = Math.min(...ys), yMax = Math.max(...ys), pad = (yMax - yMin) * 0.08 || 1;
        this.y0 = yMin - pad;
        this.y1 = yMax + pad;

        const canvas = document.createElement("canvas");
        canvas.width = CurvePlot.W;
        canvas.height = CurvePlot.H;
        this.ctx = canvas.getContext("2d");
        this.#draw(inputs, points);
        this.base = this.ctx.getImageData(0, 0, CurvePlot.W, CurvePlot.H);

        this.figure = document.createElement("figure");
        const caption = document.createElement("figcaption");
        caption.innerHTML = `<b>${node.name}</b> <small>(${this.source.name} → ${node.name})</small>`;
        this.figure.append(caption, canvas);
    }

    px(v) {
        const { PAD, W } = CurvePlot;
        return PAD + (v - this.x0) / (this.x1 - this.x0) * (W - PAD - 8);
    }

    py(v) {
        const { H } = CurvePlot;
        return H - 18 - (v - this.y0) / (this.y1 - this.y0) * (H - 18 - 8);
    }

    #draw(inputs, points) {
        const { ctx } = this, { W, H, PAD } = CurvePlot, curve = this.node.curve;
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, W, H);
        // the inputs' histogram, scaled to its highest bar
        const bins = new Array(64).fill(0);
        for (const v of inputs)
            bins[Math.min(63, Math.floor((v - this.x0) / (this.x1 - this.x0) * 64))]++;
        const top = Math.max(...bins);
        ctx.fillStyle = "#2c3a4a";
        bins.forEach((count, i) => {
            const a = this.px(this.x0 + (this.x1 - this.x0) * i / 64), b = this.px(this.x0 + (this.x1 - this.x0) * (i + 1) / 64);
            const h = count / top * (H - 26);
            ctx.fillRect(a, H - 18 - h, b - a + 0.5, h);
        });
        // zero lines
        ctx.strokeStyle = "#444";
        ctx.beginPath();
        if (this.x0 < 0 && this.x1 > 0) {
            ctx.moveTo(this.px(0), 8);
            ctx.lineTo(this.px(0), H - 18);
        }
        if (this.y0 < 0 && this.y1 > 0) {
            ctx.moveTo(PAD, this.py(0));
            ctx.lineTo(W - 8, this.py(0));
        }
        ctx.stroke();
        // the curve
        ctx.strokeStyle = "#f0a030";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 300; i++) {
            const v = this.x0 + (this.x1 - this.x0) * i / 300;
            ctx[i === 0 ? "moveTo" : "lineTo"](this.px(v), this.py(curve.apply(v)));
        }
        ctx.stroke();
        ctx.lineWidth = 1;
        // the control points
        ctx.fillStyle = "#fff";
        for (const p of points) {
            ctx.beginPath();
            ctx.arc(this.px(p.x), this.py(p.y), 3, 0, Math.PI * 2);
            ctx.fill();
        }
        // the ranges
        ctx.fillStyle = "#999";
        ctx.font = "10px ui-monospace, monospace";
        const label = (v) => Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2);
        ctx.textAlign = "left";
        ctx.fillText(label(this.x0), PAD, H - 5);
        ctx.textAlign = "right";
        ctx.fillText(label(this.x1), W - 8, H - 5);
        ctx.fillText(label(this.y1), PAD - 4, 14);
        ctx.fillText(label(this.y0), PAD - 4, H - 20);
    }

    /** @param {number} input */
    mark(input) {
        const { ctx } = this, { H } = CurvePlot;
        ctx.putImageData(this.base, 0, 0);
        const x = this.px(Math.max(this.x0, Math.min(this.x1, input))), y = this.py(this.node.curve.apply(input));
        ctx.strokeStyle = "#6cf";
        ctx.beginPath();
        ctx.moveTo(x, 8);
        ctx.lineTo(x, H - 18);
        ctx.stroke();
        ctx.fillStyle = "#6cf";
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    }
}
