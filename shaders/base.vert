attribute vec3 a_position;
attribute vec3 a_color;
attribute vec2 aTextureCoord;
varying vec3 v_color;
uniform mat4 u_matrix;
uniform mat4 r_matrix;
varying highp vec2 vTextureCoord;

void main() {
    gl_Position = r_matrix * u_matrix * vec4(a_position, 1.0);
    v_color = a_color; //vec3(0.5, 0.0, 0.8);
    
    vTextureCoord = aTextureCoord;
}