import { db } from './firebase.js';
import { doc, getDoc, updateDoc, increment, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const params = new URLSearchParams(window.location.search);
const gameId = params.get('id');
const charId = params.get('charId');
const auth = getAuth();

let game = null;
let state = [];
let customVarState = {};
let flags = [];
let lastDiceResult = null;
let currentUser = null;
let timerInterval = null;
let trpgChar = null;

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (charId && user) {
    try {
      const charSnap = await getDoc(doc(db, 'trpg_characters', charId));
      if (charSnap.exists()) trpgChar = { id: charSnap.id, ...charSnap.data() };
    } catch(e) {}
  }
});

async function init() {
  try {
    const docRef = doc(db, 'games', gameId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      document.getElementById('scene-text').textContent = 'ゲームが見つかりません';
      return;
    }
    game = { id: docSnap.id, ...docSnap.data() };
    document.getElementById('game-title-display').textContent = game.title;
    state = JSON.parse(JSON.stringify(game.libraries || []));

    if (game.customVars) {
      game.customVars.forEach(v => { customVarState[v.name] = v.value; });
    }

    await updateDoc(docRef, { playCount: increment(1) });

    if (currentUser) {
      await addDoc(collection(db, 'playHistory'), {
        uid: currentUser.uid, gameId: game.id,
        gameTitle: game.title, playedAt: new Date().toISOString()
      });
    }

    if (trpgChar) renderTrpgHud();
    showScene('scene1');
  } catch (e) {
    document.getElementById('scene-text').textContent = 'エラー：' + e.message;
  }
}

function renderTrpgHud() {
  const hud = document.getElementById('trpg-hud');
  if (!hud || !trpgChar) return;
  hud.style.display = 'block';
  const stats = trpgChar.stats || {};
  const statsHTML = Object.entries(stats).map(([k, v]) =>
    '<span class="hud-stat"><b>' + k + '</b> ' + v + '</span>'
  ).join('');
  const inventory = (trpgChar.inventory || []);
  const invHTML = inventory.length > 0
    ? inventory.map(i => '<span class="game-tag">' + i + '</span>').join('')
    : '<span style="color:#aaa;font-size:12px">なし</span>';
  hud.innerHTML =
    '<div class="hud-header">' +
    (trpgChar.icon ? '<img src="' + trpgChar.icon + '" class="hud-icon">' : '<div class="hud-icon-placeholder"></div>') +
    '<span class="hud-name">' + trpgChar.name + '</span>' +
    '</div>' +
    '<div class="hud-stats">' + statsHTML + '</div>' +
    '<div class="hud-inventory"><b>アイテム：</b>' + invHTML + '</div>';
}

function resolveText(text) {
  return text.replace(/\{([^}]+)\}/g, (match, name) => {
    const trimmed = name.trim();
    if (customVarState[trimmed] !== undefined) return customVarState[trimmed];
    if (trpgChar && trpgChar.stats && trpgChar.stats[trimmed] !== undefined) return trpgChar.stats[trimmed];
    const lib = state.find(l => l.name === trimmed);
    if (!lib) return match;
    if (lib.type === 'affection') {
      let hearts = '';
      for (let j = 0; j < lib.max; j++) hearts += j < lib.value ? '❤' : '♡';
      return hearts;
    }
    if (lib.type === 'saikoro') {
      return lib.results && lib.results.length > 0
        ? lib.results.map(r => '[' + r + ']').join(' ') + '（合計:' + lib.results.reduce((a,b)=>a+b,0) + '）'
        : '（未振）';
    }
    if (lib.type === 'dice') return lib.result !== null ? String(lib.result) : '（未振）';
    if (lib.type === 'money' || lib.type === 'time') return lib.value + (lib.unit || '');
    if (lib.type === 'hp' || lib.type === 'mp') return lib.value + '/' + lib.max;
    if (lib.type === 'flag') return lib.value ? 'ON' : 'OFF';
    if (lib.type === 'status') return lib.value;
    if (lib.type === 'inventory') return lib.items ? lib.items.join('・') : 'なし';
    if (lib.type === 'character') return lib.charName;
    return lib.value !== undefined ? String(lib.value) : match;
  });
}

