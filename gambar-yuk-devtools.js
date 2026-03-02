// =============================================================================
// GambarYuk! — Developer Tools
// Cara pakai: buka DevTools (F12) → Console → ketik:
//
//   GambarYukDev.enable()         — aktifkan dev mode
//   GambarYukDev.disable()        — matikan dev mode
//   GambarYukDev.help()           — tampilkan semua command
//
// =============================================================================

(function () {
  'use strict';

  // ─── State internal dev tools ──────────────────────────────────────────────
  var DEV = {
    enabled: false,
    bots: [],          // array of bot objects
    botCount: 0,
    debugInterval: null,
    overlayEl: null,
    botWsPool: [],
    logHistory: [],
  };

  // ─── Warna untuk log console dev ──────────────────────────────────────────
  var C = {
    title:   'background:#e94560;color:#fff;font-weight:bold;padding:2px 6px;border-radius:4px',
    ok:      'color:#00b894;font-weight:bold',
    warn:    'color:#f5a623;font-weight:bold',
    info:    'color:#00cec9',
    muted:   'color:#636e72',
    bot:     'background:#a29bfe;color:#fff;font-weight:bold;padding:1px 5px;border-radius:3px',
  };

  function devLog(msg, style) {
    console.log('%c[GambarYukDev]%c ' + msg, C.title, style || C.info);
    DEV.logHistory.push('[' + new Date().toLocaleTimeString() + '] ' + msg);
    if (DEV.logHistory.length > 200) DEV.logHistory.shift();
  }

  // ─── HELP ─────────────────────────────────────────────────────────────────
  function printHelp() {
    console.log('%c GambarYuk! Developer Tools ', C.title);
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', C.muted);
    var cmds = [
      ['GambarYukDev.enable()',                       'Aktifkan dev mode + debug overlay'],
      ['GambarYukDev.disable()',                      'Matikan dev mode'],
      ['GambarYukDev.help()',                         'Tampilkan bantuan ini'],
      ['',                                             '── BOT COMMANDS ──'],
      ['GambarYukDev.addBot(name?)',                  'Tambah 1 bot ke room saat ini'],
      ['GambarYukDev.addBots(n)',                     'Tambah n bot sekaligus'],
      ['GambarYukDev.removeBot(name?)',               'Hapus bot tertentu / semua'],
      ['GambarYukDev.listBots()',                     'Lihat daftar bot aktif'],
      ['GambarYukDev.botsReady()',                    'Semua bot set ready'],
      ['GambarYukDev.botsGuess(word)',                'Paksa semua bot kirim tebakan'],
      ['GambarYukDev.botsAutoGuess(true/false)',      'Bot otomatis nebak random tiap 3-8 detik'],
      ['',                                             '── CHEAT COMMANDS ──'],
      ['GambarYukDev.setScore(name, score)',          'Set skor pemain (nama substring)'],
      ['GambarYukDev.addScore(name, amount)',         'Tambah poin ke pemain'],
      ['GambarYukDev.skipTimer()',                    'Skip sisa timer (kirim timeLeft=0)'],
      ['GambarYukDev.revealWord()',                   'Tampilkan kata yg digambar di console'],
      ['GambarYukDev.setWord(word)',                  'Paksa set kata sebagai drawer'],
      ['GambarYukDev.fillCanvas(color?)',             'Isi kanvas dengan warna'],
      ['GambarYukDev.clearCanvas()',                  'Bersihkan kanvas'],
      ['GambarYukDev.forceRoundEnd(reason?)',         'Paksa akhir ronde'],
      ['GambarYukDev.forceGameEnd()',                 'Paksa akhir game'],
      ['GambarYukDev.sendRaw(obj)',                   'Kirim pesan WebSocket raw'],
      ['',                                             '── DEBUG COMMANDS ──'],
      ['GambarYukDev.debugOverlay()',                 'Toggle overlay debug info'],
      ['GambarYukDev.dumpState()',                    'Print semua state ke console'],
      ['GambarYukDev.dumpPlayers()',                  'Print daftar pemain'],
      ['GambarYukDev.dumpLogs()',                     'Print log history dev tools'],
      ['GambarYukDev.pingTest(n?)',                   'Kirim n ping & ukur avg latency'],
      ['GambarYukDev.simulateLag(ms)',                'Simulasi lag lokal (0 = off)'],
      ['GambarYukDev.inspectCanvas()',                'Analisa konten kanvas'],
    ];
    cmds.forEach(function (r) {
      if (!r[0]) { console.log('%c' + r[1], 'color:#74b9ff;font-weight:bold'); return; }
      console.log('%c' + r[0] + '  %c' + r[1], 'color:#dfe6e9;font-family:monospace', C.muted);
    });
    console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', C.muted);
  }

  // ─── DEBUG OVERLAY ────────────────────────────────────────────────────────
  var OVERLAY_STYLE = [
    'position:fixed', 'top:8px', 'left:8px', 'z-index:99999',
    'background:rgba(10,10,25,0.92)', 'color:#00d2d3',
    'font:12px/1.6 monospace', 'padding:10px 14px', 'border-radius:10px',
    'border:1px solid rgba(0,210,211,0.35)', 'max-width:280px',
    'pointer-events:none', 'backdrop-filter:blur(4px)',
    'box-shadow:0 4px 20px rgba(0,0,0,0.6)',
  ].join(';');

  function createOverlay() {
    if (DEV.overlayEl) return;
    var el = document.createElement('div');
    el.id = '__dev_overlay__';
    el.style.cssText = OVERLAY_STYLE;
    document.body.appendChild(el);
    DEV.overlayEl = el;
  }

  function removeOverlay() {
    if (DEV.overlayEl) { DEV.overlayEl.remove(); DEV.overlayEl = null; }
    if (DEV.debugInterval) { clearInterval(DEV.debugInterval); DEV.debugInterval = null; }
  }

  function updateOverlay() {
    if (!DEV.overlayEl) return;
    var ws = window.ws;
    var wsState = ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][ws.readyState] : 'NO WS';
    var wsColor = ws && ws.readyState === 1 ? '#00b894' : '#e94560';

    var lines = [
      '<span style="color:#f5a623;font-weight:bold">🔧 DEV MODE</span>',
      '─────────────────',
      '<b>Room:</b> ' + (window.currentRoomId || '-'),
      '<b>My ID:</b> ' + (window.myClientId ? window.myClientId.slice(0,8)+'…' : '-'),
      '<b>Host:</b> ' + (window.hostId ? window.hostId.slice(0,8)+'…' : '-') + (window.myClientId === window.hostId ? ' <span style="color:#f5a623">(YOU)</span>' : ''),
      '<b>Phase:</b> <span style="color:#a29bfe">' + (window.gamePhase || '-') + '</span>',
      '<b>Drawer?</b> ' + (window.isDrawer ? '<span style="color:#00b894">✓ YA</span>' : '<span style="color:#636e72">tidak</span>'),
      '<b>Players:</b> ' + (window.players ? window.players.length : 0),
      '<b>Bots:</b> ' + DEV.bots.filter(function(b){return b.active;}).length,
      '<b>WS:</b> <span style="color:' + wsColor + '">' + wsState + '</span>',
      '<b>Ping:</b> ' + (window.pingMs >= 0 ? window.pingMs + 'ms' : '--'),
      '<b>Config:</b> ' + (window.gameConfig ? 'dt=' + window.gameConfig.drawTime + ' r=' + window.gameConfig.maxRounds + ' p=' + window.gameConfig.maxPlayers : '-'),
      '─────────────────',
      '<span style="color:#636e72;font-size:10px">GambarYukDev.help()</span>',
    ];
    DEV.overlayEl.innerHTML = lines.join('<br>');
  }

  function startOverlay() {
    createOverlay();
    updateOverlay();
    DEV.debugInterval = setInterval(updateOverlay, 500);
  }

  // ─── BOT SYSTEM ───────────────────────────────────────────────────────────
  var BOT_WORDS = ['kucing','anjing','gajah','pizza','mobil','rumah','pohon','bola','matahari','ikan'];
  var BOT_NAMES = ['Bot_Alfa','Bot_Beta','Bot_Gamma','Bot_Delta','Bot_Sigma','Bot_Omega','Bot_Zeta','Bot_Kappa'];

  function createBot(name) {
    var roomId = window.currentRoomId;
    if (!roomId) { devLog('Belum join room! Join dulu sebelum tambah bot.', C.warn); return null; }

    var serverUrl = window.SERVER_URL || 'https://mainyuk.secret5.workers.dev';
    var wsUrl = serverUrl.replace(/^http/, 'ws') + '/room/' + roomId;
    var botName = name || BOT_NAMES[DEV.botCount % BOT_NAMES.length] + '_' + (++DEV.botCount);

    var bot = {
      name: botName,
      ws: null,
      id: null,
      active: false,
      autoGuess: false,
      autoGuessTimer: null,
      score: 0,
    };

    try {
      bot.ws = new WebSocket(wsUrl);
    } catch(e) {
      devLog('Gagal buat WebSocket untuk ' + botName + ': ' + e.message, C.warn);
      return null;
    }

    bot.ws.onopen = function () {
      bot.active = true;
      bot.ws.send(JSON.stringify({ type: 'set_username', username: botName }));
      devLog('🤖 Bot ' + botName + ' terhubung ke room ' + roomId, C.ok);
    };

    bot.ws.onmessage = function (e) {
      var msg;
      try { msg = JSON.parse(e.data); } catch(_) { return; }

      if (msg.type === 'welcome') {
        bot.id = msg.clientId;
      }
      // Bot auto-ready jika sudah di lobby
      if (msg.type === 'game_cancelled' || msg.type === 'back_to_lobby') {
        setTimeout(function () {
          if (bot.active) {
            bot.ws.send(JSON.stringify({ type: 'set_ready', ready: true }));
          }
        }, 500);
      }
      // Bot juga bisa auto-guess saat round dimulai
      if (msg.type === 'round_start_guesser') {
        if (bot.autoGuess) startBotAutoGuess(bot);
      }
      if (msg.type === 'round_end' || msg.type === 'game_end') {
        stopBotAutoGuess(bot);
      }
      if (msg.type === 'correct_guess' && msg.clientId === bot.id) {
        devLog('🎉 Bot ' + bot.name + ' berhasil menebak!', C.ok);
      }
    };

    bot.ws.onclose = function () {
      bot.active = false;
      stopBotAutoGuess(bot);
      devLog('🤖 Bot ' + botName + ' terputus.', C.muted);
    };

    bot.ws.onerror = function (err) {
      devLog('❌ Bot ' + botName + ' error: ' + (err.message || 'unknown'), C.warn);
    };

    DEV.bots.push(bot);
    return bot;
  }

  function startBotAutoGuess(bot) {
    stopBotAutoGuess(bot);
    function guess() {
      if (!bot.active || !bot.autoGuess) return;
      var word = BOT_WORDS[Math.floor(Math.random() * BOT_WORDS.length)];
      try { bot.ws.send(JSON.stringify({ type: 'guess', text: word })); } catch(_) {}
      var delay = 3000 + Math.random() * 5000;
      bot.autoGuessTimer = setTimeout(guess, delay);
    }
    var initialDelay = 1000 + Math.random() * 3000;
    bot.autoGuessTimer = setTimeout(guess, initialDelay);
  }

  function stopBotAutoGuess(bot) {
    if (bot.autoGuessTimer) { clearTimeout(bot.autoGuessTimer); bot.autoGuessTimer = null; }
  }

  // ─── SIMULATED LAG ────────────────────────────────────────────────────────
  var _lagMs = 0;
  var _origSend = null;

  function applyLag(ms) {
    _lagMs = ms;
    if (ms > 0 && !_origSend) {
      _origSend = window.send;
      window.send = function (data) {
        setTimeout(function () { if (_origSend) _origSend(data); }, _lagMs); 
      };
      devLog('⏳ Simulasi lag ' + ms + 'ms aktif', C.warn);
    } else if (ms === 0 && _origSend) {
      window.send = _origSend;
      _origSend = null;
      devLog('✅ Simulasi lag dimatikan', C.ok);
    }
  }

  // ─── PING TEST ────────────────────────────────────────────────────────────
  function pingTest(n) {
    n = n || 5;
    var results = [];
    var count = 0;
    devLog('🏓 Mengirim ' + n + ' ping...', C.info);

    function doOnePing() {
      if (count >= n) {
        var avg = results.reduce(function(a,b){return a+b;},0) / results.length;
        var min = Math.min.apply(null, results);
        var max = Math.max.apply(null, results);
        devLog('📊 Ping results (' + n + 'x): avg=' + Math.round(avg) + 'ms  min=' + min + 'ms  max=' + max + 'ms', C.ok);
        return;
      }
      var start = Date.now();
      var ts = start;
      if (window.ws && window.ws.readyState === 1) {
        window.ws.send(JSON.stringify({ type: 'ping', timestamp: ts }));
        // Intercept pong
        var origHandler = window.ws.onmessage;
        var hooked = false;
        var origFn = window.ws.onmessage;
        var tempHook = function(e) {
          var d; try { d = JSON.parse(e.data); } catch(_) {}
          if (d && d.type === 'pong' && d.timestamp === ts && !hooked) {
            hooked = true;
            results.push(Date.now() - start);
            window.ws.onmessage = origFn;
            count++;
            setTimeout(doOnePing, 300);
          } else {
            if (origFn) origFn.call(window.ws, e);
          }
        };
        window.ws.onmessage = tempHook;
        // timeout jika tidak dapat pong
        setTimeout(function() {
          if (!hooked) {
            window.ws.onmessage = origFn;
            results.push(9999);
            count++;
            setTimeout(doOnePing, 300);
          }
        }, 3000);
      } else {
        devLog('WebSocket tidak terbuka.', C.warn);
      }
    }
    doOnePing();
  }

  // ─── CANVAS INSPECTOR ─────────────────────────────────────────────────────
  function inspectCanvas() {
    var canvas = document.getElementById('game-canvas');
    if (!canvas) { devLog('Canvas tidak ditemukan.', C.warn); return; }
    var ctx = canvas.getContext('2d');
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var whitePixels = 0, coloredPixels = 0;
    for (var i = 0; i < data.length; i += 4) {
      var r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if (a < 10) { whitePixels++; continue; }
      if (r > 240 && g > 240 && b > 240) whitePixels++;
      else coloredPixels++;
    }
    var total = canvas.width * canvas.height;
    var pct = ((coloredPixels / total) * 100).toFixed(1);
    console.log('%c[GambarYukDev] 🖼 Canvas Inspector', C.title);
    console.log('  Ukuran logical:', canvas.width + 'x' + canvas.height);
    console.log('  Ukuran display:', canvas.style.width + ' x ' + canvas.style.height);
    console.log('  Total pixel   :', total);
    console.log('  Pixel berwarna:', coloredPixels, '(' + pct + '%)');
    console.log('  Pixel putih   :', whitePixels);
    console.log('  Kesimpulan    :', pct > 5 ? '🎨 Ada gambar di kanvas' : '📄 Kanvas sebagian besar kosong');
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────────────
  var API = {

    enable: function () {
      DEV.enabled = true;
      startOverlay();
      devLog('✅ Developer Mode AKTIF. Ketik GambarYukDev.help() untuk daftar command.', C.ok);
      console.log('%c💡 Tip: GambarYukDev.addBots(2) untuk langsung tambah 2 bot!', C.info);
    },

    disable: function () {
      DEV.enabled = false;
      removeOverlay();
      // Cabut lag jika ada
      if (_origSend) applyLag(0);
      devLog('Developer Mode dimatikan.', C.muted);
    },

    help: printHelp,

    // ── BOT ──
    addBot: function (name) {
      var bot = createBot(name);
      if (bot) devLog('🤖 Bot "' + bot.name + '" ditambahkan. Gunakan botsReady() agar bot siap.', C.ok);
      return bot;
    },

    addBots: function (n) {
      n = parseInt(n) || 1;
      var added = 0;
      for (var i = 0; i < n; i++) {
        if (createBot()) added++;
      }
      devLog('🤖 ' + added + ' bot ditambahkan.', C.ok);
      console.log('%c  Gunakan: GambarYukDev.botsReady() agar bot langsung ready!', C.info);
    },

    removeBot: function (name) {
      if (!name) {
        DEV.bots.forEach(function(b) {
          try { if (b.ws) b.ws.close(); } catch(_) {}
          b.active = false;
        });
        DEV.bots = [];
        devLog('🗑 Semua bot dihapus.', C.ok);
      } else {
        var found = false;
        DEV.bots = DEV.bots.filter(function(b) {
          if (b.name.toLowerCase().includes(name.toLowerCase())) {
            try { if (b.ws) b.ws.close(); } catch(_) {}
            found = true; return false;
          }
          return true;
        });
        devLog(found ? '🗑 Bot "' + name + '" dihapus.' : 'Bot tidak ditemukan: ' + name, found ? C.ok : C.warn);
      }
    },

    listBots: function () {
      var active = DEV.bots.filter(function(b){return b.active;});
      if (active.length === 0) { devLog('Tidak ada bot aktif.', C.muted); return; }
      console.log('%c[GambarYukDev] 🤖 Bot Aktif (' + active.length + '):', C.title);
      active.forEach(function(b) {
        console.log('  %c' + b.name + '%c  id=' + (b.id ? b.id.slice(0,8) : '-') + '  autoGuess=' + b.autoGuess, C.bot, C.muted);
      });
    },

    botsReady: function () {
      var count = 0;
      DEV.bots.forEach(function(b) {
        if (b.active && b.ws && b.ws.readyState === 1) {
          b.ws.send(JSON.stringify({ type: 'set_ready', ready: true }));
          count++;
        }
      });
      devLog('✅ ' + count + ' bot di-set ready.', C.ok);
    },

    botsGuess: function (word) {
      word = word || BOT_WORDS[Math.floor(Math.random() * BOT_WORDS.length)];
      var count = 0;
      DEV.bots.forEach(function(b) {
        if (b.active && b.ws && b.ws.readyState === 1) {
          b.ws.send(JSON.stringify({ type: 'guess', text: word }));
          count++;
        }
      });
      devLog('💬 ' + count + ' bot mengirim tebakan: "' + word + '"', C.ok);
    },

    botsAutoGuess: function (state) {
      DEV.bots.forEach(function(b) {
        b.autoGuess = !!state;
        if (state) startBotAutoGuess(b);
        else stopBotAutoGuess(b);
      });
      devLog('🎯 Auto-guess bot: ' + (state ? 'AKTIF' : 'MATI'), state ? C.ok : C.muted);
    },

    // ── CHEAT ──
    setScore: function (name, score) {
      var players = window.players || [];
      var p = players.find(function(p){ return p.username.toLowerCase().includes(name.toLowerCase()); });
      if (!p) { devLog('Pemain tidak ditemukan: ' + name, C.warn); return; }
      p.score = parseInt(score) || 0;
      if (window.renderScoreStrip) window.renderScoreStrip();
      devLog('💰 Skor ' + p.username + ' di-set ke ' + p.score + ' (lokal saja)', C.ok);
      console.log('%c  ⚠️ Perubahan skor ini hanya lokal, tidak terkirim ke server.', C.warn);
    },

    addScore: function (name, amount) {
      var players = window.players || [];
      var p = players.find(function(p){ return p.username.toLowerCase().includes(name.toLowerCase()); });
      if (!p) { devLog('Pemain tidak ditemukan: ' + name, C.warn); return; }
      p.score = (p.score || 0) + (parseInt(amount) || 0);
      if (window.renderScoreStrip) window.renderScoreStrip();
      devLog('💰 +' + amount + ' poin ke ' + p.username + ' → total ' + p.score + ' (lokal)', C.ok);
    },

    skipTimer: function () {
      if (!window.ws || window.ws.readyState !== 1) { devLog('Tidak terhubung ke server.', C.warn); return; }
      // Simulate timer reaching 0 locally for UI
      if (window.updateTimer) window.updateTimer(0);
      devLog('⏭ Timer di-skip (visual saja, server tetap jalan).', C.warn);
      console.log('%c  Tip: Untuk end ronde, gunakan GambarYukDev.forceRoundEnd()', C.info);
    },

    revealWord: function () {
      if (window.currentWord) {
        console.log('%c[GambarYukDev] 🔍 Kata saat ini: %c' + window.currentWord, C.title, 'color:#f5a623;font-size:16px;font-weight:bold');
      } else {
        devLog('Kata belum di-set atau kamu bukan drawer.', C.muted);
      }
    },

    setWord: function (word) {
      if (!window.isDrawer) { devLog('Kamu bukan drawer!', C.warn); return; }
      if (!word) { devLog('Masukkan kata!', C.warn); return; }
      if (window.send) window.send({ type: 'set_word', word: word });
      devLog('✏️ Kata di-set ke: ' + word, C.ok);
    },

    fillCanvas: function (color) {
      var canvas = document.getElementById('game-canvas');
      if (!canvas) { devLog('Canvas tidak ditemukan.', C.warn); return; }
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = color || '#ff4444';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      devLog('🎨 Kanvas diisi warna: ' + (color || '#ff4444'), C.ok);
    },

    clearCanvas: function () {
      if (window.clearCanvas) { window.clearCanvas(); devLog('🗑 Kanvas dibersihkan.', C.ok); }
      else devLog('clearCanvas tidak tersedia.', C.warn);
    },

    forceRoundEnd: function (reason) {
      reason = reason || 'time_up';
      // Simulate round_end locally
      if (window.showRoundEnd) {
        window.showRoundEnd({ reason: reason, word: window.currentWord || '(dev)', scores: window.players ? window.players.map(function(p){return{clientId:p.clientId,username:p.username,score:p.score||0};}) : [] });
        devLog('⏹ Round end disimulasikan: ' + reason, C.ok);
      }
    },

    forceGameEnd: function () {
      if (window.showGameEnd) {
        var scores = (window.players || []).map(function(p){return{clientId:p.clientId,username:p.username,score:p.score||0};});
        scores.sort(function(a,b){return b.score-a.score;});
        window.showGameEnd({ scores: scores, winner: scores[0] ? scores[0].username : 'Unknown' });
        devLog('🏁 Game end disimulasikan.', C.ok);
      }
    },

    sendRaw: function (obj) {
      if (!window.ws || window.ws.readyState !== 1) { devLog('WebSocket tidak terbuka.', C.warn); return; }
      var json = JSON.stringify(obj);
      window.ws.send(json);
      devLog('📤 Raw message terkirim: ' + json, C.ok);
    },

    // ── DEBUG ──
    debugOverlay: function () {
      if (DEV.overlayEl) { removeOverlay(); devLog('🔲 Debug overlay dimatikan.', C.muted); }
      else { startOverlay(); devLog('🔲 Debug overlay aktif.', C.ok); }
    },

    dumpState: function () {
      console.log('%c[GambarYukDev] 📋 Game State Dump', C.title);
      console.log({
        myClientId:    window.myClientId,
        myUsername:    window.myUsername,
        currentRoomId: window.currentRoomId,
        hostId:        window.hostId,
        isDrawer:      window.isDrawer,
        isReady:       window.isReady,
        gamePhase:     window.gamePhase,
        gameConfig:    window.gameConfig,
        currentWord:   window.currentWord,
        players:       window.players,
        pingMs:        window.pingMs,
        wsState:       window.ws ? ['CONNECTING','OPEN','CLOSING','CLOSED'][window.ws.readyState] : 'N/A',
        activeBots:    DEV.bots.filter(function(b){return b.active;}).length,
      });
    },

    dumpPlayers: function () {
      var players = window.players || [];
      console.log('%c[GambarYukDev] 👥 Pemain Aktif (' + players.length + '):', C.title);
      players.forEach(function(p, i) {
        var isMe = p.clientId === window.myClientId;
        var isHost = p.clientId === window.hostId;
        var flags = [isMe ? 'YOU' : '', isHost ? 'HOST' : '', p.isReady ? 'READY' : ''].filter(Boolean).join('/');
        console.log('  ' + (i+1) + '. %c' + p.username + '%c  id=' + p.clientId.slice(0,8) + '  score=' + (p.score||0) + '  [' + flags + ']',
          'color:#dfe6e9;font-weight:bold', C.muted);
      });
    },

    dumpLogs: function () {
      console.log('%c[GambarYukDev] 📜 Log History (' + DEV.logHistory.length + ' entri):', C.title);
      DEV.logHistory.forEach(function(l){ console.log('%c' + l, C.muted); });
    },

    pingTest: pingTest,

    simulateLag: function (ms) { applyLag(parseInt(ms) || 0); },

    inspectCanvas: inspectCanvas,
  };

  // ─── Expose ke window ─────────────────────────────────────────────────────
  window.GambarYukDev = API;

  // ─── Pesan sambutan di console ────────────────────────────────────────────
  console.log(
    '%c GambarYuk! Dev Tools Loaded ',
    'background:linear-gradient(135deg,#e94560,#f5a623);color:#fff;font-size:13px;font-weight:bold;padding:4px 10px;border-radius:6px'
  );
  console.log('%c Ketik %cGambarYukDev.enable()%c untuk aktifkan dev mode, atau %cGambarYukDev.help()%c untuk daftar command.',
    C.muted, 'color:#00d2d3;font-weight:bold', C.muted, 'color:#00d2d3;font-weight:bold', C.muted);

})();
