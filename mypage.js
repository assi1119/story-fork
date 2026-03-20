import { db, auth, onAuthStateChanged, signOut } from './firebase.js';
import { collection, getDocs, query, where, orderBy, doc, getDoc, updateDoc, deleteDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentUser = null;

onAuthStateChanged(auth, async user => {
  currentUser = user;
  if (user) {
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('login-btns').style.display = 'none';
    document.getElementById('not-logged-in-msg').style.display = 'none';
    document.getElementById('mypage-main').style.display = 'block';
    document.getElementById('user-name-text').textContent = user.displayName || user.email;
    document.getElementById('mypage-username').textContent = user.displayName || user.email;
    document.getElementById('mypage-email').textContent = user.email;
    await loadUserData(user);
    loadMyGames(user.uid);
    loadFollowCounts(user.uid);
  } else {
    document.getElementById('user-info').style.display = 'none';
    document.getElementById('login-btns').style.display = 'flex';
    document.getElementById('not-logged-in-msg').style.display = 'block';
    document.getElementById('mypage-main').style.display = 'none';
  }
});

function toggleUserMenu() {
  const dropdown = document.getElementById('user-dropdown');
  dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
}

async function logout() {
  await signOut(auth);
  location.href = 'index.html';
}

async function loadUserData(user) {
  try {
    const q = query(collection(db, 'users'), where('uid', '==', user.uid));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      if (data.avatar) {
        const img = document.getElementById('mypage-avatar-img');
        img.src = data.avatar;
        img.style.display = 'block';
        document.getElementById('mypage-avatar-placeholder').style.display = 'none';
        const headerImg = document.getElementById('header-avatar');
        if (headerImg) { headerImg.src = data.avatar; headerImg.style.display = 'block'; document.getElementById('header-avatar-placeholder').style.display = 'none'; }
      }
      if (data.username) {
        document.getElementById('mypage-at-name').textContent = '@' + data.username;
        document.getElementById('username-input').value = data.username;
      }
    }
  } catch (e) { console.log(e); }
}

async function uploadAvatar(input) {
  const file = input.files[0];
  if (!file || !currentUser) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    const avatarData = e.target.result;
    try {
      const q = query(collection(db, 'users'), where('uid', '==', currentUser.uid));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        await updateDoc(doc(db, 'users', snapshot.docs[0].id), { avatar: avatarData });
      } else {
        await addDoc(collection(db, 'users'), { uid: currentUser.uid, avatar: avatarData });
      }
      const img = document.getElementById('mypage-avatar-img');
      img.src = avatarData; img.style.display = 'block';
      document.getElementById('mypage-avatar-placeholder').style.display = 'none';
      const headerImg = document.getElementById('header-avatar');
      if (headerImg) { headerImg.src = avatarData; headerImg.style.display = 'block'; document.getElementById('header-avatar-placeholder').style.display = 'none'; }
      alert('アイコンを更新しました！');
    } catch(e) { alert('エラー：' + e.message); }
  };
  reader.readAsDataURL(file);
}

async function saveUsername() {
  if (!currentUser) return;
  const username = document.getElementById('username-input').value.trim();
  if (!username) { alert('ユーザー名を入力してください'); return; }
  try {
    const q = query(collection(db, 'users'), where('uid', '==', currentUser.uid));
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
      await updateDoc(doc(db, 'users', snapshot.docs[0].id), { username });
    } else {
      await addDoc(collection(db, 'users'), { uid: currentUser.uid, username });
    }
    document.getElementById('mypage-at-name').textContent = '@' + username;
    alert('@' + username + ' に設定しました！');
  } catch (e) { alert('エラー：' + e.message); }
}

async function loadFollowCounts(uid) {
  try {
    const followingSnap = await getDocs(query(collection(db, 'follows'), where('fromUid', '==', uid)));
    const followerSnap = await getDocs(query(collection(db, 'follows'), where('toUid', '==', uid)));
    document.getElementById('following-count').textContent = followingSnap.size + ' フォロー中';
    document.getElementById('follower-count').textContent = followerSnap.size + ' フォロワー';
  } catch (e) { console.log(e); }
}

