import { db, auth, onAuthStateChanged, signOut, collection, addDoc, getDocs, query, where, orderBy } from './firebase.js';
import { doc, updateDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const ADMIN_UID = 'AQtwwjYoTwMbCsrsMI0PA69XE443';
const MAX_CHARS = 2;

let currentUser = null;
let userChars = [];
let selectedCharId = null;
let statPoints = 0;
let statType = 'template';
let charIconData = null;
let freeStats = [];
let skills = [];

const SKILL_LIST = [
  '図書館', '説得', '回避', '目星', '聞き耳', '心理学', '医学', '応急手当',
  '鍵開け', '隠れる', '忍び歩き', '写真術', '水泳', '跳躍', '登攀', '投擲',
  '運転', '乗馬', '操縦', '機械修理', '電気修理', '電子工学', '武器', '格闘',
  '射撃', '歴史', '人類学', '考古学', '地質学', '物理学', '化学', '生物学',
  '天文学', '自然', '変装', '言語', '芸術', '交渉', '威圧', '魅惑'
];

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('login-btns').style.display = 'none';
    document.getElementById('user-name-text').textContent = user.displayName || user.email;
    document.getElementById('not-logged-in-msg').style.display = 'none';
    document.getElementById('trpg-main').style.display = 'block';
    await loadUserAvatar(user.uid);
    await loadChars();
    loadTrpgGames();
  } else {
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-btns').style.display = 'flex';
    document.getElementById('not-logged-in-msg').style.display = 'block';
    document.getElementById('trpg-main').style.display = 'none';
  }
});

async function loadUserAvatar(uid) {
  try {
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (docSnap.exists() && docSnap.data().avatar) {
      const img = document.getElementById('header-avatar');
      if (img) { img.src = docSnap.data().avatar; img.style.display = 'block'; document.getElementById('header-avatar-placeholder').style.display = 'none'; }
    }
  } catch (e) {}
}

function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

async function logout() { await signOut(auth); location.href = 'index.html'; }

function switchTrpgTab(tab) {
  document.querySelectorAll('.trpg-tab').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('trpg-chars-tab').style.display = 'none';
  document.getElementById('trpg-play-tab').style.display = 'none';
  document.getElementById('trpg-create-tab').style.display = 'none';
  document.getElementById('trpg-' + tab + '-tab').style.display = 'block';
  if (tab === 'play') loadTrpgGames();
}

// ===== キャラクター =====
async function loadChars() {
  if (!currentUser) return;
  try {
    const q = query(collection(db, 'trpg_characters'), where('uid', '==', currentUser.uid));
    const snapshot = await getDocs(q);
    userChars = [];
    snapshot.forEach(d => userChars.push({ id: d.id, ...d.data() }));
    renderCharList();
    const createBtn = document.getElementById('create-char-btn');
    if (createBtn) createBtn.style.display = userChars.length >= MAX_CHARS ? 'none' : 'inline-block';
  } catch (e) { console.log(e); }
}

