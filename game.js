const params = new URLSearchParams(window.location.search);
const gameId = params.get("id");

fetch("games.json")
  .then(res => res.json())
  .then(games => {
    const game = games.find(g => g.id === gameId);
    if (!game) {
      document.getElementById("scene-title").textContent = "ゲームが見つかりません";
      return;
    }
    showScene("start", game.story);
  });

function showScene(sceneId, story) {
  const scene = story[sceneId];
  document.getElementById("scene-title").textContent = scene.title;
  document.getElementById("scene-text").textContent = scene.text;

  const choicesDiv = document.getElementById("choices");
  choicesDiv.innerHTML = "";

  scene.choices.forEach(choice => {
    const button = document.createElement("button");
    button.textContent = choice.text;
    button.onclick = () => showScene(choice.next, story);
    choicesDiv.appendChild(button);
  });
}