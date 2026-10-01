/* ============================================================
   🔵 NÓMINA AUTOMÁTICA — HEARTBEAT + NOTIFICACIONES
   ------------------------------------------------------------
   Se incluye en las páginas del dashboard para que el sistema
   procese turnos automáticamente y notifique cuando el Gobierno
   deposita el salario. Corre un tick cada 60s mientras la app
   está abierta (el progreso de tiempo se guarda en Supabase con
   timestamps del servidor, por lo que sigue siendo persistente).
   ============================================================ */
(function () {
  if (window.__hrpPayrollInit) return;
  window.__hrpPayrollInit = true;

  let lastNotifiedAt = null;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function refreshSidebarBalance(bal) {
    const el = document.getElementById('sidebar-balance');
    if (el && bal !== undefined && bal !== null) {
      el.textContent = '$' + Number(bal).toLocaleString();
    }
  }

  function showPayrollNotification(mine, balance) {
    const total = mine.reduce((s, p) => s + (p.amount || 0), 0);
    const dept = (mine[0] && mine[0].department ? String(mine[0].department).toUpperCase() : 'EL GOBIERNO');
    const label = (mine[0] && mine[0].rank_label) || 'rango';

    let toast = document.getElementById('hrp-payroll-notify');
    const content =
      `<div style="display:flex;align-items:center;gap:12px;">
         <div style="font-size:32px;flex-shrink:0;">🏛️</div>
         <div style="min-width:0;flex:1;">
           <div style="font-family:'Rajdhani',sans-serif;font-weight:700;font-size:14px;letter-spacing:1px;color:#e6a868;text-transform:uppercase;margin-bottom:3px;">Pago del Gobierno</div>
           <div style="line-height:1.5;font-size:13px;color:#e4e7ee;">
             El <strong>${esc(dept)}</strong> depositó <strong>$${Number(total).toLocaleString()}</strong> a tu salario.<br>
             Nuevo saldo: <strong>$${Number(balance || 0).toLocaleString()}</strong>
           </div>
         </div>
         <button onclick="(function(){var t=document.getElementById('hrp-payroll-notify');if(t)t.remove();})()" style="background:none;border:none;color:#8a93a7;font-size:18px;cursor:pointer;line-height:1;align-self:flex-start;margin-left:4px;">✕</button>
       </div>`;

    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'hrp-payroll-notify';
      toast.style.cssText =
        'position:fixed;top:20px;right:20px;z-index:999999;' +
        'background:linear-gradient(145deg,#17223a,#0e1628);' +
        'border:1px solid rgba(230,168,104,0.45);border-left:4px solid #e6a868;' +
        'border-radius:12px;padding:16px 18px;color:#e4e7ee;font-family:Inter,sans-serif;' +
        'font-size:13px;box-shadow:0 18px 50px rgba(0,0,0,0.6),0 0 24px rgba(230,168,104,0.15);' +
        'max-width:360px;min-width:300px;transform:translateX(420px);opacity:0;' +
        'transition:all .45s cubic-bezier(.4,0,.2,1);';
      document.body.appendChild(toast);
    }
    toast.innerHTML = content;

    requestAnimationFrame(function () {
      toast.style.transform = 'translateX(0)';
      toast.style.opacity = '1';
    });
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      toast.style.transform = 'translateX(420px)';
      toast.style.opacity = '0';
    }, 10000);
  }

  async function runTick() {
    try {
      const session = (typeof hrpGetSession === 'function') ? hrpGetSession() : null;
      if (!session || !session.id) return;
      if (!session.id) return;

      const payments = await hrpPayrollTick();
      const mine = (payments || []).filter(p => String(p.discord_id) === String(session.id));
      if (mine.length) {
        const bal = await hrpGetBalance(session.id).catch(function () { return null; });
        showPayrollNotification(mine, bal);
        refreshSidebarBalance(bal);
      }
    } catch (e) {
      /* silencioso: el sistema no debe interrumpir la app */
    }
  }

  // ── NÓMINA AUTOMÁTICA DESACTIVADA ───────────────────────────
  // El sueldo ahora se acumula según el rol de Discord del usuario
  // (migración 021) y este lo reclama manualmente desde el dashboard
  // con el botón "Reclamar dinero". Ejecutar la nómina automática
  // volvería a depositar el mismo sueldo (doble pago), así que el
  // tick periódico ya no se inicia.
  window.__hrpPayrollDisabled = true;
})();