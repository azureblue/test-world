precision mediump float;
uniform sampler2D u_sampler;
varying highp vec2 v_tex_coord;

void main() {
    vec4 tex = texture2D(u_sampler, v_tex_coord);
    gl_FragColor = tex;
    //gl_FragColor = texture2D(u_sampler, v_tex_coord);    
}
