/* Streamdex Lobby: tiny WebGL renderer. No libraries, no build step. */
(function () {
"use strict";
const M = {
  mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3]; return o; },
  /* translate * rotateY * scale */
  trs(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) { const c = Math.cos(ry), s = Math.sin(ry); return new Float32Array([c*sx,0,-s*sx,0, 0,sy,0,0, s*sz,0,c*sz,0, x,y,z,1]); },
  t(x, y, z) { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]); },
  s(x, y, z) { return new Float32Array([x,0,0,0, 0,y,0,0, 0,0,z,0, 0,0,0,1]); },
  /* rotate about X first, then Y, then Z (radians) */
  rot(rx, ry, rz) {
    const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
    const X = new Float32Array([1,0,0,0, 0,a,b,0, 0,-b,a,0, 0,0,0,1]), Y = new Float32Array([c,0,-d,0, 0,1,0,0, d,0,c,0, 0,0,0,1]), Z = new Float32Array([e,f,0,0, -f,e,0,0, 0,0,1,0, 0,0,0,1]);
    return M.mul(Z, M.mul(Y, X));
  },
  persp(fov, asp, n, f) { const t = 1/Math.tan(fov/2); return new Float32Array([t/asp,0,0,0, 0,t,0,0, 0,0,(f+n)/(n-f),-1, 0,0,2*f*n/(n-f),0]); },
  lookAt(e, t) {
    let zx=e[0]-t[0], zy=e[1]-t[1], zz=e[2]-t[2], l=Math.hypot(zx,zy,zz); zx/=l; zy/=l; zz/=l;
    let xx=zz, xz=-zx; l=Math.hypot(xx,xz)||1; xx/=l; xz/=l;
    const yx=zy*xz, yy=zz*xx-zx*xz, yz=-zy*xx;
    return new Float32Array([xx,yx,zx,0, 0,yy,zy,0, xz,yz,zz,0, -(xx*e[0]+xz*e[2]), -(yx*e[0]+yy*e[1]+yz*e[2]), -(zx*e[0]+zy*e[1]+zz*e[2]), 1]);
  }
};
const rgb = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16) / 255);

/* ---- shapes (flat triangle lists of [position, normal]) ---- */
function pack(tris, flat) {
  const p = [], n = [];
  if (flat) for (let i = 0; i + 2 < tris.length; i += 3) { /* one normal per triangle: crisp low-poly facets */
    const [a, b, c] = [tris[i][0], tris[i+1][0], tris[i+2][0]], u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], w = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
    let x = u[1]*w[2]-u[2]*w[1], y = u[2]*w[0]-u[0]*w[2], z = u[0]*w[1]-u[1]*w[0]; const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
    for (let k = 0; k < 3; k++) { p.push(...tris[i+k][0]); n.push(x, y, z); }
  } else for (const [v, vn] of tris) { p.push(...v); n.push(...vn); }
  return { p, n };
}
function quad(out, a, b, c, d, na, nb = na, nc = na, nd = na) { out.push([a,na],[b,nb],[c,nc],[a,na],[c,nc],[d,nd]); }
function box() {
  const o = [], h = .5;
  [[[0,0,1],[1,0,0],[0,1,0]], [[0,0,-1],[-1,0,0],[0,1,0]], [[1,0,0],[0,0,-1],[0,1,0]], [[-1,0,0],[0,0,1],[0,1,0]], [[0,1,0],[1,0,0],[0,0,-1]], [[0,-1,0],[1,0,0],[0,0,1]]].forEach(([n,u,v]) => {
    const P = (i, j) => [0,1,2].map(k => (n[k] + u[k]*i + v[k]*j) * h);
    quad(o, P(-1,-1), P(1,-1), P(1,1), P(-1,1), n);
  });
  return pack(o);
}
function cylinder(seg = 28, flat = false) { /* radius .5, height 1, centred */
  const o = [];
  for (let i = 0; i < seg; i++) {
    const a = i/seg*Math.PI*2, b = (i+1)/seg*Math.PI*2, A = [Math.sin(a), Math.cos(a)], B = [Math.sin(b), Math.cos(b)];
    const P = (q, y) => [q[0]*.5, y, q[1]*.5], N = q => [q[0], 0, q[1]];
    quad(o, P(A,-.5), P(B,-.5), P(B,.5), P(A,.5), N(A), N(B), N(B), N(A));
    o.push([[0,.5,0],[0,1,0]], [P(A,.5),[0,1,0]], [P(B,.5),[0,1,0]]);
    o.push([[0,-.5,0],[0,-1,0]], [P(B,-.5),[0,-1,0]], [P(A,-.5),[0,-1,0]]);
  }
  return pack(o, flat);
}
function cone(seg = 7) { /* base radius .5, height 1, centred, flat shaded */
  const o = [];
  for (let i = 0; i < seg; i++) {
    const a = i/seg*Math.PI*2, b = (i+1)/seg*Math.PI*2, A = [Math.sin(a)*.5, -.5, Math.cos(a)*.5], B = [Math.sin(b)*.5, -.5, Math.cos(b)*.5];
    o.push([[0,.5,0],[0,1,0]], [B,[0,1,0]], [A,[0,1,0]]);
    o.push([[0,-.5,0],[0,-1,0]], [A,[0,-1,0]], [B,[0,-1,0]]);
  }
  return pack(o, true);
}
function sphere(seg = 18, rings = 12, rough = 0) { /* radius .5; rough > 0 makes a lumpy flat-shaded rock */
  const o = [], P = (i, j) => { const a = i/seg*Math.PI*2, b = j/rings*Math.PI, k = rough && j > 0 && j < rings ? 1 + rough*Math.sin((i % seg)*12.9898 + j*78.233) : 1; return [Math.sin(b)*Math.sin(a)*k, Math.cos(b), Math.sin(b)*Math.cos(a)*k]; };
  for (let i = 0; i < seg; i++) for (let j = 0; j < rings; j++) {
    const n = [P(i,j), P(i,j+1), P(i+1,j+1), P(i+1,j)], v = n.map(q => q.map(x => x*.5));
    quad(o, v[0], v[1], v[2], v[3], n[0], n[1], n[2], n[3]);
  }
  return pack(o, rough > 0);
}

