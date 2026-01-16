/*  Terrain preview in WebGL2 (single-file JS)
    - Forward rendering (no inverse projection headaches)
    - Depth test (occlusion works)
    - Heightmap sampled in shader (smooth normals, no “grid seams”)
    - Mouse controls: LMB drag = rotate, RMB/Shift+drag = pan, wheel = zoom
    Usage:
      renderTerrain(canvas, (x,y)=>heights[y][x], { mapW:800, mapH:800 });
*/

import { Camera } from "../../camera.js";
import { fvec3, mat4, Mat4, Projection } from "../../geom.js";


export function renderTerrain(canvas, getH, params = {}) {
    // ----------------------- Params (sane defaults) -----------------------
    const mapW = params.mapW ?? 800;
    const mapH = params.mapH ?? 800;

    // Geometry resolution (NOT map resolution). 256 is a good default.
    const gridN = params.gridN ?? 512;

    // World size in XZ (in "world units")
    const worldSize = params.worldSize ?? 2.0; // plane spans [-worldSize/2 .. +worldSize/2]

    // Height scale in world units
    const heightAmp = params.heightAmp ?? 0.5;

    // Lighting
    const ambient = params.ambient ?? 0.7;
    const lightDir = params.lightDir ?? [0.8, 0.35, 0.45]; // world-space

    const fov = params.fov ?? (50 * Math.PI / 180);
    const near = params.near ?? 0.1;
    const far = params.far ?? 640.0;

    // Color palette: you can override with params.paletteStops
    // stops: [t(0..1), r,g,b (0..1)]
    // const paletteStops = params.paletteStops ?? [
    //     [0.0, 80 / 255, 75 / 255, 50 / 255],    
    //     [0.30, 120 / 255, 85 / 255, 60 / 255],    // dirt
    //     [0.62, 45 / 255, 110 / 255, 70 / 255],    // dark grass
    //     [0.82, 70 / 255, 140 / 255, 75 / 255],    // grass
    //     [1.00, 140 / 255, 140 / 255, 140 / 255],  // rock
    // ];

    const paletteStops = params.paletteStops ?? [
        [0.0, 0, 0, 0],    // dark grass
        [1.0, 1, 1, 1],  // sand1
    ];

    // const paletteStops = [
    //     [0.00, 10 / 255, 25 / 255, 70 / 255], // deep water 
    //     [0.30, 20 / 255, 70 / 255, 140 / 255], // shallow water 
    //     [0.47, 175 / 255, 165 / 255, 105 / 255], // sand
    //     [0.62, 70 / 255, 140 / 255, 75 / 255], // grass
    //     [0.82, 45 / 255, 110 / 255, 70 / 255], // dark grass 
    //     [1.00, 140 / 255, 140 / 255, 140 / 255], // rock ];
    // ]


    // Camera defaults (iso-ish)
    const cam = {
        yaw: params.yaw ?? (Math.PI * 0.25),         // 45°
        pitch: params.pitch ?? (Math.PI * 0.35),     // ~63° from horizon-ish
        orthoSize: params.orthoSize ?? 1.4,          // zoom (bigger = farther)
        panX: params.panX ?? 0.0,
        panY: params.panY ?? 0.0,
    };

    // ----------------------- WebGL2 setup -----------------------
    /**
     * @type {WebGL2RenderingContext}
     */
    const gl = canvas.getContext("webgl2", { antialias: true, depth: true, alpha: false });
    if (!gl) throw new Error("WebGL2 not available");

    gl.enable(gl.DEPTH_TEST);
    // gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0.2, 0.0, 0.2, 1.0);
    resizeToDisplaySize();

    const aspect = canvas.width / canvas.height;
    const projection = new Projection(fov, aspect, near, far);

    // Twoja Camera ctor robi: this.#position.set(...position)
    // więc NAJBEZPIECZNIEJ podać tablicę [x,y,z] (nie obiekt), bo spread zadziała na 100%.
    const camera = new Camera(fvec3(-1, worldSize * 0.75, 2));
    camera.changeYaw(270);     // 0->225
    camera.changePitch(-25);   // patrzy w dół
    camera.update();

    const viewMat = mat4();
    const modelMat = Mat4.identity();

    const orbit = {
        enabled: params.orbit?.enabled ?? true,
        radius: params.orbit?.radius ?? (worldSize * 1),
        height: params.orbit?.height ?? (worldSize * 0.7),
        speedDegPerSec: params.orbit?.speedDegPerSec ?? 20,
        pitch: params.orbit?.pitch ?? -25,
    };

    const mvp = mat4();
    function updateMVP() {
        camera.calculateLookAtMatrix(viewMat);
        projection.apply(mvp);
        mvp.mulInPlace(viewMat);
        mvp.mulInPlace(modelMat);
    }

    const center = fvec3(0, 0, 0);
    const eye = fvec3()
    const eyeToCenter = fvec3();

    function updateOrbit(yaw) {
        eye.set(Math.cos(yaw) * orbit.radius, orbit.height, Math.sin(yaw) * orbit.radius);
        camera.setPosition(eye);
        center.subOut(eye, eyeToCenter);
        eyeToCenter.setTo(center).subInPlace(eye);
        camera.setDirection(eyeToCenter);
        camera.update();
    }


    function orbitLookAt(viewMat, yawRad, pitchRad) {
        const p = Math.max(-Math.PI * 0.49, Math.min(Math.PI * 0.49, pitchRad));
        const cy = Math.cos(yawRad), sy = Math.sin(yawRad);
        const cp = Math.cos(p), sp = Math.sin(p);

        const eye = fvec3(
            center.x + (cy * cp) * orbit.radius,
            center.y + (sp) * orbit.radius,
            center.z + (sy * cp) * orbit.radius
        );

        Mat4.lookAt(eye, center, fvec3(0, 1, 0), viewMat);
    }

    function setOrbit(camera, centerX, centerY, centerZ, radius, yawDeg, pitchDeg) {
        const yaw = yawDeg * Math.PI / 180;
        const pitch = pitchDeg; // w stopniach w Twojej Camera

        // Pozycja na okręgu w płaszczyźnie XZ
        const x = centerX + Math.cos(yaw) * radius;
        const z = centerZ + Math.sin(yaw) * radius;
        const y = centerY;

        camera.position.x = x;
        camera.position.y = y;
        camera.position.z = z;

        // Żeby patrzeć w środek: kierunek ma być (center - pos)
        // Dla Twojej konwencji direction.x = cos(yaw) * cosPitch, direction.z = sin(yaw) * cosPitch
        // To znaczy yaw powinien wskazywać od kamery do środka:
        const lookYawDeg = (yawDeg + 180) % 360;

        // Pitch w dół (ujemny)
        camera.changeYaw(lookYawDeg - camera.yaw);   // ustaw absolutnie przez delta
        camera.changePitch(pitch - camera.pitch);
        camera.update();
    }


    // Handle HiDPI
    function resizeToDisplaySize() {
        const dpr = params.dpr ?? (window.devicePixelRatio || 1);
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        gl.viewport(0, 0, w, h);
    }
    resizeToDisplaySize();

    // ----------------------- Shaders -----------------------
    const vs = `#version 300 es
  precision highp float;

  layout(location=0) in vec2 aUv;   // [0..1]
  layout(location=1) in vec2 aXZ;   // plane coords in XZ

  uniform sampler2D uHeightTex;     // R8, height encoded 0..1
  uniform float uHeightAmp;
  uniform mat4 uMVP;

  out vec2 vUv;
  out float vH;

  float decodeHeight(float r) { return r * 2.0 - 1.0; } // back to [-1..1]

  void main() {
    float h = decodeHeight(texture(uHeightTex, aUv).r);
    vH = h;
    vUv = aUv;

    vec3 worldPos = vec3(aXZ.x, h * uHeightAmp, aXZ.y);
    gl_Position = uMVP * vec4(worldPos, 1.0);
    // gl_Position = vec4(aXZ.x, aXZ.y, 0.0, 1.0);
    // gl_Position = vec4(aXZ.x / 2.0 * 2.0, aXZ.y / 2.0 * 2.0, 0.0, 1.0);

  }`;

    const fs = `#version 300 es
  precision highp float;

  uniform sampler2D uHeightTex;
  uniform vec2 uTexel;        // 1/mapW, 1/mapH
  uniform float uHeightAmp;

  uniform vec3 uLightDir;     // world-space (normalized)
  uniform float uAmbient;

  uniform vec4 uStops0; // packed palette stops (t0,t1,t2,t3) - we'll do palette in JS via uniform array? Keep simple:
  // We'll send palette as uniform arrays:
  uniform int uStopCount;
  uniform vec4 uStopsT[16];   // (t, r, g, b) each
  uniform vec3 uBg;           // background / fog color
  uniform float uFog;         // 0..1
  uniform float uFogPow;

  in vec2 vUv;
  in float vH;

  out vec4 fragColor;

  float decodeHeight(float r) { return r * 2.0 - 1.0; }

  vec3 palette(float h) {
    float t = clamp((h + 1.0) * 0.5, 0.0, 1.0);
    // find segment
    vec4 a = uStopsT[0];
    vec4 b = uStopsT[0];
    for (int i = 0; i < 15; i++) {
      if (i + 1 >= uStopCount) break;
      vec4 s0 = uStopsT[i];
      vec4 s1 = uStopsT[i + 1];
      if (t >= s0.x && t <= s1.x) { a = s0; b = s1; break; }
      if (t > s1.x) { a = s1; b = s1; }
    }
    float denom = max(1e-6, b.x - a.x);
    float u = clamp((t - a.x) / denom, 0.0, 1.0);
    return mix(a.yzw, b.yzw, u);
  }

  void main() {
    // normal from height texture
    float hL = decodeHeight(texture(uHeightTex, vUv + vec2(-uTexel.x, 0.0)).r);
    float hR = decodeHeight(texture(uHeightTex, vUv + vec2( uTexel.x, 0.0)).r);
    float hD = decodeHeight(texture(uHeightTex, vUv + vec2(0.0, -uTexel.y)).r);
    float hU = decodeHeight(texture(uHeightTex, vUv + vec2(0.0,  uTexel.y)).r);

    float dx = (hR - hL) * 0.5 * uHeightAmp;
    float dz = (hU - hD) * 0.5 * uHeightAmp;

    vec3 N = normalize(vec3(-dx * 10.0, 1.0, -dz * 10.0));

    float lambert = max(0.0, dot(N, normalize(uLightDir)));
    float lit = uAmbient + (1.0 - uAmbient) * lambert;

    // vec3 col = palette(vH);
    vec3 col = palette(vH) * lit;

    // simple fog based on uv.y depth-ish (good enough for preview)
    float fogT = pow(clamp(vUv.y, 0.0, 1.0), uFogPow) * uFog;
    // col = mix(col, uBg, fogT);

    fragColor = vec4(col, 1.0);
    // fragColor = vec4(vec3(lambert), 1.0);

    // fragColor = vec4(1, 1, 1, 1);
  }`;

    function compileShader(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            const msg = gl.getShaderInfoLog(s);
            gl.deleteShader(s);
            throw new Error(msg || "Shader compile failed");
        }
        return s;
    }
    function linkProgram(vsSrc, fsSrc) {
        const p = gl.createProgram();
        gl.attachShader(p, compileShader(gl.VERTEX_SHADER, vsSrc));
        gl.attachShader(p, compileShader(gl.FRAGMENT_SHADER, fsSrc));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            const msg = gl.getProgramInfoLog(p);
            gl.deleteProgram(p);
            throw new Error(msg || "Program link failed");
        }
        return p;
    }

    const prog = linkProgram(vs, fs);
    gl.useProgram(prog);

    // Uniform locations
    const uMVP = gl.getUniformLocation(prog, "uMVP");
    const uHeightTex = gl.getUniformLocation(prog, "uHeightTex");
    const uTexel = gl.getUniformLocation(prog, "uTexel");
    const uHeightAmp = gl.getUniformLocation(prog, "uHeightAmp");
    const uLightDir = gl.getUniformLocation(prog, "uLightDir");
    const uAmbient = gl.getUniformLocation(prog, "uAmbient");
    const uStopCount = gl.getUniformLocation(prog, "uStopCount");
    const uStopsT = gl.getUniformLocation(prog, "uStopsT[0]");
    const uBg = gl.getUniformLocation(prog, "uBg");
    const uFog = gl.getUniformLocation(prog, "uFog");
    const uFogPow = gl.getUniformLocation(prog, "uFogPow");

    // ----------------------- Height texture -----------------------
    const heightTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, heightTex);

    // Use R8 texture (single channel)

    const pixF = new Float32Array(mapW * mapH);
    for (let y = 0; y < mapH; y++) for (let x = 0; x < mapW; x++) {
        pixF[y * mapW + x] = (getH(x, y) * 0.5 + 0.5); // 0..1
    }

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, mapW, mapH, 0, gl.RED, gl.FLOAT, pixF);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mapW, mapH, 0, gl.RED, gl.UNSIGNED_BYTE, pix);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.uniform1i(uHeightTex, 0);
    gl.uniform2f(uTexel, 1 / mapW, 1 / mapH);
    gl.uniform1f(uHeightAmp, heightAmp);

    // ----------------------- Grid mesh -----------------------
    function buildGridMesh(N) {
        // Vertex: [u,v, x,z]
        const verts = new Float32Array(N * N * 4);
        let p = 0;
        for (let j = 0; j < N; j++) {
            const v = j / (N - 1);
            const z = (v - 0.5) * worldSize;
            for (let i = 0; i < N; i++) {
                const u = i / (N - 1);
                const x = (u - 0.5) * worldSize;
                verts[p++] = u;
                verts[p++] = v;
                verts[p++] = x;
                verts[p++] = z;
            }
        }

        const idx = new Uint32Array((N - 1) * (N - 1) * 6);
        let k = 0;
        for (let j = 0; j < N - 1; j++) {
            for (let i = 0; i < N - 1; i++) {
                const i0 = j * N + i;
                const i1 = i0 + 1;
                const i2 = i0 + N;
                const i3 = i2 + 1;
                idx[k++] = i0; idx[k++] = i1; idx[k++] = i3;
                idx[k++] = i0; idx[k++] = i3; idx[k++] = i2;
            }
        }

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

        const stride = 4 * 4;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4);

        gl.bindVertexArray(null);
        return { vao, indexCount: idx.length, vbo, ebo };
    }

    const mesh = buildGridMesh(gridN);
    // ----------------------- Controls -----------------------
    let dragging = false;
    let lastX = 0, lastY = 0;

    canvas.addEventListener("mousedown", (e) => {
        dragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
    });
    window.addEventListener("mouseup", () => (dragging = false));

    window.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;

        camera.changeYaw(dx * 0.25);      // deg per px
        camera.changePitch(-dy * 0.25);
        camera.update();
    });

    canvas.addEventListener(
        "wheel",
        (e) => {
            e.preventDefault();
            const step = Math.sign(e.deltaY) * 0.8;
            if (orbit.enabled) {
                orbit.radius += step;
                orbit.radius = Math.max(0.1, orbit.radius);
            }
            else
                camera.moveForward(step);
        },
        { passive: false }
    );

    // ----------------------- Render loop -----------------------
    const bg = params.bg ?? [11 / 255, 15 / 255, 20 / 255];
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    const fog = params.fog ?? 0.35;
    const fogPow = params.fogPow ?? 1.3;

    // upload palette (up to 16 stops)
    const stopCount = Math.min(16, paletteStops.length);
    const packedStops = new Float32Array(4 * 16);
    for (let i = 0; i < stopCount; i++) {
        const s = paletteStops[i];
        packedStops[i * 4 + 0] = s[0];
        packedStops[i * 4 + 1] = s[1];
        packedStops[i * 4 + 2] = s[2];
        packedStops[i * 4 + 3] = s[3];
    }

    const L = fvec3(...lightDir).normalize()._values;

    gl.uniform1i(uStopCount, stopCount);
    gl.uniform4fv(uStopsT, packedStops);
    gl.uniform3f(uBg, bg[0], bg[1], bg[2]);
    gl.uniform1f(uFog, fog);
    gl.uniform1f(uFogPow, fogPow);

    gl.uniform3f(uLightDir, L[0], L[1], L[2]);
    gl.uniform1f(uAmbient, ambient);

    let raf = 0;
    let disposed = false;

    function frame() {
        if (disposed) return;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const now = performance.now() * 0.001;
        if (orbit.enabled) {
            const yawDeg = (now * orbit.speedDegPerSec) % 360;
            updateOrbit(yawDeg * (Math.PI / 180));
            // orbitLookAt(viewMat, yawDeg * (Math.PI / 180), 10 * (Math.PI / 180));
        }

        updateMVP();

        gl.useProgram(prog);
        gl.uniformMatrix4fv(uMVP, false, mvp._values);

        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);

        raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);

    // ----------------------- Public API -----------------------
    // function updateHeightTexture() {
    //     // Re-upload height texture from getH (call when your generator changes)
    //     for (let y = 0; y < mapH; y++) {
    //         for (let x = 0; x < mapW; x++) {
    //             const h = getH(x, y);
    //             pix[y * mapW + x] = Math.max(0, Math.min(255, (((h * 0.5 + 0.5) * 255) | 0)));
    //         }
    //     }
    //     gl.bindTexture(gl.TEXTURE_2D, heightTex);
    //     gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, mapW, mapH, gl.RED, gl.UNSIGNED_BYTE, pix);
    // }


    function dispose() {
        disposed = true;
        cancelAnimationFrame(raf);
        gl.deleteTexture(heightTex);
        gl.deleteBuffer(mesh.vbo);
        gl.deleteBuffer(mesh.ebo);
        gl.deleteVertexArray(mesh.vao);
        gl.deleteProgram(prog);
    }

    return {
        gl,
        // updateHeightTexture,
        dispose,
    };
}
