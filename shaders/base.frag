precision mediump float;
varying vec3 v_color;
uniform sampler2D uSampler;
varying highp vec2 vTextureCoord;
void main() {
    // gl_FragColor = vec4(v_color, 1.0);
    gl_FragColor = texture2D(uSampler, vTextureCoord);    
}