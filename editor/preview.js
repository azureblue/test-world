// The editor's 3D view: a patch of dirt-grass with a block or plants on it, drawn with the textures as they are
// edited (its own small renderer, not the game's). Positions are the game's: x, y on the ground, z up.

/** a face's shading by the sun's direction, as cube_solid.frag (up, front, left, back, right, down) */
const FACE_SHADE = [1.0, 0.8, 0.6, 0.6, 0.7, 0.5];
/** the faces' corners (x, y, z) from the lower left as seen from outside, counter-clockwise; up, front, left, back, right, down */
const FACES = [
    [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
    [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
    [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]],
    [[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]],
    [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
    [[0, 1, 0], [1, 1, 0], [1, 0, 0], [0, 0, 0]]
];
/** the neighbour each face looks at */
const FACE_NORMALS = [[0, 0, 1], [0, -1, 0], [-1, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, -1]];
/** a liquid's top (the game's water surface level: 7 of 8) and how much it hides behind it (Settings.water.opacity) */
const LIQUID_TOP = 7 / 8;
const LIQUID_OPACITY = 0.76;
/** the ground's half size: (2 GROUND + 1)^2 blocks */
const GROUND = 5;
/** seconds without dragging before it starts circling, and its speed (radians a second) */
const IDLE_BEFORE_SPIN = 3;
const SPIN_SPEED = 0.25;

const VERTEX_SHADER = `#version 300 es
layout (location = 0) in vec3 a_pos;
layout (location = 1) in vec3 a_tex;
layout (location = 2) in float a_shade;
uniform mat4 u_view_projection;
out vec3 v_tex;
out float v_shade;
void main() {
    gl_Position = u_view_projection * vec4(a_pos, 1.0);
    v_tex = a_tex;
    v_shade = a_shade;
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
uniform mediump sampler2DArray u_textures;
// 1, or a liquid's opacity
uniform float u_alpha;
in vec3 v_tex;
in float v_shade;
out vec4 color_out;
void main() {
    vec4 tex = texture(u_textures, v_tex);
    if (tex.a < 0.5)
        discard;
    color_out = vec4(tex.rgb * v_shade, u_alpha);
}`;

/**
 * What the preview shows: the block on the ground's middle, its face textures (layers) by face (up, front, left,
 * back, right, down) (a liquid: 7/8 high, see-through, drawn last); a plant's (x_quads) is its front one; an image alone ("panel"): its front one, one quad upright
 * through the block's middle. A patch: 3 x 3 of it.
 * @typedef {{model: string, layers: number[], patch: boolean}} PreviewObject
 */

export class Preview {
    #gl;
    #canvas;
    #program;
    #viewProjection;
    #alpha;
    /** the vertices: the opaque ones, then this many see-through ones (a liquid's) */
    #translucentCount = 0;
    #vao;
    #buffer;
    #vertexCount = 0;
    #texture = null;
    #textureSize = 0;
    #textureLayers = 0;
    /** the ground's layers: dirt-grass up, sides, down */
    #groundLayers = [0, 0, 0];
    /** @type {PreviewObject | null} */
    #object = null;

    #yaw = -Math.PI / 3;
    #pitch = 0.45;
    #distance = 3.5;
    #lastDrag = -Infinity;
    #lastFrame = performance.now();

    /** @param {HTMLCanvasElement} canvas */
    constructor(canvas) {
        this.#canvas = canvas;
        const gl = this.#gl = canvas.getContext("webgl2", { antialias: true });
        this.#program = program(gl, VERTEX_SHADER, FRAGMENT_SHADER);
        this.#viewProjection = gl.getUniformLocation(this.#program, "u_view_projection");
        this.#alpha = gl.getUniformLocation(this.#program, "u_alpha");
        this.#vao = gl.createVertexArray();
        this.#buffer = gl.createBuffer();
        gl.bindVertexArray(this.#vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
        const stride = 7 * 4;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride, 3 * 4);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 6 * 4);
        gl.bindVertexArray(null);
        this.#initControls();
        requestAnimationFrame(() => this.#frame());
    }

    /**
     * The textures, by layer (rows from the top), all the same size; uploaded again on every change (a few dozen of
     * 16 x 16: nothing).
     * @param {import("../src/blockTextures.js").Pixels[]} layers
     */
    setTextures(layers) {
        const gl = this.#gl;
        const size = layers[0].width;
        if (this.#texture === null || size !== this.#textureSize || layers.length !== this.#textureLayers) {
            if (this.#texture !== null)
                gl.deleteTexture(this.#texture);
            this.#texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#texture);
            gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, size, size, layers.length);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            this.#textureSize = size;
            this.#textureLayers = layers.length;
        }
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#texture);
        layers.forEach((layer, i) =>
            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, size, size, 1, gl.RGBA, gl.UNSIGNED_BYTE, layer.data));
    }

    /**
     * @param {number[]} groundLayers dirt-grass's layers: up, sides, down
     * @param {PreviewObject | null} object
     */
    setScene(groundLayers, object) {
        this.#groundLayers = groundLayers;
        this.#object = object;
        this.#build();
    }

    #build() {
        const v = [];
        const [up, side, down] = this.#groundLayers;
        // the ground: its top at z = 0, its outer sides and bottom (seen from below the edge)
        for (let x = -GROUND; x <= GROUND; x++)
            for (let y = -GROUND; y <= GROUND; y++)
                for (let f = 0; f < 6; f++) {
                    const [nx, ny] = FACE_NORMALS[f];
                    const outer = f === 0 || f === 5 || Math.abs(x + nx) > GROUND || Math.abs(y + ny) > GROUND;
                    if (outer)
                        cubeFace(v, x, y, -1, f, f === 0 ? up : f === 5 ? down : side);
                }
        const o = this.#object;
        const liquid = [];
        if (o !== null) {
            const spots = o.patch ? [-1, 0, 1].flatMap(x => [-1, 0, 1].map(y => [x, y])) : [[0, 0]];
            for (const [x, y] of spots) {
                if (o.model === "x_quads") {
                    xQuads(v, x, y, 0, o.layers[1]);
                } else if (o.model === "panel") {
                    panel(v, x, y, 0, o.layers[1]);
                } else {
                    for (let f = 0; f < 6; f++) {
                        const [nx, ny, nz] = FACE_NORMALS[f];
                        // hidden between blocks of a patch, and the bottom on the ground
                        const neighbour = nz === -1 || (o.patch && nz === 0 && Math.abs(x + nx) <= 1 && Math.abs(y + ny) <= 1);
                        if (neighbour)
                            continue;
                        if (o.model === "liquid")
                            cubeFace(liquid, x, y, 0, f, o.layers[f], LIQUID_TOP, 1);
                        else
                            cubeFace(v, x, y, 0, f, o.layers[f]);
                    }
                }
            }
        }
        const gl = this.#gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.#buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([...v, ...liquid]), gl.STATIC_DRAW);
        this.#vertexCount = v.length / 7;
        this.#translucentCount = liquid.length / 7;
    }

    #initControls() {
        const canvas = this.#canvas;
        let dragging = false;
        canvas.addEventListener("pointerdown", (e) => {
            dragging = true;
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener("pointerup", () => dragging = false);
        canvas.addEventListener("pointermove", (e) => {
            if (!dragging)
                return;
            this.#yaw -= e.movementX * 0.01;
            this.#pitch = Math.min(1.5, Math.max(-0.3, this.#pitch + e.movementY * 0.01));
            this.#lastDrag = performance.now();
        });
        canvas.addEventListener("wheel", (e) => {
            e.preventDefault();
            this.#distance = Math.min(30, Math.max(2, this.#distance * Math.exp(e.deltaY * 0.001)));
            this.#lastDrag = performance.now();
        }, { passive: false });
    }

    #frame() {
        const now = performance.now();
        const dt = Math.min(0.1, (now - this.#lastFrame) / 1000);
        this.#lastFrame = now;
        if (now - this.#lastDrag > IDLE_BEFORE_SPIN * 1000)
            this.#yaw += SPIN_SPEED * dt;
        this.#draw();
        requestAnimationFrame(() => this.#frame());
    }

    #draw() {
        const gl = this.#gl, canvas = this.#canvas;
        const width = canvas.clientWidth * devicePixelRatio, height = canvas.clientHeight * devicePixelRatio;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        // the game's sky at the horizon (Settings.sky.horizonColor)
        gl.clearColor(0xad / 255, 0xd9 / 255, 0xfa / 255, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        if (this.#texture === null || this.#vertexCount === 0)
            return;
        gl.enable(gl.DEPTH_TEST);
        gl.useProgram(this.#program);
        const target = [0.5, 0.5, this.#object?.model === "cube" ? 0.5 : 0.4];
        const eye = [
            target[0] + Math.cos(this.#yaw) * Math.cos(this.#pitch) * this.#distance,
            target[1] + Math.sin(this.#yaw) * Math.cos(this.#pitch) * this.#distance,
            target[2] + Math.sin(this.#pitch) * this.#distance];
        const matrix = multiply(perspective(Math.PI / 3, width / height, 0.05, 200), lookAt(eye, target));
        gl.uniformMatrix4fv(this.#viewProjection, false, matrix);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.#texture);
        gl.bindVertexArray(this.#vao);
        gl.uniform1f(this.#alpha, 1);
        gl.drawArrays(gl.TRIANGLES, 0, this.#vertexCount);
        if (this.#translucentCount > 0) {
            // over what's drawn, not hiding what's behind it; only the faces turned to the camera (the faces are
            // counter-clockwise from outside): a liquid's box is convex, so they don't overlap, and the far ones
            // don't blend over the near ones in whatever order they come
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.depthMask(false);
            gl.enable(gl.CULL_FACE);
            gl.uniform1f(this.#alpha, LIQUID_OPACITY);
            gl.drawArrays(gl.TRIANGLES, this.#vertexCount, this.#translucentCount);
            gl.disable(gl.CULL_FACE);
            gl.depthMask(true);
            gl.disable(gl.BLEND);
        }
        gl.bindVertexArray(null);
    }
}

/**
 * a cube face of the block at (x, y, z) as 2 triangles; the texture's v up the face (rows from the top: flipped); a
 * block height high (a liquid's lower top; the sides show the texture's bottom part), shaded (default: the face's)
 */
function cubeFace(v, x, y, z, face, layer, height = 1, shade = FACE_SHADE[face]) {
    const c = FACES[face];
    const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
    for (const k of [0, 1, 2, 0, 2, 3]) {
        const top = c[k][2] === 1;
        const u = uv[k][0], tv = face === 0 || face === 5 || !top ? uv[k][1] : 1 - height;
        v.push(x + c[k][0], y + c[k][1], z + (top ? height : 0), u, tv, layer, shade);
    }
}

/** a plant: 2 quads across the block's diagonals, unshaded like the game's (both sides: no culling) */
function xQuads(v, x, y, z, layer) {
    for (const [ax, ay, bx, by] of [[0, 0, 1, 1], [0, 1, 1, 0]]) {
        const c = [[ax, ay, 0], [bx, by, 0], [bx, by, 1], [ax, ay, 1]];
        const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
        for (const k of [0, 1, 2, 0, 2, 3])
            v.push(x + c[k][0], y + c[k][1], z + c[k][2], uv[k][0], uv[k][1], layer, 1);
    }
}

/** an image upright through the block's middle, facing -y (both sides: no culling), unshaded */
function panel(v, x, y, z, layer) {
    const c = [[0, 0.5, 0], [1, 0.5, 0], [1, 0.5, 1], [0, 0.5, 1]];
    const uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
    for (const k of [0, 1, 2, 0, 2, 3])
        v.push(x + c[k][0], y + c[k][1], z + c[k][2], uv[k][0], uv[k][1], layer, 1);
}

function program(gl, vertexSource, fragmentSource) {
    const shader = (type, source) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
            throw new Error(gl.getShaderInfoLog(s));
        return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(p));
    return p;
}

// column-major 4 x 4 matrices, as WebGL takes them

function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}

/** z up */
function lookAt(eye, target) {
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const norm = (a) => { const l = Math.hypot(...a); return a.map(c => c / l); };
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const zAxis = norm(sub(eye, target));
    const xAxis = norm(cross([0, 0, 1], zAxis));
    const yAxis = cross(zAxis, xAxis);
    return [
        xAxis[0], yAxis[0], zAxis[0], 0,
        xAxis[1], yAxis[1], zAxis[1], 0,
        xAxis[2], yAxis[2], zAxis[2], 0,
        -dot(xAxis, eye), -dot(yAxis, eye), -dot(zAxis, eye), 1];
}

function multiply(a, b) {
    const out = new Array(16);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return out;
}
