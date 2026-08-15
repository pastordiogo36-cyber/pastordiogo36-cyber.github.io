(function () {
  const TOTAL_PREGUNTAS = 5;

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function shuffle(items) {
    const list = [...items];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function ensureGameState() {
    if (!window.juegoHoryState) {
      window.juegoHoryState = {
        phase: 'intro',
        questions: [],
        currentIndex: 0,
        score: 0,
        total: TOTAL_PREGUNTAS,
        stars: 0,
        answers: [],
        summary: null,
        pool: []
      };
    }
    return window.juegoHoryState;
  }

  function getMondayOfCurrentWeek() {
    const d = new Date();
    const day = d.getDay();
    const diffToMonday = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diffToMonday);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function toISODateString(date) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function getHoryWeeklyInfo() {
    const usuario = (window.state && window.state.usuario) || {};
    const semanaInicio = usuario.juego_hory_semana_inicio ? String(usuario.juego_hory_semana_inicio).slice(0, 10) : '';
    const tandas = Number(usuario.juego_hory_tandas_semana || 0);
    const lunesActual = toISODateString(getMondayOfCurrentWeek());
    const reached = false; // Límite semanal desactivado: juego libre
    return { semanaInicio, tandas, lunesActual, reached };
  }

  async function syncHoryWeeklyLimit() {
    const usuario = (window.state && window.state.usuario) || null;
    if (!usuario || usuario.rol !== 'hory' || !window.sb) return { reached: false, reset: false, tandas: 0 };

    const lunesActual = toISODateString(getMondayOfCurrentWeek());
    const semanaInicio = usuario.juego_hory_semana_inicio ? String(usuario.juego_hory_semana_inicio).slice(0, 10) : '';
    const tandasActuales = Number(usuario.juego_hory_tandas_semana || 0);

    if (!semanaInicio || new Date(`${semanaInicio}T00:00:00`) < new Date(`${lunesActual}T00:00:00`)) {
      try {
        await window.sb
          .from('usuarios')
          .update({
            juego_hory_tandas_semana: 0,
            juego_hory_semana_inicio: `${lunesActual}T00:00:00Z`
          })
          .eq('id', usuario.id);

        if (window.state && window.state.usuario) {
          window.state.usuario.juego_hory_tandas_semana = 0;
          window.state.usuario.juego_hory_semana_inicio = `${lunesActual}T00:00:00Z`;
        }
        return { reached: false, reset: true, tandas: 0 };
      } catch (error) {
        console.warn('No se pudo resetear el límite semanal de Hory:', error);
      }
    }

    return { reached: false, reset: false, tandas: tandasActuales }; // Límite semanal desactivado: juego libre
  }

  function getPoolPersonas() {
    const appState = window.state || {};
    const estadosExcluidos = ['transferido', 'sin_respuesta'];
    const normalizar = window.normalizarEstado || ((v) => String(v || '').trim().toLowerCase());
    const sources = [
      ...(appState.congregantes || []).filter(c => !estadosExcluidos.includes(normalizar(c?.estado))),
      ...(appState.lideres || []).filter(u => u?.activo !== false),
      ...(appState.usuariosAsistencia || []).filter(u => u?.activo !== false)
    ];

    const unique = new Map();
    for (const persona of sources) {
      if (!persona || !persona.id || !persona.nombre || !persona.foto_url) continue;
      const key = String(persona.id);
      if (!unique.has(key)) {
        unique.set(key, {
          id: persona.id,
          nombre: String(persona.nombre).trim(),
          foto_url: persona.foto_url,
          rol: persona.rol || null
        });
      }
    }

    return Array.from(unique.values());
  }

  function buildQuestions() {
    const pool = getPoolPersonas();
    if (pool.length < 3) return [];

    const seleccion = shuffle(pool).slice(0, Math.min(TOTAL_PREGUNTAS, pool.length));
    const modes = ['escribir', 'multiple', 'elegir-nombre', 'verdadero-falso'];

    return seleccion.map((personaCorrecta) => {
      const distractors = shuffle(pool.filter((p) => String(p.id) !== String(personaCorrecta.id))).slice(0, 2);
      const cards = shuffle([personaCorrecta, ...distractors]);
      const mode = modes[Math.floor(Math.random() * modes.length)];
      const wrongNames = distractors.length >= 2 ? distractors : shuffle(pool.filter((p) => String(p.id) !== String(personaCorrecta.id))).slice(0, 2);
      const nameOptions = shuffle([personaCorrecta, ...wrongNames]).slice(0, 3);
      const proposedIsCorrect = Math.random() < 0.5;
      const proposedName = proposedIsCorrect ? personaCorrecta.nombre : (wrongNames[0] ? wrongNames[0].nombre : distractors[0]?.nombre || personaCorrecta.nombre);

      return {
        mode,
        correctId: String(personaCorrecta.id),
        correctName: personaCorrecta.nombre,
        cards,
        prompt: personaCorrecta.nombre,
        correctPerson: personaCorrecta,
        nameOptions,
        proposedName,
        proposedIsCorrect
      };
    });
  }

  function renderNoHayMaterial() {
    return `
      <div class="section-header">
        <h3>Reconocé el rostro</h3>
        <button class="btn-back" onclick="cambiarPantalla('home')">← Volver</button>
      </div>

      <div class="info-section" style="padding:24px 18px; text-align:center;">
        <div style="font-size:42px; margin-bottom:12px">🧠</div>
        <h3 style="margin:0 0 12px 0; font-size:20px;">Todavía no hay material para entrenar</h3>
        <p style="margin:0 0 16px 0; color:var(--texto-suave); line-height:1.5;">
          Faltan fotos cargadas de congregantes o líderes para armar la tanda.
        </p>
        <button class="btn-primary" style="width:100%;" onclick="cambiarPantalla('home')">Volver al inicio</button>
      </div>
    `;
  }

  function renderPreguntaActual() {
    const game = ensureGameState();
    const q = game.questions[game.currentIndex];
    if (!q) return renderResultadoJuego();

    if (q.mode === 'escribir') {
      return `
        <div class="section-header">
          <h3>Ejercicio ${game.currentIndex + 1} / ${game.total}</h3>
          <button class="btn-back" onclick="cambiarPantalla('home')">← Volver</button>
        </div>

        <div class="info-section" style="padding:18px 14px;">
          <div style="text-align:center; font-size:14px; font-weight:600; margin-bottom:14px; color:var(--texto-suave);">
            Escribí el nombre debajo de cada rostro
          </div>

          <div style="display:grid; grid-template-columns:1fr; gap:14px;">
            ${q.cards.map((persona) => {
              const answer = (game.answers[game.currentIndex] && game.answers[game.currentIndex].values && game.answers[game.currentIndex].values[persona.id]) || '';
              return `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px;">
                  <div style="display:flex; align-items:center; gap:10px;">
                    <div style="width:72px; height:72px; border-radius:12px; overflow:hidden; background:#111; flex-shrink:0;">
                      <img src="${persona.foto_url}" style="width:100%; height:100%; object-fit:cover; display:block;" alt="${persona.nombre}" />
                    </div>
                    <div style="flex:1; min-width:0;">
                      <input
                        type="text"
                        value="${answer}"
                        oninput="window.horyEscribirInput('${persona.id}', this.value)"
                        placeholder="Escribí el nombre"
                        style="width:100%; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04); color:#fff; padding:12px 14px; font-size:15px; min-height:46px; box-sizing:border-box;"
                      />
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>

          <button class="btn-primary" style="width:100%; margin-top:18px; min-height:48px;" onclick="window.horySubmitEscribirPregunta()">
            Siguiente
          </button>
        </div>
      `;
    }

    if (q.mode === 'multiple') {
      return `
        <div class="section-header">
          <h3>Ejercicio ${game.currentIndex + 1} / ${game.total}</h3>
          <button class="btn-back" onclick="cambiarPantalla('home')">← Volver</button>
        </div>

        <div class="info-section" style="padding:18px 14px;">
          <div style="text-align:center; font-weight:700; font-size:18px; margin-bottom:18px;">
            ¿Quién es ${q.prompt}?
          </div>

          <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:12px;">
            ${q.cards.map((persona) => `
              <button
                class="btn-secondary"
                style="padding:10px; min-height:132px; display:flex; align-items:center; justify-content:center; border-radius:12px;"
                onclick="window.horyElegirOpcion('${persona.id}')"
              >
                <div style="width:88px; height:88px; border-radius:12px; overflow:hidden; background:#111;">
                  <img src="${persona.foto_url}" style="width:100%; height:100%; object-fit:cover; display:block;" alt="${persona.nombre}" />
                </div>
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    if (q.mode === 'elegir-nombre') {
      return `
        <div class="section-header">
          <h3>Ejercicio ${game.currentIndex + 1} / ${game.total}</h3>
          <button class="btn-back" onclick="cambiarPantalla('home')">← Volver</button>
        </div>

        <div class="info-section" style="padding:18px 14px; text-align:center;">
          <div style="font-size:14px; color:var(--texto-suave); margin-bottom:12px; font-weight:700;">
            ¿Cuál es el nombre de esta persona?
          </div>

          <div style="display:flex; justify-content:center; margin-bottom:18px;">
            <div style="width:120px; height:120px; border-radius:18px; overflow:hidden; background:#111; box-shadow:0 8px 20px rgba(0,0,0,0.2);">
              <img src="${q.correctPerson.foto_url}" style="width:100%; height:100%; object-fit:cover; display:block;" alt="${q.correctPerson.nombre}" />
            </div>
          </div>

          <div style="display:grid; gap:10px;">
            ${q.nameOptions.map((persona) => `
              <button
                class="btn-secondary"
                style="padding:14px 16px; border-radius:12px; font-size:15px; font-weight:600; min-height:48px;"
                onclick="window.horyElegirOpcion('${persona.id}')"
              >
                ${persona.nombre}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    return `
      <div class="section-header">
        <h3>Ejercicio ${game.currentIndex + 1} / ${game.total}</h3>
        <button class="btn-back" onclick="cambiarPantalla('home')">← Volver</button>
      </div>

      <div class="info-section" style="padding:18px 14px; text-align:center;">
        <div style="font-size:14px; color:var(--texto-suave); margin-bottom:12px; font-weight:700;">
          ¿El nombre propuesto es correcto?
        </div>

        <div style="display:flex; justify-content:center; margin-bottom:18px;">
          <div style="width:120px; height:120px; border-radius:18px; overflow:hidden; background:#111; box-shadow:0 8px 20px rgba(0,0,0,0.2);">
            <img src="${q.correctPerson.foto_url}" style="width:100%; height:100%; object-fit:cover; display:block;" alt="${q.correctPerson.nombre}" />
          </div>
        </div>

        <div style="font-size:18px; font-weight:700; margin-bottom:18px; line-height:1.3;">
          ${q.proposedName}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
          <button class="btn-primary" style="padding:14px 10px; border-radius:12px; min-height:52px;" onclick="window.horyElegirOpcion('true')">
            Sí, es correcto ✅
          </button>
          <button class="btn-secondary" style="padding:14px 10px; border-radius:12px; min-height:52px;" onclick="window.horyElegirOpcion('false')">
            No, es incorrecto ❌
          </button>
        </div>
      </div>
    `;
  }

  function getStars(score, total) {
    const ratio = total > 0 ? score / total : 0;
    if (ratio >= 0.9) return 5;
    if (ratio >= 0.7) return 4;
    if (ratio >= 0.5) return 3;
    if (ratio >= 0.3) return 2;
    if (ratio > 0) return 1;
    return 0;
  }

  function renderResultadoJuego() {
    const game = ensureGameState();
    const stars = getStars(game.score, game.total);
    const limitReached = getHoryWeeklyInfo().reached;

    return `
      <div class="section-header">
        <h3>Resultado</h3>
        <button class="btn-back" onclick="cambiarPantalla('home')">← Volver</button>
      </div>

      <div class="info-section" style="padding:24px 18px; text-align:center;">
        <div style="font-size:42px; margin-bottom:10px;">${stars > 0 ? '⭐'.repeat(stars) : '🌱'}</div>
        <h3 style="margin:0 0 10px 0;">Tanda completada</h3>
        <div style="font-size:18px; font-weight:700; margin-bottom:8px;">${game.score} / ${game.total} aciertos</div>
        <div style="font-size:14px; color:var(--texto-suave); margin-bottom:18px;">
          Puntaje final: <strong>${Math.round((game.score / game.total) * 100)}%</strong>
        </div>

        ${limitReached ? `
          <div style="padding:12px 14px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; background:rgba(255,255,255,0.03); margin-bottom:16px; color:var(--texto-suave); font-size:13px; line-height:1.5;">
            Ya usaste tus 3 tandas de esta semana. Volvé el lunes que viene 🙂
          </div>
        ` : `
          <button class="btn-primary" style="width:100%; margin-bottom:10px;" onclick="window.iniciarJuegoHory && window.iniciarJuegoHory()">
            Repetir tanda
          </button>
        `}

        <button class="btn-secondary" style="width:100%;" onclick="cambiarPantalla('home')">
          Volver al inicio
        </button>
      </div>
    `;
  }

  function renderJuegoHory() {
    const usuario = (window.state && window.state.usuario) || {};
    const nombre = String(usuario.nombre || 'Hory').split(' ')[0] || 'Hory';
    const limitReached = getHoryWeeklyInfo().reached;

    if (window.state && window.state.pantalla === 'juego-hory-play') {
      const game = ensureGameState();
      if (game.phase === 'finished') return renderResultadoJuego();
      if (game.questions.length > 0) return renderPreguntaActual();
      return renderNoHayMaterial();
    }

    return `
      <div class="section-header">
        <h3>Reconocé el rostro</h3>
        <button class="btn-back" onclick="cambiarPantalla('home')">← Volver</button>
      </div>

      <div class="info-section" style="padding:24px 18px; text-align:center;">
        <div style="font-size:42px; margin-bottom:12px">🧠</div>
        <h3 style="margin:0 0 12px 0; font-size:20px; line-height:1.25;">Entrenamiento visual de ${nombre}</h3>
        <p style="margin:0 0 18px 0; color:var(--texto-suave); line-height:1.5; font-size:14px;">
          Tandas de 5 ejercicios para repasar nombres y rostros de congregantes y líderes.
        </p>

        <div class="info-row" style="justify-content:space-between; padding:10px 0; font-size:14px;">
          <span class="label">Modo</span>
          <span>Alterna al azar</span>
        </div>
        <div class="info-row" style="justify-content:space-between; padding:10px 0; font-size:14px;">
          <span class="label">Objetivo</span>
          <span>Mejorar reconocimiento</span>
        </div>
        <div class="info-row" style="justify-content:space-between; padding:10px 0; font-size:14px;">
          <span class="label">Tanda</span>
          <span>5 ejercicios</span>
        </div>

        ${limitReached ? `
          <div style="padding:12px 14px; border-radius:10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); margin-top:14px; color:var(--texto-suave); font-size:13px; line-height:1.5;">
            Ya usaste tus 3 tandas de esta semana. Volvé el lunes que viene 🙂
          </div>
        ` : `
          <button class="btn-primary" style="margin-top:18px; width:100%; min-height:48px;" onclick="window.iniciarJuegoHory && window.iniciarJuegoHory()">
            Comenzar tanda
          </button>
        `}
      </div>
    `;
  }

  function evaluarPreguntaEscribir() {
    const game = ensureGameState();
    const q = game.questions[game.currentIndex];
    if (!q) return;

    const current = game.answers[game.currentIndex] || { values: {} };
    const values = current.values || {};
    const isCorrect = q.cards.every((persona) => normalizeText(values[persona.id] || '') === normalizeText(persona.nombre));

    game.score += isCorrect ? 1 : 0;
    game.currentIndex += 1;

    if (game.currentIndex >= game.questions.length) {
      finalizarJuego();
      return;
    }

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  async function finalizarJuego() {
    const game = ensureGameState();
    game.phase = 'finished';
    game.stars = getStars(game.score, game.total);
    game.summary = {
      aciertos: game.score,
      total: game.total,
      puntaje: Math.round((game.score / game.total) * 100),
      estrellas: game.stars,
      fecha: new Date().toISOString()
    };

    const usuarioId = (window.state && window.state.usuario && window.state.usuario.id) || null;
    const usuario = (window.state && window.state.usuario) || null;
    const semanasActuales = Number((usuario && usuario.juego_hory_tandas_semana) || 0);

    if (usuarioId && window.sb) {
      window.sb.from('usuarios')
        .update({
          ultimo_puntaje_hory: game.summary.puntaje,
          ultimo_resultado_hory: `${game.score}/${game.total}`,
          ultimo_juego_hory_en: new Date().toISOString(),
          juego_hory_tandas_semana: semanasActuales + 1
        })
        .eq('id', usuarioId)
        .then(() => {
          if (window.state && window.state.usuario) {
            window.state.usuario.juego_hory_tandas_semana = semanasActuales + 1;
          }
          console.log('Resultado Hory guardado en usuarios:', game.summary);
        })
        .catch((error) => {
          console.warn('No se pudo guardar el resultado del juego Hory:', error);
        });
    }

    if (usuarioId && window.sb && typeof window.enviarPushA === 'function') {
      try {
        const { data: pastor, error: pastorError } = await window.sb
          .from('usuarios')
          .select('onesignal_push_id')
          .eq('rol', 'pastor')
          .limit(1)
          .maybeSingle();

        if (!pastorError && pastor && pastor.onesignal_push_id) {
          const nombreHory = ((window.state && window.state.usuario && window.state.usuario.nombre) || 'Hory').split(' ')[0];
          const mensaje = `Hory: ${nombreHory} | Tanda completada | ${game.score}/${game.total} correctas | Puntaje: ${game.summary.puntaje}% | Estrellas: ${game.stars}/5 | Fecha: ${new Date().toLocaleString()}`;
          await window.enviarPushA(pastor.onesignal_push_id, 'Resultado del entrenamiento Hory', mensaje);
        }
      } catch (error) {
        console.warn('Error enviando push al Pastor desde Hory:', error);
      }
    }

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  function avanzarPreguntaDesdeOpcion(opcionId) {
    const game = ensureGameState();
    const q = game.questions[game.currentIndex];
    if (!q) return;

    let isCorrect = false;

    if (q.mode === 'verdadero-falso') {
      isCorrect = (q.proposedIsCorrect && String(opcionId) === 'true') || (!q.proposedIsCorrect && String(opcionId) === 'false');
    } else {
      isCorrect = String(q.correctId) === String(opcionId);
    }

    game.score += isCorrect ? 1 : 0;
    game.currentIndex += 1;

    if (game.currentIndex >= game.questions.length) {
      finalizarJuego();
      return;
    }

    if (typeof window.render === 'function') {
      window.render();
    }
  }

  window.renderJuegoHory = renderJuegoHory;

  window.iniciarJuegoHory = async function iniciarJuegoHory() {
    if (!window.state) {
      console.warn('No hay window.state disponible para iniciar el juego Hory');
      return;
    }

    const limitState = await syncHoryWeeklyLimit();
    if (limitState.reached) {
      if (typeof window.render === 'function') {
        window.render();
      }
      return;
    }

    const game = ensureGameState();
    const pool = getPoolPersonas();
    if (pool.length < 3) {
      window.state.pantalla = 'juego-hory-play';
      if (typeof window.render === 'function') {
        window.render();
      }
      return;
    }

    game.phase = 'playing';
    game.questions = buildQuestions();
    game.currentIndex = 0;
    game.score = 0;
    game.total = game.questions.length;
    game.answers = [];
    game.summary = null;
    game.pool = pool;

    window.state.pantalla = 'juego-hory-play';
    if (typeof window.render === 'function') {
      window.render();
    }
  };

  window.horyEscribirInput = function horyEscribirInput(personaId, value) {
    const game = ensureGameState();
    if (!game.questions.length) return;
    const current = game.answers[game.currentIndex] || { values: {} };
    current.values = current.values || {};
    current.values[personaId] = value;
    game.answers[game.currentIndex] = current;
  };

  window.horySubmitEscribirPregunta = function horySubmitEscribirPregunta() {
    evaluarPreguntaEscribir();
  };

  window.horyElegirOpcion = function horyElegirOpcion(opcionId) {
    avanzarPreguntaDesdeOpcion(opcionId);
  };
})();
