export class Color {
    constructor(r, g, b, a = 255) {
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
        this.toFillStyle = () => "rgba(" + this.r + ", " + this.g + ", " + this.b + ", " + this.a / 255 + ")";
    }

    darker(factor = 0.9) {
        return new Color(Math.round(this.r * factor), Math.round(this.g * factor), Math.round(this.b * factor));
    }
}

/**
 * @param {Color} col
 */
Color.fromStyle = (col) => {
    let colorInt = Number.parseInt(col.substring(1, 7), 16);
    return new Color((colorInt >> 16) & 255, (colorInt >> 8) & 255, (colorInt >> 0) & 255);
};

/**
 * @param {Color} col
 */
Color.toStyle = (col) => {
    return "#" +  ((col.r << 16) + (col.g << 8) + col.b).toString(16);
}

function ColorRandomizer(delta) {
    var ca = new Uint8ClampedArray(3);
    this.delta = delta;
    this.randomize = (col) => {
        ca[0] = col.r + randInt(delta * 2) - delta;
        ca[1] = col.g + randInt(delta * 2) - delta;
        ca[2] = col.b + randInt(delta * 2) - delta;
        return new Color(...ca);
    };
}
