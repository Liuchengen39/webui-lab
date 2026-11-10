const menuButton = document.querySelector(".menu-toggle");

if (menuButton) {
  const closeMenu = () => {
    document.body.classList.remove("sidebar-open");
    menuButton.setAttribute("aria-expanded", "false");
  };

  menuButton.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("sidebar-open");
    menuButton.setAttribute("aria-expanded", String(isOpen));
  });
  document.querySelector("[data-close-menu]")?.addEventListener("click", closeMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
  document.querySelectorAll(".side-nav a").forEach((link) => link.addEventListener("click", closeMenu));
}

const scheduleTable = document.querySelector(".schedule-table");

if (scheduleTable) {
  const scheduleMessage = document.querySelector("#scheduleMessage");
  const storageKey = "selectedCourses.v2";
  const PALETTE = [
    ["#e8f1ff", "#c5dcff", "#1f4f9e", "#3b82f6"],
    ["#e6f7ef", "#bfe8d3", "#1d7a55", "#34b27b"],
    ["#f1e9fd", "#dccbf7", "#6b3fa8", "#9b6ee0"],
    ["#fff1e0", "#fcd9ac", "#9a5a12", "#f59e2b"],
    ["#fdeaf1", "#f8c9dc", "#a1325f", "#ec5b97"],
    ["#e0f6f6", "#b4e6e6", "#17717a", "#19b0b8"],
    ["#fff8d9", "#f5e8a1", "#86690c", "#e0b81d"],
    ["#e9ebff", "#cdd2fb", "#3a43a3", "#6470e6"],
    ["#eef8dc", "#d3ebab", "#4a6f12", "#86c232"],
    ["#eef1f6", "#d3dae6", "#43546d", "#7a8aa5"],
  ];
  const CONFLICT_COLOR = ["#fff0f0", "#ffc4c8", "#b0303a", "#e5484d"];

  function parseCourseMeetings(time, periodCount) {
    const meetings = [];
    for (const [, day, periodCodes] of String(time).matchAll(/([1-5])([a-j]+)/gi)) {
      const periods = [...new Set(
        [...periodCodes.toLowerCase()].map((code) => code.charCodeAt(0) - 97),
      )].filter((period) => period < periodCount).sort((a, b) => a - b);
      let run = [];
      periods.forEach((period) => {
        if (run.length && period !== run[run.length - 1] + 1) {
          meetings.push({ day: Number(day), periods: run });
          run = [];
        }
        run.push(period);
      });
      if (run.length) {
        meetings.push({ day: Number(day), periods: run });
      }
    }
    return meetings;
  }

  function buildScheduleGrid(tbody) {
    const rows = [...tbody.rows];
    const grid = rows.map(() => []);
    rows.forEach((row, rowIndex) => {
      let column = 1;
      [...row.cells].slice(1).forEach((cell) => {
        while (grid[rowIndex][column]) column += 1;
        for (let span = 0; span < cell.rowSpan && rowIndex + span < rows.length; span += 1) {
          grid[rowIndex + span][column] = cell;
        }
        column += 1;
      });
    });
    return grid;
  }

  function addCourseCard(cell, course, isConflict, courseColor) {
    const card = document.createElement("span");
    card.className = `schedule-course-card schedule-selected-course${isConflict ? " is-conflict" : ""}`;
    const [background, border, text, accent] = isConflict ? CONFLICT_COLOR : courseColor;
    card.style.setProperty("--course-background", background);
    card.style.setProperty("--course-border", border);
    card.style.setProperty("--course-text", text);
    card.style.setProperty("--course-accent", accent);
    const name = document.createElement("strong");
    name.textContent = course.name;
    const details = document.createElement("small");
    details.textContent = `${course.time}${course.location ? `・${course.location}` : ""}`;
    card.append(name, details);
    cell.append(card);
  }

  function clearDefaultSchedule() {
    [...scheduleTable.tBodies[0].rows].forEach((row) => {
      const periodHeader = row.cells[0];
      row.replaceChildren(periodHeader, ...Array.from({ length: 5 }, () => document.createElement("td")));
    });
  }

  function renderSelectedTimetable() {
    clearDefaultSchedule();
    scheduleTable.querySelectorAll(".schedule-selected-course").forEach((card) => card.remove());
    scheduleTable.querySelectorAll(".schedule-course-card.is-conflict").forEach((card) => {
      card.classList.remove("is-conflict");
    });

    Promise.resolve()
      .then(() => sessionStorage.getItem(storageKey))
      .then((storedSelection) => {
        const selectedCourses = storedSelection ? JSON.parse(storedSelection) : [];
        if (!Array.isArray(selectedCourses) || !selectedCourses.every((course) => (
          course && typeof course.id === "string" && typeof course.name === "string"
          && typeof course.time === "string"
        ))) {
          throw new Error("暫存的選課資料格式錯誤");
        }
        const tbody = scheduleTable.tBodies[0];
        const grid = buildScheduleGrid(tbody);
        const staticCardsBySlot = new Map();
        const selectedBySlot = new Map();
        const selectedMeetings = selectedCourses.map((course, index) => ({
          course,
          meetings: parseCourseMeetings(course.time, grid.length),
          color: PALETTE[index % PALETTE.length],
        }));

        grid.forEach((row, period) => {
          row.forEach((cell, day) => {
            if (!cell) return;
            const slot = `${day}-${period}`;
            const staticCards = [...cell.querySelectorAll(".schedule-course-card")];
            if (staticCards.length) staticCardsBySlot.set(slot, staticCards);
          });
        });

        selectedMeetings.forEach(({ course, meetings }) => {
          meetings.forEach(({ day, periods }) => {
            periods.forEach((period) => {
              const slot = `${day}-${period}`;
              if (!selectedBySlot.has(slot)) selectedBySlot.set(slot, new Set());
              selectedBySlot.get(slot).add(course.id);
            });
          });
        });

        selectedMeetings.forEach(({ course, meetings, color }) => {
          const isConflict = meetings.some(({ day, periods }) => periods.some((period) => {
            const slot = `${day}-${period}`;
            return staticCardsBySlot.has(slot) || selectedBySlot.get(slot).size > 1;
          }));
          if (isConflict) {
            meetings.forEach(({ day, periods }) => {
              periods.forEach((period) => {
                (staticCardsBySlot.get(`${day}-${period}`) || []).forEach((card) => card.classList.add("is-conflict"));
              });
            });
          }
          meetings.forEach(({ day, periods }) => {
            const cell = grid[periods[0]]?.[day];
            if (!cell) return;
            addCourseCard(cell, course, isConflict, color);
            if (!isConflict && periods.length > 1) {
              cell.rowSpan = periods.length;
              periods.slice(1).forEach((period) => grid[period]?.[day]?.remove());
            }
          });
        });

        scheduleMessage.classList.remove("load-error");
        scheduleMessage.textContent = selectedCourses.length
          ? `已選 ${selectedCourses.length} 門課程；紅色標示代表與課表既有課程或其他已選課程衝堂。`
          : "加入課程後會顯示在此課表；紅色標示代表衝堂。";
      })
      .catch((error) => {
        scheduleMessage.classList.add("load-error");
        scheduleMessage.textContent = `${error.message}，請確認課程暫存資料。`;
      });
  }

  renderSelectedTimetable();
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) renderSelectedTimetable();
  });
}
