import { db, auth, googleProvider, collection, addDoc, getDocs, query, orderBy, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from './firebase.js';

let scenes = {};
let sceneCount = 0;
let currentMode = 'simple';
let currentGenre = 'その他';
let libraries = [];
let currentFilterGenre = 'all';
let thumbnailData = null;
let currentUser = null;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const palette = ['#e94560','#1a6fc4','#1d9e75','#7f77dd','#e8760a','#d4537e','#444441','#0f6e56'];

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('login-btns').style.display = 'none';
    document.getElementById('user-name').textContent = user.displayName || user.email;
    document.getElementById('game-author').value = user.displayName || user.email;
    document.getElementById('not-logged-in').style.display = 'none';
    document.getElementById('mode-select').style.display = 'block';
  } else {
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-btns').style.display = 'flex';
    document.getElementById('game-author').value = '';
    document.getElementById('not-logged-in').style.display = 'block';
    document.getElementById('mode-select').style.display = 'none';
    document.getElementById('game-form').style.display = 'none';
  }
});

function showLoginModal() {
  document.getElementById('login-modal').style.display = 'flex';
}

function hideLoginModal() {
  document.getElementById('login-modal').style.display = 'none';
}

function switchModalTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('login-form').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('register-form').style.display = tab === 'register' ? 'block' : 'none';
}

async function loginWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider);
    hideLoginModal();
  } catch (e) {
    alert('Googleログインに失敗しました：' + e.message);
  }
}

async function loginWithEmail() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  if (!email || !password) { alert('メールとパスワードを入力してください'); return; }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    hideLoginModal();
  } catch (e) {
    alert('ログインに失敗しました：' + e.message);
  }
}

async function registerWithEmail() {
  const username = document.getElementById('register-username').value;
  const email = document.getElementById('register-email').value;
  const password = document.getElementById('register-password').value;
  if (!username) { alert('ユーザー名を入力してください'); return; }
  if (!email || !password) { alert('メールとパスワードを入力してください'); return; }
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCred.user, { displayName: username });
    hideLoginModal();
  } catch (e) {
    alert('登録に失敗しました：' + e.message);
  }
}

async function logout() {
  await signOut(auth);
}

function showTab(tab) {
  document.getElementById('play-tab').style.display = tab === 'play' ? 'block' : 'none';
  document.getElementById('create-tab').style.display = tab === 'create' ? 'block' : 'none';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  if (tab === 'play') {
    const title = document.getElementById('game-title').value;
    const desc = document.getElementById('game-description').value;
    const hasInput = title || desc || Object.keys(scenes).length > 1;
    if (!hasInput) resetCreateForm();
    loadGames();
  }
}

function resetCreateForm() {
  if (currentUser) {
    document.getElementById('mode-select').style.display = 'block';
  }
  document.getElementById('game-form').style.display = 'none';
  scenes = {};
  sceneCount = 0;
  libraries = [];
  thumbnailData = null;
}

function backToModeSelect() {
  resetCreateForm();
}

function startCreate(mode) {
  currentMode = mode;
  libraries = [];
  scenes = {};
  sceneCount = 0;
  thumbnailData = null;
  document.getElementById('mode-select').style.display = 'none';
  document.getElementById('game-form').style.display = 'block';
  document.getElementById('library-list').innerHTML = '';
  document.getElementById('scene-tree').innerHTML = '';
  document.getElementById('thumbnail-preview').style.display = 'none';
  document.getElementById('thumbnail-preview').src = '';
  document.getElementById('game-title').value = '';
  document.getElementById('game-description').value = '';
  document.getElementById('game-author').value = currentUser ? (currentUser.displayName || currentUser.email) : '';
  document.getElementById('library-panel').style.display = mode === 'simple' ? 'none' : 'block';
  addScene();
}

function updateGenre() {
  currentGenre = document.getElementById('game-genre').value;
  renderTree();
}

