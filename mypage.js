import { db, auth, signOut, onAuthStateChanged } from './firebase.js';
import { collection, query, where, getDocs, doc, deleteDoc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('login-btns').style.display = 'none';
    document.getElementById('user-name-text').textContent = user.displayName || user.email;
    document.getElementById('not-logged-in-msg').style.display = 'none';
    document.getElementById('mypage-main').style.display = 'block';
    document.getElementById('mypage-username').textContent = user.displayName || 'ユーザー';
    document.getElementById('mypage-email').textContent = user.email;
    await loadUserData(user.uid);
    await loadMyGames();
    await loadPlayHistory();
  } else {
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-btns').style.display = 'flex';
    document.getElementById('not-logged-in-msg').style.display = 'block';
    document.getElementById('mypage-main').style.display = 'none';
  }
});

async function loadUserData(uid) {
  try {
    const docSnap = await getDoc(doc(db, 'users', uid));
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.username) {
        document.getElementById('mypage-at-name').textContent = '@' + data.username;
        document.getElementById('username-form').style.display = 'none';
      } else {
        document.getElementById('username-form').style.display = 'flex';
      }
      if (data.avatar) {
        document.getElementById('mypage-avatar-img').src = data.avatar;
        document.getElementById('mypage-avatar-img').style.display = 'block';
        document.getElementById('mypage-avatar-placeholder').style.display = 'none';
      }
    } else {
      document.getElementById('username-form').style.display = 'flex';
    }
  } catch (e) {
    console.log(e);
  }
}

async function saveUsername() {
  const username = document.getElementById('username-input').value.trim();
  if (!username) { alert('ユーザー名を入力してください'); return; }
  try {
    const docSnap = await getDoc(doc(db, 'users', currentUser.uid));
    const existing = docSnap.exists() ? docSnap.data() : {};
    await setDoc(doc(db, 'users', currentUser.uid), { ...existing, username });
    document.getElementById('mypage-at-name').textContent = '@' + username;
    document.getElementById('username-form').style.display = 'none';
    alert('ユーザー名を設定しました！');
  } catch (e) {
    alert('エラー：' + e.message);
  }
}

async function uploadAvatar(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const avatarData = e.target.result;
    try {
      const docSnap = await getDoc(doc(db, 'users', currentUser.uid));
      const existing = docSnap.exists() ? docSnap.data() : {};
      await setDoc(doc(db, 'users', currentUser.uid), { ...existing, avatar: avatarData });
      document.getElementById('mypage-avatar-img').src = avatarData;
      document.getElementById('mypage-avatar-img').style.display = 'block';
      document.getElementById('mypage-avatar-placeholder').style.display = 'none';
      alert('アイコンを更新しました！');
    } catch (e) {
      alert('エラー：' + e.message);
    }
  };
  reader.readAsDataURL(file);
}

function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

async function logout() {
  await signOut(auth);
  location.href = 'index.html';
}

async function loadMyGames() {
  const list = document.getElementById('my-games');
  list.innerHTML = '<p class="empty">読み込み中...</p>';
  try {
    const q = query(collection(db, 'games'), where('uid', '==', currentUser.uid));
    const snapshot = await getDocs(q);
    const games = [];
    snapshot.forEach(d => games.push({ id: d.id, ...d.data() }));
    games.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    list.innerHTML = '';
    if (games.length === 0) {
      list.innerHTML = '<p class="empty">まだゲームを作っていません</p>';
      return;
    }
    games.forEach(game => list.appendChild(createMyGameCard(game)));
  } catch (e) {
    list.innerHTML = '<p class="empty">読み込みエラー：' + e.message + '</p>';
  }
}

function createMyGameCard(game) {
  const card = document.createElement('div');
  card.className = 'mypage-game-card';
  const genres = game.genres || [game.genre];
  const genreTags = genres.map(g => '<span class="game-genre-tag">' + g + '</span>').join('');
  card.innerHTML =
    '<div class="mypage-game-info">' +
    '<div class="genre-tags-row">' + genreTags + '</div>' +
    '<h4>' + game.title + '</h4>' +
    '<p>' + (game.description || '') + '</p>' +
    '<p class="game-playcount">プレイ数：' + (game.playCount || 0) + '回</p>' +
    '</div>' +
    '<div class="mypage-game-actions">' +
    '<a href="play.html?id=' + game.id + '" class="play-btn">遊ぶ</a>' +
    '<a href="edit.html?id=' + game.id + '" class="edit-btn">編集</a>' +
    '<button class="delete-game-btn" onclick="deleteGame(\'' + game.id + '\', \'' + game.title + '\')">削除</button>' +
    '</div>';
  return card;
}

async function deleteGame(gameId, title) {
  if (!confirm('「' + title + '」を本当に削除しますか？\nこの操作は取り消せません。')) return;
  try {
    await deleteDoc(doc(db, 'games', gameId));
    alert('削除しました');
    await loadMyGames();
  } catch (e) {
    alert('削除に失敗しました：' + e.message);
  }
}

async function loadPlayHistory() {
  const list = document.getElementById('play-history');
  list.innerHTML = '<p class="empty">読み込み中...</p>';
  try {
    const q = query(collection(db, 'playHistory'), where('uid', '==', currentUser.uid));
    const snapshot = await getDocs(q);
    const history = [];
    snapshot.forEach(d => history.push({ id: d.id, ...d.data() }));
    history.sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
    list.innerHTML = '';
    if (history.length === 0) {
      list.innerHTML = '<p class="empty">まだプレイ履歴がありません</p>';
      return;
    }
    history.forEach(h => {
      const div = document.createElement('div');
      div.className = 'history-item';
      const date = new Date(h.playedAt).toLocaleDateString('ja-JP');
      div.innerHTML =
        '<span class="history-title"><a href="play.html?id=' + h.gameId + '">' + h.gameTitle + '</a></span>' +
        '<span class="history-date">' + date + '</span>';
      list.appendChild(div);
    });
  } catch (e) {
    list.innerHTML = '<p class="empty">読み込みエラー：' + e.message + '</p>';
  }
}

window.toggleUserMenu = toggleUserMenu;
window.logout = logout;
window.deleteGame = deleteGame;
window.saveUsername = saveUsername;
window.uploadAvatar = uploadAvatar;