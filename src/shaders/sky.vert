#version 300 es
// The sky: one triangle covering the screen (no vertex buffer, from gl_VertexID), on the far plane, so with depth test
// LEQUAL after the opaque blocks only the pixels they left empty run the fragment shader.
uniform vec3 sky_forward; // the view direction
uniform vec3 sky_right;   // right, scaled by tan(fov / 2) * aspect: the view direction at the screen's right edge minus forward
uniform vec3 sky_up;      // up, scaled by tan(fov / 2)
out vec3 v_dir;

void main() {
    vec2 p = vec2(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0);
    // linear over the screen, so the interpolated value is the pixel's view direction (not normalized)
    v_dir = sky_forward + p.x * sky_right + p.y * sky_up;
    gl_Position = vec4(p, 1.0, 1.0);
}
