/* ══════════════════════════════════════════════════════════════
   16º Festival Hercule Florence · 2026
   Navegador de programação (dia / tipo / mapa) + painel diafragma
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  // no WordPress a página não fica na pasta do tema: functions.php define FHF_BASE
  const BASE = window.FHF_BASE || 'assets/';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let DATA = null;      // programacao.json
  let IMGS = {};        // manifest de imagens
  const state = { view: 'dia', q: '', tipos: new Set(), local: null };

  /* ─── utilidades ─────────────────────────────────────────── */
  const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const d  = (iso) => new Date(iso + 'T12:00:00');
  const dia = (iso) => String(d(iso).getDate()).padStart(2, '0');
  const wd  = (iso) => WD[d(iso).getDay()];
  const norm = (s) => (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  /** melhor arquivo disponível para uma imagem, dado um alvo de largura */
  function img(name, target) {
    const m = IMGS[name];
    if (!m) return '';
    const fit = m.sizes.filter(s => s.w >= target).sort((a, b) => a.w - b.w)[0]
             || m.sizes.slice().sort((a, b) => b.w - a.w)[0];
    return BASE + 'img/' + fit.file;
  }

  /** Hora de início como número, para ordenar o dia. "15h às 17h" → 15, "19h30" → 19.5. */
  function horaNum(a) {
    if (!a.hora) return Infinity;                       // sem horário vai para o fim do dia
    const m = a.hora.match(/(\d{1,2})\s*h\s*(\d{2})?/i);
    if (!m) {                                           // "Manhã", "Tarde", "Noite"
      const t = norm(a.hora);
      if (t.includes('manha')) return 9;
      if (t.includes('tarde')) return 14;
      if (t.includes('noite')) return 19;
      return Infinity;
    }
    return parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 60 : 0);
  }

  /** Link de busca no Google Maps — funciona com ou sem número. */
  function mapsURL(loc) {
    const q = loc.maps || `${loc.nome} ${loc.bairro}, Campinas, SP`;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  const SVG_MAPA = '<svg viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/>'
    + '<circle cx="12" cy="10" r="2.6"/></svg>';

  /** Resumo curto da descrição para o card do dia — corta em palavra inteira. */
  function resumo(texto, max) {
    if (!texto) return '';
    max = max || 108;
    if (texto.length <= max) return texto;
    const corte = texto.slice(0, max);
    return corte.slice(0, corte.lastIndexOf(' ')) + '\u2026';
  }

  const SVG_VERMAIS = '<svg viewBox="0 0 24 24" aria-hidden="true">'
    + '<circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6"/></svg>';

  function periodo(a) {
    if (a.inicio === a.fim) return dia(a.inicio) + '/08';
    return dia(a.inicio) + '—' + dia(a.fim) + '/08';
  }

  /* ─── vídeo do hero ──────────────────────────────────────── */
  function initHero() {
    const v = $('#heroVideo');
    if (!v) return;
    const conn = navigator.connection || {};
    // só a conexão fraca dispensa o movimento; 'reduzir movimento' recebe a
    // versão suave (crossfade lento, sem zoom) em vez de uma foto parada
    if (conn.saveData || /(^|-)2g/.test(conn.effectiveType || '')) return;

    if (reduceMotion) { heroSequencia(); return; }

    const portrait = window.matchMedia('(max-aspect-ratio: 3/4)').matches;
    const src = BASE + 'video/' + (portrait ? 'hero-9x16.mp4' : 'hero.mp4');
    const s = document.createElement('source');
    s.src = src; s.type = 'video/mp4';
    v.appendChild(s);
    v.preload = 'auto';
    v.load();
    // se o autoplay for bloqueado pelo navegador, cai na sequência de fotos
    v.play().catch(() => heroSequencia());
  }

  /** Fotos do festival em crossfade, atrás do título. */
  function heroSequencia() {
    const media = $('.hero-media');
    const v = $('#heroVideo');
    if (!media || media.querySelector('.hero-slide')) return;
    if (!Object.keys(IMGS).length) return;   // sem manifesto, fica o poster
    // fotos desta edição: clima e SESC abrindo, acervo só no fim
    const nomes = ['clima-floresta-queimada', 'sesc-oficina-pinhole', 'arfoc-garimpo',
                   'arfoc-aerea', 'mcs-batalha', 'sesc-pinhole-campo',
                   'broken-forests-grupo', 'rua-fotos'];
    nomes.forEach((nome, i) => {
      const el = document.createElement('div');
      el.className = 'hero-slide' + (i === 0 ? ' on' : '');
      el.style.backgroundImage = `url('${img(nome, 1600)}')`;
      el.dataset.foto = nome;
      media.appendChild(el);      // appendChild preserva a ordem da lista
    });
    montaCredito(nomes);
    const slides = nomes.map(n => media.querySelector(`[data-foto="${n}"]`)).filter(Boolean);
    if (!slides.length) return;
    if (v) v.style.display = 'none';
    let i = 0;
    setInterval(() => {
      slides[i].classList.remove('on');
      i = (i + 1) % slides.length;
      slides[i].classList.add('on');
      if (heroCredito) heroCredito(slides[i].dataset.foto);
    }, reduceMotion ? 6000 : 4200);
  }

  /** Crédito da fotografia em cartaz no topo — autoria é obrigatória. */
  let CREDITOS = {};
  function montaCredito(nomes) {
    const hero = $('.hero');
    if (!hero || $('.hero-credito')) return;
    const el = document.createElement('p');
    el.className = 'hero-credito';
    hero.appendChild(el);
    const mostra = (nome) => {
      const c = CREDITOS[nome];
      if (!c) { el.textContent = ''; return; }
      el.innerHTML = (c.credito ? `<b>${c.credito}</b> · ` : '') + c.atividade;
    };
    mostra(nomes[0]);
    heroCredito = mostra;
  }
  let heroCredito = null;

  /* ─── barra fixa + reveal ────────────────────────────────── */
  function initChrome() {
    const bar = $('#topbar'), hero = $('#topo');
    if (bar && hero) {
      new IntersectionObserver(
        ([e]) => bar.classList.toggle('show', !e.isIntersecting),
        { rootMargin: '-70px 0px 0px 0px' }
      ).observe(hero);
    }
    const io = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.08 });
    $$('.reveal').forEach(el => io.observe(el));
  }

  /* ─── painel diafragma ───────────────────────────────────── */
  const panel = $('#panel');
  let lastFocus = null;

  function openPanel() {
    lastFocus = document.activeElement;
    panel.hidden = false;
    requestAnimationFrame(() => panel.classList.add('open'));
    document.body.classList.add('locked');
    $$('[aria-controls="panel"]').forEach(b => b.setAttribute('aria-expanded', 'true'));
    // entrada escalonada dos itens
    $$('.panel-nav a').forEach((a, i) => { a.style.animationDelay = (0.04 * i) + 's'; });
    // preventScroll: focar sem arrastar o painel para longe do topo
    setTimeout(() => $('#panelSearch').focus({ preventScroll: true }), 260);
  }
  function closePanel() {
    panel.classList.remove('open');
    document.body.classList.remove('locked');
    $$('[aria-controls="panel"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    setTimeout(() => { panel.hidden = true; }, 450);
    if (lastFocus) lastFocus.focus();
  }
  const panelOpen = () => panel.classList.contains('open');

  function initPanel() {
    $$('#apBtn, #apBtnHero, [data-open-panel]').forEach(b =>
      b.addEventListener('click', () => (panelOpen() ? closePanel() : openPanel())));
    $('#apClose').addEventListener('click', closePanel);
    $$('.panel-nav a:not([data-sub])').forEach(a => a.addEventListener('click', closePanel));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (detailOpen()) closeDetail(); else if (panelOpen()) closePanel(); }
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (!typing && (e.key === 'm' || e.key === 'M')) { e.preventDefault(); panelOpen() ? closePanel() : openPanel(); }
    });
  }

  /* ─── busca do painel ────────────────────────────────────── */
  function renderPanelDays() {
    const grupos = agrupaPorDia();
    $('#panelDays').innerHTML = grupos.map(g =>
      `<button class="panel-day" data-dia="${g.iso}">${dia(g.iso)}<span class="n">${wd(g.iso)}</span></button>`
    ).join('');
    $$('#panelDays .panel-day').forEach(b => b.addEventListener('click', () => {
      closePanel();
      setView('dia');
      setTimeout(() => {
        const alvo = $('#dia-' + b.dataset.dia);
        if (alvo) alvo.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }, 380);
    }));
  }

  /** Submenu: Programação expande em dias → atividades, sem sair do painel. */
  function renderSubmenu() {
    const box = $('#subProgramacao');
    box.innerHTML =
      `<button class="panel-sub-all" data-ir="programacao">Ver a programação completa →</button>` +
      agrupaPorDia().map(g => {
        const range = g.itens.find(a => a.fim !== a.inicio);
        const rotulo = dia(g.iso) + (range ? '—' + dia(range.fim) : '') + '.08';
        return `<div class="panel-sub-dia">
          <button class="panel-sub-d" data-dia="${g.iso}">${rotulo}<span>${wd(g.iso)}</span></button>
          <div class="panel-sub-itens">${g.itens.map(a =>
            `<button class="panel-sub-item" data-id="${a.id}">
               ${a.destaque ? '<i>✦</i>' : ''}${a.titulo}
               <span>${DATA.locais[a.local].nome}</span>
             </button>`).join('')}</div>
        </div>`;
      }).join('');

    $$('[data-id]', box).forEach(b => b.addEventListener('click', () => {
      closePanel();
      setTimeout(() => openDetail(b.dataset.id), 300);
    }));
    $$('[data-dia]', box).forEach(b => b.addEventListener('click', () => {
      closePanel(); setView('dia');
      setTimeout(() => {
        const alvo = $('#dia-' + b.dataset.dia);
        if (alvo) alvo.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      }, 380);
    }));
    $('.panel-sub-all', box).addEventListener('click', () => {
      closePanel();
      setTimeout(() => $('#programacao').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }), 300);
    });

    const gatilho = $('[data-sub="programacao"]');
    gatilho.addEventListener('click', (e) => {
      e.preventDefault();
      const aberto = !box.hidden;
      box.hidden = aberto;
      gatilho.classList.toggle('aberto', !aberto);
      gatilho.setAttribute('aria-expanded', String(!aberto));
    });
    gatilho.setAttribute('aria-expanded', 'false');
    gatilho.setAttribute('aria-controls', 'subProgramacao');
  }

  function renderPanelResults(q) {
    const box = $('#panelResults');
    const termo = norm(q);
    const lista = termo
      ? DATA.atividades.filter(a => casa(a, termo))
      : DATA.atividades.filter(a => a.destaque);
    if (!lista.length) {
      box.innerHTML = '<p class="panel-hint">Nada encontrado para esse termo.</p>';
      return;
    }
    box.innerHTML = (termo ? '' : '<p class="panel-col-t" style="margin:0 0 10px">Destaques</p>') +
      lista.map(a => `
        <button class="panel-result" data-id="${a.id}">
          <span>
            <span class="panel-result-t">${a.titulo}</span>
            <span class="panel-result-l">${DATA.locais[a.local].nome}${a.artista ? ' · ' + a.artista : ''}</span>
          </span>
          <span class="panel-result-d">${periodo(a)}</span>
        </button>`).join('');
    $$('.panel-result', box).forEach(b => b.addEventListener('click', () => {
      closePanel();
      setTimeout(() => openDetail(b.dataset.id), 300);
    }));
  }

  function casa(a, termo) {
    const alvo = norm([
      a.titulo, a.artista, a.desc, a.parceria,
      DATA.locais[a.local].nome, DATA.locais[a.local].bairro, DATA.tipos[a.tipo].nome
    ].join(' '));
    return termo.split(/\s+/).every(t => alvo.includes(t));
  }

  /* ─── filtros ────────────────────────────────────────────── */
  function filtradas() {
    const termo = norm(state.q);
    return DATA.atividades.filter(a => {
      if (state.tipos.size && !state.tipos.has(a.tipo)) return false;
      if (state.local && a.local !== state.local) return false;
      if (termo && !casa(a, termo)) return false;
      return true;
    }).sort((x, y) =>
      x.inicio.localeCompare(y.inicio) ||
      horaNum(x) - horaNum(y) ||
      x.titulo.localeCompare(y.titulo));
  }

  function agrupaPorDia(lista) {
    const src = lista || DATA.atividades.slice().sort((x, y) =>
      x.inicio.localeCompare(y.inicio) || horaNum(x) - horaNum(y) || x.titulo.localeCompare(y.titulo));
    const map = new Map();
    src.forEach(a => {
      if (!map.has(a.inicio)) map.set(a.inicio, []);
      map.get(a.inicio).push(a);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([iso, itens]) => ({ iso, itens }));
  }

  function renderChips() {
    const usados = {};
    DATA.atividades.forEach(a => { usados[a.tipo] = (usados[a.tipo] || 0) + 1; });
    $('#progChips').innerHTML = Object.keys(DATA.tipos)
      .filter(t => usados[t])
      .map(t => `<button class="chip" data-tipo="${t}" aria-pressed="${state.tipos.has(t)}">
                   ${DATA.tipos[t].nome}<span class="n">${usados[t]}</span></button>`).join('');
    $$('#progChips .chip').forEach(c => c.addEventListener('click', () => {
      const t = c.dataset.tipo;
      const ativo = state.tipos.has(t);
      state.tipos.clear();            // um filtro por vez — nada de combinação
      state.local = null;
      if (!ativo) state.tipos.add(t);
      $$('.chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
      c.setAttribute('aria-pressed', String(!ativo));
      render();
    }));
  }

  /** Filtro por espaço: SESC e Senac em destaque, os demais abaixo. */
  const DESTAQUES = ['sesc', 'senac'];

  function renderChipsLocais() {
    const conta = {};
    DATA.atividades.forEach(a => { conta[a.local] = (conta[a.local] || 0) + 1; });

    const chip = (k) => `<button class="chip" data-local-chip="${k}" aria-pressed="false">
        ${DATA.locais[k].nome}<span class="n">${conta[k] || 0}</span></button>`;

    const dest = $('#progDestaques');
    if (dest) {
      dest.innerHTML = '<span class="chips-rotulo">Parcerias de formação</span>' +
        DESTAQUES.filter(k => DATA.locais[k]).map(chip).join('');
    }
    const box = $('#progLocais');
    if (box) {
      box.innerHTML = Object.keys(DATA.locais)
        .filter(k => !DESTAQUES.includes(k))
        .sort((a, b) => (conta[b] || 0) - (conta[a] || 0) || DATA.locais[a].nome.localeCompare(DATA.locais[b].nome))
        .map(chip).join('');
    }
    $$('[data-local-chip]').forEach(c => c.addEventListener('click', () => {
      const k = c.dataset.localChip;
      const ativo = state.local === k;
      state.tipos.clear();            // um filtro por vez
      state.local = ativo ? null : k;
      render();
    }));
  }

  /* ─── vistas ─────────────────────────────────────────────── */
  function cardHTML(a) {
    const L = DATA.locais[a.local];
    return `<button class="card ${a.destaque ? 'is-destaque' : ''}" data-id="${a.id}">
      <span class="card-img" style="background-image:url('${img(a.img, 560)}')"></span>
      <span class="card-body">
        <span class="card-meta"><span class="card-tipo">${DATA.tipos[a.tipo].nome}</span>${a.hora ? '<span>· ' + a.hora + '</span>' : ''}</span>
        <span class="card-date">${periodo(a)}</span>
        <span class="card-title">${a.titulo}</span>
        ${a.artista ? `<span class="card-artist">${a.artista}</span>` : ''}
        <span class="card-local">${L.nome}</span>
      </span>
    </button>`;
  }

  function viewDia(lista) {
    const grupos = agrupaPorDia(lista);
    if (!grupos.length) return vazio();
    return `<div class="days">` + grupos.map(g => {
      const range = g.itens.find(a => a.fim !== a.inicio);
      const tag = g.itens.some(a => a.destaque) ? '\u2726 destaque' : '';
      return `<div class="day" id="dia-${g.iso}">
        <div class="day-date">
          <div class="day-num">${dia(g.iso)}${range ? `<span class="sep">\u2014</span>${dia(range.fim)}` : ''}</div>
          <div class="day-wd">${range ? (range.dias_semana || wd(g.iso) + ' \u2014 ' + wd(range.fim)) : wd(g.iso)} \u00b7 agosto</div>
          ${tag ? `<div class="day-tag">${tag}</div>` : ''}
        </div>
        <div class="day-items">${g.itens.map(a => `
          <div class="day-item" data-id="${a.id}" role="button" tabindex="0">
            <span class="di-hora${a.hora ? '' : ' vago'}">${a.hora || 'horário a<br>confirmar'}</span>
            <span>
              <span class="di-linha">
                <span class="day-item-t">${a.titulo}</span>
                <span class="di-tag">${DATA.tipos[a.tipo].nome}</span>
              </span>
              <span class="day-item-l">${DATA.locais[a.local].nome}${a.artista ? ' \u00b7 <em>' + a.artista + '</em>' : ''}${a.inscricaoUrl ? ' <i class="di-insc">\u2022 inscri\u00e7\u00e3o</i>' : ''}</span>
              ${a.desc ? `<span class="day-item-d">${resumo(a.desc)}
                <span class="ver-mais">${SVG_VERMAIS}Ver mais</span></span>` : ''}
            </span>
          </div>`).join('')}</div>
      </div>`;
    }).join('') + `</div>`;
  }

  function viewTipo(lista) {
    if (!lista.length) return vazio();
    return `<div class="cards">${lista.map(cardHTML).join('')}</div>`;
  }

  function viewMapa(lista) {
    const L = DATA.locais;
    const chaves = Object.keys(L);
    const conta = {};
    DATA.atividades.forEach(a => { conta[a.local] = (conta[a.local] || 0) + 1; });

    // constelação: tudo se liga ao centro da cidade
    const hub = L.centro;
    const linhas = chaves.filter(k => k !== 'centro').map(k =>
      `<line class="mapa-link" x1="${hub.x}" y1="${hub.y}" x2="${L[k].x}" y2="${L[k].y}"/>`
    ).join('');

    return `<div class="mapa">
      <div>
        <div class="mapa-canvas">
          <div class="mapa-textura" style="background-image:url('${img('predios', 900)}')"></div>
          <svg class="mapa-grid" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            ${[20, 40, 60, 80].map(x => `<line x1="${x}" y1="0" x2="${x}" y2="100"/>`).join('')}
            ${[20, 40, 60, 80].map(y => `<line x1="0" y1="${y}" x2="100" y2="${y}"/>`).join('')}
            ${linhas}
          </svg>
          ${chaves.map((k, i) => `
            <button class="pin ${state.local === k ? 'on' : ''}" data-local="${k}"
                    style="left:${L[k].x}%;top:${L[k].y}%"
                    aria-label="${L[k].nome} — ${conta[k] || 0} atividades">
              <span class="pin-dot" style="--s:${10 + Math.min(conta[k] || 0, 6) * 2.2}px"></span>
              <span class="pin-n">${i + 1}</span>
              <span class="pin-label">${L[k].nome} · ${conta[k] || 0}</span>
            </button>`).join('')}
        </div>
        <p class="mapa-note">Mapa esquemático — as posições indicam a relação entre as regiões, não a distância real.</p>
      </div>
      <div class="mapa-list">
        ${chaves.map((k, i) => `
          <div class="mapa-item-linha ${state.local === k ? 'on' : ''}">
            <button class="mapa-item" data-local="${k}">
              <span class="mapa-item-n">${String(i + 1).padStart(2, '0')}</span>
              <span>
                <span class="mapa-item-nome">${L[k].nome}</span>
                <span class="mapa-item-b">${L[k].endereco || L[k].bairro}</span>
              </span>
              <span class="mapa-item-c">${conta[k] || 0}</span>
            </button>
            <a class="mapa-item-ir" href="${mapsURL(L[k])}" target="_blank" rel="noopener"
               title="Abrir ${L[k].nome} no Google Maps"
               aria-label="Abrir ${L[k].nome} no Google Maps">${SVG_MAPA}</a>
          </div>`).join('')}
      </div>
    </div>
    ${state.local
        ? `<div class="cards">${lista.map(cardHTML).join('')}</div>`
        : `<p class="cards-empty">Escolha um local no mapa ou na lista para ver o que acontece lá.</p>`}`;
  }

  const vazio = () => `<p class="cards-empty">Nenhuma atividade com esses filtros.<br>Tente limpar a busca.</p>`;

  function render() {
    const lista = filtradas();
    const box = $('#progView');
    box.innerHTML = state.view === 'dia'  ? viewDia(lista)
                  : state.view === 'tipo' ? viewTipo(lista)
                  : viewMapa(lista);

    $('#progCount').innerHTML = `<b>${lista.length}</b> ${lista.length === 1 ? 'atividade' : 'atividades'}`;
    const sujo = state.q || state.tipos.size || state.local;
    $('#progClear').hidden = !sujo;

    $$('[data-id]', box).forEach(b => {
      b.addEventListener('click', () => openDetail(b.dataset.id));
      if (b.getAttribute('role') === 'button') {
        b.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(b.dataset.id); }
        });
      }
    });
    $$('[data-local]', box).forEach(b => b.addEventListener('click', () => {
      state.local = state.local === b.dataset.local ? null : b.dataset.local;
      render();
    }));
    $$('[data-local-chip]').forEach(c =>
      c.setAttribute('aria-pressed', String(state.local === c.dataset.localChip)));
    $$('[data-tipo]').forEach(c =>
      c.setAttribute('aria-pressed', String(state.tipos.has(c.dataset.tipo))));
  }

  function setView(v) {
    state.view = v;
    if (v !== 'mapa') state.local = null;
    $$('.prog-tab').forEach(t => t.setAttribute('aria-selected', t.dataset.view === v));
    render();
  }

  /* ─── detalhe da atividade ───────────────────────────────── */
  const detail = $('#detail');
  const detailOpen = () => detail.classList.contains('open');

  function openDetail(id) {
    const a = DATA.atividades.find(x => x.id === id);
    if (!a) return;
    const L = DATA.locais[a.local];
    lastFocus = document.activeElement;

    $('#detailPanel').innerHTML = `
      <button class="detail-close" aria-label="Fechar">✕</button>
      <div class="detail-img" style="background-image:url('${img(a.img, 900)}')"></div>
      <div class="detail-body">
        <div class="detail-meta">
          <span class="tipo">${DATA.tipos[a.tipo].nome}</span>
          <span>${periodo(a)}</span>
          <span>${a.hora || 'horário a confirmar'}</span>
        </div>
        <h3 class="detail-title" id="detailTitle">${a.titulo}</h3>
        ${a.artista ? `<p class="detail-artist">${a.artista}</p>` : ''}
        <p class="detail-desc">${a.desc}</p>
        <dl class="detail-rows">
          <div class="detail-row"><dt>Local</dt><dd>
            <b>${L.nome}</b>${a.localDetalhe ? ' — ' + a.localDetalhe : ''}<br>${L.endereco || L.bairro} · Campinas — SP
            ${(a.tambemEm || []).map(k => `<br><span class="detail-tambem">também em ${DATA.locais[k].nome}</span>`).join('')}<br>
            <a class="detail-mapa" href="${mapsURL(L)}" target="_blank" rel="noopener">Ver no Google Maps →</a>
          </dd></div>
          <div class="detail-row"><dt>Quando</dt><dd>${periodo(a)}${a.datasConfirmar ? ' · datas exatas a confirmar' : ''}${a.dias_semana ? ' · ' + a.dias_semana : ''}${a.hora ? ' · ' + a.hora : ''}</dd></div>
          ${a.parceria ? `<div class="detail-row"><dt>Parceria</dt><dd>${a.parceria}</dd></div>` : ''}
          ${a.classificacao ? `<div class="detail-row"><dt>Classificação</dt><dd>${a.classificacao}</dd></div>` : ''}
          ${a.ingresso ? `<div class="detail-row"><dt>Ingresso</dt><dd>${a.ingresso}</dd></div>` : ''}
          ${a.publico ? `<div class="detail-row"><dt>Público</dt><dd>${a.publico}</dd></div>` : ''}
          ${a.creditoFoto ? `<div class="detail-row"><dt>Foto</dt><dd>${a.creditoFoto}</dd></div>` : ''}
        </dl>
        <div class="detail-actions">
          ${a.inscricaoUrl ? `<a class="btn btn-sm" href="${a.inscricaoUrl}" target="_blank" rel="noopener">${a.inscricaoLabel || 'Inscreva-se'} →</a>` : ''}
          <button class="btn btn-sm btn-line" data-share>Compartilhar</button>
        </div>
      </div>`;

    detail.hidden = false;
    requestAnimationFrame(() => detail.classList.add('open'));
    document.body.classList.add('locked');
    history.replaceState(null, '', '#atividade/' + a.id);

    $('.detail-close').addEventListener('click', closeDetail);
    $('[data-share]').addEventListener('click', () => compartilhar(a));
    $('.detail-close').focus();
  }

  function closeDetail() {
    detail.classList.remove('open');
    document.body.classList.remove('locked');
    setTimeout(() => { detail.hidden = true; }, 400);
    history.replaceState(null, '', location.pathname + location.search);
    if (lastFocus) lastFocus.focus();
  }


  function compartilhar(a) {
    const url = location.origin + location.pathname + '#atividade/' + a.id;
    const dados = { title: a.titulo, text: a.titulo + ' · Festival Hercule Florence 2026', url };
    if (navigator.share) { navigator.share(dados).catch(() => {}); return; }
    navigator.clipboard.writeText(url).then(() => {
      const b = $('[data-share]');
      const txt = b.textContent; b.textContent = 'Link copiado';
      setTimeout(() => { b.textContent = txt; }, 1800);
    }).catch(() => {});
  }

  /* ─── listas por parceria ────────────────────────────────── */
  function renderParcerias() {
    $$('.parceria-list').forEach(box => {
      const loc = box.dataset.local;
      box.innerHTML = DATA.atividades.filter(a => a.local === loc).map(a =>
        `<button data-id="${a.id}"><span class="d">${periodo(a)}</span><span>${a.titulo}</span></button>`
      ).join('');
      $$('[data-id]', box).forEach(b => b.addEventListener('click', () => openDetail(b.dataset.id)));
    });
    $$('[data-atividade]').forEach(b =>
      b.addEventListener('click', () => openDetail(b.dataset.atividade)));
  }

  /* ─── ligação dos controles ──────────────────────────────── */
  function initProg() {
    $$('.prog-tab').forEach(t => t.addEventListener('click', () => setView(t.dataset.view)));

    let deb;
    $('#progSearch').addEventListener('input', (e) => {
      clearTimeout(deb);
      deb = setTimeout(() => { state.q = e.target.value; render(); }, 140);
    });
    $('#progClear').addEventListener('click', () => {
      state.q = ''; state.tipos.clear(); state.local = null;
      $('#progSearch').value = '';
      $$('.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
      render();
    });

    let debP;
    $('#panelSearch').addEventListener('input', (e) => {
      clearTimeout(debP);
      debP = setTimeout(() => renderPanelResults(e.target.value), 140);
    });

    detail.addEventListener('click', (e) => { if (e.target === detail) closeDetail(); });
  }

  /** Números que contam até o valor quando entram na tela. */
  function initContadores() {
    const alvos = $$('[data-conta]');
    if (!alvos.length) return;
    const io = new IntersectionObserver((es) => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        const el = e.target;
        const fim = parseFloat(el.dataset.conta);
        const suf = el.dataset.sufixo || '';
        if (reduceMotion) { el.textContent = fim + suf; return; }
        const dur = 1400;
        let t0 = null;
        const passo = (t) => {
          if (t0 === null) t0 = t;
          const p = Math.min((t - t0) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(fim * eased) + (p === 1 ? suf : '');
          if (p < 1) requestAnimationFrame(passo);
        };
        requestAnimationFrame(passo);
      });
    }, { threshold: 0.5 });
    alvos.forEach(el => io.observe(el));
  }

  /** Sequência de fotos em crossfade nos blocos full-bleed. */
  function initSlideshows() {
    $$('[data-slideshow]').forEach(box => {
      let nomes;
      try { nomes = JSON.parse(box.dataset.slideshow); } catch (e) { return; }
      nomes.forEach((nome, i) => {
        const el = document.createElement('div');
        el.className = 'bleed-slide' + (i === 0 ? ' on' : '');
        el.style.backgroundImage = `url('${img(nome, 1000)}')`;
        box.appendChild(el);
      });
      if (reduceMotion || nomes.length < 2) return;
      const slides = $$('.bleed-slide', box);
      let i = 0;
      setInterval(() => {
        slides[i].classList.remove('on');
        i = (i + 1) % slides.length;
        slides[i].classList.add('on');
      }, 4200);
    });
  }

  /** Camadas em velocidades diferentes: o fundo corre menos que o texto. */
  function initParallax() {
    if (window.innerWidth < 900) return;
    const escala = reduceMotion ? 0.4 : 1;
    const camadas = [];
    $$('.bleed, .footer').forEach(sec => {
      const fundo = $('.bleed-bg, .bleed-slideshow, .footer-bg', sec);
      const texto = $('.wrap', sec);
      if (fundo) camadas.push({ sec, el: fundo, k: 0.14 * escala });
      if (texto) camadas.push({ sec, el: texto, k: -0.06 * escala });
    });
    if (!camadas.length) return;

    let pendente = false;
    const desenha = () => {
      pendente = false;
      const vh = window.innerHeight;
      camadas.forEach(c => {
        const r = c.sec.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return;
        const centro = r.top + r.height / 2 - vh / 2;   // 0 quando centralizado
        c.el.style.transform = `translate3d(0, ${(centro * c.k).toFixed(1)}px, 0)`;
      });
    };
    window.addEventListener('scroll', () => {
      if (!pendente) { pendente = true; requestAnimationFrame(desenha); }
    }, { passive: true });
    window.addEventListener('resize', desenha, { passive: true });
    desenha();
  }

  /* ─── boot ───────────────────────────────────────────────── */
  Promise.all([
    fetch(BASE + 'data/programacao.json').then(r => r.json()),
    fetch(BASE + 'img/manifest.json').then(r => r.json()).catch(() => ({})),
    fetch(BASE + 'data/creditos.json').then(r => r.json()).catch(() => ({}))
  ]).then(([prog, manifest, creditos]) => {
    DATA = prog; IMGS = manifest; CREDITOS = creditos;
    renderChips();
    renderChipsLocais();
    renderParcerias();
    initHero();          // depende do manifesto de imagens já carregado
    initSlideshows();
    initContadores();
    initParallax();
    renderPanelDays();
    renderSubmenu();
    renderPanelResults('');
    initProg();
    setView('dia');

    const m = location.hash.match(/^#atividade\/(.+)$/);
    if (m) setTimeout(() => openDetail(decodeURIComponent(m[1])), 400);
  }).catch((e) => {
    console.error('Falha ao carregar a programação', e);
    $('#progView').innerHTML = '<p class="cards-empty">Não foi possível carregar a programação.</p>';
  });

  initChrome();
  initPanel();
})();
