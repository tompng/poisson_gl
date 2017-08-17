let THREE = require('three');

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
    return createRenderTarget(size, size, { format: format })
  }
  _target(type, size) {
    let key = type + '-' + size
    if(!this.textures[key]){
      this.textures[key] = PoissonSolverGL.target(size, this.format)
    }
  }
  poisson(texture, out){
    if(!out) out = this._target('poisson', this.size)
    this._renderWithDelta(out, poissonShader, { texture: texture }, size)
  }
  solve(f, out){
    if(!out) out = this._target('out', this.size)
    this._solve(f, out, size)
    return out
  }
  _solve(f, out, size){
    let tmp = this._target('tmp', this.size)
    this._renderWithDelta(tmp, smoothShader, { ftexture: f, itexture: out }, size)
    if(size > 4){
      let f2 = this._target('f', this.size)
      let o2 = this._target('o2', this.size/2)
      let o3 = this._target('o3', this.size/2)
      this._renderWithDelta(f2, diffShader, { ftexture: f, itexture: tmp }, size)
      this._solve(f2, o2, o3, size/2)
      this._add(tmp, o3, 0.25, f2)
    }
    this._renderWithDelta(out, smoothShader, { ftexture: f, itexture: tmp }, size)
  }
  _renderWithDelta(o, shader, unforms, size){
    this._render(o, shader, Object.assign({ delta: 1.0 / size }, uniforms))
  }
  _render(o, shader, uniforms){
    this.mesh.material = shader
    for(let key in uniforms){
      let uniform = shader.uniforms[key]
      if(uniform)uniform.value = uniforms[key]
    }
    this.renderer.render(this.scene, this.camera, o)
  }
  add(o, t1, t2, s){
    this._render(o, addShader, { texture1: t1, texture2: t2, scale: s })
  }
}

function createShader(uniforms, fragCode){
  let vertexCode = `
  void main(){
    gl_Position=vec4(position, 1);
  }
  `
  return new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexCode,
    fragmentShader: fragCode,
    transparent: true,
    blending: THREE.NoBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.ZeroFactor
  })
}
let identityShader = createShader(
  { texture: { type: 't' } },
  `
  uniform sampler2D texture;
  void main(){
    gl_FragColor = texture2D(texture, gl_FragCoord.xy)
  }
  `
)

let smoothShader = createShader(
  { itexture: { type: 't' }, ftexture: { type: 't' }, delta: { type: 'f' } },
  `
  uniform sampler2D itexture, ftexture;
  uniform float delta;
  void main(){
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

let diffShader = createShader(
  { itexture: { type: 't' }, ftexture: { type: 't' }, delta: { type: 'f' } },
  `
  uniform sampler2D itexture, ftexture;
  uniform float delta;
  void main(){
    vec4 val = texture2D(wave, gl_FragCoord.xy);
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

let poissonShader = createShader(
  { texture: { type: 't' }, delta: { type: 'f' } },
  `
  uniform sampler2D texture;
  uniform float delta;
  void main(){
    vec2 coord = gl_FragCoord.xy;
    vec2 dx = vec2(delta, 0);
    vec2 dy = vec2(0, delta);
    gl_FragColor = (
      + texture2D(texture, coord - dx)
      + texture2D(texture, coord + dx)
      + texture2D(texture, coord - dy)
      + texture2D(texture, coord + dy)
      - 4 * texture2D(texture, coord)
    );
  }
  `
)

let addShader = createShader(
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
