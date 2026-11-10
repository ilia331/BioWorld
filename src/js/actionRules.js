// Връща причина, ако действието е недопустимо; иначе връща null.
// Това е само проверка. Промяната на популациите е за simulation.js.
function actionError(action, state) {
  if (action === "plant-grass") {
    if (state.water < 10) return "Нужни са поне 10 вода за засаждане на трева.";
    if (state.grass >= 500) return "Тревата вече е достигнала максимума 500.";
    return null;
  }

  if (action === "restore-water") {
    if (state.waterUses >= 2) return "Водоемът може да се възстанови най-много 2 пъти.";
    if (state.water >= 100) return "Водата вече е достигнала максимума 100.";
    return null;
  }

  if (action === "add-rabbits") {
    if (state.rabbitUses >= 3) return "Зайци могат да се добавят най-много 3 пъти.";
    if (state.rabbits >= 200) return "Зайците вече са достигнали максимума 200.";
    return null;
  }

  if (action === "add-foxes") {
    if (state.foxUses >= 2) return "Лисици могат да се добавят най-много 2 пъти.";
    if (state.foxes >= 50) return "Лисиците вече са достигнали максимума 50.";
    return null;
  }

  if (action === "none") return null;
  return "Непознато действие.";
}

// Ходът може да се поиска само след действие и четири прогнози.
function canContinue(actionChosen, predictionCount, screenState) {
  return Boolean(actionChosen) && predictionCount === 4 && screenState === "ready";
}
