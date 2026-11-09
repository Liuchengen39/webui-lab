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
  const storageKey = "selectedCourses";

  function parseCourseMeetings(time, periodCount) {
    const meetings = [];
    for (const [, day, firstPeriod, lastPeriod = firstPeriod] of String(time).matchAll(/([1-5])([a-j])([a-j])?/gi)) {
      const first = firstPeriod.toLowerCase().charCodeAt(0) - 97;
      const last = lastPeriod.toLowerCase().charCodeAt(0) - 97;
      const periods = [];
      for (let period = first; period <= last && period < periodCount; period += 1) {
        periods.push(period);
      }
      if (periods.length) meetings.push({ day: Number(day), periods });
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

  function addCourseCard(cell, course, isConflict) {
    const card = document.createElement("span");
    card.className = `schedule-course-card schedule-selected-course${isConflict ? " is-conflict" : ""}`;
    const name = document.createElement("strong");
    name.textContent = course.name;
    const details = document.createElement("small");
    details.textContent = `${course.time}${course.location ? `・${course.location}` : ""}`;
    card.append(name, details);
    cell.append(card);
  }

  function renderSelectedTimetable() {
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
        const selectedMeetings = selectedCourses.map((course) => ({
          course,
          meetings: parseCourseMeetings(course.time, grid.length),
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

        selectedMeetings.forEach(({ course, meetings }) => {
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
            addCourseCard(cell, course, isConflict);
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
