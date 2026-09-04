/**
 * World Clock Card
 * https://github.com/korova-sq/world-clock-card
 * Version: 1.0.0
 *
 * A clean clock card for Home Assistant: choose a digital or analog clock,
 * an optional localized date, and up to three secondary world-clock time
 * zones shown in a row. Transparent background or background image + overlay,
 * same styling family as sun-weather-card / calendar-tasks-card.
 *
 * Config minima:
 *   type: custom:world-clock-card
 *
 * Config completa:
 *   type: custom:world-clock-card
 *   clock_style: digital        # 'digital' | 'analog'
 *   time_format: '24'           # '24' | '12'
 *   show_seconds: false
 *   show_date: true
 *   title: ''
 *   language: system            # 'system' | 'it' | 'en'
 *   show_timezones: false
 *   timezones:
 *     - { label: 'New York', tz: 'America/New_York' }
 *     - { label: 'Tokyo',    tz: 'Asia/Tokyo' }
 *   transparent: false
 *   background_image: null
 *   background_overlay: 0        # -1 chiaro ... 0 ... +1 scuro
 */

/* Deriva un locale BCP-47 dalla lingua scelta (per i NOMI di giorno/mese).
   L'orario 12/24 e' controllato separatamente con hour12, quindi il locale
   qui serve solo alla localizzazione testuale. */
function wccResolveLanguage(cfgLang, hass) {
  if (cfgLang && cfgLang !== 'system') return cfgLang;
  const l = (hass && hass.locale && hass.locale.language)
    || (hass && hass.language)
    || navigator.language || 'en';
  const s = String(l).toLowerCase();
  return s.startsWith('it') ? 'it' : 'en';
}
const WCC_LOCALE = { it: 'it-IT', en: 'en-GB' };