async function showFollowList(type) {
  if (!currentUser) return;
  const modal = document.getElementById('follow-modal');
  const title = document.getElementById('follow-modal-title');
  const list = document.getElementById('follow-modal-list');
  title.textContent = type === 'following' ? 'フォロー中' : 'フォロワー';
  list.innerHTML = '<p class="empty">読み込み中...</p>';
  modal.style.display = 'flex';

  try {
    const field = type === 'following' ? 'fromUid' : 'toUid';
    const otherField = type === 'following' ? 'toUid' : 'fromUid';
    const snapshot = await getDocs(query(collection(db, 'follows'), where(field, '==', currentUser.uid)));
    const uids = [];
    snapshot.forEach(d => uids.push({ id: d.id, uid: d.data()[otherField] }));

    if (uids.length === 0) {
      list.innerHTML = '<p class="empty">まだ' + (type === 'following' ? 'フォロー中のユーザー' : 'フォロワー') + 'がいません</p>';
      return;
    }

    list.innerHTML = '';
    for (const item of uids) {
      const userSnap = await getDocs(query(collection(db, 'users'), where('uid', '==', item.uid)));
      let userName = item.uid;
      let avatarUrl = '';
      let atName = '';
      if (!userSnap.empty) {
        const userData = userSnap.docs[0].data();
        userName = userData.username || item.uid;
        avatarUrl = userData.avatar || '';
        atName = userData.username ? '@' + userData.username : '';
      }

      // フォローバック確認
      let isFollowingBack = false;
      if (type === 'followers') {
        const fbSnap = await getDocs(query(collection(db, 'follows'), where('fromUid', '==', currentUser.uid), where('toUid', '==', item.uid)));
        isFollowingBack = !fbSnap.empty;
      }

      const div = document.createElement('div');
      div.className = 'follow-list-item';
      div.innerHTML =
        '<div class="follow-list-user">' +
        (avatarUrl ? '<img src="' + avatarUrl + '" class="follow-list-avatar">' : '<div class="follow-list-avatar-placeholder"></div>') +
        '<div><div class="follow-list-name">' + userName + '</div>' +
        (atName ? '<div class="follow-list-at">' + atName + '</div>' : '') +
        '</div></div>' +
        '<div class="follow-list-actions">' +
        (type === 'following' ?
          '<button class="delete-game-btn" onclick="unfollowUser(\'' + item.id + '\', this)">フォロー解除</button>' :
          (!isFollowingBack ?
            '<button class="submit-btn" style="padding:6px 14px;font-size:12px;" onclick="followUser(\'' + item.uid + '\', this)">フォローバック</button>' :
            '<span style="color:var(--mint);font-size:12px;font-weight:700;">フォロー中✓</span>')
        ) +
        '</div>';
      list.appendChild(div);
    }
  } catch(e) { list.innerHTML = '<p class="empty">読み込みエラー：' + e.message + '</p>'; }
}

async function followUser(toUid, btn) {
  if (!currentUser) return;
  try {
    await addDoc(collection(db, 'follows'), {
      fromUid: currentUser.uid, toUid,
      createdAt: new Date().toISOString()
    });
    if (btn) { btn.textContent = 'フォロー中✓'; btn.disabled = true; btn.style.background = 'var(--mint-light)'; btn.style.color = 'var(--mint)'; }
    loadFollowCounts(currentUser.uid);
  } catch(e) { alert('エラー：' + e.message); }
}

async function unfollowUser(followId, btn) {
  if (!confirm('フォローを解除しますか？')) return;
  try {
    await deleteDoc(doc(db, 'follows', followId));
    const item = btn.closest('.follow-list-item');
    if (item) item.style.opacity = '0.4';
    btn.textContent = '解除済み'; btn.disabled = true;
    loadFollowCounts(currentUser.uid);
  } catch(e) { alert('エラー：' + e.message); }
}

function hideFollowModal() {
  document.getElementById('follow-modal').style.display = 'none';
}

async function loadMyGames(uid) {
  const list = document.getElementById('my-games-list');
  list.innerHTML = '<p class="empty">読み込み中...</p>';
  try {
    const q = query(collection(db, 'games'), where('uid', '==', uid));
    const snapshot = await getDocs(q);
    const games = [];
    snapshot.forEach(d => games.push({ id: d.id, ...d.data() }));
    games.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    list.innerHTML = '';
    if (games.length === 0) { list.innerHTML = '<p class="empty">まだゲームがありません</p>'; return; }
    games.forEach(game => {
      const card = document.createElement('div');
      card.className = 'mypage-game-card';
      card.innerHTML =
        '<div class="mypage-game-info">' +
        '<h4>' + game.title + '</h4>' +
        '<p>' + (game.description || '') + '</p>' +
        '<p style="font-size:12px;color:var(--mint);font-weight:700;">プレイ数：' + (game.playCount || 0) + '回　いいね：' + (game.likeCount || 0) + '</p>' +
        '</div>' +
        '<div class="mypage-game-actions">' +
        '<a href="play.html?id=' + game.id + '" class="play-btn">遊ぶ</a>' +
        '<a href="edit.html?id=' + game.id + '" class="edit-btn">編集</a>' +
        '<button class="delete-game-btn" onclick="deleteGame(\'' + game.id + '\')">削除</button>' +
        '</div>';
      list.appendChild(card);
    });
  } catch (e) { list.innerHTML = '<p class="empty">読み込みエラー：' + e.message + '</p>'; }
}

