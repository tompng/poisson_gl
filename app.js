let THREE = require('three');
let PoissonSolverGL = require('./index')
window.THREE =THREE
window.PoissonSolverGL = PoissonSolverGL

renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(512, 512);
onload=()=>{

  canvas=document.createElement('canvas')
  canvas.width=canvas.height=512
  g=canvas.getContext('2d')
  g.fillRect(0,0,512,512)
  g.beginPath()
  let border = 32
  g.rect(border,border,512-2*border,512-2*border)
  g.clip()
  g.fillStyle='white'
  g.beginPath()
  g.arc(256,256,128,0,2*Math.PI)
  g.fill()
  for(var i=0;i<1000;i++){
    g.fillStyle='#'+[0,0,0].map(()=>Math.floor(Math.random()*16).toString(16)).join('')
    g.globalAlpha=Math.random()
    g.font='64px sans-serif'
    g.fillText(Math.floor(Math.random()*10), 512*Math.random(), 512*Math.random())
  }
  g.fillStyle='white'
  g.beginPath()
  g.globalAlpha=1
  g.arc(256+32,256+32,64,0,2*Math.PI)
  g.fill()
  document.body.appendChild(canvas)
  img=new Image()
  img.src = canvas.toDataURL()
  texture = new THREE.Texture(img)
  texture.needsUpdate = true;
  document.body.appendChild(renderer.domElement)
  renderer.domElement.style.cssText = "border: 1px solid red;"
  img.onload=()=>{
    solver = new PoissonSolverGL(renderer, 512)
    let poi = solver.poisson(texture, null)
    solver.show(poi)
    solver.solve(poi)
    setTimeout(()=>{
      let out = PoissonSolverGL.target(512)
      solver.solve(poi, out)
      solver.show(out)
      let t=new Date()
      out2 = solver.solve(out)
      console.error((new Date()-t)+'ms')
    },1000)
  }
}