/* ---- minimal .glb reader: static meshes with flat material colours ---- */
function parseGLB(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error("not a .glb file");
  let off = 12, json, bin;
  while (off < dv.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off+4, true);
    if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off+8, len)));
    else if (type === 0x004E4942) bin = buf.slice(off+8, off+8+len);
    off += 8 + len;
  }
  const read = idx => {
    const a = json.accessors[idx], v = json.bufferViews[a.bufferView];
    const n = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4 }[a.type];
    const [get, size] = { 5126:["getFloat32",4], 5125:["getUint32",4], 5123:["getUint16",2], 5121:["getUint8",1] }[a.componentType];
    const d = new DataView(bin), start = (v.byteOffset||0) + (a.byteOffset||0), stride = v.byteStride || n*size, out = [];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out.push(d[get](start + i*stride + k*size, true));
    return out;
  };
  const local = nd => {
    if (nd.matrix) return new Float32Array(nd.matrix);
    const [x,y,z,w] = nd.rotation || [0,0,0,1], s = nd.scale || [1,1,1], t = nd.translation || [0,0,0];
    return new Float32Array([
      (1-2*(y*y+z*z))*s[0], 2*(x*y+z*w)*s[0], 2*(x*z-y*w)*s[0], 0,
      2*(x*y-z*w)*s[1], (1-2*(x*x+z*z))*s[1], 2*(y*z+x*w)*s[1], 0,
      2*(x*z+y*w)*s[2], 2*(y*z-x*w)*s[2], (1-2*(x*x+y*y))*s[2], 0,
      t[0], t[1], t[2], 1]);
  };
  const srgb = c => Math.pow(Math.max(0, c), 1/2.2), parts = [];
  const walk = (i, parent) => {
    const nd = json.nodes[i], m = M.mul(parent, local(nd));
    if (nd.mesh !== undefined) for (const pr of json.meshes[nd.mesh].primitives) {
      if (pr.mode !== undefined && pr.mode !== 4) continue;
      const pos = read(pr.attributes.POSITION), nor = pr.attributes.NORMAL !== undefined ? read(pr.attributes.NORMAL) : null;
      const ind = pr.indices !== undefined ? read(pr.indices) : pos.map((_, k) => k).slice(0, pos.length/3);
      const p = [], n = [];
      for (const k of ind) {
        const [x,y,z] = pos.slice(k*3, k*3+3);
        for (let r = 0; r < 3; r++) p.push(m[r]*x + m[4+r]*y + m[8+r]*z + m[12+r]);
        const [a,b,c] = nor ? nor.slice(k*3, k*3+3) : [0,1,0];
        for (let r = 0; r < 3; r++) n.push(m[r]*a + m[4+r]*b + m[8+r]*c);
      }
      const mat = (json.materials || [])[pr.material] || {};
      const base = (mat.pbrMetallicRoughness || {}).baseColorFactor || [.8,.8,.8,1];
      const em = mat.emissiveFactor || [0,0,0];
      parts.push({ data: { p, n }, color: base.slice(0,3).map(srgb), glow: Math.max(...em) > .05 ? .8 : 0, tint: /^tint/i.test(mat.name || "") });
    }
    (nd.children || []).forEach(c => walk(c, m));
  };
  (json.scenes[json.scene || 0].nodes || []).forEach(i => walk(i, M.trs(0,0,0)));
  if (!parts.length) throw new Error("no meshes in .glb");
  return parts;
}

