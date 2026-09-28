const LicenseCanvas = (function(){
  const W = 1024, H = 652;

  let PHOTO = { x: 48, y: 228, w: 226, h: 321 };
  let SIG = { x: 24, y: 570, w: 380, h: 80 };

  let TEXT_FIELDS = [
    { id: 'f-apellidos', x: 321, y: 248, maxW: 280, upper: true },
    { id: 'f-nombres',   x: 321, y: 219, maxW: 280, upper: true },
    { id: 'f-dob',       x: 379, y: 279, maxW: 210 },
    { id: 'f-direccion', x: 435, y: 410, maxW: 540, upper: true },
    { id: 'f-peso',      x: 380, y: 486, maxW: 60 },
    { id: 'f-altura',    x: 375, y: 520, maxW: 60 },
    { id: 'f-sexo',      x: 553, y: 520, maxW: 40, initial: true },
    { id: 'f-ojos',      x: 680, y: 520, maxW: 130, upper: true },
  ];

  let FIXED_FIELDS = [
    { id: 'dl',       x: 108, y: 182, maxW: 210 },
    { id: 'exp',      x: 707, y: 251, maxW: 160 },
    { id: 'iss',      x: 698, y: 281, maxW: 160 },
    { id: 'class',    x: 710, y: 219, maxW: 60 },
  ];

  (function applySavedLayout(){
    try {
      const saved = JSON.parse(localStorage.getItem('hrp_license_layout') || 'null');
      if (!saved || saved.v !== 3) return;
      if (saved.photo && typeof saved.photo.x === 'number') PHOTO = saved.photo;
      if (saved.sig && typeof saved.sig.x === 'number') SIG = saved.sig;
      if (Array.isArray(saved.fields) && saved.fields.length === TEXT_FIELDS.length) {
        for (let i = 0; i < TEXT_FIELDS.length; i++) {
          const f = saved.fields[i];
          if (f && typeof f.x === 'number' && typeof f.y === 'number') {
            TEXT_FIELDS[i] = { ...TEXT_FIELDS[i], x: f.x, y: f.y, maxW: typeof f.maxW === 'number' ? f.maxW : TEXT_FIELDS[i].maxW };
          }
        }
      }
      if (Array.isArray(saved.fixed) && saved.fixed.length === FIXED_FIELDS.length) {
        for (let i = 0; i < FIXED_FIELDS.length; i++) {
          const f = saved.fixed[i];
          if (f && typeof f.x === 'number' && typeof f.y === 'number') {
            FIXED_FIELDS[i] = { ...FIXED_FIELDS[i], x: f.x, y: f.y, maxW: typeof f.maxW === 'number' ? f.maxW : FIXED_FIELDS[i].maxW };
          }
        }
      }
      console.log('[LicenseCanvas] Layout personalizado aplicado desde localStorage');
    } catch(e) {}
  })();

  let canvas = null, ctx = null;
  let base = null, baseReady = false, baseFailed = false;
  let avatar = null, sig = null;

  const BASE_CANDIDATES = ['images/image.png', 'images/image.jpg'];

  let dlNumber = localStorage.getItem('hrp_dl_number');
  if(!dlNumber){
    dlNumber = 'DL-' + Math.floor(10000000 + Math.random() * 90000000);
    localStorage.setItem('hrp_dl_number', dlNumber);
  }

  function init(id){
    canvas = document.getElementById(id);
    if(!canvas){
      console.error('[LicenseCanvas] ERROR: no se encontró el canvas "' + id + '" en la página');
      return;
    }
    canvas.width = W;
    canvas.height = H;
    ctx = canvas.getContext('2d');
    base = new Image();
    let baseIndex = 0;
    base.onload = () => {
      console.log('[LicenseCanvas] base cargada OK:', base.naturalWidth + 'x' + base.naturalHeight, '(' + BASE_CANDIDATES[baseIndex] + ')');
      baseReady = true;
      render();
    };
    base.onerror = () => {
      baseIndex++;
      if (baseIndex < BASE_CANDIDATES.length) {
        console.warn('[LicenseCanvas] No se pudo cargar', BASE_CANDIDATES[baseIndex - 1], '- probando', BASE_CANDIDATES[baseIndex]);
        base.src = BASE_CANDIDATES[baseIndex];
        return;
      }
      baseFailed = true;
      console.error('[LicenseCanvas] ERROR: no se pudo cargar el fondo de la licencia (el preview quedará gris).');
      console.error('[LicenseCanvas] URLs intentadas:', BASE_CANDIDATES.join(', '));
      render();
    };
    base.src = BASE_CANDIDATES[0];
    console.log('[LicenseCanvas] init("' + id + '") — cargando', BASE_CANDIDATES[0]);
    render();
  }

  function getVal(id){
    const el = document.getElementById(id);
    return el ? (el.value || '').trim() : '';
  }

  function fmtDate(d){
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return mm + '/' + dd + '/' + d.getFullYear();
  }

  function drawValue(txt, x, y, maxW){
    if(!txt) return;
    let size = 22;
    ctx.font = '700 ' + size + 'px Arial';
    while(ctx.measureText(txt).width > maxW && size > 9){
      size--;
      ctx.font = '700 ' + size + 'px Arial';
    }
    ctx.fillStyle = '#16161f';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(txt, x, y);
  }

  function drawCover(img, r){
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if(!iw || !ih) return;
    const scale = Math.max(r.w / iw, r.h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.drawImage(img, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
    ctx.restore();
  }

  function drawContained(img, r){
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if(!iw || !ih) return;
    const scale = Math.min(r.w / iw, r.h / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, r.x + (r.w - dw) / 2, r.y + (r.h - dh) / 2, dw, dh);
  }

  function render(){
    if(!canvas || !ctx) return;
    ctx.clearRect(0, 0, W, H);

    if(baseReady){
      ctx.drawImage(base, 0, 0, W, H);
    } else if(baseFailed){
      ctx.fillStyle = '#f2d8d8';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#8a1f1f';
      ctx.font = '700 26px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('ERROR: no se pudo cargar el fondo de la licencia', W / 2, H / 2);
      ctx.font = '600 18px Arial';
      ctx.fillText('Revisa la consola (F12) para más detalles', W / 2, H / 2 + 34);
      ctx.textAlign = 'start';
    } else {
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(0, 0, W, H);
    }

    ctx.fillStyle = 'rgba(170,170,170,0.35)';
    ctx.fillRect(PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h);
    if(avatar) drawCover(avatar, PHOTO);

    TEXT_FIELDS.forEach(f => {
      let v = getVal(f.id);
      if(f.upper) v = v.toUpperCase();
      if(f.initial) v = v.charAt(0).toUpperCase();
      drawValue(v, f.x, f.y, f.maxW);
    });

    drawValue(dlNumber, FIXED_FIELDS[0].x, FIXED_FIELDS[0].y, FIXED_FIELDS[0].maxW);
    drawValue('C', FIXED_FIELDS[3].x, FIXED_FIELDS[3].y, FIXED_FIELDS[3].maxW);

    const now = new Date();
    const exp = new Date(now);
    exp.setFullYear(exp.getFullYear() + 5);
    drawValue(fmtDate(exp), FIXED_FIELDS[1].x, FIXED_FIELDS[1].y, FIXED_FIELDS[1].maxW);
    drawValue(fmtDate(now), FIXED_FIELDS[2].x, FIXED_FIELDS[2].y, FIXED_FIELDS[2].maxW);

    if(sig) drawContained(sig, SIG);
  }

  function setAvatarUrl(url){
    if(!url){ avatar = null; render(); return; }
    const candidates = [
      'https://images.weserv.nl/?url=' + encodeURIComponent(url) + '&output=png',
      url
    ];
    (async () => {
      for(const c of candidates){
        try{
          const r = await fetch(c);
          if(!r.ok) continue;
          const b = await r.blob();
          if(!b.type.startsWith('image') || b.size === 0) continue;
          const o = URL.createObjectURL(b);
          const img = new Image();
          img.onload = () => { avatar = img; render(); };
          img.src = o;
          return;
        }catch(e){
          console.warn('[LicenseCanvas] avatar falló con el candidato', c, e);
        }
      }
      console.error('[LicenseCanvas] ERROR: no se pudo cargar el avatar de Roblox:', url);
    })();
  }

  function setSignature(dataUrl){
    if(!dataUrl){ sig = null; render(); return; }
    const img = new Image();
    img.onload = () => { sig = img; render(); };
    img.onerror = () => {
      console.error('[LicenseCanvas] ERROR: no se pudo cargar la firma como imagen');
    };
    img.src = dataUrl;
  }

  function toDataURL(){
    if(!canvas){
      console.error('[LicenseCanvas] ERROR: toDataURL llamado sin canvas inicializado');
      return '';
    }
    try{
      return canvas.toDataURL('image/png');
    }catch(e){
      console.error('[LicenseCanvas] ERROR en toDataURL:', e.message);
      throw e;
    }
  }

  function getNumber(){
    return dlNumber;
  }

  return { init, render, setAvatarUrl, setSignature, toDataURL, getNumber };
})();
