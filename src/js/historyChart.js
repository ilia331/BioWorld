// Графиката използва същите състояния, които показва игровият екран.
const CHART_LINES = [
  { key: "water", label: "Вода", max: 100, color: "#3186a8" },
  { key: "grass", label: "Трева", max: 500, color: "#39864d" },
  { key: "rabbits", label: "Зайци", max: 200, color: "#bd843a" },
  { key: "foxes", label: "Лисици", max: 50, color: "#a85c62" },
];

function chartData(history) {
  return {
    labels: history.map((state) => String(state.turn)),
    datasets: CHART_LINES.map((line) => ({
      label: line.label,
      data: history.map((state) => Math.round(state[line.key] / line.max * 100)),
      borderColor: line.color,
      backgroundColor: line.color,
      tension: 0.2,
      pointRadius: 3,
      rawValues: history.map((state) => state[line.key]),
    })),
  };
}

// Избира ходовете с най-голяма обща промяна за екрана с резултат.
function keyDecisions(entries) {
  return entries.map((entry) => ({
    ...entry,
    change: CHART_LINES.reduce((sum, line) =>
      sum + Math.abs(entry.after[line.key] - entry.before[line.key]) / line.max, 0),
  })).sort((a, b) => b.change - a.change).slice(0, 3);
}

function drawHistoryChart(canvas, history) {
  if (canvas.chartInstance) canvas.chartInstance.destroy();
  if (!window.Chart) return false;

  const data = chartData(history);
  canvas.chartInstance = new window.Chart(canvas, {
    type: "line",
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { min: 0, max: 100, title: { display: true, text: "% от максимума" } },
        x: { title: { display: true, text: "Ход" } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (item) => `${item.dataset.label}: ${item.dataset.rawValues[item.dataIndex]}`,
          },
        },
      },
    },
  });
  return true;
}