function create(canvas) {
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false });
  if (!gl) return null;
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, `attribute vec3 p,n; uniform mat4 vp,m; varying vec3 vn,vw;
    void main(){ vec4 w=m*vec4(p,1.0); vw=w.xyz; vn=mat3(m)*n; gl_Position=vp*w; }`));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, `precision mediump float; uniform vec3 col,eye,fog; uniform float glow,alpha; varying vec3 vn,vw;
    void main(){ vec3 N=normalize(vn);
      float key=max(dot(N,normalize(vec3(.4,.9,.35))),0.0), fill=max(dot(N,normalize(vec3(-.6,.3,-.5))),0.0);
      vec3 lit=col*(vec3(.6,.58,.62)+key*vec3(.58,.52,.42))+col*vec3(.2,.26,.5)*fill*.3;
      vec3 c=mix(lit,col,glow);
      float f=clamp((distance(vw,eye)-28.0)/55.0,0.0,1.0)*(1.0-glow*.7);
      gl_FragColor=vec4(mix(c,fog,f),alpha); }`));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const A = { p: gl.getAttribLocation(prog, "p"), n: gl.getAttribLocation(prog, "n") };
  const U = {}; ["vp","m","col","eye","fog","glow","alpha"].forEach(k => U[k] = gl.getUniformLocation(prog, k));
  const buffer = arr => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW); return b; };
  const mesh = d => ({ p: buffer(d.p), n: buffer(d.n), count: d.p.length/3 });
  const shapes = { box: mesh(box()), cyl: mesh(cylinder()), ball: mesh(sphere()), hex: mesh(cylinder(6, true)), cone: mesh(cone(7)), rock: mesh(sphere(6, 4, .16)) };
  let vp = M.trs(0,0,0), W = 1, H = 1;
  return {
    shapes, mesh,
    begin(eye, target, sky) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      W = canvas.clientWidth || 1; H = canvas.clientHeight || 1;
      const w = Math.round(W*dpr), h = Math.round(H*dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      const fog = sky || [.043,.051,.165];
      gl.clearColor(fog[0], fog[1], fog[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      const asp = W/H, fov = asp < 1 ? 1.15 : .9; /* wider on tall phone screens */
      vp = M.mul(M.persp(fov, asp, .1, 100), M.lookAt(eye, target));
      gl.uniformMatrix4fv(U.vp, false, vp); gl.uniform3fv(U.eye, eye); gl.uniform3fv(U.fog, fog);
    },
    draw(shape, model, color, glow = 0, alpha = 1) {
      const s = typeof shape === "string" ? shapes[shape] : shape;
      for (const k of ["p","n"]) { gl.bindBuffer(gl.ARRAY_BUFFER, s[k]); gl.enableVertexAttribArray(A[k]); gl.vertexAttribPointer(A[k], 3, gl.FLOAT, false, 0, 0); }
      gl.uniformMatrix4fv(U.m, false, model); gl.uniform3fv(U.col, color); gl.uniform1f(U.glow, glow); gl.uniform1f(U.alpha, alpha);
      if (alpha < 1) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      gl.drawArrays(gl.TRIANGLES, 0, s.count);
      if (alpha < 1) { gl.disable(gl.BLEND); gl.depthMask(true); }
    },
    /* world point -> CSS pixels (null if behind the camera) */
    project(x, y, z) {
      const w = vp[3]*x + vp[7]*y + vp[11]*z + vp[15];
      if (w < .2) return null;
      return [((vp[0]*x + vp[4]*y + vp[8]*z + vp[12])/w*.5+.5)*W, (.5-(vp[1]*x + vp[5]*y + vp[9]*z + vp[13])/w*.5)*H, w];
    }
  };
}
window.Lobby3D = { create, parseGLB, M, rgb };
})();
