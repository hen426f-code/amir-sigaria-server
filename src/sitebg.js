/*
  רקע עשן חי לכל האתר.
  שכבה קבועה מאחורי התוכן, שדוגמת רק את פסי העשן מתוך צילום הרקע
  ומעוותת אותם בזמן אמת. נכתב בגרפיקה ישירה ולא בספריית תלת מימד,
  כי כל מה שנדרש כאן הוא משטח אחד בגודל המסך.
*/

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2  uRes;
uniform float uTime;
uniform float uReady;
uniform float uScroll;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

/* דגימה של פס עשן בלבד מתוך התמונה.
   השיקוף מונע תפרים, והמכשיר שבמרכז התמונה לעולם לא נדגם. */
vec3 band(vec2 p, float x0, float x1) {
  float tx = abs(fract(p.x) * 2.0 - 1.0);
  float ty = abs(fract(p.y) * 2.0 - 1.0);
  return texture2D(uTex, vec2(mix(x0, x1, tx), mix(0.06, 0.94, ty))).rgb;
}

void main() {
  float aspect = uRes.x / max(uRes.y, 1.0);
  vec2 uv = vUv;
  uv.x *= aspect;
  uv.y += uScroll * 0.06;          // היסט עדין בגלילה, נותן עומק

  float t = uTime * 0.016;

  /* עיוות תחום כפול, מגלגל את העשן. משרעת קטנה בכוונה:
     ערך גבוה מושך את הפיקסלים למרחק ומייצר מריחה. */
  vec2 q = vec2(fbm(uv * 2.2 + vec2(0.0, t)),
                fbm(uv * 2.2 + vec2(4.3, 1.2 - t)));
  vec2 r = vec2(fbm(uv * 2.2 + 2.2 * q + vec2(1.7, 9.2) + t * 1.1),
                fbm(uv * 2.2 + 2.2 * q + vec2(8.3, 2.8) - t * 0.85));
  vec2 w = uv + (r - 0.5) * 0.16;

  /* פס העשן במקור צר וגבוה, ביחס רוחב לגובה של כ־0.26.
     לכן הצפיפות האופקית חייבת להיות גבוהה פי כ־3.8 מהאנכית,
     אחרת העשן נמתח לרוחב ונראה מרוח. */
  vec3 pink = band(vec2(w.x * 2.10,        w.y * 0.55 - t * 0.55), 0.04, 0.27);
  vec3 blue = band(vec2(w.x * 1.70 + 0.37, w.y * 0.45 + t * 0.45), 0.73, 0.96);

  float m = fbm(uv * 0.7 + vec2(t * 0.4, -t * 0.28));
  vec3 col = mix(pink, blue, smoothstep(0.36, 0.64, m));
  col += 0.18 * min(pink, blue);   // חפיפה קלה, מוסיפה זוהר

  // מוחשך בכוונה, כדי שהטקסט מעל יישאר קריא לכל אורך האתר
  col *= 0.42;

  gl_FragColor = vec4(col * uReady, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('shader:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

/**
 * מפעיל את רקע העשן בתוך המכל שנשלח.
 * נכשל בשקט אם אין תמיכה בגרפיקה מואצת, והאתר ממשיך לעבוד רגיל.
 */
export function initSiteBackground(container, imageUrl) {
  if (!container) return () => {};

  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' })
          || canvas.getContext('experimental-webgl');
  if (!gl) return () => {};

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return () => {};

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('link:', gl.getProgramInfoLog(prog));
    return () => {};
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTex    = gl.getUniformLocation(prog, 'uTex');
  const uRes    = gl.getUniformLocation(prog, 'uRes');
  const uTime   = gl.getUniformLocation(prog, 'uTime');
  const uReady  = gl.getUniformLocation(prog, 'uReady');
  const uScroll = gl.getUniformLocation(prog, 'uScroll');

  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.uniform1i(uTex, 0);
  gl.uniform1f(uReady, 0);

  if (imageUrl) {
    const img = new Image();
    img.onload = () => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.uniform1f(uReady, 1);
    };
    img.src = imageUrl;
  }

  container.appendChild(canvas);

  /* מסך מלא עולה ביוקר במילוי פיקסלים. בנייד מורידים את הצפיפות. */
  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, w < 820 ? 1 : 1.5);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener('resize', resize);

  let scroll = 0;
  function onScroll() {
    scroll = window.scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = performance.now();
  let frame;
  function draw(now) {
    frame = requestAnimationFrame(draw);
    gl.uniform1f(uTime, reduce ? 0 : (now - start) / 1000);
    gl.uniform1f(uScroll, scroll);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  frame = requestAnimationFrame(draw);

  return function destroy() {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    window.removeEventListener('scroll', onScroll);
    gl.deleteTexture(tex);
    gl.deleteBuffer(buf);
    gl.deleteProgram(prog);
    canvas.remove();
  };
}
