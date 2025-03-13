attribute vec3 a_position;
attribute vec2 a_tex_coord;
uniform mat4 u_matat;
uniform mat4 r_matrix;
varying highp vec2 a_tex_coord;
void main() {
    gl_Position = r_matrix * u_matrix * vec4(a_position, 1.0);        
    vTextureCoord = a_tex_coord
}