#version 300 es
precision mediump float;
uniform vec3 sky_zenith;   // the colour straight up
uniform vec3 sky_horizon;  // the colour at the horizon and below it, the same as the fog's: terrain fades into it
uniform float sky_height;  // the view direction's height (0 at the horizon, 1 straight up) where it's the zenith colour
in vec3 v_dir;
out vec4 color_out;

void main() {
    // smoothstep: no edge at the horizon (the colour starts changing slowly), none where it reaches the zenith colour
    float t = smoothstep(0.0, sky_height, normalize(v_dir).y);
    color_out = vec4(mix(sky_horizon, sky_zenith, t), 1.0);
}
