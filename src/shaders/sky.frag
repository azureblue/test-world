#version 300 es
// highp: the sun's pixels are fractions of a degree, beyond mediump's precision
precision highp float;
uniform vec3 sky_zenith;   // the colour straight up
uniform vec3 sky_horizon;  // the colour at the horizon and below it, the same as the fog's: terrain fades into it
uniform float sky_height;  // the view direction's height (0 at the horizon, 1 straight up) where it's the zenith colour
uniform vec3 sun_dir;      // towards the sun, unit length
uniform vec3 sun_u;        // two axes across the sun (perpendicular to sun_dir), scaled so that projected onto the
uniform vec3 sun_v;        //   plane facing the sun, one unit is one of the sun's pixels
uniform float sun_radius;  // the sun's radius, in its pixels
uniform vec3 sun_color;
uniform vec2 sun_glow;     // the glow's strength and exponent (cos(angle to the sun) to the exponent)
in vec3 v_dir;
out vec4 color_out;

void main() {
    vec3 dir = normalize(v_dir);
    // smoothstep: no edge at the horizon (the colour starts changing slowly), none where it reaches the zenith colour
    vec3 color = mix(sky_horizon, sky_zenith, smoothstep(0.0, sky_height, dir.y));

    // the glow is smooth; it fades out towards the horizon: there the sky stays the fog's colour, so far terrain fading
    // into the fog doesn't stand out against a glowing sky
    float toSun = dot(dir, sun_dir);
    color += sun_color * (sun_glow.x * pow(max(toSun, 0.0), sun_glow.y) * smoothstep(0.0, 0.2, dir.y));
    // the disc is blocky: the direction projected onto the plane facing the sun, cut into square pixels; a pixel is in
    // the disc if its centre is
    vec2 pixel = floor(vec2(dot(dir, sun_u), dot(dir, sun_v)) / max(toSun, 1e-3)) + 0.5;
    color = mix(color, sun_color, step(length(pixel), sun_radius) * step(0.0, toSun));
    color_out = vec4(color, 1.0);
}