function showScene(sceneId) {
  const scene = game.story[sceneId];
  if (!scene) return;

  const conditions = scene.sceneConditions || [];
  if (conditions.length > 0) {
    const mode = scene.sceneConditionMode || 'all';
    const results = conditions.map(cond => {
      if (cond.type === 'flag') return flags.includes(cond.tag);
      if (cond.type === 'var') {
        const val = customVarState[cond.varName];
        return val !== undefined && val >= cond.varMin;
      }
      return true;
    });
    const pass = mode === 'all' ? results.every(r => r) : results.some(r => r);
    if (!pass && scene.sceneConditionFail && game.story[scene.sceneConditionFail]) {
      showScene(scene.sceneConditionFail); return;
    }
  }

  document.getElementById('scene-title-display').textContent = scene.title || '';
  document.getElementById('scene-text').innerHTML = resolveText(scene.text).replace(/\n/g, '<br>');

  // 背景画像
  const bg = document.getElementById('scene-bg');
  if (bg) {
    if (scene.background) {
      bg.style.backgroundImage = 'url(' + scene.background + ')';
      bg.style.backgroundSize = 'cover';
      bg.style.backgroundPosition = 'center';
    } else {
      bg.style.backgroundImage = '';
    }
  }

  renderStatus();
  renderButtons(scene);
  startTimers();

  // 死亡シーンチェック
  if (scene.isDeath && trpgChar && charId) {
    killCharacter();
  }
}

async function killCharacter() {
  try {
    await updateDoc(doc(db, 'trpg_characters', charId), { isAlive: false, inventory: [] });
    trpgChar.isAlive = false;
    trpgChar.inventory = [];
    const hud = document.getElementById('trpg-hud');
    if (hud) {
      const deadMsg = document.createElement('div');
      deadMsg.className = 'hud-dead-msg';
      deadMsg.textContent = '💀 このキャラクターはロストしました';
      hud.appendChild(deadMsg);
    }
  } catch(e) { console.log(e); }
}

async function acquireItem(itemName) {
  if (!trpgChar || !charId) return;
  const inventory = trpgChar.inventory || [];
  if (inventory.includes(itemName)) return;
  inventory.push(itemName);
  trpgChar.inventory = inventory;
  try {
    await updateDoc(doc(db, 'trpg_characters', charId), { inventory });
    renderTrpgHud();
  } catch(e) {}
}

async function consumeItem(itemName) {
  if (!trpgChar || !charId) return false;
  const inventory = trpgChar.inventory || [];
  const idx = inventory.indexOf(itemName);
  if (idx === -1) return false;
  inventory.splice(idx, 1);
  trpgChar.inventory = inventory;
  try {
    await updateDoc(doc(db, 'trpg_characters', charId), { inventory });
    renderTrpgHud();
  } catch(e) {}
  return true;
}

