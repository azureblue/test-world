precision mediump float;
uniform sampler2D u_sampler;
varying highp vec2 a_tex_coord;
void main() {
    gl_FragColor = texture2D(u_sampler, a_tex_coord);    
}