function renderCharList() {
  const list = document.getElementById('char-list');
  if (!list) return;
  list.innerHTML = '';
  if (userChars.length === 0) {
    list.innerHTML = '<p class="empty">キャラクターがいません。「＋ キャラ作成」から作成してください！</p>';
    return;
  }
  userChars.forEach(char => {
    const card = document.createElement('div');
    card.className = 'char-card' + (!char.isAlive ? ' char-dead' : '');
    const stats = char.stats || {};
    const statsHTML = Object.entries(stats).map(([k, v]) =>
      '<span class="char-stat-badge">' + k + ':' + v + '</span>'
    ).join('');
    const skills = (char.skills || []).map(s =>
      '<span class="char-skill-badge">' + s.name + ' ' + s.value + '%</span>'
    ).join('');
    card.innerHTML =
      '<div class="char-card-header">' +
      (char.icon ? '<img src="' + char.icon + '" class="char-card-icon">' : '<div class="char-card-icon-placeholder"></div>') +
      '<div class="char-card-info">' +
      '<h3>' + char.name + (char.isAlive === false ? ' 💀（ロスト）' : '') + '</h3>' +
      '<div class="char-stats-row">' + statsHTML + '</div>' +
      '</div></div>' +
      '<div class="char-skills-row">' + skills + '</div>' +
      '<div class="char-card-actions">' +
      '<button class="edit-btn" onclick="showCharDetail(\'' + char.id + '\')">詳細</button>' +
      (char.isAlive !== false ? '<button class="edit-btn" onclick="renameChar(\'' + char.id + '\', \'' + char.name.replace(/'/g, "\\'") + '\')">名前変更</button>' : '') +
      '<button class="delete-game-btn" onclick="deleteChar(\'' + char.id + '\')">削除</button>' +
      '</div>';
    list.appendChild(card);
  });
}

function showCharCreate() {
  if (userChars.length >= MAX_CHARS) { alert('キャラクターは最大' + MAX_CHARS + '体まで作成できます'); return; }
  document.getElementById('char-create-form').style.display = 'block';
  charIconData = null;
  freeStats = [];
  skills = [];
  statPoints = 0;
  document.getElementById('stat-points-display').textContent = 'まだ振っていません';
  document.getElementById('stat-total-display').textContent = '合計: 0 / 0点';
  document.querySelectorAll('.stat-input').forEach(i => i.value = 0);
  renderFreeStats();
  renderSkillSection();
}

function hideCharCreate() {
  document.getElementById('char-create-form').style.display = 'none';
}

function previewCharIcon(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    charIconData = e.target.result;
    const preview = document.getElementById('char-icon-preview');
    preview.src = charIconData; preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function setStatType(type) {
  statType = type;
  document.querySelectorAll('.stat-type-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('template-stats').style.display = type === 'template' ? 'block' : 'none';
  document.getElementById('free-stats').style.display = type === 'free' ? 'block' : 'none';
}

function rollStatPoints() {
  const rolls = [1,2,3].map(() => Math.floor(Math.random() * 6) + 1);
  statPoints = rolls.reduce((a, b) => a + b, 0) + 10;
  document.getElementById('stat-points-display').textContent =
    'ダイス結果: ' + rolls.join('+') + '+10 = ' + statPoints + '点';
  updateStatTotal();
}

function updateStatTotal() {
  if (statType !== 'template') return;
  const statIds = ['STR','DEX','INT','CON','POW','APP','EDU','SAN'];
  const total = statIds.reduce((sum, id) => {
    const val = parseInt(document.getElementById('stat-' + id).value) || 0;
    return sum + val;
  }, 0);
  const display = document.getElementById('stat-total-display');
  if (display) {
    display.textContent = '合計: ' + total + ' / ' + statPoints + '点';
    display.style.color = total > statPoints ? '#e94560' : '#00a878';
  }
}

function addFreeStat() {
  const name = prompt('ステータス名を入力（例：魔力）'); if (!name) return;
  const value = parseInt(prompt('値を入力（例：10）')) || 0;
  freeStats.push({ name, value });
  renderFreeStats();
}

function renderFreeStats() {
  const list = document.getElementById('free-stat-list');
  if (!list) return;
  list.innerHTML = '';
  freeStats.forEach((stat, i) => {
    const div = document.createElement('div');
    div.className = 'lib-item';
    div.innerHTML = '<span class="lib-preview">' + stat.name + ': ' + stat.value + '</span>' +
      '<button class="delete-btn" onclick="removeFreeStat(' + i + ')">✕</button>';
    list.appendChild(div);
  });
}

function removeFreeStat(i) { freeStats.splice(i, 1); renderFreeStats(); }

function addSkill() {
  const existing = SKILL_LIST.map((s, i) => i + ': ' + s).join('\n');
  const choice = prompt('技能を番号で選んでください：\n' + existing + '\n\nまたは直接入力（カスタム技能）');
  if (choice === null) return;
  const idx = parseInt(choice);
  const skillName = isNaN(idx) ? choice : (SKILL_LIST[idx] || choice);
  if (!skillName) return;
  const value = parseInt(prompt(skillName + 'の技能値を入力（例：60）')) || 0;
  skills.push({ name: skillName, value });
  renderSkillSection();
}

function renderSkillSection() {
  const list = document.getElementById('skill-list');
  if (!list) return;
  list.innerHTML = '';
  skills.forEach((skill, i) => {
    const div = document.createElement('div');
    div.className = 'lib-item';
    div.innerHTML = '<span class="lib-preview">' + skill.name + ' ' + skill.value + '%</span>' +
      '<button class="delete-btn" onclick="removeSkill(' + i + ')">✕</button>';
    list.appendChild(div);
  });
}

function removeSkill(i) { skills.splice(i, 1); renderSkillSection(); }

async function saveChar() {
  if (!currentUser) return;
  const name = document.getElementById('char-name').value.trim();
  if (!name) { alert('キャラクター名を入力してください'); return; }
  if (userChars.length >= MAX_CHARS) { alert('キャラクターは最大' + MAX_CHARS + '体まで作成できます'); return; }

  let stats = {};
  if (statType === 'template') {
    const statIds = ['STR','DEX','INT','CON','POW','APP','EDU','SAN'];
    statIds.forEach(id => {
      stats[id] = parseInt(document.getElementById('stat-' + id).value) || 0;
    });
    const total = Object.values(stats).reduce((a, b) => a + b, 0);
    if (statPoints > 0 && total > statPoints) {
      alert('合計点数が超過しています（' + total + ' / ' + statPoints + '点）'); return;
    }
  } else {
    freeStats.forEach(s => { stats[s.name] = s.value; });
  }

  const char = {
    uid: currentUser.uid, name,
    icon: charIconData || '',
    stats, skills,
    isAlive: true,
    inventory: [],
    createdAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'trpg_characters'), char);
    alert('「' + name + '」を作成しました！');
    hideCharCreate();
    await loadChars();
  } catch (e) { alert('エラー：' + e.message); }
}

async function renameChar(charId, currentName) {
  const newName = prompt('新しい名前を入力', currentName);
  if (!newName || newName === currentName) return;
  try {
    await updateDoc(doc(db, 'trpg_characters', charId), { name: newName });
    await loadChars();
  } catch (e) { alert('エラー：' + e.message); }
}

async function deleteChar(charId) {
  if (!confirm('このキャラクターを削除しますか？\nアイテムも全て失われます。')) return;
  try {
    await deleteDoc(doc(db, 'trpg_characters', charId));
    await loadChars();
  } catch (e) { alert('エラー：' + e.message); }
}

function showCharDetail(charId) {
  const char = userChars.find(c => c.id === charId);
  if (!char) return;
  document.getElementById('char-detail-name').textContent = char.name + (char.isAlive === false ? ' 💀' : '');
  const stats = char.stats || {};
  const statsHTML = Object.entries(stats).map(([k, v]) =>
    '<div class="char-detail-stat"><span class="char-stat-key">' + k + '</span><span class="char-stat-val">' + v + '</span></div>'
  ).join('');
  const skillsHTML = (char.skills || []).map(s =>
    '<div class="char-detail-stat"><span class="char-stat-key">' + s.name + '</span><span class="char-stat-val">' + s.value + '%</span></div>'
  ).join('');
  const inventoryHTML = (char.inventory || []).length > 0
    ? (char.inventory || []).map(item => '<span class="game-tag">' + item + '</span>').join('')
    : '<span style="color:#aaa">なし</span>';

  document.getElementById('char-detail-content').innerHTML =
    (char.icon ? '<img src="' + char.icon + '" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin-bottom:12px;">' : '') +
    '<div class="char-detail-section"><h4>ステータス</h4><div class="char-detail-grid">' + statsHTML + '</div></div>' +
    '<div class="char-detail-section"><h4>技能値</h4><div class="char-detail-grid">' + (skillsHTML || '<span style="color:#aaa">なし</span>') + '</div></div>' +
    '<div class="char-detail-section"><h4>アイテム</h4><div class="game-tags-row">' + inventoryHTML + '</div></div>';
  document.getElementById('char-detail-modal').style.display = 'flex';
}

function hideCharDetailModal() { document.getElementById('char-detail-modal').style.display = 'none'; }

// ===== TRPGゲーム一覧 =====
async function loadTrpgGames() {
  const list = document.getElementById('trpg-game-list');
  if (!list) return;
  list.innerHTML = '<p class="empty">読み込み中...</p>';
  try {
    const snapshot = await getDocs(collection(db, 'games'));
    const games = [];
    snapshot.forEach(d => {
      const data = { id: d.id, ...d.data() };
      const genres = data.genres || [data.genre];
      const tags = data.tags || [];
      if (genres.includes('TRPG') || tags.includes('TRPG')) games.push(data);
    });
    list.innerHTML = '';
    if (games.length === 0) { list.innerHTML = '<p class="empty">TRPGシナリオがまだありません</p>'; return; }
    games.forEach(game => {
      const card = document.createElement('div');
      card.className = 'game-card';
      const thumb = game.thumbnail
        ? '<img src="' + game.thumbnail + '" class="game-thumb" alt="サムネイル">'
        : '<div class="game-thumb-placeholder"></div>';
      card.innerHTML = thumb +
        '<div class="game-card-body">' +
        '<h2>' + game.title + '</h2>' +
        '<p>' + (game.description || '') + '</p>' +
        '<p class="game-author">製作者：' + (game.author || '不明') + '</p>' +
        '<p class="game-playcount">プレイ数：' + (game.playCount || 0) + '回</p>' +
        '<div class="game-card-actions">' +
        '<button class="play-link" onclick="startTrpgPlay(\'' + game.id + '\')">TRPGで遊ぶ</button>' +
        '</div></div>';
      list.appendChild(card);
    });
  } catch (e) { list.innerHTML = '<p class="empty">読み込みエラー：' + e.message + '</p>'; }
}

function startTrpgPlay(gameId) {
  if (!currentUser) { alert('ログインが必要です'); return; }
  const aliveChars = userChars.filter(c => c.isAlive !== false);
  if (aliveChars.length === 0) { alert('使用できるキャラクターがいません。先にキャラクターを作成してください！'); return; }
  if (aliveChars.length === 1) {
    selectedCharId = aliveChars[0].id;
    location.href = 'play.html?id=' + gameId + '&charId=' + selectedCharId;
    return;
  }
  // 2体以上いる場合は選択
  showCharSelectModal(gameId, aliveChars);
}

function showCharSelectModal(gameId, chars) {
  const list = document.getElementById('char-select-list');
  list.innerHTML = '';
  chars.forEach(char => {
    const btn = document.createElement('button');
    btn.className = 'char-select-btn';
    btn.innerHTML =
      (char.icon ? '<img src="' + char.icon + '" class="char-select-icon">' : '<div class="char-select-icon-placeholder"></div>') +
      '<span>' + char.name + '</span>';
    btn.onclick = () => {
      selectedCharId = char.id;
      hideCharSelectModal();
      location.href = 'play.html?id=' + gameId + '&charId=' + selectedCharId;
    };
    list.appendChild(btn);
  });
  document.getElementById('char-select-modal').style.display = 'flex';
}

function hideCharSelectModal() { document.getElementById('char-select-modal').style.display = 'none'; }

// ===== window登録 =====
window.toggleUserMenu = toggleUserMenu;
window.logout = logout;
window.switchTrpgTab = switchTrpgTab;
window.showCharCreate = showCharCreate;
window.hideCharCreate = hideCharCreate;
window.previewCharIcon = previewCharIcon;
window.setStatType = setStatType;
window.rollStatPoints = rollStatPoints;
window.updateStatTotal = updateStatTotal;
window.addFreeStat = addFreeStat;
window.removeFreeStat = removeFreeStat;
window.addSkill = addSkill;
window.removeSkill = removeSkill;
window.saveChar = saveChar;
window.renameChar = renameChar;
window.deleteChar = deleteChar;
window.showCharDetail = showCharDetail;
window.hideCharDetailModal = hideCharDetailModal;
window.startTrpgPlay = startTrpgPlay;
window.hideCharSelectModal = hideCharSelectModal;