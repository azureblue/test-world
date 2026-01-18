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


export function renderTerrain(canvas, startX, startY, width, height, getH, params = {}) {
    // ----------------------- Params (sane defaults) -----------------------


    const heightMapResolution = params.heightMapResolution ?? 1;
    const mapW = Math.floor(width * heightMapResolution);
    const mapH = Math.floor(height * heightMapResolution);
    // Geometry resolution (NOT map resolution). 256 is a good default.
    const gridN = params.gridN ?? 1200;

    // World size in XZ (in "world units")
    const worldSize = params.worldSize ?? 2.0; // plane spans [-worldSize/2 .. +worldSize/2]

    // Height scale in world units
    const heightAmp = params.heightAmp ?? 0.3;
    const bottomY = params.bottomY ?? (-heightAmp * 2.0); // albo -50, zależnie od skali


    // Lighting
    const ambient = params.ambient ?? 0.5;
    const lightDir = params.lightDir ?? [0.8, 0.5, 0.5]; // world-space
    const toLightVector = fvec3(...lightDir).normalizeIn();

    const bg = params.bg ?? [11 / 255, 15 / 255, 20 / 255];

    const fov = params.fov ?? (50 * Math.PI / 180);
    const near = params.near ?? 0.1;
    const far = params.far ?? 640.0;

    const water = {
        enabled: params.water?.enabled ?? true,
        level: params.water?.level ?? -0.2,          // world Y
        alpha: params.water?.alpha ?? 0.3,
        color: params.water?.color ?? [0.08, 0.19, 0.80],
    }; 

    // Color palette: you can override with params.paletteStops
    // stops: [t(0..1), r,g,b (0..1)]
    // const paletteStops = params.paletteStops ?? [
    //     [0.0, 80 / 255, 75 / 255, 50 / 255],    
    //     [0.30, 120 / 255, 85 / 255, 60 / 255],    // dirt
    //     [0.62, 45 / 255, 110 / 255, 70 / 255],    // dark grass
    //     [0.82, 70 / 255, 140 / 255, 75 / 255],    // grass
    //     [1.00, 140 / 255, 140 / 255, 140 / 255],  // rock
    // ];

    // const paletteStops = params.paletteStops ?? [
    //     [0.0, 0, 0, 0],    // dark grass
    //     [1.0, 1, 1, 1],  // sand1
    // ];

    const paletteStops = [
        // [0.0, 0 / 255, 0 / 255, 0 / 255], // deep water 
        // [0.12, 50 / 255, 5 / 255, 110 / 255], // water 
        // [0.30, 20 / 255, 70 / 255, 140 / 255], // shallow water 
        [0.00, 30 / 255, 70 / 255, 30 / 255], // darker grass 
        [0.30, 45 / 255, 110 / 255, 60 / 255], // dark grass 
        // [0.60, 175 / 255, 165 / 255, 80 / 255], // sand
        [0.45].concat([170, 170, 70].map(c => c / 255)), // mountain ;
        [0.60].concat([240, 208, 48].map(c => c / 255)), // mountain ;
        [0.70].concat([240, 190, 48].map(c => c / 255)), // mountain ;
        [0.90].concat([224, 70, 4].map(c => c / 255)), // mountain ;
        [1.0].concat([255, 255, 255].map(c => c / 255)), // rock ;
    ]


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
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CW);
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
    const modelMat = Mat4.identity().scale(worldSize, 1, worldSize);

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

    function buildWaterQuad(worldSize) {
        // 2 triangles on XZ plane centered at 0
        // aXZ only (like terrain), no UV needed
        const hs = worldSize * 0.5;
        const verts = new Float32Array([
            -hs, -hs,
            hs, -hs,
            hs, hs,
            -hs, -hs,
            hs, hs,
            -hs, hs,
        ]);


        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * 4, 0);

        gl.bindVertexArray(null);

        return { vao, vbo, vertexCount: 6 };
    }
    const waterMesh = buildWaterQuad(worldSize);

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

    vec3 N = normalize(vec3(-dx * 25.0, 1.0, -dz * 25.0));

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

    const waterVS = `#version 300 es
precision highp float;

layout(location=0) in vec2 aXZ; // x,z
uniform mat4 uMVP;
uniform float uWaterY;

out vec3 vWorldPos;

void main() {
  vec3 wp = vec3(aXZ.x, uWaterY, aXZ.y);
  vWorldPos = wp;
  gl_Position = uMVP * vec4(wp, 1.0);
}
`;
    const waterFS = `#version 300 es
precision highp float;

uniform vec3 uWaterColor;
uniform float uAlpha;
// uniform vec3 uCamPos;

in vec3 vWorldPos;
out vec4 fragColor;

void main() {
  // view dir
//   vec3 V = normalize(uCamPos - vWorldPos);

  // water normal = up (flat plane)
  vec3 N = vec3(0.0, 1.0, 0.0);

  // cheap fresnel: stronger at grazing angles
//   float f = pow(1.0 - max(0.0, dot(N, V)), 3.0);
//   float a = mix(uAlpha, 0.95, f * uFresnel);
  vec3 col = uWaterColor;
  fragColor = vec4(col, uAlpha);
//   fragColor = vec4(col, a);
}
`;

    const skirtVS = `#version 300 es
precision highp float;

layout(location=0) in vec2 aXZ;
layout(location=1) in float aT;   // 0 top, 1 bottom
layout(location=2) in vec2 aUv;

uniform sampler2D uHeightTex;
uniform float uHeightAmp;
uniform float uBottomY;
uniform mat4 uMVP;

out float vYWorld;
out float vHFromY;
out float vIsBottom;

float decodeHeight(float r){ return r*2.0-1.0; }

void main() {
  float hTop = decodeHeight(texture(uHeightTex, aUv).r);
  float yTop = hTop * uHeightAmp;

  float y = mix(yTop, uBottomY, aT);

  vYWorld = y;
  vHFromY = clamp(y / uHeightAmp, -1.0, 1.0);  // <-- "rzeczywista" wysokość [-1..1]
  vIsBottom = aT;

  gl_Position = uMVP * vec4(aXZ.x, y, aXZ.y, 1.0);
}


`;
    const skirtFS = `#version 300 es
precision highp float;

uniform int uStopCount;
uniform vec4 uStopsT[16];
uniform vec3 uLightDir;
uniform float uAmbient;

in vec2 vUv;
in float vHFromY;
in float vIsBottom;
out vec4 fragColor;

vec3 palette(float h) {
  float t = clamp((h + 1.0) * 0.5, 0.0, 1.0);
  vec4 a = uStopsT[0], b = uStopsT[0];
  for (int i=0;i<15;i++){
    if (i+1>=uStopCount) break;
    vec4 s0=uStopsT[i], s1=uStopsT[i+1];
    if (t>=s0.x && t<=s1.x){ a=s0; b=s1; break; }
    if (t>s1.x){ a=s1; b=s1; }
  }
  float u = clamp((t - a.x)/max(1e-6,b.x-a.x), 0.0, 1.0);
  return mix(a.yzw, b.yzw, u);
}

void main() {
  // ściana: normal pozioma (upraszczamy: brak, dajmy stałe oświetlenie)
  // albo pseudo: im niżej tym ciemniej
  vec3 col = palette(vHFromY);
  float lit = uAmbient; // stałe (żeby nie było dziwnych pasów)
  col *= lit;
  col *= mix(1.0, 0.35, vIsBottom); // dół ciemniejszy
  fragColor = vec4(col, 1.0);
}
`;

    const waterSkirtVS = `#version 300 es
precision highp float;

layout(location=0) in vec2 aXZ;
layout(location=1) in float aT; // 0 top, 1 bottom

uniform mat4 uMVP;
uniform float uWaterY;
uniform float uBottomY;

out vec3 vWorldPos;

void main() {
  float y = mix(uWaterY, uBottomY, aT);
  vec3 wp = vec3(aXZ.x * 0.99999, y + 0.001, aXZ.y * 0.99999 );
  vWorldPos = wp;
  gl_Position = uMVP * vec4(wp, 1.0);
}
`;
    const waterSkirtFS = `#version 300 es
precision highp float;

uniform vec3 uWaterColor;
uniform float uAlpha;

out vec4 fragColor;

void main() {
  fragColor = vec4(uWaterColor, uAlpha);
}
`;




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
    gl.uniform1i(uHeightTex, 0);
    gl.uniform2f(uTexel, 1 / mapW, 1 / mapH);
    gl.uniform1f(uHeightAmp, heightAmp);
    const fog = params.fog ?? 0.35;
    const fogPow = params.fogPow ?? 1.3;
    gl.uniform1i(uStopCount, stopCount);
    gl.uniform4fv(uStopsT, packedStops);
    gl.uniform3f(uBg, bg[0], bg[1], bg[2]);
    gl.uniform1f(uFog, fog);
    gl.uniform1f(uFogPow, fogPow);
    gl.uniform3f(uLightDir, toLightVector.x, toLightVector.y, toLightVector.z);
    gl.uniform1f(uAmbient, ambient);


    const waterProg = linkProgram(waterVS, waterFS);
    // gl.useProgram(waterProg);
    const uWaterMVP = gl.getUniformLocation(waterProg, "uMVP");
    const uWaterY = gl.getUniformLocation(waterProg, "uWaterY");
    const uWaterColor = gl.getUniformLocation(waterProg, "uWaterColor");
    const uWaterAlpha = gl.getUniformLocation(waterProg, "uAlpha");
    // const uWaterFres = gl.getUniformLocation(waterProg, "uFresnel");
    // const uWaterCam = gl.getUniformLocation(waterProg, "uCamPos");

    const skirtProg = linkProgram(skirtVS, skirtFS);
    gl.useProgram(skirtProg);
    const uSkirtMVP = gl.getUniformLocation(skirtProg, "uMVP");
    const uSkirtHeight = gl.getUniformLocation(skirtProg, "uHeightTex");
    const uSkirtAmp = gl.getUniformLocation(skirtProg, "uHeightAmp");
    const uSkirtBottomY = gl.getUniformLocation(skirtProg, "uBottomY");
    const uSkirtStopCnt = gl.getUniformLocation(skirtProg, "uStopCount");
    const uSkirtStops = gl.getUniformLocation(skirtProg, "uStopsT[0]");
    const uSkirtLightDir = gl.getUniformLocation(skirtProg, "uLightDir");
    const uSkirtAmbient = gl.getUniformLocation(skirtProg, "uAmbient");

    gl.uniform1i(uSkirtHeight, 0); // TEXTURE0

    gl.uniform1f(uSkirtAmp, heightAmp);
    gl.uniform1f(uSkirtBottomY, bottomY);

    // paleta (ta sama co terrain)
    gl.uniform1i(uSkirtStopCnt, stopCount);
    gl.uniform4fv(uSkirtStops, packedStops);

    // światło – uproszczone, ale spójne
    gl.uniform3f(
        uSkirtLightDir,
        lightDir[0], lightDir[1], lightDir[2]
    );
    gl.uniform1f(uSkirtAmbient, ambient);

    const waterSkirtProg = linkProgram(waterSkirtVS, waterSkirtFS);

    const uWSkirtMVP = gl.getUniformLocation(waterSkirtProg, "uMVP");
    const uWSkirtWaterY = gl.getUniformLocation(waterSkirtProg, "uWaterY");
    const uWSkirtBottom = gl.getUniformLocation(waterSkirtProg, "uBottomY");
    const uWSkirtColor = gl.getUniformLocation(waterSkirtProg, "uWaterColor");
    const uWSkirtAlpha = gl.getUniformLocation(waterSkirtProg, "uAlpha");


    // ----------------------- Height texture -----------------------
    const heightTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, heightTex);

    // Use R8 texture (single channel)

    const pixF = new Float32Array(mapW * mapH);
    for (let y = 0; y < mapH; y++)
        for (let x = 0; x < mapW; x++) {
            pixF[y * mapW + x] = (getH((x / heightMapResolution) + startX, (y / heightMapResolution) + startY) * 0.5 + 0.5); // 0..1
        }

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, mapW, mapH, 0, gl.RED, gl.FLOAT, pixF);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    // gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, mapW, mapH, 0, gl.RED, gl.UNSIGNED_BYTE, pix);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    function buildWaterSkirtMesh(N, worldSize) {
        const hs = worldSize * 0.5;
        const seg = N - 1;
        const vCount = 4 * seg * 6; // 4 sides * segments * 2 tris * 3 verts

        // (x,z,t) where t=0 top (water level), t=1 bottom
        const verts = new Float32Array(vCount * 3);
        let p = 0;

        function push(x, z, t) {
            verts[p++] = x;
            verts[p++] = z;
            verts[p++] = t;
        }

