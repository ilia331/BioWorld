// BioWorld — начален файл (седмица 1).
// Засега само показва имената на петте мисии.
// Истинската навигация е за стъпка 3, а алгоритъмът ще бъде в отделен файл
// simulation.js (стъпка 6), без връзка с HTML, за да може да се тества.

const missions = [
  { number: 1, title: "Първи живот" },
  { number: 2, title: "Пресъхналият поток" },
  { number: 3, title: "Твърде много зайци" },
  { number: 4, title: "Изчезващият хищник" },
  { number: 5, title: "Непредвидима година" },
];

function showMissions() {
  const list = document.getElementById("mission-list");

  for (const mission of missions) {
    const item = document.createElement("li");
    // textContent (а не innerHTML) — текстът се показва като текст, не като HTML код
    item.textContent = `${mission.number}. ${mission.title}`;
    list.appendChild(item);
  }
}

showMissions();
document.getElementById("status").textContent = "начална версия";