class WorldClockCard extends HTMLElement {
  setConfig(config) {
    this._config = {
      clock_style: 'digital',
      time_format: '24',
      size: 'medium', // 'small' | 'medium' | 'large'
      bold: true,
      dial_detail: 'minutes', // 'quarters' | 'hours' | 'minutes' (solo analogico)
      dial_markers: 'ticks', // 'ticks' | 'dots' | 'numbers' | 'roman' | 'none'
      tz_dial_detail: 'inherit', // fusi: come il locale se 'inherit'
      tz_dial_markers: 'inherit',
      show_seconds: false,
      show_seconds_tz: false, // secondi sui fusi (indipendente dal locale)
      show_date: true,
      date_format: 'full', // full | no_year | short | short_year | numeric | day_month
      date_separator: '/', // per il formato numerico: '/' | '-' | '.'
      date_position: 'below', // 'above' | 'below'
      date_color: null, // colore della data (ui_color); null = neutro
      title: '',
      language: 'system',
      // layout: 'row' = tutti affiancati, locale al centro, fusi ai lati (max 2).
      // 'split' = locale a sinistra, fusi impilati a destra (max 2).
      layout: 'row',
      show_timezones: false,
      timezones: [],
      // sfondo: 'transparent' rimuove sfondo/ombra/bordo (la card si fonde con
      // la dashboard). 'background_image' imposta un'immagine (URL o /local/...).
      // 'background_overlay' e' un velo unico: -1 chiaro ... 0 nessuno ... +1 scuro.
      transparent: false,
      background_image: null,
      background_css: null, // colore/gradiente CSS libero (usato se non c'e' un'immagine)
      light_text: false, // forza testi/indici chiari (utile su sfondi scuri)
      background_overlay: 0,
      ...config,
    };
    if (!Array.isArray(this._config.timezones)) this._config.timezones = [];

    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
      this._buildStaticDOM();
    }
    this._appliedStyle = null; // forza (ri)costruzione del blocco orologio
    this._applyConfig();
    this._tick();
  }

  set hass(hass) {
    this._hass = hass;
    // la lingua 'system' dipende da hass: se cambia, ri-localizza
    this._applyConfig();
    this._tick();
    this._startTick();
  }

  connectedCallback() { this._startTick(); }
  disconnectedCallback() { this._stopTick(); }

  _startTick() {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), 1000);
  }
  _stopTick() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  _lang() { return wccResolveLanguage(this._config && this._config.language, this._hass); }
  _locale() { return WCC_LOCALE[this._lang()] || 'en-GB'; }

  _buildStaticDOM() {
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          padding: 20px 18px;
          font-family: var(--paper-font-body1_-_font-family, inherit);
          position: relative;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
          --wc-scale: 1.04; /* medio (predefinito) — +30% */
        }
        ha-card.size-small { --wc-scale: 0.78; }
        ha-card.size-large { --wc-scale: 1.3; }
        ha-card.size-xlarge { --wc-scale: 1.8; }
        /* solo orologio (niente data ne' fusi): card compatta come il clock nativo */
        ha-card.wc-minimal { padding: 10px 16px; gap: 4px; }

        /* --- sfondo trasparente totale: via sfondo, ombra e bordo --- */
        ha-card.transparent {
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          box-shadow: none !important;
          border: none !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
          --ha-card-background: transparent;
          --ha-card-box-shadow: none;
          --ha-card-border-width: 0;
          --ha-card-backdrop-filter: none;
          --card-background-color: transparent;
        }
        ha-card.transparent::before,
        ha-card.transparent::after {
          content: none !important;
          display: none !important;
          background: none !important;
          -webkit-backdrop-filter: none !important;
          backdrop-filter: none !important;
          box-shadow: none !important;
        }
        /* --- immagine di sfondo con velo incorporato --- */
        ha-card.has-bg-image {
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          border: none !important;
          --ha-card-border-width: 0;
          overflow: hidden;
        }
        /* su velo scuro schiarisce i testi che di default sono scuri */
        ha-card.bg-dark .wc-time,
        ha-card.bg-dark .wc-date,
        ha-card.bg-dark .wc-title,
        ha-card.bg-dark .wc-label { color: #f3f3f3; }
        ha-card.bg-dark .wc-analog .hand-h,
        ha-card.bg-dark .wc-analog .hand-m,
        ha-card.bg-dark .wc-analog .tick,
        ha-card.bg-dark .wc-analog .wc-face { stroke: #f3f3f3; }
        ha-card.bg-dark .wc-analog .wc-dot,
        ha-card.bg-dark .wc-analog .wc-num,
        ha-card.bg-dark .wc-analog .wc-disc-num { fill: #f3f3f3; }
        ha-card.bg-dark .wc-analog .wc-face { fill: rgba(255,255,255,0.06); }

        .wc-title {
          font-size: calc(1.7em * var(--wc-scale)); font-weight: 600;
          color: var(--wc-title-color, var(--primary-text-color)); text-align: center;
          line-height: 1.1;
        }

        /* --- palco: contiene una o piu' unita' orologio --- */
        .wc-stage { display: flex; align-items: center; justify-content: center; }
        .wc-stage.layout-column { flex-direction: column; gap: 10px; width: 100%; }
        .wc-stage.layout-row {
          flex-direction: row; flex-wrap: nowrap;
          gap: clamp(6px, 3vw, 26px); width: 100%;
        }
        /* in fila gli orologi si adattano alla larghezza: piccoli su mobile,
           fino al massimo su schermi larghi — cosi' restano sempre su una riga */
        .wc-stage.layout-row .wc-label { font-size: calc(0.66em * var(--wc-scale)); }
        /* riga fusi sotto il locale (solo layout colonna) */
        .wc-subrow {
          display: flex; justify-content: center; flex-wrap: wrap;
          gap: 10px 22px; margin-top: 4px;
        }
        /* affiancato: locale e fusi come gruppo centrato (non spinti ai bordi) */
        .wc-stage.layout-split {
          display: flex; justify-content: center; align-items: center;
          gap: clamp(24px, 8vw, 60px); width: 100%;
        }
        /* digitale: orario/etichette allineati a sinistra (colonna ordinata) */
        .wc-stage.layout-split .wc-unit.main.mode-digital { align-items: flex-start; }
        .wc-stage.layout-split .wc-unit.main.mode-digital .wc-time,
        .wc-stage.layout-split .wc-unit.main.mode-digital .wc-date { text-align: left; }
        .wc-tzcol.mode-digital { align-items: flex-start; }
        .wc-tzcol.mode-digital .wc-unit.sub { align-items: flex-start; }
        .wc-tzcol.mode-digital .wc-label { text-align: left; }
        /* analogico: scritte centrate sul rispettivo orologio */
        .wc-stage.layout-split .wc-unit.main.mode-analog { align-items: center; }
        .wc-tzcol.mode-analog { align-items: center; }
        .wc-tzcol.mode-analog .wc-unit.sub { align-items: center; }
        .wc-tzcol { display: flex; flex-direction: column; gap: 12px; }

        /* --- unita' orologio (locale = main, fuso = sub) --- */
        .wc-unit { display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .wc-label {
          font-size: calc(0.78em * var(--wc-scale)); font-weight: 500; letter-spacing: 0.3px;
          color: var(--wc-label-color, var(--secondary-text-color)); text-transform: uppercase;
        }

        /* --- orologio digitale --- */
        .wc-time {
          font-weight: 700; line-height: 1;
          color: var(--wc-time-color, var(--primary-text-color));
          letter-spacing: -1px; text-align: center;
        }
        .wc-unit.main .wc-time { font-size: calc(clamp(1.7em, 11vw, 3.4em) * var(--wc-scale)); }
        .wc-unit.sub .wc-time { font-size: calc(clamp(1.1em, 6vw, 1.9em) * var(--wc-scale)); font-weight: 600; }
        .wc-time .wc-sec { font-size: 0.5em; font-weight: 600; opacity: 0.45; margin-left: 2px; vertical-align: baseline; font-variant-numeric: tabular-nums; }
        .wc-time .wc-ampm { font-size: 0.34em; font-weight: 600; opacity: 0.7; margin-left: 6px; vertical-align: 0.9em; }

        /* --- orologio analogico --- */
        .wc-analog svg { width: 100%; height: 100%; display: block; }
        .wc-unit.main .wc-analog { width: calc(clamp(92px, 30vw, 160px) * var(--wc-scale)); height: calc(clamp(92px, 30vw, 160px) * var(--wc-scale)); }
        .wc-unit.sub .wc-analog { width: calc(clamp(54px, 18vw, 84px) * var(--wc-scale)); height: calc(clamp(54px, 18vw, 84px) * var(--wc-scale)); }
        .wc-analog .wc-face {
          fill: var(--wc-face-color, rgba(0,0,0,0.03));
          stroke: var(--wc-face-border-color, var(--divider-color, #cfcfcf)); stroke-width: 1.5;
        }
        .wc-analog .tick { stroke: var(--wc-tick-color, var(--secondary-text-color, #888)); stroke-width: 0.8; stroke-linecap: round; opacity: 0.4; }
        .wc-analog .tick.major { stroke: var(--wc-tick-color, var(--secondary-text-color, #888)); stroke-width: 1.2; opacity: 0.85; }
        .wc-analog .wc-dot { fill: var(--wc-tick-color, var(--secondary-text-color, #888)); opacity: 0.4; }
        .wc-analog .wc-dot.major { opacity: 0.85; }
        .wc-analog .wc-num { fill: var(--wc-num-color, var(--secondary-text-color, #888)); font-family: inherit; font-weight: 500; opacity: 0.9; }
        .wc-analog .wc-disc { fill: var(--wc-tick-color, var(--secondary-text-color, #888)); opacity: 0.16; }
        .wc-analog .wc-disc-num { fill: var(--wc-num-color, var(--primary-text-color, #333)); font-family: inherit; font-weight: 600; }
        .wc-analog .hand-h { stroke: var(--wc-hand-color, var(--secondary-text-color, #888)); stroke-width: 3; stroke-linecap: round; }
        .wc-analog .hand-m { stroke: var(--wc-hand-color, var(--secondary-text-color, #888)); stroke-width: 2.2; stroke-linecap: round; opacity: 0.55; }
        .wc-analog .hand-s { stroke: var(--wc-second-color, var(--error-color, #e5484d)); stroke-width: 1; stroke-linecap: round; }
        .wc-analog .pin { fill: var(--wc-pin-color, var(--primary-color, #03a9f4)); }
        /* auto-contrasto: quadrante scuro -> indici e lancette chiari */
        .wc-analog.dark-face .hand-h,
        .wc-analog.dark-face .hand-m,
        .wc-analog.dark-face .tick { stroke: #f3f3f3; }
        .wc-analog.dark-face .wc-num,
        .wc-analog.dark-face .wc-disc-num,
        .wc-analog.dark-face .wc-dot { fill: #f3f3f3; }
        .wc-analog.dark-face .wc-disc { fill: #ffffff; opacity: 0.18; }

        .wc-date {
          font-size: calc(1.15em * var(--wc-scale)); font-weight: 600;
          color: var(--wc-date-color, var(--secondary-text-color));
          text-transform: capitalize; text-align: center; line-height: 1.15;
        }
        .wc-unit.sub .wc-date { font-size: calc(0.8em * var(--wc-scale)); }
        /* un po' di respiro tra l'orologio principale e la data sotto */
        .wc-unit.main .wc-date { margin-top: 6px; }
        .wc-unit.main .wc-date.above { margin-top: 0; margin-bottom: 6px; }
        /* data a piena larghezza sopra/sotto la fila (layout riga) */
        .wc-date-standalone { width: 100%; margin-top: 8px; }
        .wc-date-standalone.above { margin-top: 0; margin-bottom: 8px; }
        /* grassetto disattivato: pesi normali su orario, secondi, data, nomi fusi, titolo */
        ha-card.wc-no-bold .wc-unit .wc-time { font-weight: 400; }
        ha-card.wc-no-bold .wc-time .wc-sec { font-weight: 400; }
        ha-card.wc-no-bold .wc-label { font-weight: 400; }
        ha-card.wc-no-bold .wc-date { font-weight: 400; }
        ha-card.wc-no-bold .wc-title { font-weight: 400; }
      </style>
      <ha-card>
        <div class="wc-title"></div>
        <div class="wc-stage"></div>
      </ha-card>
    `;
  }

  /* struttura + sfondo: dipende solo dalla config, non dal secondo corrente */
  _applyConfig() {
    if (!this.shadowRoot) return;
    const cardEl = this.shadowRoot.querySelector('ha-card');
    if (!cardEl) return;
    const c = this._config;

    // titolo
    const titleEl = this.shadowRoot.querySelector('.wc-title');
    if (titleEl) {
      titleEl.textContent = c.title || '';
      titleEl.style.display = c.title ? '' : 'none';
    }

    const mode = c.clock_style === 'analog' ? 'analog' : 'digital';
    const layout = c.layout === 'split' ? 'split' : 'row';
    const tzList = (c.show_timezones && Array.isArray(c.timezones))
      ? c.timezones.filter((z) => z && z.tz).slice(0, 2) : [];

    // dimensione (piccolo/medio/grande) — solo CSS, non ricostruisce il DOM
    const size = ['small', 'medium', 'large', 'xlarge'].includes(c.size) ? c.size : 'medium';
    cardEl.classList.remove('size-small', 'size-medium', 'size-large', 'size-xlarge');
    cardEl.classList.add('size-' + size);
    // compatta la card quando c'e' solo l'orologio (niente data ne' fusi)
    const minimal = c.show_date === false && tzList.length === 0;
    cardEl.classList.toggle('wc-minimal', minimal);
    // grassetto on/off (predefinito on)
    cardEl.classList.toggle('wc-no-bold', c.bold === false);

    // ricostruisci il palco solo quando cambia qualcosa di strutturale
    // (evita di distruggere/ricreare il DOM a ogni set hass)
    const sig = JSON.stringify({
      mode, layout, date: c.show_date !== false,
      datePos: c.date_position || 'below',
      dateColor: c.date_color ? String(c.date_color) : '',
      detail: c.dial_detail || 'minutes',
      markers: c.dial_markers || 'ticks',
      tzDetail: c.tz_dial_detail || 'inherit',
      tzMarkers: c.tz_dial_markers || 'inherit',
      color: c.dial_color ? String(c.dial_color) : '',
      tz: tzList.map((z) => [z.label || '', z.tz, z.color ? String(z.color) : '']),
    });
    if (this._sig !== sig) {
      this._sig = sig;
      this._buildStage(mode, layout, tzList);
      // dopo il render, adatta il contrasto se un quadrante ha colore scuro
      requestAnimationFrame(() => this._applyContrast());
    }

    this._applyBackground(cardEl);
  }

  /* costruisce il palco: unita' locale (main) + eventuali fusi (sub) */
  _buildStage(mode, layout, tzList) {
    const stage = this.shadowRoot.querySelector('.wc-stage');
    if (!stage) return;
    const card = this.shadowRoot.querySelector('ha-card');
    // rimuovi la data "a piena larghezza" di una costruzione precedente
    const oldStandalone = card && card.querySelector('.wc-date-standalone');
    if (oldStandalone) oldStandalone.remove();

    stage.className = 'wc-stage layout-' + layout;
    stage.innerHTML = '';
    this._units = [];

    const showDate = this._config.show_date !== false;
    const datePos = this._config.date_position === 'above' ? 'above' : 'below';
    const localColor = this._config.dial_color;
    const mkSub = (z) => this._buildUnit({
      mode, main: false, tz: z.tz,
      label: z.label || z.tz.split('/').pop().replace(/_/g, ' '),
      showDate: false, dialColor: z.color,
    });

    if (layout === 'split') {
      // affiancato: locale grande a sinistra (con data sopra/sotto), fusi impilati a destra
      const mainUnit = this._buildUnit({ mode, main: true, tz: null, label: '', showDate, datePos, dialColor: localColor });
      stage.appendChild(mainUnit.el);
      this._units.push(mainUnit);
      if (tzList.length) {
        const col = document.createElement('div');
        col.className = 'wc-tzcol mode-' + mode;
        // affiancato: max 2 fusi (con 3 la card diventa troppo alta/sproporzionata)
        tzList.slice(0, 2).forEach((z) => {
          const u = mkSub(z); this._units.push(u); col.appendChild(u.el);
        });
        stage.appendChild(col);
      }
    } else {
      // riga: sempre max 3 orologi — un fuso a sx, locale al centro, un fuso a dx.
      // La data NON va sotto il solo locale (allargherebbe la colonna centrale e
      // spingerebbe i fusi), ma su una riga a piena larghezza sopra/sotto la fila.
      const mainUnit = this._buildUnit({ mode, main: true, tz: null, label: '', showDate: false, dialColor: localColor });
      const rowTz = tzList.slice(0, 2);
      if (rowTz[0]) {
        const u = mkSub(rowTz[0]); this._units.push(u); stage.appendChild(u.el);
      }
      stage.appendChild(mainUnit.el);
      this._units.push(mainUnit);
      if (rowTz[1]) {
        const u = mkSub(rowTz[1]); this._units.push(u); stage.appendChild(u.el);
      }
      if (showDate && card) {
        const d = document.createElement('div');
        d.className = 'wc-date wc-date-standalone' + (datePos === 'above' ? ' above' : '');
        const dcol = this._toColor(this._config.date_color);
        if (dcol) d.style.color = dcol;
        if (datePos === 'above') card.insertBefore(d, stage); else card.appendChild(d);
        this._units.push({ dateEl: d }); // il tick aggiorna solo la data
      }
    }
  }

  /* costruisce una singola unita' orologio. Ritorna riferimenti per il tick. */
  _buildUnit(opts) {
    const { mode, main, tz, label, showDate, datePos } = opts;
    const unit = document.createElement('div');
    unit.className = 'wc-unit ' + (main ? 'main' : 'sub') + ' mode-' + mode;
    const u = { el: unit, tz: tz || null, main: !!main, mode };
    const above = datePos === 'above';

    if (label) {
      const lab = document.createElement('div');
      lab.className = 'wc-label';
      lab.textContent = label;
      unit.appendChild(lab);
    }

    const mkDate = () => {
      const d = document.createElement('div');
      d.className = 'wc-date' + (above ? ' above' : '');
      const dcol = this._toColor(this._config.date_color);
      if (dcol) d.style.color = dcol;
      u.dateEl = d;
      unit.appendChild(d);
    };

    if (showDate && above) mkDate();

    if (mode === 'analog') {
      const c = this._config;
      let detail = ['quarters', 'hours', 'minutes'].includes(c.dial_detail) ? c.dial_detail : 'minutes';
      let markers = ['ticks', 'dots', 'disc', 'numbers', 'roman', 'none'].includes(c.dial_markers) ? c.dial_markers : 'ticks';
      // i fusi (sub) possono avere impostazioni proprie; 'inherit'/assente = come il locale
      if (!main) {
        if (['quarters', 'hours', 'minutes'].includes(c.tz_dial_detail)) detail = c.tz_dial_detail;
        if (['ticks', 'dots', 'disc', 'numbers', 'roman', 'none'].includes(c.tz_dial_markers)) markers = c.tz_dial_markers;
      }
      const clk = this._buildAnalog(detail, markers, this._toColor(opts.dialColor));
      unit.appendChild(clk);
      u.hands = clk._hands;
    } else {
      const t = document.createElement('div');
      t.className = 'wc-time';
      // nel digitale il "colore quadrante" colora le cifre dell'orario
      const col = this._toColor(opts.dialColor);
      if (col) t.style.color = col;
      unit.appendChild(t);
      u.timeEl = t;
    }

    if (showDate && !above) mkDate();
    return u;
  }

  /* logica sfondo/velo/trasparenza (portata da sun-weather-card) */
  _applyBackground(cardEl) {
    const bg = this._config.background_image;
    const cssBg = (typeof this._config.background_css === 'string') ? this._config.background_css.trim() : '';
    const hasBg = !!bg;
    const hasCss = !hasBg && !!cssBg; // il CSS agisce solo se non c'e' un'immagine
    const wantTransparent = this._config.transparent === true && !hasBg && !hasCss;
    cardEl.classList.toggle('transparent', wantTransparent);

    const forced = [
      ['background', 'transparent'],
      ['background-color', 'transparent'],
      ['background-image', 'none'],
      ['box-shadow', 'none'],
      ['border', 'none'],
      ['backdrop-filter', 'none'],
      ['-webkit-backdrop-filter', 'none'],
      ['--ha-card-background', 'transparent'],
      ['--card-background-color', 'transparent'],
      ['--ha-card-box-shadow', 'none'],
      ['--ha-card-border-width', '0'],
      ['--ha-card-border-color', 'transparent'],
      ['--ha-card-backdrop-filter', 'none'],
    ];
    if (wantTransparent) {
      forced.forEach(([p, v]) => cardEl.style.setProperty(p, v, 'important'));
    } else {
      forced.forEach(([p]) => {
        if (hasBg && (p === 'background' || p === 'background-image' || p === 'background-color')) return;
        if (hasCss && (p === 'background' || p === 'background-image' || p === 'background-color')) return;
        cardEl.style.removeProperty(p);
      });
    }

    if (hasBg) {
      cardEl.classList.remove('has-css-bg');
      cardEl.classList.add('has-bg-image');
      cardEl.style.setProperty('background-color', 'transparent', 'important');
      cardEl.style.setProperty('--ha-card-background', 'transparent', 'important');
      cardEl.style.setProperty('--card-background-color', 'transparent', 'important');
      let ov = Number(this._config.background_overlay);
      if (!isFinite(ov)) ov = 0;
      ov = Math.min(Math.max(ov, -1), 1);
      const dark = ov > 0;
      const op = Math.abs(ov);
      const veil = dark ? `rgba(0, 0, 0, ${op})` : `rgba(255, 255, 255, ${op})`;
      const bgUrl = String(bg).trim();
      cardEl.style.setProperty('background-image',
        `linear-gradient(${veil}, ${veil}), url("${bgUrl}")`, 'important');
      cardEl.classList.toggle('bg-dark', dark && op >= 0.4);
    } else if (hasCss) {
      // sfondo CSS libero (colore pieno, gradiente lineare/radiale/conico…)
      cardEl.classList.remove('has-bg-image', 'bg-dark');
      cardEl.classList.add('has-css-bg');
      cardEl.style.removeProperty('background-image');
      cardEl.style.setProperty('background', cssBg, 'important');
      cardEl.style.setProperty('--ha-card-background', cssBg, 'important');
    } else {
      cardEl.classList.remove('has-bg-image', 'bg-dark', 'has-css-bg');
      cardEl.style.removeProperty('background-image');
      cardEl.style.removeProperty('background');
      if (!wantTransparent) {
        cardEl.style.removeProperty('background-color');
        cardEl.style.removeProperty('--ha-card-background');
        cardEl.style.removeProperty('--card-background-color');
      }
    }

    // testo/indici chiari forzati (comodo su sfondi CSS scuri, dove non c'e' overlay)
    if (this._config.light_text === true) cardEl.classList.add('bg-dark');
  }

  /* true se il colore risolto e' scuro (e abbastanza opaco da contare) */
  _isDarkColor(cssColor) {
    if (!cssColor) return false;
    const m = cssColor.match(/rgba?\(([^)]+)\)/);
    if (!m) return false;
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    const r = p[0], g = p[1], b = p[2], a = p[3] === undefined ? 1 : p[3];
    if (a < 0.4) return false; // troppo trasparente per "scurire" il quadrante
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum < 140;
  }

  /* per ogni orologio con quadrante colorato, schiarisce indici e lancette se scuro */
  _applyContrast() {
    if (!this._units) return;
    this._units.forEach((u) => {
      const wrap = u.el && u.el.querySelector('.wc-analog');
      if (!wrap || !wrap._hasColor || !wrap._face) return;
      let fill = '';
      try { fill = getComputedStyle(wrap._face).fill; } catch (e) { fill = ''; }
      wrap.classList.toggle('dark-face', this._isDarkColor(fill));
    });
  }

  /* normalizza un colore per il quadrante:
     - [r,g,b] (vecchi salvataggi) -> rgb(...)
     - '#hex' / 'rgb(...)' / 'var(...)' -> usato cosi' com'e'
     - nome colore del tema HA (es. 'red', 'primary') -> var(--red-color) */
  _toColor(v) {
    if (Array.isArray(v) && v.length === 3) return `rgb(${v[0]}, ${v[1]}, ${v[2]})`;
    if (typeof v === 'string' && v.trim()) {
      const s = v.trim();
      if (s.startsWith('#') || s.startsWith('rgb') || s.startsWith('hsl') || s.startsWith('var')) return s;
      return `var(--${s}-color, ${s})`;
    }
    return null;
  }

  /* costruisce l'SVG dell'orologio analogico (quadrante + indici + lancette).
     detail: 'quarters' (4), 'hours' (12) o 'minutes' (60).
     markers: 'ticks' | 'dots' | 'disc' | 'numbers' | 'roman' | 'none'.
     faceColor: colore CSS del cerchio del quadrante (opzionale). */
  _buildAnalog(detail, markers, faceColor) {
    const wrap = document.createElement('div');
    wrap.className = 'wc-analog';
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');

    const face = document.createElementNS(NS, 'circle');
    face.setAttribute('class', 'wc-face');
    face.setAttribute('cx', '50'); face.setAttribute('cy', '50'); face.setAttribute('r', '48');
    if (faceColor) face.style.fill = faceColor;
    svg.appendChild(face);

    // posizioni (0..59) e "major" secondo il dettaglio scelto
    let ticks;
    if (detail === 'quarters') {
      ticks = [0, 15, 30, 45].map((i) => ({ i, major: true }));
    } else if (detail === 'hours') {
      ticks = [];
      for (let h = 0; h < 12; h++) ticks.push({ i: h * 5, major: true });
    } else { // minutes (completo)
      ticks = [];
      for (let i = 0; i < 60; i++) ticks.push({ i, major: i % 5 === 0 });
    }

    const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X', 11: 'XI', 12: 'XII' };
    const drawTick = (i, major, shorten) => {
      const a = (i / 60) * 2 * Math.PI;
      const r1 = shorten ? 42 : (major ? 39 : 42), r2 = 46;
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('class', 'tick' + (major ? ' major' : ''));
      line.setAttribute('x1', (50 + r1 * Math.sin(a)).toFixed(2));
      line.setAttribute('y1', (50 - r1 * Math.cos(a)).toFixed(2));
      line.setAttribute('x2', (50 + r2 * Math.sin(a)).toFixed(2));
      line.setAttribute('y2', (50 - r2 * Math.cos(a)).toFixed(2));
      svg.appendChild(line);
    };
    const drawDot = (i, major) => {
      const a = (i / 60) * 2 * Math.PI;
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('class', 'wc-dot' + (major ? ' major' : ''));
      c.setAttribute('cx', (50 + 44 * Math.sin(a)).toFixed(2));
      c.setAttribute('cy', (50 - 44 * Math.cos(a)).toFixed(2));
      c.setAttribute('r', major ? '1.7' : '0.9');
      svg.appendChild(c);
    };
    const drawNum = (h) => {
      const a = (h % 12) / 12 * 2 * Math.PI;
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'wc-num');
      t.setAttribute('x', (50 + 35.5 * Math.sin(a)).toFixed(2));
      t.setAttribute('y', (50 - 35.5 * Math.cos(a)).toFixed(2));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'central');
      // romani piu' piccoli degli arabi perche' hanno piu' lettere
      t.setAttribute('font-size', markers === 'roman' ? '6.5' : '8');
      t.textContent = markers === 'roman' ? ROMAN[h] : String(h);
      svg.appendChild(t);
    };
    // numero dentro un disco (stile "numeri in cerchio")
    const drawDisc = (h) => {
      const a = (h % 12) / 12 * 2 * Math.PI;
      const cx = 50 + 38 * Math.sin(a), cy = 50 - 38 * Math.cos(a);
      const disc = document.createElementNS(NS, 'circle');
      disc.setAttribute('class', 'wc-disc');
      disc.setAttribute('cx', cx.toFixed(2));
      disc.setAttribute('cy', cy.toFixed(2));
      disc.setAttribute('r', '6.4');
      svg.appendChild(disc);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('class', 'wc-disc-num');
      t.setAttribute('x', cx.toFixed(2));
      t.setAttribute('y', cy.toFixed(2));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'central');
      t.setAttribute('font-size', '6.5');
      t.textContent = String(h);
      svg.appendChild(t);
    };

    if (markers === 'none') {
      // nessun indice
    } else if (markers === 'disc') {
      // numeri dentro dischi alle ore (o ai quarti)
      const hours = detail === 'quarters' ? [12, 3, 6, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      hours.forEach((h) => drawDisc(h));
    } else if (markers === 'numbers' || markers === 'roman') {
      // in "completo" tieni le tacche fini dei minuti
      if (detail === 'minutes') {
        for (let i = 0; i < 60; i++) if (i % 5 !== 0) drawTick(i, false);
      }
      // tacche corte alle ore (o ai quarti) insieme ai numeri
      const hourPos = detail === 'quarters' ? [0, 15, 30, 45]
        : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
      hourPos.forEach((i) => drawTick(i, true, true));
      const hours = detail === 'quarters' ? [12, 3, 6, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
      hours.forEach((h) => drawNum(h));
    } else if (markers === 'dots') {
      ticks.forEach(({ i, major }) => drawDot(i, major));
    } else { // ticks
      ticks.forEach(({ i, major }) => drawTick(i, major));
    }

    const mk = (cls, len) => {
      const l = document.createElementNS(NS, 'line');
      l.setAttribute('class', cls);
      l.setAttribute('x1', '50'); l.setAttribute('y1', '50');
      l.setAttribute('x2', '50'); l.setAttribute('y2', String(50 - len));
      l.setAttribute('data-len', String(len));
      return l;
    };
    const hH = mk('hand-h', 26);
    const hM = mk('hand-m', 36);
    const hS = mk('hand-s', 40);
    svg.appendChild(hH); svg.appendChild(hM); svg.appendChild(hS);

    const pin = document.createElementNS(NS, 'circle');
    pin.setAttribute('class', 'pin');
    pin.setAttribute('cx', '50'); pin.setAttribute('cy', '50'); pin.setAttribute('r', '2.4');
    svg.appendChild(pin);

    wrap.appendChild(svg);
    wrap._hands = { h: hH, m: hM, s: hS };
    wrap._face = face;
    wrap._hasColor = !!faceColor;
    return wrap;
  }

  /* ore/minuti/secondi per un fuso (o locale se tz nullo). null se tz invalido. */
  _hmsFor(now, tz) {
    if (!tz) return { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() };
    try {
      const p = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: tz,
      }).formatToParts(now);
      const g = (t) => { const f = p.find((x) => x.type === t); return f ? parseInt(f.value, 10) : 0; };
      let h = g('hour'); if (h === 24) h = 0; // alcune impl. danno 24 a mezzanotte
      return { h, m: g('minute'), s: g('second') };
    } catch (e) { return null; }
  }

  /* aggiornamento al secondo: scorre tutte le unita' (locale + fusi) */
  _tick() {
    if (!this.shadowRoot || !this._units) return;
    const c = this._config;
    const now = new Date();
    const loc = this._locale();
    const hour12 = c.time_format === '12';
    // secondi: toggle indipendenti per locale (show_seconds) e fusi (show_seconds_tz)
    const secLocal = c.show_seconds === true;
    const secZones = c.show_seconds_tz === true;
    const wantSec = (u) => (u.main ? secLocal : secZones);

    this._units.forEach((u) => {
      // I nomi IANA non hanno spazi: ripulisce un copia-incolla "sporco".
      const tz = u.tz ? u.tz.replace(/\s+/g, '') : null;

      if (u.mode === 'analog' && u.hands) {
        const hms = this._hmsFor(now, tz);
        if (hms) {
          const angH = (hms.h % 12) * 30 + hms.m * 0.5;
          const angM = hms.m * 6 + hms.s * 0.1;
          const angS = hms.s * 6;
          u.hands.h.setAttribute('transform', `rotate(${angH} 50 50)`);
          u.hands.m.setAttribute('transform', `rotate(${angM} 50 50)`);
          u.hands.s.setAttribute('transform', `rotate(${angS} 50 50)`);
          u.hands.s.style.display = wantSec(u) ? '' : 'none';
        }
      } else if (u.timeEl) {
        const opts = { hour: '2-digit', minute: '2-digit', hour12 };
        if (wantSec(u)) opts.second = '2-digit';
        if (tz) opts.timeZone = tz;
        try {
          const parts = new Intl.DateTimeFormat(loc, opts).formatToParts(now);
          let main = '', sec = '', ampm = '';
          for (let i = 0; i < parts.length; i++) {
            const p = parts[i];
            if (p.type === 'dayPeriod') { ampm = p.value; continue; }
            if (p.type === 'second') { sec += p.value; continue; }
            // scarta il ":" che precede i secondi — restano solo le cifre, piccole
            if (p.type === 'literal' && parts[i + 1] && parts[i + 1].type === 'second') { continue; }
            main += p.value;
          }
          u.timeEl.innerHTML = `${main.trim()}`
            + (sec ? `<span class="wc-sec">${sec}</span>` : '')
            + (ampm ? `<span class="wc-ampm">${ampm}</span>` : '');
        } catch (e) {
          u.timeEl.textContent = '—';
        }
      }

      if (u.dateEl) {
        u.dateEl.textContent = this._dateText(now, loc);
      }
    });
  }

  /* testo della data secondo il formato scelto */
  _dateText(now, loc) {
    const fmt = this._config.date_format;
    if (fmt === 'numeric') {
      const sep = ['/', '-', '.'].includes(this._config.date_separator) ? this._config.date_separator : '/';
      const parts = new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(now);
      return parts.map((p) => (p.type === 'literal' ? sep : p.value)).join('');
    }
    let opts;
    switch (fmt) {
      case 'no_year': opts = { weekday: 'long', day: 'numeric', month: 'long' }; break;
      case 'short': opts = { weekday: 'short', day: 'numeric', month: 'short' }; break;
      case 'short_year': opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }; break;
      case 'day_month': opts = { day: 'numeric', month: 'long' }; break;
      default: opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    }
    return new Intl.DateTimeFormat(loc, opts).format(now);
  }

  getCardSize() { return this._config.clock_style === 'analog' ? 4 : 3; }

  static getConfigElement() {
    return document.createElement('world-clock-card-editor');
  }

  static getStubConfig() {
    return {
      clock_style: 'digital',
      show_date: true,
      show_seconds: false,
    };
  }
}

customElements.define('world-clock-card', WorldClockCard);

/* =========================================================================
 * Editor UI: world-clock-card-editor (ha-form nativo)
 * ========================================================================= */

const WCC_EDITOR_I18N = {
  en: {
    grp_general: 'General', grp_timezones: 'World clocks', grp_appearance: 'Appearance',
    grp_clock: 'Clock', grp_dial: 'Dial (analog)', grp_datetime: 'Time & date',
    title: 'Title (optional)',
    clock_style: 'Clock style', cs_digital: 'Digital', cs_analog: 'Analog',
    layout: 'Layout', lay_column: 'Local on top, zones below', lay_row: 'In a row, local at center', lay_split: 'Local left, zones right',
    size: 'Size', sz_small: 'Small', sz_medium: 'Medium', sz_large: 'Large', sz_xlarge: 'Extra large',
    bold: 'Bold',
    dial_detail: 'Dial detail', dd_quarters: 'Quarters (12·3·6·9)', dd_hours: 'Hours', dd_minutes: 'Full (minutes)',
    dial_markers: 'Markers', dm_ticks: 'Ticks', dm_dots: 'Dots', dm_numbers: 'Numbers', dm_roman: 'Roman numerals', dm_none: 'None (minimal)',
    dm_disc: 'Numbers in circles',
    dial_color: 'Dial color',
    time_format: 'Time format', tf_24: '24 hours', tf_12: '12 hours (AM/PM)',
    show_seconds: 'Show seconds', show_date: 'Show date',
    tz_seconds: 'Show seconds on zones',
    date_position: 'Date position', dp_above: 'Above', dp_below: 'Below',
    date_format: 'Date format', df_full: 'Full (weekday dd month yyyy)', df_no_year: 'Without year (weekday dd month)', df_short: 'Short (ddd dd mmm)', df_short_year: 'Short with year (ddd dd mmm yyyy)', df_numeric: 'Numeric (dd/mm/yyyy)', df_day_month: 'Day and month (dd month)',
    date_separator: 'Separator (numeric format)', sep_slash: 'Slash /', sep_dash: 'Dash -', sep_dot: 'Dot .',
    date_color: 'Date color',
    language: 'Language', lang_system: 'System default', lang_it: 'Italiano', lang_en: 'English',
    show_timezones: 'Show world clocks',
    tz_detail: 'Zones — dial detail', tz_markers: 'Zones — markers', opt_inherit: 'Same as local',
    tz_slot: 'Zone',
    tz_hint: 'Up to three secondary time zones, shown in a row.',
    tz_place: 'Location', tz_zone: 'Time zone (IANA, e.g. Europe/Rome)',
    transparent: 'Transparent background',
    background_image: 'Background image (URL or /local/… path)',
    background_css: 'Background (colour / CSS gradient)',
    light_text: 'Light text (for dark backgrounds)',
    overlay: 'Image overlay', ov_light: 'Lighter', ov_dark: 'Darker',
  },
  it: {
    grp_general: 'Generale', grp_timezones: 'Orologi del mondo', grp_appearance: 'Aspetto',
    grp_clock: 'Orologio', grp_dial: 'Quadrante (analogico)', grp_datetime: 'Ora e data',
    title: 'Titolo (opzionale)',
    clock_style: 'Stile orologio', cs_digital: 'Digitale', cs_analog: 'Analogico',
    layout: 'Disposizione', lay_column: 'Locale sopra, fusi sotto', lay_row: 'In fila, locale al centro', lay_split: 'Locale a sinistra, fusi a destra',
    size: 'Dimensione', sz_small: 'Piccolo', sz_medium: 'Medio', sz_large: 'Grande', sz_xlarge: 'Extra grande',
    bold: 'Grassetto',
    dial_detail: 'Dettaglio quadrante', dd_quarters: 'Quarti (12·3·6·9)', dd_hours: 'Ore', dd_minutes: 'Completo (minuti)',
    dial_markers: 'Stile indici', dm_ticks: 'Tacche', dm_dots: 'Punti', dm_numbers: 'Numeri', dm_roman: 'Numeri romani', dm_none: 'Nessuno (minimal)',
    dm_disc: 'Numeri in cerchio',
    dial_color: 'Colore quadrante',
    time_format: 'Formato ora', tf_24: '24 ore', tf_12: '12 ore (AM/PM)',
    show_seconds: 'Mostra i secondi', show_date: 'Mostra la data',
    tz_seconds: 'Mostra i secondi nei fusi',
    date_position: 'Posizione data', dp_above: 'Sopra', dp_below: 'Sotto',
    date_format: 'Formato data', df_full: 'Completo (giorno gg mese aaaa)', df_no_year: 'Senza anno (giorno gg mese)', df_short: 'Corto (gio gg mmm)', df_short_year: 'Corto con anno (gio gg mmm aaaa)', df_numeric: 'Numerico (gg/mm/aaaa)', df_day_month: 'Giorno e mese (gg mese)',
    date_separator: 'Separatore (formato numerico)', sep_slash: 'Barra /', sep_dash: 'Trattino -', sep_dot: 'Punto .',
    date_color: 'Colore data',
    language: 'Lingua', lang_system: 'Come il sistema', lang_it: 'Italiano', lang_en: 'English',
    show_timezones: 'Mostra gli orologi del mondo',
    tz_detail: 'Fusi — dettaglio quadrante', tz_markers: 'Fusi — stile indici', opt_inherit: 'Come il locale',
    tz_slot: 'Fuso',
    tz_hint: 'Fino a tre fusi orari secondari, mostrati in fila.',
    tz_place: 'Località', tz_zone: 'Fuso orario (IANA, es. Europe/Rome)',
    transparent: 'Sfondo trasparente',
    background_image: 'Immagine di sfondo (URL o percorso /local/…)',
    background_css: 'Sfondo (colore / gradiente CSS)',
    light_text: 'Testo chiaro (per sfondi scuri)',
    overlay: 'Velo sull\'immagine', ov_light: 'Più chiaro', ov_dark: 'Più scuro',
  },
};

class WorldClockCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    if (!Array.isArray(this._config.timezones)) this._config.timezones = [];
    if (!this._rendered) {
      this._rendered = true;
      this._render();
    }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first && this._rendered) {
      this._render();
    } else {
      this._fillClockForm();
      this._fillDialForm();
      this._fillDatetimeForm();
      this._fillTimezonesForm();
      this._fillAppearanceForm();
    }
  }

  _lang() { return wccResolveLanguage(this._config && this._config.language, this._hass); }
  t(key) {
    const dict = WCC_EDITOR_I18N[this._lang()] || WCC_EDITOR_I18N.en;
    return dict[key] != null ? dict[key] : (WCC_EDITOR_I18N.en[key] || key);
  }

  _emit() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config }, bubbles: true, composed: true,
    }));
  }
  _set(key, value) {
    if (value === '' || value === null || value === undefined) delete this._config[key];
    else this._config[key] = value;
    this._emit();
  }

  /* crea un segmented control (bordino + viola tenue) per una scelta a piu' opzioni */
  _segControl(mount, cfgKey, options, defVal, labelKey) {
    const block = document.createElement('div');
    block.className = 'ctrl-block';
    const lab = document.createElement('div');
    lab.className = 'ctrl-label';
    lab.textContent = this.t(labelKey);
    const seg = document.createElement('div');
    seg.className = 'seg';
    const cur = this._config[cfgKey] || defVal;
    options.forEach(([val, lblKey]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seg-btn';
      btn.textContent = this.t(lblKey);
      if (cur === val) btn.classList.add('selected');
      btn.addEventListener('click', () => {
        seg.querySelectorAll('.seg-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this._set(cfgKey, val === defVal ? undefined : val);
      });
      seg.appendChild(btn);
    });
    block.appendChild(lab);
    block.appendChild(seg);
    mount.appendChild(block);
    return block;
  }

  _fillClockForm() {
    if (!this.shadowRoot) return;
    const mount = this.shadowRoot.getElementById('clock-form');
    if (!mount || mount.dataset.filled) return;
    const c = this._config;
    const sel = (opts) => ({ select: { mode: 'dropdown', options: opts } });

    this._segControl(mount, 'clock_style', [['digital', 'cs_digital'], ['analog', 'cs_analog']], 'digital', 'clock_style');

    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = {
      title: c.title || '',
      size: c.size || 'medium',
      bold: c.bold !== false,
      language: c.language || 'system',
    };
    form.schema = [
      { name: 'title', selector: { text: {} } },
      { name: 'size', selector: sel([
        { value: 'small', label: this.t('sz_small') },
        { value: 'medium', label: this.t('sz_medium') },
        { value: 'large', label: this.t('sz_large') },
        { value: 'xlarge', label: this.t('sz_xlarge') },
      ]) },
      { name: 'bold', selector: { boolean: {} } },
      { name: 'language', selector: sel([
        { value: 'system', label: this.t('lang_system') },
        { value: 'it', label: this.t('lang_it') },
        { value: 'en', label: this.t('lang_en') },
      ]) },
    ];
    const labels = {
      title: this.t('title'), size: this.t('size'), bold: this.t('bold'), language: this.t('language'),
    };
    form.computeLabel = (s) => labels[s.name] || s.name;
    form.addEventListener('value-changed', (e) => {
      const v = e.detail.value || {};
      this._set('title', v.title);
      this._set('size', (v.size && v.size !== 'medium') ? v.size : undefined);
      this._set('bold', v.bold === false ? false : undefined);
      this._set('language', (v.language && v.language !== 'system') ? v.language : undefined);
    });
    mount.appendChild(form);
    mount.dataset.filled = '1';
  }

  _fillDialForm() {
    if (!this.shadowRoot) return;
    const mount = this.shadowRoot.getElementById('dial-form');
    if (!mount || mount.dataset.filled) return;
    const c = this._config;
    const sel = (opts) => ({ select: { mode: 'dropdown', options: opts } });

    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = {
      dial_detail: c.dial_detail || 'minutes',
      dial_markers: c.dial_markers || 'ticks',
      dial_color: c.dial_color,
    };
    form.schema = [
      { name: 'dial_detail', selector: sel([
        { value: 'quarters', label: this.t('dd_quarters') },
        { value: 'hours', label: this.t('dd_hours') },
        { value: 'minutes', label: this.t('dd_minutes') },
      ]) },
      { name: 'dial_markers', selector: sel([
        { value: 'ticks', label: this.t('dm_ticks') },
        { value: 'dots', label: this.t('dm_dots') },
        { value: 'disc', label: this.t('dm_disc') },
        { value: 'numbers', label: this.t('dm_numbers') },
        { value: 'roman', label: this.t('dm_roman') },
        { value: 'none', label: this.t('dm_none') },
      ]) },
      { name: 'dial_color', selector: { ui_color: {} } },
    ];
    const labels = {
      dial_detail: this.t('dial_detail'), dial_markers: this.t('dial_markers'), dial_color: this.t('dial_color'),
    };
    form.computeLabel = (s) => labels[s.name] || s.name;
    form.addEventListener('value-changed', (e) => {
      const v = e.detail.value || {};
      this._set('dial_detail', (v.dial_detail && v.dial_detail !== 'minutes') ? v.dial_detail : undefined);
      this._set('dial_markers', (v.dial_markers && v.dial_markers !== 'ticks') ? v.dial_markers : undefined);
      this._set('dial_color', v.dial_color || undefined);
    });
    mount.appendChild(form);
    mount.dataset.filled = '1';
  }

  _fillDatetimeForm() {
    if (!this.shadowRoot) return;
    const mount = this.shadowRoot.getElementById('datetime-form');
    if (!mount || mount.dataset.filled) return;
    const c = this._config;
    const sel = (opts) => ({ select: { mode: 'dropdown', options: opts } });

    this._segControl(mount, 'time_format', [['24', 'tf_24'], ['12', 'tf_12']], '24', 'time_format');

    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = {
      show_seconds: c.show_seconds === true,
      show_date: c.show_date !== false,
      date_format: c.date_format || 'full',
      date_separator: c.date_separator || '/',
      date_color: c.date_color,
    };
    form.schema = [
      { name: 'show_seconds', selector: { boolean: {} } },
      { name: 'show_date', selector: { boolean: {} } },
      { name: 'date_format', selector: sel([
        { value: 'full', label: this.t('df_full') },
        { value: 'no_year', label: this.t('df_no_year') },
        { value: 'short', label: this.t('df_short') },
        { value: 'short_year', label: this.t('df_short_year') },
        { value: 'numeric', label: this.t('df_numeric') },
        { value: 'day_month', label: this.t('df_day_month') },
      ]) },
      { name: 'date_separator', selector: sel([
        { value: '/', label: this.t('sep_slash') },
        { value: '-', label: this.t('sep_dash') },
        { value: '.', label: this.t('sep_dot') },
      ]) },
      { name: 'date_color', selector: { ui_color: {} } },
    ];
    const labels = {
      show_seconds: this.t('show_seconds'), show_date: this.t('show_date'),
      date_format: this.t('date_format'), date_separator: this.t('date_separator'),
      date_color: this.t('date_color'),
    };
    form.computeLabel = (s) => labels[s.name] || s.name;
    form.addEventListener('value-changed', (e) => {
      const v = e.detail.value || {};
      this._set('show_seconds', v.show_seconds === true ? true : undefined);
      this._set('show_date', v.show_date === false ? false : undefined);
      this._set('date_format', (v.date_format && v.date_format !== 'full') ? v.date_format : undefined);
      this._set('date_separator', (v.date_separator && v.date_separator !== '/') ? v.date_separator : undefined);
      this._set('date_color', v.date_color || undefined);
    });
    mount.appendChild(form);
    const dpBlock = this._segControl(mount, 'date_position', [['below', 'dp_below'], ['above', 'dp_above']], 'below', 'date_position');
    if (dpBlock) dpBlock.classList.add('ctrl-spaced');
    mount.dataset.filled = '1';
  }

  _fillTimezonesForm() {
    if (!this.shadowRoot) return;
    const mount = this.shadowRoot.getElementById('timezones-form');
    if (!mount || mount.dataset.filled) return;
    const c = this._config;

    // toggle principale
    const tForm = document.createElement('ha-form');
    tForm.hass = this._hass;
    tForm.data = { show_timezones: c.show_timezones === true };
    tForm.schema = [{ name: 'show_timezones', selector: { boolean: {} } }];
    tForm.computeLabel = () => this.t('show_timezones');
    tForm.addEventListener('value-changed', (e) => {
      const on = !!(e.detail.value && e.detail.value.show_timezones);
      this._set('show_timezones', on ? true : undefined);
      this._updateTzVisibility();
    });
    mount.appendChild(tForm);

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = this.t('tz_hint');
    mount.appendChild(hint);

    // tre slot fissi (label + tz IANA)
    const slots = document.createElement('div');
    slots.id = 'tz-slots';
    for (let i = 0; i < 2; i++) {
      const arr = Array.isArray(c.timezones) ? c.timezones : [];
      const z = arr[i] || {};
      const f = document.createElement('ha-form');
      f.hass = this._hass;
      f.data = { label: z.label || '', tz: z.tz || '', color: z.color };
      f.schema = [
        { type: 'grid', name: '', schema: [
          { name: 'tz', selector: { text: {} } },
          { name: 'label', selector: { text: {} } },
        ] },
        { name: 'color', selector: { ui_color: {} } },
      ];
      f.computeLabel = (s) => {
        if (s.name === 'tz') return this.t('tz_zone');
        if (s.name === 'label') return this.t('tz_place');
        return this.t('dial_color');
      };
      f.addEventListener('value-changed', (e) => {
        const v = e.detail.value || {};
        this._setTz(i, v.label, v.tz, v.color);
      });
      const slotWrap = document.createElement('div');
      slotWrap.className = 'tz-slot';
      const head = document.createElement('div');
      head.className = 'tz-slot-head';
      head.textContent = (this.t('tz_slot') || 'Zone') + ' ' + (i + 1);
      slotWrap.appendChild(head);
      slotWrap.appendChild(f);
      slots.appendChild(slotWrap);
    }
    mount.appendChild(slots);

    // disposizione come segmented control (bordino + viola tenue)
    this._segControl(mount, 'layout', [['row', 'lay_row'], ['split', 'lay_split']], 'row', 'layout');

    // stile del quadrante per i soli fusi (default: come il locale)
    const styleForm = document.createElement('ha-form');
    styleForm.hass = this._hass;
    styleForm.data = {
      show_seconds_tz: c.show_seconds_tz === true,
      tz_dial_detail: c.tz_dial_detail || 'inherit',
      tz_dial_markers: c.tz_dial_markers || 'inherit',
    };
    const selT = (opts) => ({ select: { mode: 'dropdown', options: opts } });
    styleForm.schema = [
      { name: 'show_seconds_tz', selector: { boolean: {} } },
      { name: 'tz_dial_detail', selector: selT([
        { value: 'inherit', label: this.t('opt_inherit') },
        { value: 'quarters', label: this.t('dd_quarters') },
        { value: 'hours', label: this.t('dd_hours') },
        { value: 'minutes', label: this.t('dd_minutes') },
      ]) },
      { name: 'tz_dial_markers', selector: selT([
        { value: 'inherit', label: this.t('opt_inherit') },
        { value: 'ticks', label: this.t('dm_ticks') },
        { value: 'dots', label: this.t('dm_dots') },
        { value: 'disc', label: this.t('dm_disc') },
        { value: 'numbers', label: this.t('dm_numbers') },
        { value: 'roman', label: this.t('dm_roman') },
        { value: 'none', label: this.t('dm_none') },
      ]) },
    ];
    styleForm.computeLabel = (s) => {
      if (s.name === 'show_seconds_tz') return this.t('tz_seconds');
      if (s.name === 'tz_dial_detail') return this.t('tz_detail');
      return this.t('tz_markers');
    };
    styleForm.addEventListener('value-changed', (e) => {
      const v = e.detail.value || {};
      this._set('show_seconds_tz', v.show_seconds_tz === true ? true : undefined);
      this._set('tz_dial_detail', (v.tz_dial_detail && v.tz_dial_detail !== 'inherit') ? v.tz_dial_detail : undefined);
      this._set('tz_dial_markers', (v.tz_dial_markers && v.tz_dial_markers !== 'inherit') ? v.tz_dial_markers : undefined);
    });
    slots.appendChild(styleForm);

    mount.dataset.filled = '1';
    this._updateTzVisibility();
  }

  _setTz(index, label, tz, color) {
    const arr = Array.isArray(this._config.timezones) ? this._config.timezones.slice() : [];
    while (arr.length < 3) arr.push({});
    // il fuso IANA non ha mai spazi: rimuovili (spazi normali e no-break) per
    // evitare che un copia-incolla "sporco" lo renda invalido. L'etichetta la trimmo solo ai bordi.
    const entry = { label: (label || '').trim(), tz: (tz || '').replace(/\s+/g, '') };
    if (Array.isArray(color) && color.length === 3) entry.color = color;
    else if (typeof color === 'string' && color.trim()) entry.color = color.trim();
    arr[index] = entry;
    // compatta: tieni solo gli slot con un fuso valorizzato
    const clean = arr.filter((z) => z && z.tz);
    if (clean.length) this._config.timezones = clean;
    else delete this._config.timezones;
    this._emit();
  }

  _updateTzVisibility() {
    const slots = this.shadowRoot && this.shadowRoot.getElementById('tz-slots');
    if (slots) slots.style.display = this._config.show_timezones ? '' : 'none';
  }

  _fillAppearanceForm() {
    if (!this.shadowRoot) return;
    const mount = this.shadowRoot.getElementById('appearance-form');
    if (!mount || mount.dataset.filled) return;
    const c = this._config;

    const form = document.createElement('ha-form');
    form.hass = this._hass;
    form.data = {
      transparent: c.transparent === true,
      background_image: c.background_image || '',
      background_css: c.background_css || '',
      light_text: c.light_text === true,
    };
    form.schema = [
      { name: 'transparent', selector: { boolean: {} } },
      { name: 'background_image', selector: { text: {} } },
      { name: 'background_css', selector: { text: {} } },
      { name: 'light_text', selector: { boolean: {} } },
    ];
    const labels = {
      transparent: this.t('transparent'),
      background_image: this.t('background_image'),
      background_css: this.t('background_css'),
      light_text: this.t('light_text'),
    };
    form.computeLabel = (s) => labels[s.name] || s.name;
    form.addEventListener('value-changed', (e) => {
      const v = e.detail.value || {};
      this._set('transparent', v.transparent === true ? true : undefined);
      this._set('background_image', v.background_image || undefined);
      this._set('background_css', v.background_css || undefined);
      this._set('light_text', v.light_text === true ? true : undefined);
      this._updateOverlayVisibility();
    });
    mount.appendChild(form);
    mount.dataset.filled = '1';
    this._updateOverlayVisibility();
  }

  _updateOverlayVisibility() {
    const row = this.shadowRoot && this.shadowRoot.getElementById('overlay-row');
    if (row) row.style.display = this._config.background_image ? '' : 'none';
  }

  _render() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    const c = this._config;

    this.shadowRoot.innerHTML = `
      <style>
        .editor { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px; }
        details.group {
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 8px; padding: 0 10px;
        }
        details.group[open] { padding-bottom: 10px; }
        summary {
          cursor: pointer; padding: 10px 4px; font-weight: 600;
          color: var(--primary-text-color); list-style: none;
        }
        summary::-webkit-details-marker { display: none; }
        summary::before { content: '\\25B8'; display: inline-block; margin-right: 8px; transition: transform 0.15s; color: var(--secondary-text-color); }
        details[open] > summary::before { transform: rotate(90deg); }
        .grp-body { display: flex; flex-direction: column; gap: 10px; padding: 4px 2px 2px; }
        .ctrl-block { margin-bottom: 4px; }
        .ctrl-block.ctrl-spaced { padding-top: 22px; }
        .ctrl-label { font-size: 0.85em; color: var(--secondary-text-color); margin: 0 0 6px 4px; }
        /* segmented control stile orologio: bordino, viola tenue, spazio sotto */
        .seg { display: flex; gap: 8px; margin-bottom: 18px; }
        .seg-btn {
          flex: 1; padding: 11px 8px; border-radius: 10px;
          border: 1px solid var(--divider-color, #d0d0d0);
          background: transparent; color: var(--primary-text-color);
          font-size: 1em; font-family: inherit; cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
        }
        .seg-btn.selected {
          background: rgba(var(--rgb-primary-color, 98, 0, 238), 0.12);
          border-color: var(--primary-color, #6200ee);
          color: var(--primary-color, #6200ee);
          font-weight: 600;
        }
        .hint { font-size: 0.78em; color: var(--secondary-text-color); margin: 2px 2px 0; }
        #tz-slots { display: flex; flex-direction: column; gap: 14px; margin-top: 6px; }
        .tz-slot {
          border: 1px solid var(--divider-color, #e0e0e0);
          border-radius: 10px; padding: 6px 10px 10px;
        }
        .tz-slot-head {
          font-size: 0.72em; font-weight: 600; letter-spacing: 0.4px;
          text-transform: uppercase; color: var(--secondary-text-color);
          margin: 2px 0 4px;
        }

        .ov-slider { position: relative; display: flex; align-items: center; }
        .ov-slider .ov-tick {
          position: absolute; left: 50%; top: 50%;
          width: 2px; height: 16px; transform: translate(-50%, -50%);
          background: var(--primary-text-color, #333); opacity: 0.55;
          border-radius: 1px; pointer-events: none; z-index: 2;
        }
        .ov-scale { display: flex; justify-content: space-between; font-size: 0.72em; color: var(--secondary-text-color); margin-top: 2px; }
        label.ov-label { font-size: 0.9em; color: var(--secondary-text-color); }
        input[type="range"]#background_overlay {
          -webkit-appearance: none; appearance: none;
          width: 100%; height: 8px; border-radius: 999px; padding: 0;
          border: 1px solid var(--divider-color, #ccc);
          background: linear-gradient(to right, #ffffff, #d9d9d9 50%, #000000);
          cursor: pointer;
        }
        input[type="range"]#background_overlay::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none;
          width: 18px; height: 18px; border-radius: 50%;
          background: var(--primary-color, #03a9f4);
          border: 2px solid #fff; box-shadow: 0 0 2px rgba(0,0,0,0.4);
        }
        input[type="range"]#background_overlay::-moz-range-thumb {
          width: 18px; height: 18px; border-radius: 50%;
          background: var(--primary-color, #03a9f4); border: 2px solid #fff;
        }
      </style>
      <div class="editor">
        <details class="group">
          <summary>${this.t('grp_clock')}</summary>
          <div class="grp-body"><div id="clock-form"></div></div>
        </details>
        <details class="group">
          <summary>${this.t('grp_dial')}</summary>
          <div class="grp-body"><div id="dial-form"></div></div>
        </details>
        <details class="group">
          <summary>${this.t('grp_datetime')}</summary>
          <div class="grp-body"><div id="datetime-form"></div></div>
        </details>
        <details class="group">
          <summary>${this.t('grp_timezones')}</summary>
          <div class="grp-body"><div id="timezones-form"></div></div>
        </details>
        <details class="group">
          <summary>${this.t('grp_appearance')}</summary>
          <div class="grp-body">
            <div id="appearance-form"></div>
            <div class="row" id="overlay-row">
              <label class="ov-label">${this.t('overlay')}</label>
              <div class="ov-slider">
                <span class="ov-tick"></span>
                <input type="range" id="background_overlay" min="-1" max="1" step="0.05" value="${c.background_overlay ?? 0}">
              </div>
              <div class="ov-scale"><span>${this.t('ov_light')}</span><span>${this.t('ov_dark')}</span></div>
            </div>
          </div>
        </details>
      </div>
    `;

    const ovInput = this.shadowRoot.getElementById('background_overlay');
    if (ovInput) ovInput.addEventListener('input', (e) => this._set('background_overlay', Number(e.target.value)));

    this._fillClockForm();
    this._fillDialForm();
    this._fillDatetimeForm();
    this._fillTimezonesForm();
    this._fillAppearanceForm();
  }
}

customElements.define('world-clock-card-editor', WorldClockCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'world-clock-card',
  name: 'World Clock Card',
  description: 'A digital or analog clock with date and world time zones.',
  preview: true,
});

console.info(
  '%c WORLD-CLOCK-CARD %c 1.0.0 ',
  'color: white; background: #3b7dd8; font-weight: 700;',
  'color: #3b7dd8; background: #1c1c1c; font-weight: 700;'
);