function renderStatus() {
  const bar = document.getElementById('status-bar');
  bar.innerHTML = '';

  state.forEach((lib, i) => {
    if (lib.type === 'character') {
      const charDiv = document.createElement('div');
      charDiv.className = 'character-display';
      charDiv.innerHTML = lib.image
        ? '<img src="' + lib.image + '" class="char-img" alt="' + lib.charName + '"><div class="char-name">' + lib.charName + '</div>'
        : '<div class="char-placeholder"></div><div class="char-name">' + lib.charName + '</div>';
      bar.appendChild(charDiv); return;
    }

    const div = document.createElement('div');
    div.className = 'status-item';

    if (lib.type === 'affection') {
      let hearts = '';
      for (let j = 0; j < lib.max; j++) hearts += j < lib.value ? '❤' : '♡';
      div.innerHTML = '<span class="status-name">' + lib.name + '</span><span class="status-hearts">' + hearts + '</span>';
    } else if (lib.type === 'dice') {
      div.innerHTML = '<span class="status-name">' + lib.name + '</span>' +
        '<button class="dice-btn" onclick="rollDice(' + i + ')">振る</button>' +
        (lib.result !== null ? '<span class="dice-result">→ ' + lib.result + '</span>' : '');
    } else if (lib.type === 'saikoro') {
      const diceDisplay = lib.results && lib.results.length > 0
        ? lib.results.map(r => '[' + r + ']').join(' ') + ' 合計:' + lib.results.reduce((a,b)=>a+b,0) : '';
      div.innerHTML = '<span class="status-name">' + lib.name + '</span>' +
        '<button class="dice-btn" onclick="rollSaikoro(' + i + ')">振る</button>' +
        (diceDisplay ? '<span class="dice-result">→ ' + diceDisplay + '</span>' : '');
    } else if (lib.type === 'hp' || lib.type === 'mp') {
      const pct = Math.max(0, Math.min(100, (lib.value / lib.max) * 100));
      const color = lib.type === 'hp' ? '#e94560' : '#1a6fc4';
      div.innerHTML = '<span class="status-name">' + lib.name + '</span>' +
        '<div class="status-bar-wrap"><div class="status-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
        '<span class="status-value">' + lib.value + '/' + lib.max + '</span>';
    } else if (lib.type === 'san') {
      const pct = Math.max(0, Math.min(100, (lib.value / lib.max) * 100));
      div.innerHTML = '<span class="status-name">SAN値</span>' +
        '<div class="status-bar-wrap"><div class="status-bar-fill" style="width:' + pct + '%;background:#7f77dd"></div></div>' +
        '<span class="status-value">' + lib.value + '/' + lib.max + '</span>';
    } else if (lib.type === 'level') {
      div.innerHTML = '<span class="status-name">Lv.' + lib.value + '</span>';
    } else if (lib.type === 'exp') {
      const pct = Math.max(0, Math.min(100, (lib.value / lib.nextLevel) * 100));
      div.innerHTML = '<span class="status-name">EXP</span>' +
        '<div class="status-bar-wrap"><div class="status-bar-fill" style="width:' + pct + '%;background:#e8760a"></div></div>' +
        '<span class="status-value">' + lib.value + '/' + lib.nextLevel + '</span>';
    } else if (lib.type === 'inventory') {
      div.innerHTML = '<span class="status-name">アイテム</span>' +
        '<span class="status-value">' + (lib.items && lib.items.length > 0 ? lib.items.join('・') : 'なし') + '</span>';
    } else if (lib.type === 'score') {
      div.innerHTML = '<span class="status-name">スコア</span><span class="status-value">' + lib.value + '点</span>';
    } else if (lib.type === 'timer') {
      div.id = 'timer-' + i;
      div.innerHTML = '<span class="status-name">残り時間</span>' +
        '<span class="status-value timer-value">' + (lib.remaining !== undefined ? lib.remaining : lib.seconds) + '秒</span>';
    } else if (lib.type === 'flag') {
      div.innerHTML = '<span class="status-name">' + lib.name + '</span><span class="status-value">' + (lib.value ? 'ON' : 'OFF') + '</span>';
    } else if (lib.type === 'status') {
      div.innerHTML = '<span class="status-name">' + lib.name + '</span><span class="status-value">' + lib.value + '</span>';
    } else {
      div.innerHTML = '<span class="status-name">' + lib.name + '</span>' +
        '<span class="status-value">' + (lib.value !== undefined ? lib.value : '') + (lib.unit || '') + '</span>';
    }
    bar.appendChild(div);
  });

  Object.entries(customVarState).forEach(([name, value]) => {
    const div = document.createElement('div');
    div.className = 'status-item';
    div.innerHTML = '<span class="status-name">' + name + '</span><span class="status-value">' + value + '</span>';
    bar.appendChild(div);
  });
}

function startTimers() {
  if (timerInterval) clearInterval(timerInterval);
  const timerLibs = state.filter(l => l.type === 'timer');
  if (timerLibs.length === 0) return;
  timerInterval = setInterval(() => {
    timerLibs.forEach(lib => {
      if (lib.remaining === undefined) lib.remaining = lib.seconds;
      if (lib.remaining > 0) {
        lib.remaining--;
        const idx = state.indexOf(lib);
        const el = document.getElementById('timer-' + idx);
        if (el) el.querySelector('.timer-value').textContent = lib.remaining + '秒';
        if (lib.remaining === 0) clearInterval(timerInterval);
      }
    });
  }, 1000);
}

function rollDice(libIndex) {
  const lib = state[libIndex];
  let total = 0;
  for (let i = 0; i < lib.count; i++) total += Math.floor(Math.random() * lib.faces) + 1;
  state[libIndex].result = total;
  lastDiceResult = total;
  renderStatus();
}

function rollSaikoro(libIndex) {
  const lib = state[libIndex];
  const results = [];
  for (let i = 0; i < lib.count; i++) results.push(Math.floor(Math.random() * 6) + 1);
  state[libIndex].results = results;
  lastDiceResult = results.reduce((a,b)=>a+b,0);
  renderStatus();
}

function checkConditions(btn) {
  const conditions = btn.ifConditions || [];
  if (conditions.length === 0) return true;
  const mode = btn.ifMode || 'all';
  const results = conditions.map(cond => {
    if (cond.type === 'flag') return flags.includes(cond.tag);
    if (cond.type === 'dice') return lastDiceResult !== null && lastDiceResult >= cond.diceMin;
    if (cond.type === 'var') {
      const val = customVarState[cond.varName];
      return val !== undefined && val >= cond.varMin;
    }
    return true;
  });
  return mode === 'all' ? results.every(r => r) : results.some(r => r);
}