function addSide(getXZ, flip) {
  for (let i = 0; i < seg; i++) {
    const a = getXZ(i);
    const b = getXZ(i + 1);

    if (!flip) {
      // tri 1
      push(a[0], a[1], 0.0);
      push(b[0], b[1], 0.0);
      push(b[0], b[1], 1.0);

      // tri 2
      push(a[0], a[1], 0.0);
      push(b[0], b[1], 1.0);
      push(a[0], a[1], 1.0);
    } else {
      // odwrócony winding (zamiana a<->b w każdym tri)
      push(b[0], b[1], 0.0);
      push(a[0], a[1], 0.0);
      push(b[0], b[1], 1.0);

      push(a[0], a[1], 0.0);
      push(a[0], a[1], 1.0);
      push(b[0], b[1], 1.0);
    }
  }
}

// z = -hs (outward -Z)  -> OK, bez flip
addSide(i => [-hs + (i / seg) * worldSize, -hs], true);

// z = +hs (outward +Z)  -> FLIP
addSide(i => [-hs + (i / seg) * worldSize, +hs], false);

// x = -hs (outward -X)  -> FLIP
addSide(i => [-hs, -hs + (i / seg) * worldSize], false);

// x = +hs (outward +X)  -> OK, bez flip
addSide(i => [+hs, -hs + (i / seg) * worldSize], true);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

        // layout(location=0) in vec2 aXZ;
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 3 * 4, 0);

        // layout(location=1) in float aT;
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 3 * 4, 2 * 4);

        gl.bindVertexArray(null);

        return { vao, vbo, vertexCount: vCount };
    }

    const waterSkirtMesh = buildWaterSkirtMesh(gridN, worldSize);


   function buildSkirtMesh(N, worldSize) {
  const hs = worldSize * 0.5;
  const seg = N - 1;
  const vCount = 4 * seg * 6;

  // (x,z,t,u,v)
  const verts = new Float32Array(vCount * 5);
  let p = 0;

  function uvFromXZ(x, z) {
    const u = (x / worldSize) + 0.5;
    const v = (z / worldSize) + 0.5;
    return [u, v];
  }

    function push(x, z, t) {
    const [u, v] = uvFromXZ(x, z);
    verts[p++] = x;
    verts[p++] = z;
    verts[p++] = t;
    verts[p++] = u;
    verts[p++] = v;
  }
function emitTri(ax, az, at, bx, bz, bt, cx, cz, ct) {
  push(ax, az, at);
  push(bx, bz, bt);
  push(cx, cz, ct);
}

function addSide(getXZ, flip) {
  for (let i = 0; i < seg; i++) {
    const a = getXZ(i);
    const b = getXZ(i + 1);

    // Quad corners:
    // A0 = top at a, B0 = top at b, B1 = bottom at b, A1 = bottom at a
    const A0 = [a[0], a[1], 0.0];
    const B0 = [b[0], b[1], 0.0];
    const B1 = [b[0], b[1], 1.0];
    const A1 = [a[0], a[1], 1.0];

    if (!flip) {
      // (A0, B0, B1) and (A0, B1, A1)
      emitTri(A0[0],A0[1],A0[2],  B0[0],B0[1],B0[2],  B1[0],B1[1],B1[2]);
      emitTri(A0[0],A0[1],A0[2],  B1[0],B1[1],B1[2],  A1[0],A1[1],A1[2]);
    } else {
      // flip winding PER TRIANGLE: swap last two vertices
      emitTri(A0[0],A0[1],A0[2],  B1[0],B1[1],B1[2],  B0[0],B0[1],B0[2]);
      emitTri(A0[0],A0[1],A0[2],  A1[0],A1[1],A1[2],  B1[0],B1[1],B1[2]);
    }
  }
}

  // Ten sam flip-map co water-skirt (Twoje “odwrotnie”)
  addSide(i => [-hs + (i / seg) * worldSize, -hs], true);   // z=-hs
  addSide(i => [-hs + (i / seg) * worldSize, +hs], false);  // z=+hs
  addSide(i => [-hs, -hs + (i / seg) * worldSize], false);  // x=-hs
  addSide(i => [+hs, -hs + (i / seg) * worldSize], true);   // x=+hs

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

  const stride = 5 * 4;
  gl.enableVertexAttribArray(0); // aXZ
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);

  gl.enableVertexAttribArray(1); // aT
  gl.vertexAttribPointer(1, 1, gl.FLOAT, false, stride, 2 * 4);

  gl.enableVertexAttribArray(2); // aUv
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, stride, 3 * 4);

  gl.bindVertexArray(null);
  return { vao, vbo, vertexCount: vCount };
}

    
    const skirt = buildSkirtMesh(gridN, worldSize);

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

        orbit.enabled = !orbit.enabled;

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
    gl.clearColor(bg[0], bg[1], bg[2], 1);

    let raf = 0;
    let disposed = false;
    let orbitAngle = 0;
    function frame() {
        if (disposed) return;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        const now = performance.now() * 0.001;
        if (orbit.enabled) {
            orbitAngle += 0.3;
            if (orbitAngle > 360) orbitAngle -= 360;
            const yawDeg = orbitAngle;
            updateOrbit(yawDeg * (Math.PI / 180));
            // orbitLookAt(viewMat, yawDeg * (Math.PI / 180), 10 * (Math.PI / 180));
        }

        updateMVP();

        gl.useProgram(prog);
        gl.uniformMatrix4fv(uMVP, false, mvp._values);
        // const cd = camera.direction.normalize();
        // gl.uniform3f(uLightDir, -cd.x, -cd.y, -cd.z);

        gl.bindVertexArray(mesh.vao);
        gl.drawElements(gl.TRIANGLES, mesh.indexCount, gl.UNSIGNED_INT, 0);

        gl.useProgram(skirtProg);
        gl.uniformMatrix4fv(uSkirtMVP, false, mvp._values);

        gl.bindVertexArray(skirt.vao);
        gl.drawArrays(gl.TRIANGLES, 0, skirt.vertexCount);
        gl.bindVertexArray(null);

        if (water.enabled) {

            gl.useProgram(waterSkirtProg);

            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            gl.depthMask(false);     // nie zapisuj depth
            // gl.disable(gl.DEPTH_TEST);

            gl.uniformMatrix4fv(uWSkirtMVP, false, mvp._values);
            gl.uniform1f(uWSkirtWaterY, water.level * heightAmp);         // bez yBias tutaj (opcjonalnie)
            gl.uniform1f(uWSkirtBottom, bottomY);             // ten sam bottomY co terrain skirt
            gl.uniform3f(uWSkirtColor, water.color[0], water.color[1], water.color[2]);
            gl.uniform1f(uWSkirtAlpha, water.alpha);

            gl.bindVertexArray(waterSkirtMesh.vao);
            gl.drawArrays(gl.TRIANGLES, 0, waterSkirtMesh.vertexCount);
            gl.enable(gl.DEPTH_TEST);
            // gl.bindVertexArray(null);


            gl.useProgram(waterProg);

            // blending
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

            // depth test zostaje ON (żeby woda była zasłaniana przez góry),
            // ale nie zapisujemy depth (żeby nie psuć dalszych drawcalli / debugów)
            gl.depthMask(false);

            gl.uniformMatrix4fv(uWaterMVP, false, mvp._values);
            gl.uniform1f(uWaterY, water.level * heightAmp);
            gl.uniform3f(uWaterColor, water.color[0], water.color[1], water.color[2]);
            gl.uniform1f(uWaterAlpha, water.alpha);
            // gl.uniform1f(uWaterFres, water.fresnel);

            // kamera: jeśli nie używasz klasy Camera, podaj eye z orbitu.
            // Jeśli używasz Camera, to:
            // gl.uniform3f(uWaterCam, camera.position.x, camera.position.y, camera.position.z);

            gl.bindVertexArray(waterMesh.vao);
            gl.drawArrays(gl.TRIANGLES, 0, waterMesh.vertexCount);
            gl.bindVertexArray(null);

            gl.depthMask(true);
            gl.disable(gl.BLEND);
        }




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
