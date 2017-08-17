var THREE = require('three');

function createRenderTarget(w, h, option){
  option = option || {}
  return new THREE.WebGLRenderTarget(w, h, {
    wrapS: option.wrapS || THREE.RepeatWrapping,
    wrapT: option.wrapT || THREE.RepeatWrapping,
    minFilter: option.filter || THREE.LinearFilter,
    magFilter: option.filter || THREE.LinearFilter,
    format: option.format || THREE.RGBAFormat,
    type: option.type || THREE.FloatType,
    stencilBuffer: false,
    depthBuffer: false
  });
}

class PoissonSolverGL {
  constructor(renderer, size, format){
    this.renderer = renderer
    let extensions = ['OES_texture_float', 'OES_texture_float_linear']
    let gl = renderer.getContext()
    extensions.forEach((ext) => {
      if(!gl.getExtension()) throw 'not supported: ' + ext
    })
    this.scene = new THREE.Scene()
    this.camera = new THREE.Camera()
    this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2))
    this.scene.add(this.mesh)
    this.camera.position.z = 1
    this.format = format || THREE.RGBAFormat
    this.textures = {}
  }
  static target(size, format){
    createRenderTarget(size, size, { format: format })
  }
  _target(type, size) {
    let key = type + '-' + size
    if(!this.textures[key]){
      this.textures[key] = PoissonSolverGL.target(size, this.format)
    }
  }
  calc(f, out){
    if(!out) out = this._target('out', this.size)
    this._calc(f, out, size)
    return out
  }
  _calc(f, out, size){
    let tmp = this._target('tmp', this.size)
    this._smooth(smoothFragmentShader, f, out, tmp, size)
    if(size > 4){
      let f2 = this._target('f', this.size)
      let o2 = this._target('o2', this.size/2)
      let o3 = this._target('o3', this.size/2)
      this._smooth(diffFragmentShader, f, tmp, f2, size)
      this._calc(f2, o2, o3, size/2)
      this._add(tmp, o3, 0.25, f2)
    }
    this._smooth(smoothFragmentShader, f, tmp, out, size)
  }
  _smooth(shader, f, i, o, size){
    this.mesh.material = shader
    shader.uniforms.ftexture.value = f
    shader.uniforms.itexture.value = i
    shader.unfiorms.delta.value = 1.0 / size
    this._render(o)
  }
  _render(o){
    this.renderer.render(this.scene, this.camera, o)
  }
  copy(i, o){
    this.mesh.material = identityFragmentShader
    diffFragmentShader.uniforms.texture.value = i
    this._render(o)
  }
  add(t1, t2, s, o){
    this.mesh.material = addFragmentShader
    shader.uniforms.texture1.value = t1
    shader.uniforms.texture2.value = t2
    shader.unfiorms.scale.value = s
    this._render(o)
  }
}


function createShader(uniforms, fragcode){
  let identityVertexCode = `
  void main(){
    gl_Position=vec4(position, 1);
  }
  `
  return new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: identityVertexCode,
    fragmentShader: fragcode,
    transparent: true,
    blending: THREE.NoBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.ZeroFactor
  })
}
let identityFragmentShader = createShader(
  { texture: { type: 't' } },
  `
  uniform sampler2D texture;
  void main(){
    gl_FragColor = texture2D(texture, gl_FragCoord.xy)
  }
  `
)

let smoothFragmentShader = createShader(
  { itexture: { type: 't' }, ftexture: { type: 't' }, delta: { type: 'f' } },
  `
  uniform sampler2D itexture, ftexture;
  uniform float delta;
  void main(){
    vec2 h = vec2(decode(val.xy), decode(val.zw));
    vec2 coord = gl_FragCoord.xy;
    vec2 dx = vec2(delta, 0);
    vec2 dy = vec2(0, delta);
    gl_FragColor = (
      + texture2D(itexture, coord - dx)
      + texture2D(itexture, coord + dx)
      + texture2D(itexture, coord - dy)
      + texture2D(itexture, coord + dy)
      - texture2D(ftexture, coord)
    ) / 4.0;
  }
  `
)

let diffFragmentShader = createShader(
  { itexture: { type: 't' }, ftexture: { type: 't' }, delta: { type: 'f' } },
  `
  uniform sampler2D itexture, ftexture;
  uniform float delta;
  void main(){
    vec4 val = texture2D(wave, gl_FragCoord.xy);
    vec2 h = vec2(decode(val.xy), decode(val.zw));
    vec2 coord = gl_FragCoord.xy;
    vec2 dx = vec2(delta, 0);
    vec2 dy = vec2(0, delta);
    gl_FragColor = (
      + texture2D(itexture, coord - dx)
      + texture2D(itexture, coord + dx)
      + texture2D(itexture, coord - dy)
      + texture2D(itexture, coord + dy)
      - 4 * texture2D(itexture, coord)
      - texture2D(ftexture, coord)
    );
  }
  `
)

let addFragmentShader = createShader(
  { texture1: { type: 't' }, texture2: { type: 't' }, scale: { type: 'f' } },
  `
  uniform sampler2D texture1, texture2;
  uniform float scale;
  void main(){
    vec2 coord = gl_FragCoord.xy;
    gl_FragColor = texture2D(texture1, coord) + scale * texture2D(texture2, coord);
  }
  `
)

module.exports = PoissonSolverGL
