(function () {
  function renderJuegoHory() {
    const usuario = (window.state && window.state.usuario) || {};
    const nombre = String(usuario.nombre || 'Hory').split(' ')[0] || 'Hory';

    return `
      <div class="section-header">
        <h3>Reconocé el rostro</h3>
        <button class="btn-back" onclick="cambiarPantalla('home')">← Volver</button>
      </div>

      <div class="info-section" style="padding:24px 18px; text-align:center;">
        <div style="font-size:42px; margin-bottom:12px">🧠</div>
        <h3 style="margin:0 0 12px 0; font-size:20px;">Entrenamiento visual de ${nombre}</h3>
        <p style="margin:0 0 18px 0; color:var(--texto-suave); line-height:1.5;">
          Tandas de 5 ejercicios para repasar nombres y rostros de congregantes y líderes.
        </p>

        <div class="info-row" style="justify-content:space-between; padding:10px 0;">
          <span class="label">Modo</span>
          <span>Alterna al azar</span>
        </div>
        <div class="info-row" style="justify-content:space-between; padding:10px 0;">
          <span class="label">Objetivo</span>
          <span>Mejorar reconocimiento facial</span>
        </div>
        <div class="info-row" style="justify-content:space-between; padding:10px 0;">
          <span class="label">Tanda</span>
          <span>5 ejercicios</span>
        </div>

        <button class="btn-primary" style="margin-top:18px; width:100%;" onclick="window.iniciarJuegoHory && window.iniciarJuegoHory()">
          Comenzar tanda
        </button>
      </div>
    `;
  }

  window.renderJuegoHory = renderJuegoHory;

  window.iniciarJuegoHory = function iniciarJuegoHory() {
    if (!window.state) return;
    window.state.pantalla = 'juego-hory-play';
    if (typeof window.render === 'function') {
      window.render();
    }
  };
})();