function previewThumbnail(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    thumbnailData = e.target.result;
    const preview = document.getElementById('thumbnail-preview');
    preview.src = thumbnailData;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function addScene() {
  sceneCount++;
  const id = 'scene' + sceneCount;
  scenes[id] = { id, title: '', text: '', buttons: [], elements: [] };
  renderTree();
  return id;
}

function deleteScene(sceneId) {
  if (Object.keys(scenes).length <= 1) {
    alert('最低1つのシーンが必要です');
    return;
  }
  delete scenes[sceneId];
  renderTree();
}

function addButton(sceneId) {
  const scene = scenes[sceneId];
  const label = ALPHABET[scene.buttons.length];
  if (!label) { alert('ボタンはZまで追加できます'); return; }
  const nextId = addScene();
  scene.buttons.push({
    label,
    color: '#00c896',
    next: nextId,
    flagGive: '',
    ifCondition: { type: 'none', tag: '', diceMin: 1 },
    libEffect: { libId: '', change: 0, branchMin: '', branchMinScene: '', branchElseScene: '' },
    diceFlag: { libId: '', min: 1, successFlag: '', failFlag: '' }
  });
  renderTree();
}

function deleteButton(sceneId, btnIndex) {
  scenes[sceneId].buttons.splice(btnIndex, 1);
  renderTree();
}

function updateButtonColor(sceneId, btnIndex, color) {
  scenes[sceneId].buttons[btnIndex].color = color;
  renderTree();
}

function updateSceneText(sceneId, value) {
  scenes[sceneId].text = value;
}

function updateSceneTitle(sceneId, value) {
  scenes[sceneId].title = value;
}

function addLibrary(type) {
  const lib = { type, id: 'lib' + Date.now() };

  if (type === 'affection') {
    const name = prompt('好感度の名前を入力（例：アリス 好感度）');
    if (!name) return;
    const max = prompt('ハートの数を入力（例：5）');
    if (!max) return;
    lib.name = name;
    lib.max = parseInt(max);
    lib.value = 0;
  } else if (type === 'dice') {
    const faces = prompt('ダイスの面数を入力（4/6/8/10/12/20/100）');
    if (!faces) return;
    const count = prompt('一度に振る数を入力（例：1 または 2）');
    if (!count) return;
    lib.faces = parseInt(faces);
    lib.count = parseInt(count);
    lib.name = count + 'd' + faces;
    lib.result = null;
  } else if (type === 'saikoro') {
    const count = prompt('さいころの個数を入力（1〜6）');
    if (!count) return;
    const c = Math.min(6, Math.max(1, parseInt(count)));
    lib.count = c;
    lib.faces = 6;
    lib.name = c + '個のさいころ';
    lib.results = [];
  } else if (type === 'san') {
    const max = prompt('SAN値の最大値を入力（例：100）');
    if (!max) return;
    lib.name = 'SAN値';
    lib.max = parseInt(max);
    lib.value = parseInt(max);
  } else if (type === 'counter') {
    const name = prompt('カウンターの名前を入力（例：撃破数）');
    if (!name) return;
    const init = prompt('初期値を入力（例：0）');
    if (init === null) return;
    lib.name = name;
    lib.value = parseInt(init);
  } else if (type === 'money') {
    const name = prompt('名前を入力（例：所持金）');
    if (!name) return;
    const unit = prompt('単位を入力（例：G、円、ゴールド）');
    if (!unit) return;
    const init = prompt('初期値を入力（例：100）');
    if (init === null) return;
    lib.name = name;
    lib.unit = unit;
    lib.value = parseInt(init);
  } else if (type === 'time') {
    const name = prompt('名前を入力（例：日数、時間）');
    if (!name) return;
    const unit = prompt('単位を入力（例：日目、時間目）');
    if (!unit) return;
    const init = prompt('初期値を入力（例：1）');
    if (init === null) return;
    lib.name = name;
    lib.unit = unit;
    lib.value = parseInt(init);
  } else if (type === 'flag') {
    const name = prompt('フラグの名前を入力（例：鍵を持っている）');
    if (!name) return;
    lib.name = name;
    lib.value = false;
  } else if (type === 'status') {
    const name = prompt('状態の名前を入力（例：天気）');
    if (!name) return;
    const options = prompt('状態の選択肢をカンマ区切りで入力（例：晴れ,雨,雪）');
    if (!options) return;
    lib.name = name;
    lib.options = options.split(',');
    lib.value = lib.options[0];
  }

  libraries.push(lib);
  renderLibrary();
}

function renderLibrary() {
  const list = document.getElementById('library-list');
  list.innerHTML = '';
  libraries.forEach((lib, i) => {
    const div = document.createElement('div');
    div.className = 'lib-item';
    let preview = '';
    if (lib.type === 'affection') {
      preview = lib.name + ' ' + '♡'.repeat(lib.max);
    } else if (lib.type === 'dice') {
      preview = lib.name;
    } else if (lib.type === 'saikoro') {
      preview = lib.name;
    } else if (lib.type === 'san') {
      preview = 'SAN値 ' + lib.value + ' / ' + lib.max;
    } else if (lib.type === 'counter') {
      preview = lib.name + ' ' + lib.value;
    } else if (lib.type === 'money') {
      preview = lib.name + ' ' + lib.value + lib.unit;
    } else if (lib.type === 'time') {
      preview = lib.name + ' ' + lib.value + lib.unit;
    } else if (lib.type === 'flag') {
      preview = lib.name + ' OFF';
    } else if (lib.type === 'status') {
      preview = lib.name + ' ' + lib.value;
    }
    div.innerHTML = '<span class="lib-preview">' + preview + '</span>' +
      '<button class="delete-btn" onclick="deleteLibrary(' + i + ')">✕</button>';
    list.appendChild(div);
  });
}

function deleteLibrary(index) {
  libraries.splice(index, 1);
  renderLibrary();
}

function getSceneOptions() {
  return Object.keys(scenes).map(id =>
    '<option value="' + id + '">' + id + (scenes[id].title ? ' (' + scenes[id].title + ')' : '') + '</option>'
  ).join('');
}

function getLibOptions() {
  return '<option value="">なし</option>' +
    libraries.map(lib =>
      '<option value="' + lib.id + '">' + lib.name + '</option>'
    ).join('');
}

function getDiceLibOptions() {
  return '<option value="">なし</option>' +
    libraries.filter(lib => lib.type === 'dice' || lib.type === 'saikoro').map(lib =>
      '<option value="' + lib.id + '">' + lib.name + '</option>'
    ).join('');
}

function renderTree() {
  const tree = document.getElementById('scene-tree');
  tree.innerHTML = '';
  Object.values(scenes).forEach(scene => {
    tree.appendChild(createSceneCard(scene));
  });
}

function createSimpleSceneCard(scene) {
  const card = document.createElement('div');
  card.className = 'scene-card';
  card.id = 'card-' + scene.id;

  let buttonsHTML = scene.buttons.map((btn, i) => {
    const sceneOpts = Object.keys(scenes).map(id =>
      '<option value="' + id + '"' + (btn.next === id ? ' selected' : '') + '>' +
      id + (scenes[id].title ? ' (' + scenes[id].title + ')' : '') +
      '</option>'
    ).join('');
    return '<div class="button-row">' +
      '<span class="btn-label" style="background:#00c896">【' + btn.label + '】</span>' +
      '<span class="btn-arrow">→</span>' +
      '<span class="btn-option-label" style="color:#00a878;font-weight:700;">飛び先：</span>' +
      '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].next = this.value">' + sceneOpts + '</select>' +
      '<button class="delete-btn" onclick="deleteButton(\'' + scene.id + '\', ' + i + ')">✕</button>' +
      '</div>';
  }).join('');

  card.innerHTML =
    '<div class="scene-header">' +
    '<span class="scene-label">' + scene.id + '</span>' +
    '<input type="text" class="scene-title-input" placeholder="シーンタイトル（任意）" value="' + (scene.title || '') + '" oninput="updateSceneTitle(\'' + scene.id + '\', this.value)">' +
    '<button class="delete-scene-btn" onclick="deleteScene(\'' + scene.id + '\')">✕</button>' +
    '</div>' +
    '<textarea placeholder="このシーンの文章を入力..." oninput="updateSceneText(\'' + scene.id + '\', this.value)">' + scene.text + '</textarea>' +
    '<div class="simple-choices-label">このシーンの選択肢は？</div>' +
    '<div class="buttons-list">' + buttonsHTML + '</div>' +
    '<div class="scene-actions">' +
    '<button class="add-btn" onclick="addButton(\'' + scene.id + '\')">＋ 選択肢を追加</button>' +
    '<button class="add-btn" onclick="addScene()">＋ シーン追加</button>' +
    '</div>';

  return card;
}

function createNormalSceneCard(scene) {
  const card = document.createElement('div');
  card.className = 'scene-card';
  card.id = 'card-' + scene.id;

  const libNames = libraries.map(l => '{' + l.name + '}').join('　');
  const hintText = libraries.length > 0
    ? '文章にライブラリの値を表示するには { ライブラリ名 } と書いてください。例：' + libNames
    : '普通モードでは { ライブラリ名 } と書くと値が表示されます（ライブラリを追加すると使えます）';

  let buttonsHTML = scene.buttons.map((btn, i) => {
    const ifOptions =
      '<option value="none"' + (btn.ifCondition.type === 'none' ? ' selected' : '') + '>条件なし</option>' +
      '<option value="flag"' + (btn.ifCondition.type === 'flag' ? ' selected' : '') + '>タグを持っている</option>' +
      '<option value="dice"' + (btn.ifCondition.type === 'dice' ? ' selected' : '') + '>ダイス結果が○以上</option>';

    const sceneOpts = getSceneOptions();
    const libOpts = getLibOptions();
    const diceOpts = getDiceLibOptions();

    return '<div class="btn-block">' +
      '<div class="button-row">' +
      '<span class="btn-label" style="background:' + btn.color + '">【' + btn.label + '】</span>' +
      '<span class="btn-arrow">→</span>' +
      '<span class="btn-next">' + btn.next + '</span>' +
      '<div class="color-palette">' +
      palette.map(c =>
        '<span class="palette-dot' + (btn.color === c ? ' selected' : '') + '" style="background:' + c + '" onclick="updateButtonColor(\'' + scene.id + '\', ' + i + ', \'' + c + '\')"></span>'
      ).join('') +
      '</div>' +
      '<input type="color" value="' + btn.color + '" title="カスタムカラー" onchange="updateButtonColor(\'' + scene.id + '\', ' + i + ', this.value)">' +
      '<button class="delete-btn" onclick="deleteButton(\'' + scene.id + '\', ' + i + ')">✕</button>' +
      '</div>' +
      '<div class="btn-options">' +
      '<div class="btn-section-title">フラグ付与</div>' +
      '<div class="btn-option-row">' +
      '<span class="btn-option-label">タグ名：</span>' +
      '<input type="text" class="btn-option-input" placeholder="例：鍵、仲間A" value="' + (btn.flagGive || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].flagGive = this.value">' +
      '<span class="btn-option-hint">このボタンを押すとタグが付与されます</span>' +
      '</div>' +
      '<div class="btn-section-title">ライブラリ効果</div>' +
      '<div class="btn-option-row">' +
      '<span class="btn-option-label">対象：</span>' +
      '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.libId = this.value">' + libOpts.replace('value="' + (btn.libEffect.libId || '') + '"', 'value="' + (btn.libEffect.libId || '') + '" selected') + '</select>' +
      '<span class="btn-option-label">変化：</span>' +
      '<input type="number" class="btn-option-input-sm" placeholder="例：+1" value="' + (btn.libEffect.change || 0) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.change = parseInt(this.value)">' +
      '</div>' +
      '<div class="btn-option-row">' +
      '<span class="btn-option-hint">結果分岐：値が</span>' +
      '<input type="number" class="btn-option-input-sm" placeholder="例：5" value="' + (btn.libEffect.branchMin || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.branchMin = this.value">' +
      '<span class="btn-option-hint">以上なら</span>' +
      '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.branchMinScene = this.value">' + sceneOpts + '</select>' +
      '<span class="btn-option-hint">未満なら</span>' +
      '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].libEffect.branchElseScene = this.value">' + sceneOpts + '</select>' +
      '</div>' +
      '<div class="btn-section-title">IF条件（表示条件）</div>' +
      '<div class="btn-option-row">' +
      '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifCondition.type = this.value; renderTree()">' + ifOptions + '</select>' +
      (btn.ifCondition.type === 'flag' ?
        '<input type="text" class="btn-option-input" placeholder="必要なタグ名" value="' + (btn.ifCondition.tag || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifCondition.tag = this.value">' : '') +
      (btn.ifCondition.type === 'dice' ?
        '<input type="number" class="btn-option-input-sm" placeholder="最低値" value="' + (btn.ifCondition.diceMin || 1) + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].ifCondition.diceMin = parseInt(this.value)">' : '') +
      '</div>' +
      '<div class="btn-section-title">ダイス → フラグ</div>' +
      '<div class="btn-option-row">' +
      '<span class="btn-option-label">ダイス：</span>' +
      '<select class="btn-option-select" onchange="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.libId = this.value">' + diceOpts + '</select>' +
      '<span class="btn-option-label">以上：</span>' +
      '<input type="number" class="btn-option-input-sm" placeholder="例：15" value="' + (btn.diceFlag.min || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.min = parseInt(this.value)">' +
      '</div>' +
      '<div class="btn-option-row">' +
      '<span class="btn-option-hint">成功フラグ：</span>' +
      '<input type="text" class="btn-option-input" placeholder="例：成功" value="' + (btn.diceFlag.successFlag || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.successFlag = this.value">' +
      '<span class="btn-option-hint">失敗フラグ：</span>' +
      '<input type="text" class="btn-option-input" placeholder="例：失敗" value="' + (btn.diceFlag.failFlag || '') + '" oninput="scenes[\'' + scene.id + '\'].buttons[' + i + '].diceFlag.failFlag = this.value">' +
      '</div>' +
      '</div>' +
      '</div>';
  }).join('');

  card.innerHTML =
    '<div class="scene-header">' +
    '<span class="scene-label">' + scene.id + '</span>' +
    '<input type="text" class="scene-title-input" placeholder="シーンタイトル（任意）" value="' + (scene.title || '') + '" oninput="updateSceneTitle(\'' + scene.id + '\', this.value)">' +
    '<button class="delete-scene-btn" onclick="deleteScene(\'' + scene.id + '\')">✕</button>' +
    '</div>' +
    '<textarea placeholder="ここにシーンのテキストを入力..." oninput="updateSceneText(\'' + scene.id + '\', this.value)">' + scene.text + '</textarea>' +
    '<div class="lib-hint">' + hintText + '</div>' +
    '<div class="buttons-list">' + buttonsHTML + '</div>' +
    '<div class="scene-actions">' +
    '<button class="add-btn" onclick="addButton(\'' + scene.id + '\')">＋ ボタン追加</button>' +
    '<button class="add-btn" onclick="addScene()">＋ シーン追加</button>' +
    '</div>';

  return card;
}

function createSceneCard(scene) {
  return currentMode === 'simple' ? createSimpleSceneCard(scene) : createNormalSceneCard(scene);
}

async function uploadGame() {
  if (!currentUser) { alert('ゲームを作るにはログインが必要です'); return; }
  const title = document.getElementById('game-title').value;
  const genre = document.getElementById('game-genre').value;
  const description = document.getElementById('game-description').value;
  const author = currentUser.displayName || currentUser.email;

  if (!title) { alert('タイトルを入力してください'); return; }
  if (Object.keys(scenes).length === 0) { alert('シーンを追加してください'); return; }

  const game = {
    title,
    genre,
    description,
    author,
    uid: currentUser.uid,
    thumbnail: thumbnailData || '',
    mode: currentMode,
    libraries: JSON.parse(JSON.stringify(libraries)),
    story: JSON.parse(JSON.stringify(scenes)),
    playCount: 0,
    createdAt: new Date().toISOString()
  };

  try {
    await addDoc(collection(db, 'games'), game);
    alert('アップロードしました！');
    document.querySelectorAll('.tab-btn')[0].click();
  } catch (e) {
    alert('エラーが発生しました：' + e.message);
  }
}

function renderGameCard(game) {
  const card = document.createElement('div');
  card.className = 'game-card';
  const thumb = game.thumbnail
    ? '<img src="' + game.thumbnail + '" class="game-thumb" alt="サムネイル">'
    : '<div class="game-thumb-placeholder"></div>';
  card.innerHTML =
    thumb +
    '<div class="game-card-body">' +
    '<div class="game-genre-tag">' + game.genre + '</div>' +
    '<h2>' + game.title + '</h2>' +
    '<p>' + game.description + '</p>' +
    '<p class="game-author">製作者：' + (game.author || '不明') + '</p>' +
    '<p class="game-playcount">プレイ数：' + (game.playCount || 0) + '回</p>' +
    '<a href="play.html?id=' + game.id + '">遊ぶ</a>' +
    '</div>';
  return card;
}

async function loadGames() {
  const list = document.getElementById('game-list');
  list.innerHTML = '<p class="empty">読み込み中...</p>';
  try {
    const q = query(collection(db, 'games'), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const games = [];
    snapshot.forEach(doc => {
      games.push({ id: doc.id, ...doc.data() });
    });
    list.innerHTML = '';
    if (games.length === 0) {
      list.innerHTML = '<p class="empty">まだゲームがありません。作るタブからゲームを作ってみよう！</p>';
      return;
    }
    games.forEach(game => list.appendChild(renderGameCard(game)));
    window._allGames = games;
  } catch (e) {
    list.innerHTML = '<p class="empty">読み込みエラー：' + e.message + '</p>';
  }
}

function filterGenre(genre) {
  currentFilterGenre = genre;
  document.querySelectorAll('.genre-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('search-input').value = '';
  applyFilter();
}

function searchGames() {
  applyFilter();
}

function applyFilter() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const games = window._allGames || [];
  const list = document.getElementById('game-list');
  list.innerHTML = '';

  const filtered = games.filter(game => {
    const matchGenre = currentFilterGenre === 'all' || game.genre === currentFilterGenre;
    const matchSearch = !q ||
      game.title.toLowerCase().includes(q) ||
      (game.author || '').toLowerCase().includes(q) ||
      game.genre.toLowerCase().includes(q);
    return matchGenre && matchSearch;
  });

  if (filtered.length === 0) {
    list.innerHTML = '<p class="empty">該当するゲームが見つかりませんでした</p>';
    return;
  }
  filtered.forEach(game => list.appendChild(renderGameCard(game)));
}

window.showTab = showTab;
window.startCreate = startCreate;
window.backToModeSelect = backToModeSelect;
window.updateGenre = updateGenre;
window.previewThumbnail = previewThumbnail;
window.addScene = addScene;
window.deleteScene = deleteScene;
window.addButton = addButton;
window.deleteButton = deleteButton;
window.updateButtonColor = updateButtonColor;
window.updateSceneText = updateSceneText;
window.updateSceneTitle = updateSceneTitle;
window.addLibrary = addLibrary;
window.deleteLibrary = deleteLibrary;
window.uploadGame = uploadGame;
window.filterGenre = filterGenre;
window.searchGames = searchGames;
window.scenes = scenes;
window.renderTree = renderTree;
window.showLoginModal = showLoginModal;
window.hideLoginModal = hideLoginModal;
window.switchModalTab = switchModalTab;
window.loginWithGoogle = loginWithGoogle;
window.loginWithEmail = loginWithEmail;
window.registerWithEmail = registerWithEmail;
window.logout = logout;

loadGames();