async function loadPlayHistory() {
  const list = document.getElementById('play-history-list');
  if (!list || !currentUser) return;
  list.innerHTML = '<p class="empty">読み込み中...</p>';
  try {
    const q = query(collection(db, 'playHistory'), where('uid', '==', currentUser.uid));
    const snapshot = await getDocs(q);
    const items = [];
    snapshot.forEach(d => items.push({ id: d.id, ...d.data() }));
    items.sort((a, b) => new Date(b.playedAt) - new Date(a.playedAt));
    list.innerHTML = '';
    if (items.length === 0) { list.innerHTML = '<p class="empty">プレイ履歴がありません</p>'; return; }
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML =
        '<div class="history-title"><a href="play.html?id=' + item.gameId + '">' + (item.gameTitle || 'タイトル不明') + '</a></div>' +
        '<div class="history-date">' + new Date(item.playedAt).toLocaleDateString('ja-JP') + '</div>';
      list.appendChild(div);
    });
  } catch (e) { list.innerHTML = '<p class="empty">読み込みエラー：' + e.message + '</p>'; }
}

async function loadFavorites() {
  const list = document.getElementById('favorites-list');
  if (!list || !currentUser) return;
  list.innerHTML = '<p class="empty">読み込み中...</p>';
  try {
    const q = query(collection(db, 'favorites'), where('uid', '==', currentUser.uid));
    const snapshot = await getDocs(q);
    const favs = [];
    snapshot.forEach(d => favs.push({ id: d.id, ...d.data() }));
    list.innerHTML = '';
    if (favs.length === 0) { list.innerHTML = '<p class="empty">お気に入りがありません</p>'; return; }
    for (const fav of favs) {
      try {
        const gameSnap = await getDoc(doc(db, 'games', fav.gameId));
        if (!gameSnap.exists()) continue;
        const game = { id: gameSnap.id, ...gameSnap.data() };
        const card = document.createElement('div');
        card.className = 'mypage-game-card';
        card.innerHTML =
          '<div class="mypage-game-info">' +
          '<h4>' + game.title + '</h4>' +
          '<p>' + (game.description || '') + '</p>' +
          '<p style="font-size:12px;color:var(--text-sub);">製作者：' + (game.author || '不明') + '</p>' +
          '</div>' +
          '<div class="mypage-game-actions">' +
          '<a href="play.html?id=' + game.id + '" class="play-btn">遊ぶ</a>' +
          '<button class="delete-game-btn" onclick="removeFavorite(\'' + fav.id + '\')">★解除</button>' +
          '</div>';
        list.appendChild(card);
      } catch(e) {}
    }
    if (list.innerHTML === '') list.innerHTML = '<p class="empty">お気に入りがありません</p>';
  } catch (e) { list.innerHTML = '<p class="empty">読み込みエラー：' + e.message + '</p>'; }
}

async function deleteGame(gameId) {
  if (!confirm('このゲームを削除しますか？\nこの操作は取り消せません。')) return;
  try {
    await deleteDoc(doc(db, 'games', gameId));
    alert('削除しました！');
    if (currentUser) loadMyGames(currentUser.uid);
  } catch (e) { alert('エラー：' + e.message); }
}

async function removeFavorite(favId) {
  if (!confirm('お気に入りを解除しますか？')) return;
  try {
    await deleteDoc(doc(db, 'favorites', favId));
    loadFavorites();
  } catch (e) { alert('エラー：' + e.message); }
}

function switchMypageTab(tab, btn) {
  document.querySelectorAll('.mypage-tab').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.getElementById('tab-games').style.display = 'none';
  document.getElementById('tab-history').style.display = 'none';
  document.getElementById('tab-favorites').style.display = 'none';
  document.getElementById('tab-' + tab).style.display = 'block';
  if (tab === 'history') loadPlayHistory();
  if (tab === 'favorites') loadFavorites();
}

window.toggleUserMenu = toggleUserMenu;
window.logout = logout;
window.uploadAvatar = uploadAvatar;
window.saveUsername = saveUsername;
window.deleteGame = deleteGame;
window.removeFavorite = removeFavorite;
window.switchMypageTab = switchMypageTab;
window.showFollowList = showFollowList;
window.hideFollowModal = hideFollowModal;
window.followUser = followUser;
window.unfollowUser = unfollowUser;