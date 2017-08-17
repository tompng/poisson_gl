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
  })
}

class PoissonSolverGL {
  constructor(renderer, size, format){
    this.renderer = renderer
    let extensions = ['OES_texture_float', 'OES_texture_float_linear']
    let gl = renderer.getContext()
    extensions.forEach((ext) => {
      if(!gl.getExtension(ext)) throw 'not supported: ' + ext
    })
    this.scene = new THREE.Scene()
    this.camera = new THREE.Camera()
    this.mesh = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2))
    this.scene.add(this.mesh)
    this.camera.position.z = 1
    this.format = format || THREE.RGBAFormat
    this.size = size
    this.textures = {}
    this._prepare()
  }
  static target(size, format){
    return createRenderTarget(size, size, { format: format })
  }
  dispose(){
    for(let key in thiss){
      this.textures[key].dispose()
    }
    this.textures = {}
  }
  _target(type, size){
    let key = type + '-' + size
    if(!this.textures[key]){
      this.textures[key] = PoissonSolverGL.target(size, this.format)
    }
    return this.textures[key]
  }
  poisson(texture, out){
    if(!out) out = this._target('poisson', this.size)
    this._render(out, poissonShader, this.size, { texture: texture })
    return out
  }
  show(texture){
    this._render(null, identityShader, this.size, { texture: texture })
  }
  solve(f, out){
    if(!out) out = this._target('out', this.size)
    this._solve(f, out, this.size)
    return out
  }
  _prepare(){
    this._target('out', this.size)
    for(let size = this.size; size > 4; size /= 2){
      this._target('f2', size)
      this._target('o2', size / 2)
      size /= 2
    }
    this.size
  }
  _solve(f, out, size){
    let tmp = this._target('tmp', size)
    this._render(tmp, smoothShader, size, { ftexture: f, itexture: out })
    if(size > 4){
      let f2 = this._target('f2', size)
      let o2 = this._target('o2', size / 2)
      this._render(f2, diffShader, size, { ftexture: f, itexture: tmp })
      this._render(o2, zeroShader)
      this._solve(f2, o2, size / 2)
      this._add(f2, size, tmp, o2, -4)
      tmp = f2
    }
    this._render(out, smoothShader, size, { ftexture: f, itexture: tmp })
  }
  _render(o, shader, size, uniforms){
    this.mesh.material = shader
    if(shader.uniforms.delta)shader.uniforms.delta.value = 1.0 / size
    for(let key in uniforms){
      let uniform = shader.uniforms[key]
      let value = uniforms[key]
      if(uniform)uniform.value = value.texture || value
    }
    this.renderer.render(this.scene, this.camera, o)
  }
  _add(o, size, t1, t2, s){
    this._render(o, addShader, size, { texture1: t1, texture2: t2, scale: s })
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
  { texture: { type: 't' }, delta: { type: 'f' } },
  `
  uniform sampler2D texture;
  uniform float delta;
  void main(){
    gl_FragColor = texture2D(texture, gl_FragCoord.xy * delta);
    gl_FragColor.a = 1.0;
  }
  `
)

let smoothShader = createShader(
  { itexture: { type: 't' }, ftexture: { type: 't' }, delta: { type: 'f' } },
  `
  uniform sampler2D itexture, ftexture;
  uniform float delta;
  void main(){
    vec2 coord = gl_FragCoord.xy * delta;
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
    vec2 coord = gl_FragCoord.xy * delta;
    vec2 dx = vec2(delta, 0);
    vec2 dy = vec2(0, delta);
    gl_FragColor = (
      + texture2D(itexture, coord - dx)
      + texture2D(itexture, coord + dx)
      + texture2D(itexture, coord - dy)
      + texture2D(itexture, coord + dy)
      - 4.0 * texture2D(itexture, coord)
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
    vec2 coord = gl_FragCoord.xy * delta;
    vec2 dx = vec2(delta, 0);
    vec2 dy = vec2(0, delta);
    gl_FragColor = (
      + texture2D(texture, coord - dx)
      + texture2D(texture, coord + dx)
      + texture2D(texture, coord - dy)
      + texture2D(texture, coord + dy)
      - 4.0 * texture2D(texture, coord)
    );
  }
  `
)

let zeroShader = createShader(
  {},
  `void main(){gl_FragColor = vec4(0,0,0,0);}`
)

let addShader = createShader(
  { texture1: { type: 't' }, texture2: { type: 't' }, scale: { type: 'f' }, delta: { type: 'f' } },
  `
  uniform sampler2D texture1, texture2;
  uniform float delta, scale;
  void main(){
    vec2 coord = gl_FragCoord.xy * delta;
    gl_FragColor = texture2D(texture1, coord) + scale * texture2D(texture2, coord);
  }
  `
)

module.exports = PoissonSolverGL
