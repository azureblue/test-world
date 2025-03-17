attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_tex_coord;
uniform mat4 m_matrix;
uniform mat4 v_matrix;
uniform mat4 p_matrix;
varying highp vec2 v_tex_coord;
varying vec3 o_norm;
void main() {
    gl_Position = p_matrix * v_matrix * m_matrix * vec4(a_position, 1.0);        
    v_tex_coord = a_tex_coord;
    o_norm = a_normal;
}