function applyLibEffect(btn) {
  if (!btn.libEffect || !btn.libEffect.libId) return null;
  const lib = state.find(l => l.id === btn.libEffect.libId);
  if (!lib) return null;
  const change = btn.libEffect.change || 0;
  if (['affection','san','counter','money','time','hp','mp','exp','level','score','skill','charsheet'].includes(lib.type)) {
    lib.value = Math.max(0, (lib.value || 0) + change);
    if (lib.type === 'exp' && lib.nextLevel && lib.value >= lib.nextLevel) {
      lib.value -= lib.nextLevel;
      const levelLib = state.find(l => l.type === 'level');
      if (levelLib) levelLib.value++;
    }
  }
  if (btn.libEffect.branchMin !== '' && btn.libEffect.branchMin !== undefined && btn.libEffect.branchMin !== null) {
    const min = parseInt(btn.libEffect.branchMin);
    if (!isNaN(min)) {
      if (lib.value >= min && btn.libEffect.branchMinScene) return btn.libEffect.branchMinScene;
      if (lib.value < min && btn.libEffect.branchElseScene) return btn.libEffect.branchElseScene;
    }
  }
  return null;
}

function applyVarEffect(btn) {
  if (!btn.varEffect || !btn.varEffect.varName) return;
  const varName = btn.varEffect.varName;
  if (customVarState[varName] !== undefined && typeof customVarState[varName] === 'number') {
    customVarState[varName] += (btn.varEffect.change || 0);
  }
}

function applyDiceFlag(btn) {
  if (!btn.diceFlag || !btn.diceFlag.libId) return;
  const lib = state.find(l => l.id === btn.diceFlag.libId);
  if (!lib) return;
  const result = lib.type === 'saikoro'
    ? (lib.results || []).reduce((a,b)=>a+b,0)
    : lib.result || 0;
  const min = parseInt(btn.diceFlag.min) || 1;
  if (result >= min) { if (btn.diceFlag.successFlag) flags.push(btn.diceFlag.successFlag); }
  else { if (btn.diceFlag.failFlag) flags.push(btn.diceFlag.failFlag); }
}

function resolveExtraDests(btn) {
  const extraDests = btn.extraDests || [];
  for (const dest of extraDests) {
    if (dest.type === 'flag' && dest.flag && flags.includes(dest.flag)) return dest.next;
    if (dest.type === 'random') { if (Math.random() * 100 < (dest.prob || 50)) return dest.next; }
    if (dest.type === 'var' && dest.varName) {
      const val = customVarState[dest.varName];
      if (val !== undefined && val >= dest.varMin) return dest.next;
    }
  }
  return null;
}

function renderButtons(scene) {
  const btns = document.getElementById('buttons');
  btns.innerHTML = '';
  scene.buttons.forEach(btn => {
    if (!checkConditions(btn)) return;

    // アイテム判定（TRPGモード）
    if (btn.requireItem && trpgChar) {
      const hasItem = (trpgChar.inventory || []).includes(btn.requireItem);
      if (!hasItem) {
        const disabledBtn = document.createElement('button');
        disabledBtn.className = 'choice-btn choice-btn-disabled';
        disabledBtn.style.background = '#ccc';
        disabledBtn.textContent = btn.label + '（' + btn.requireItem + 'が必要）';
        disabledBtn.disabled = true;
        btns.appendChild(disabledBtn);
        return;
      }
    }

    const button = document.createElement('button');
    button.className = 'choice-btn';
    button.textContent = btn.label;
    button.style.background = btn.color;
    button.onclick = async () => {
      if (timerInterval) clearInterval(timerInterval);
      const flagGives = Array.isArray(btn.flagGive) ? btn.flagGive : (btn.flagGive ? [btn.flagGive] : []);
      flagGives.forEach(f => { if (f) flags.push(f); });
      applyDiceFlag(btn);
      applyVarEffect(btn);

      // アイテム付与・消費（TRPGモード）
      if (btn.giveItem && trpgChar) await acquireItem(btn.giveItem);
      if (btn.consumeItem && trpgChar) await consumeItem(btn.consumeItem);

      const branchScene = applyLibEffect(btn);
      const extraScene = !branchScene ? resolveExtraDests(btn) : null;
      showScene(branchScene || extraScene || btn.next);
    };
    btns.appendChild(button);
  });
}

window.rollDice = rollDice;
window.rollSaikoro = rollSaikoro;

init();