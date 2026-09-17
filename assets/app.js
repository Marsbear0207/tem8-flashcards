/* 专八喵喵学习卡 — 交互逻辑 */
(function () {
  "use strict";

  var WORDS = window.WORDS || [];
  var STORE_KEY = "tem8.meow.mastered";
  var SOUND_KEY = "tem8.meow.sound";

  /* ---------- 状态 ---------- */
  var mastered = loadJSON(STORE_KEY, {});
  var soundOn = loadJSON(SOUND_KEY, true);
  var deck = [];        // 当前牌堆（WORDS 索引数组）
  var cursor = 0;
  var flipped = false;
  var filters = { letter: "ALL", level: "ALL", q: "" };
  var REDUCE_MOTION = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function loadJSON(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  /* ---------- 元素 ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var elCard = $("card");
  var elWord = $("cardWord");
  var elPhon = $("cardPhon");
  var elLevel = $("cardLevel");
  var elMarkFront = $("cardMarkFront");
  var elBackWord = $("backWord");
  var elBackPhon = $("backPhon");
  var elBackPos = $("backPos");
  var elBackDef = $("backDef");
  var elBackCol = $("backCol");
  var elBackEn = $("backEn");
  var elBackZh = $("backZh");
  var elBtnKnow = $("btnKnow");
  var elCounter = $("counter");
  var elProgressText = $("progressText");
  var elProgressFill = $("progressFill");
  var elEmpty = $("emptyState");
  var elStage = $("cardStage");
  var elCardPrev = $("cardPrev");
  var elCardNext = $("cardNext");
  var elFilterLetter = $("filterLetter");
  var elFilterLevel = $("filterLevel");
  var elSearch = $("searchInput");
  var elSoundBtn = $("soundToggle");

  /* ---------- 猫叫音效（Web Audio 合成，无外部依赖） ---------- */
  var audioCtx = null;
  function playMeow() {
    if (!soundOn) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      var t = audioCtx.currentTime;

      // 主音高：先升后降的“喵”曲线
      var osc = audioCtx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(420, t);
      osc.frequency.exponentialRampToValueAtTime(880, t + 0.14);
      osc.frequency.exponentialRampToValueAtTime(760, t + 0.30);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.52);

      // 颤音
      var lfo = audioCtx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 7;
      var lfoGain = audioCtx.createGain();
      lfoGain.gain.value = 22;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      // 柔和滤波
      var filter = audioCtx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1600, t);
      filter.frequency.exponentialRampToValueAtTime(900, t + 0.52);
      filter.Q.value = 2;

      // 音量包络
      var gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.06);
      gain.gain.setValueAtTime(0.22, t + 0.34);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t); lfo.start(t);
      osc.stop(t + 0.62); lfo.stop(t + 0.62);
    } catch (e) { /* 静默失败不影响翻卡 */ }
  }

  /* ---------- 橘猫泡泡飘浮动效 ---------- */
  var CAT_IMG = '<img src="assets/cat-flip-action-512.jpg" alt="" aria-hidden="true">';

  var STAR_SVG =
    '<svg viewBox="0 0 20 20" aria-hidden="true">' +
    '<path d="M10 1 L12.2 6.8 L18.4 7.3 L13.7 11.3 L15.2 17.4 L10 14.1 L4.8 17.4 L6.3 11.3 L1.6 7.3 L7.8 6.8 Z" fill="#F0B23E"/>' +
    "</svg>";

  /* 落地冲击波 + 闪光：翻面打击感 */
  function spawnHitFx() {
    if (!elStage) return;
    if (REDUCE_MOTION) return;
    var ring = document.createElement("span");
    ring.className = "hit-ring";
    var flash = document.createElement("span");
    flash.className = "hit-flash";
    elStage.appendChild(ring);
    elStage.appendChild(flash);
    setTimeout(function () { ring.remove(); flash.remove(); }, 800);
  }

  function spawnFloatCat() {
    if (!elStage) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var wrap = document.createElement("div");
    wrap.className = "float-cat";
    // 本体：仰卧拍泡泡的橘猫，装进气泡里上浮飘散
    var inner = document.createElement("div");
    inner.className = "float-cat__inner";
    inner.innerHTML = CAT_IMG;
    wrap.appendChild(inner);
    // 周围小泡泡：各自延迟升起，到顶「啵」地破掉
    for (var i = 1; i <= 4; i++) {
      var bub = document.createElement("span");
      bub.className = "float-cat__bubble float-cat__bubble--b" + i;
      wrap.appendChild(bub);
    }
    // 泡泡破裂处的星星闪光
    for (var j = 1; j <= 2; j++) {
      var star = document.createElement("span");
      star.className = "float-cat__star float-cat__star--s" + j;
      star.innerHTML = STAR_SVG;
      wrap.appendChild(star);
    }
    elStage.appendChild(wrap);
    setTimeout(function () { wrap.remove(); }, 2100);
  }

  /* ---------- 牌堆 ---------- */
  function rebuildDeck() {
    var q = filters.q.trim().toLowerCase();
    deck = [];
    for (var i = 0; i < WORDS.length; i++) {
      var w = WORDS[i];
      if (filters.letter !== "ALL" && w.w.charAt(0).toUpperCase() !== filters.letter) continue;
      if (filters.level !== "ALL" && String(w.lv) !== filters.level) continue;
      if (q && w.w.toLowerCase().indexOf(q) === -1 && w.def.indexOf(q) === -1) continue;
      deck.push(i);
    }
    cursor = 0;
    setFlipped(false, true);
    render();
  }

  function shuffleDeck() {
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
    }
    cursor = 0;
    setFlipped(false, true);
    render(true);
  }

  function current() {
    return deck.length ? WORDS[deck[cursor]] : null;
  }

  function setFlipped(v, instant) {
    flipped = v;
    if (!elCard) return;
    elCard.classList.remove("flip-to-back", "flip-to-front");
    if (instant || REDUCE_MOTION) {
      elCard.classList.toggle("flipped", v);
      return;
    }
    // 游戏式翻面：播关键帧动画，animationend 时落到稳定状态
    elCard.classList.remove("flipped");
    void elCard.offsetWidth;
    elCard.classList.add(v ? "flip-to-back" : "flip-to-front");
  }

  if (elCard) {
    elCard.addEventListener("animationend", function (e) {
      if (e.animationName === "flipToBack") {
        elCard.classList.remove("flip-to-back");
        elCard.classList.add("flipped");
      } else if (e.animationName === "flipToFront") {
        elCard.classList.remove("flip-to-front");
      }
    });
  }

  /* ---------- 渲染 ---------- */
  function stars(lv) {
    var s = "";
    for (var i = 1; i <= 3; i++) s += i <= lv ? "★" : "☆";
    return s;
  }

  function render(announce) {
    var w = current();
    var has = !!w;
    if (elEmpty) elEmpty.hidden = has;
    if (elCard) elCard.parentElement.style.visibility = has ? "visible" : "hidden";
    if (!w) {
      if (elCounter) elCounter.textContent = "0 / 0";
      renderProgress();
      return;
    }
    var isMastered = !!mastered[w.w];

    if (elWord) elWord.textContent = w.w;
    if (elPhon) elPhon.textContent = w.ph;
    if (elLevel) elLevel.innerHTML = '<span class="stars stars--' + w.lv + '">' + stars(w.lv) + "</span>";
    if (elMarkFront) {
      elMarkFront.classList.toggle("is-on", isMastered);
      elMarkFront.textContent = isMastered ? "✓ 已掌握" : "未掌握";
    }

    if (elBackWord) elBackWord.textContent = w.w;
    if (elBackPhon) elBackPhon.textContent = w.ph;
    if (elBackPos) elBackPos.textContent = w.pos;
    if (elBackDef) elBackDef.textContent = w.def;
    if (elBackCol) {
      elBackCol.innerHTML = "";
      w.col.forEach(function (c) {
        var li = document.createElement("li");
        li.textContent = c;
        elBackCol.appendChild(li);
      });
    }
    if (elBackEn) elBackEn.textContent = w.en;
    if (elBackZh) elBackZh.textContent = w.zh;

    if (elBtnKnow) {
      elBtnKnow.textContent = isMastered ? "✓ 已掌握（点击取消）" : "标记为已掌握";
      elBtnKnow.classList.toggle("is-mastered", isMastered);
      elBtnKnow.setAttribute("aria-pressed", isMastered ? "true" : "false");
    }
    if (elCounter) elCounter.textContent = (cursor + 1) + " / " + deck.length;
    renderSide(elCardPrev, peek(-1));
    renderSide(elCardNext, peek(1));
    renderProgress();

    if (announce && elCounter) {
      elCounter.setAttribute("aria-label", "当前第 " + (cursor + 1) + " 张，共 " + deck.length + " 张");
    }
  }

  /* 两侧预览小卡：取上/下一个单词并渲染 */
  function peek(delta) {
    if (deck.length < 2) return null;
    return WORDS[deck[(cursor + delta + deck.length) % deck.length]];
  }

  function renderSide(el, w) {
    if (!el) return;
    if (!w) { el.style.visibility = "hidden"; return; }
    el.style.visibility = "visible";
    var isM = !!mastered[w.w];
    var elW = el.querySelector(".side__word");
    var elP = el.querySelector(".side__phon");
    var elL = el.querySelector(".side__level");
    var elM = el.querySelector(".side__mark");
    if (elW) elW.textContent = w.w;
    if (elP) elP.textContent = w.ph;
    if (elL) elL.innerHTML = '<span class="stars stars--' + w.lv + '">' + stars(w.lv) + "</span>";
    if (elM) {
      elM.classList.toggle("is-on", isM);
      elM.textContent = isM ? "✓ 已掌握" : "未掌握";
    }
  }

  function renderProgress() {
    var total = WORDS.length;
    var done = 0;
    WORDS.forEach(function (w) { if (mastered[w.w]) done++; });
    var pct = total ? Math.round((done / total) * 100) : 0;
    if (elProgressText) elProgressText.textContent = "已掌握 " + done + " / " + total + "（" + pct + "%）";
    if (elProgressFill) elProgressFill.style.width = pct + "%";
  }

  /* ---------- 交互 ---------- */
  function flipCard() {
    if (!current()) return;
    setFlipped(!flipped);
    if (flipped) {
      playMeow();
      // 与落地帧同步：400ms 后爆发冲击波 + 猫咪弹出
      setTimeout(function () {
        if (!flipped) return;
        spawnHitFx();
        spawnFloatCat();
      }, 400);
    }
  }

  var switchTimer = null;
  function animateSwitch() {
    if (!elStage) return;
    clearTimeout(switchTimer);
    elStage.classList.remove("is-switching");
    void elStage.offsetWidth; // 重置动画
    elStage.classList.add("is-switching");
    switchTimer = setTimeout(function () { elStage.classList.remove("is-switching"); }, 380);
  }

  function go(delta) {
    if (!deck.length) return;
    cursor = (cursor + delta + deck.length) % deck.length;
    setFlipped(false, true);
    animateSwitch();
    render(true);
  }

  function toggleMastered() {
    var w = current();
    if (!w) return;
    if (mastered[w.w]) delete mastered[w.w]; else mastered[w.w] = true;
    save(STORE_KEY, mastered);
    render();
  }

  function bind() {
    if (elCard) {
      elCard.addEventListener("click", function (e) {
        if (e.target.closest("button")) return; // 按钮不触发翻面
        flipCard();
      });
    }
    var prev = $("btnPrev"), next = $("btnNext"), flip = $("btnFlip"), shuffle = $("btnShuffle");
    if (prev) prev.addEventListener("click", function () { go(-1); });
    if (next) next.addEventListener("click", function () { go(1); });
    if (flip) flip.addEventListener("click", flipCard);
    if (shuffle) shuffle.addEventListener("click", shuffleDeck);
    if (elBtnKnow) elBtnKnow.addEventListener("click", toggleMastered);
    if (elCardPrev) elCardPrev.addEventListener("click", function () { go(-1); });
    if (elCardNext) elCardNext.addEventListener("click", function () { go(1); });

    if (elFilterLetter) elFilterLetter.addEventListener("change", function () {
      filters.letter = this.value; rebuildDeck();
    });
    if (elFilterLevel) elFilterLevel.addEventListener("change", function () {
      filters.level = this.value; rebuildDeck();
    });
    if (elSearch) {
      var timer = null;
      elSearch.addEventListener("input", function () {
        var v = this.value;
        clearTimeout(timer);
        timer = setTimeout(function () { filters.q = v; rebuildDeck(); }, 200);
      });
    }
    if (elSoundBtn) {
      renderSoundBtn();
      elSoundBtn.addEventListener("click", function () {
        soundOn = !soundOn;
        save(SOUND_KEY, soundOn);
        renderSoundBtn();
        if (soundOn) playMeow();
      });
    }

    document.addEventListener("keydown", function (e) {
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
      if (e.code === "Space") {
        if (e.target && e.target.tagName === "BUTTON") return; // 按钮自带空格触发
        e.preventDefault(); flipCard();
      }
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "m" || e.key === "M") toggleMastered();
    });
  }

  function renderSoundBtn() {
    if (!elSoundBtn) return;
    elSoundBtn.textContent = soundOn ? "音效：开" : "音效：关";
    elSoundBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
  }

  /* ---------- 字母筛选选项 ---------- */
  function buildLetterOptions() {
    if (!elFilterLetter) return;
    var letters = {};
    WORDS.forEach(function (w) { letters[w.w.charAt(0).toUpperCase()] = true; });
    Object.keys(letters).sort().forEach(function (L) {
      var opt = document.createElement("option");
      opt.value = L; opt.textContent = L;
      elFilterLetter.appendChild(opt);
    });
  }

  buildLetterOptions();
  bind();
  rebuildDeck();
})();
