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

const dashboard = document.querySelector("#dashboard");

if (dashboard) {
  const elements = {
    error: document.querySelector("#loadError"),
    creditTotal: document.querySelector("#creditTotal"),
    totalProgress: document.querySelector("#totalProgress"),
    totalProgressBar: document.querySelector("#totalProgressBar"),
    totalPercent: document.querySelector("#totalPercent"),
    progressRows: document.querySelector("#progressRows"),
    progressNotice: document.querySelector("#progressNotice"),
    earnedCredits: document.querySelector("#earnedCredits"),
    creditDonut: document.querySelector("#creditDonut"),
    donutPercent: document.querySelector("#donutPercent"),
    categoryProgress: document.querySelector("#categoryProgress"),
    domainCreditTotal: document.querySelector("#domainCreditTotal"),
    domainCards: document.querySelector("#domainCards"),
    domainNotice: document.querySelector("#domainNotice"),
    freeCreditLabel: document.querySelector("#freeCreditLabel"),
    freeCreditBar: document.querySelector("#freeCreditBar"),
    selectedSummary: document.querySelector("#selectedSummary"),
    selectedCourses: document.querySelector("#selectedCourses"),
    emptySelected: document.querySelector("#emptySelected"),
    courseCount: document.querySelector("#courseCount"),
    gradeFilterLabel: document.querySelector('label[for="gradeFilter"]'),
    gradeFilter: document.querySelector("#gradeFilter"),
    courseSearch: document.querySelector("#courseSearch"),
    courseFilters: document.querySelector("#courseFilters"),
    courseRows: document.querySelector("#courseRows"),
    emptyCourses: document.querySelector("#emptyCourses"),
    coursePagination: document.querySelector("#coursePagination"),
    pageSummary: document.querySelector("#pageSummary"),
    previousPage: document.querySelector("#previousPage"),
    nextPage: document.querySelector("#nextPage"),
    openCourseForm: document.querySelector("#openCourseForm"),
    courseDialog: document.querySelector("#courseDialog"),
    courseForm: document.querySelector("#courseForm"),
    closeCourseForm: document.querySelector("#closeCourseForm"),
    cancelCourseForm: document.querySelector("#cancelCourseForm"),
  };
  const categoryGroups = [
    { label: "資工系必選修", categories: ["專業必修", "專業選修"] },
    { label: "體育", categories: ["體育", "特色運動"] },
    { label: "校共同必修", categories: ["校共同必修"] },
    { label: "通識", categories: ["通識"] },
  ];
  const courseGroup = (course) => course.group
    || categoryGroups.find((group) => group.categories.includes(course.category))?.label
    || "其他系所";
  const groupForCategory = (category) => categoryGroups.find((group) => (
    group.label === category || group.categories.includes(category)
  ))?.label || "其他系所";
  const gradeLabel = (grade) => ({ 0: "其他年級", 1: "大一", 2: "大二", 3: "大三" }[grade] || `大${grade}`);
  const weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五"];
  const selectedCourseStorageKey = "selectedCourses";
  const categoryTone = {
    "系必修": "required",
    "專業必修": "required",
    "資工系必選修": "required",
    "專業選修": "elective",
    "校共同必修": "common",
    "通識": "general",
    "體育": "physical",
    "特色運動": "sport",
  };
  const courseTypeTone = (course) => {
    if (course.category === "通識" && course.domain) {
      return {
        人文: "humanities",
        社會: "society",
        自然: "nature",
        特色: "featured",
      }[course.domain] || "general";
    }
    return {
      專業必修: "major-required",
      專業選修: "major-elective",
      校共同必修: "common-required",
    }[course.category] || categoryTone[course.category] || "required";
  };
  let data;
  const selectedIds = new Set();
  let activeCategory = categoryGroups[0].label;
  let currentPage = 1;
  const pageSize = 8;

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const percentage = (value, target) => target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const updateProgress = (bar, value, target) => {
    bar.style.width = `${percentage(value, target)}%`;
  };

  const selectedCourses = () => data.courses.filter((course) => selectedIds.has(course.id));
  const plannedCreditsFor = (matches) => selectedCourses()
    .filter(matches)
    .reduce((sum, course) => sum + course.credits, 0);
  const plannedCreditsForRequirement = (requirement) => {
    const name = requirement.name.trim();
    if (requirement.child) {
      const domain = name.match(/人文|社會|自然|特色/)?.[0];
      return domain ? plannedCreditsFor((course) => course.category === "通識" && course.domain === domain) : 0;
    }
    if (name.startsWith("系必修")) return plannedCreditsFor((course) => course.category === "專業必修");
    if (name === "專業選修") return plannedCreditsFor((course) => course.category === "專業選修");
    if (name === "校共同必修") return plannedCreditsFor((course) => course.category === "校共同必修");
    if (name === "通識領域課程") return plannedCreditsFor((course) => course.category === "通識");
    if (name === "自由學分") {
      return plannedCreditsFor((course) => ["體育", "特色運動"].includes(course.category));
    }
    return 0;
  };
  const courseTimeSlots = (course) => {
    const slots = new Set();
    for (const [, day, firstPeriod, lastPeriod = firstPeriod] of String(course.time).matchAll(/([1-5])([a-j])([a-j])?/gi)) {
      const first = firstPeriod.toLowerCase().charCodeAt(0);
      const last = lastPeriod.toLowerCase().charCodeAt(0);
      for (let period = first; period <= last; period += 1) {
        slots.add(`${day}-${period}`);
      }
    }
    return slots;
  };
  const coursesConflict = (first, second) => {
    const firstSlots = courseTimeSlots(first);
    return [...courseTimeSlots(second)].some((slot) => firstSlots.has(slot));
  };
  const persistSelectedCourses = () => {
    try {
      sessionStorage.setItem(selectedCourseStorageKey, JSON.stringify(selectedCourses()));
    } catch (error) {
      elements.error.hidden = false;
      elements.error.textContent = `無法暫存選課資料：${error.message}`;
    }
  };

  function renderProgress() {
    const plannedCredits = selectedCourses().reduce((sum, course) => sum + course.credits, 0);
    const currentCredits = data.credits.earned + plannedCredits;
    const percent = percentage(currentCredits, data.credits.required);
    elements.progressRows.replaceChildren();
    elements.categoryProgress.replaceChildren();
    elements.domainCards.replaceChildren();
    elements.creditTotal.textContent = `已修學分 ${currentCredits} / ${data.credits.required}`;
    elements.totalProgress.setAttribute("aria-valuemin", "0");
    elements.totalProgress.setAttribute("aria-valuemax", String(data.credits.required));
    elements.totalProgress.setAttribute("aria-valuenow", String(currentCredits));
    updateProgress(elements.totalProgressBar, currentCredits, data.credits.required);
    elements.totalPercent.textContent = `${percent}%`;
    elements.earnedCredits.textContent = `${currentCredits} / ${data.credits.required}`;
    elements.donutPercent.textContent = `${percent}%`;
    elements.creditDonut.style.background = `conic-gradient(var(--blue) ${percent}%, #dce7f5 ${percent}%)`;
    elements.progressNotice.textContent = data.notices.progress;

    data.creditRequirements.forEach((requirement) => {
      const earned = requirement.earned + plannedCreditsForRequirement(requirement);
      const row = make("div", `progress-row${requirement.child ? " child-row" : ""}`);
      row.append(make("span", "progress-row-name", requirement.name));
      row.append(make("span", "progress-row-value", `${earned} / ${requirement.required}`));
      row.append(make("span", "progress-row-percent", `${percentage(earned, requirement.required)}%`));
      elements.progressRows.append(row);
    });

    data.categories.forEach((category) => {
      const planned = category.name === "系必修"
        ? plannedCreditsFor((course) => course.category === "專業必修")
        : plannedCreditsFor((course) => course.category === category.name);
      const earned = category.earned + planned;
      const line = make("div", `category-line tone-${categoryTone[category.name] || "required"}`);
      const labels = make("div");
      labels.append(make("strong", "", category.name));
      labels.append(make("span", "", `${percentage(earned, category.required)}%`));
      const track = make("div", "progress-track");
      const fill = make("span");
      updateProgress(fill, earned, category.required);
      track.append(fill);
      line.append(labels, track);
      elements.categoryProgress.append(line);
    });

    const generalEducation = data.creditRequirements.find((requirement) => requirement.name === "通識領域課程");
    const generalEducationEarned = generalEducation.earned + plannedCreditsFor((course) => course.category === "通識");
    elements.domainCreditTotal.textContent = `${generalEducationEarned} / ${generalEducation.required} 學分`;
    data.domains.forEach((domain) => {
      const earned = domain.earned + plannedCreditsFor((course) => course.category === "通識" && course.domain === domain.name);
      const chip = make("div", "domain-chip");
      const heading = make("div", "domain-chip-heading");
      const name = make("span", "domain-name");
      const dot = make("span", "domain-dot");
      dot.style.backgroundColor = domain.color;
      name.append(dot, document.createTextNode(domain.name));
      heading.append(name, make("strong", "", `${earned}/${domain.required}`));
      const track = make("div", "progress-track");
      const fill = make("span");
      track.setAttribute("role", "progressbar");
      track.setAttribute("aria-label", `${domain.name}通識學分進度`);
      track.setAttribute("aria-valuemin", "0");
      track.setAttribute("aria-valuemax", String(domain.required));
      track.setAttribute("aria-valuenow", String(earned));
      fill.style.backgroundColor = domain.color;
      updateProgress(fill, earned, domain.required);
      track.append(fill);
      chip.append(heading, track);
      elements.domainCards.append(chip);
    });
    elements.domainNotice.textContent = data.notices.domains;
    const freeCreditsEarned = data.freeCredits.earned + plannedCreditsFor((course) => ["體育", "特色運動"].includes(course.category));
    elements.freeCreditLabel.textContent = `${percentage(freeCreditsEarned, data.freeCredits.required)}%`;
    updateProgress(elements.freeCreditBar, freeCreditsEarned, data.freeCredits.required);
  }

  function renderSelected() {
    const selected = data.courses.filter((course) => selectedIds.has(course.id));
    const total = selected.reduce((sum, course) => sum + course.credits, 0);
    elements.selectedSummary.textContent = `${selected.length} 門・${total} 學分`;
    elements.selectedCourses.replaceChildren();
    elements.emptySelected.hidden = selected.length > 0;
    selected.forEach((course) => {
      const item = make("li", "selected-item");
      item.append(make("span", "", course.name));
      const remove = make("button", "remove-course", "移除");
      remove.type = "button";
      remove.setAttribute("aria-label", `移除${course.name}`);
      remove.dataset.removeCourse = course.id;
      item.append(remove);
      elements.selectedCourses.append(item);
    });
  }

  function renderFilters() {
    elements.courseFilters.replaceChildren();
    categoryGroups.forEach((group) => {
      const button = make("button", "course-tab");
      button.type = "button";
      button.dataset.category = group.label;
      button.classList.add(`tone-${categoryTone[group.label] || "required"}`);
      button.setAttribute("aria-pressed", String(activeCategory === group.label));
      button.append(document.createTextNode(group.label));
      const count = data.courses.filter((course) => courseGroup(course) === group.label).length;
      button.append(make("span", "tab-count", String(count)));
      elements.courseFilters.append(button);
    });
  }

  function renderFilterOptions() {
    let options;
    if (activeCategory === "資工系必選修") {
      elements.gradeFilterLabel.textContent = "年級篩選";
      options = [1, 2, 3].map((grade) => [String(grade), gradeLabel(grade)]);
    } else if (activeCategory === "校共同必修") {
      elements.gradeFilterLabel.textContent = "年級篩選";
      options = [1, 2].map((grade) => [String(grade), gradeLabel(grade)]);
    } else if (activeCategory === "體育") {
      elements.gradeFilterLabel.textContent = "體育類別篩選";
      options = [["feature", "特色運動"], ["required", "校共同必修"]];
    } else if (activeCategory === "通識") {
      elements.gradeFilterLabel.textContent = "星期篩選";
      options = weekdays.map((weekday, index) => [String(index + 1), weekday]);
    } else {
      elements.gradeFilterLabel.textContent = "年級篩選";
      options = [["all", "全部年級"]];
      [...new Set(data.courses.map((course) => course.grade))]
        .sort((a, b) => a - b)
        .forEach((grade) => options.push([String(grade), gradeLabel(grade)]));
    }

    const previousValue = elements.gradeFilter.value;
    elements.gradeFilter.replaceChildren(...options.map(([value, label]) => {
      const option = make("option", "", label);
      option.value = value;
      return option;
    }));
    elements.gradeFilter.value = options.some(([value]) => value === previousValue)
      ? previousValue
      : options[0][0];
  }

  function renderCourses() {
    const search = elements.courseSearch.value.trim().toLocaleLowerCase();
    const filterValue = elements.gradeFilter.value;
    const activeGroup = categoryGroups.find((group) => group.label === activeCategory);
    const courses = data.courses.filter((course) => {
      const matchesCategory = activeGroup !== undefined && courseGroup(course) === activeGroup.label;
      let matchesFilter;
      if (activeCategory === "資工系必選修") {
        matchesFilter = String(course.grade) === filterValue;
      } else if (activeCategory === "校共同必修") {
        matchesFilter = String(course.grade) === filterValue;
      } else if (activeCategory === "體育") {
        const isFeatureSport = course.name.startsWith("體育");
        matchesFilter = filterValue === "feature" ? isFeatureSport : !isFeatureSport;
      } else if (activeCategory === "通識") {
        matchesFilter = String(course.time).match(/^([1-7])/)?.[1] === filterValue;
      } else {
        matchesFilter = filterValue === "all" || String(course.grade) === filterValue;
      }
      const matchesSearch = `${course.name} ${course.teacher}`.toLocaleLowerCase().includes(search);
      return matchesCategory && matchesFilter && matchesSearch;
    });
    const pageCount = Math.ceil(courses.length / pageSize);
    currentPage = Math.min(currentPage, Math.max(pageCount, 1));
    const visibleCourses = courses.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    elements.courseRows.replaceChildren();
    elements.courseCount.textContent = `共 ${courses.length} 門`;
    elements.emptyCourses.hidden = courses.length > 0;
    elements.pageSummary.textContent = `第 ${pageCount === 0 ? 0 : currentPage} / ${pageCount} 頁`;
    elements.previousPage.disabled = currentPage <= 1;
    elements.nextPage.disabled = currentPage >= pageCount;
    visibleCourses.forEach((course) => {
      const row = make("tr");
      row.append(make("td", "", course.name));
      const type = make("td");
      const typeClass = `type-pill tone-${courseTypeTone(course)}`;
      type.append(make("span", typeClass, course.domain ? `${course.category}・${course.domain}` : course.category));
      row.append(type, make("td", "", String(course.credits)), make("td", "", course.time), make("td", "", course.teacher), make("td", "", course.location));
      const status = make("td");
      const isSelected = selectedIds.has(course.id);
      const hasConflict = !isSelected && selectedCourses().some((selected) => coursesConflict(course, selected));
      status.append(make(
        "span",
        `status-pill${isSelected ? " is-added" : hasConflict ? " is-conflict" : ""}`,
        isSelected ? "已選" : hasConflict ? "衝堂" : "未選",
      ));
      row.append(status);
      const action = make("td");
      const button = make("button", `add-course${isSelected ? " is-selected" : ""}`, isSelected ? "退選" : "加入");
      button.type = "button";
      button.dataset.addCourse = course.id;
      action.append(button);
      row.append(action);
      elements.courseRows.append(row);
    });
  }

  function render() {
    renderProgress();
    renderFilters();
    renderFilterOptions();
    renderSelected();
    renderCourses();
    dashboard.setAttribute("aria-busy", "false");
  }

  elements.courseFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category;
    currentPage = 1;
    renderFilterOptions();
    elements.courseFilters.querySelectorAll("[data-category]").forEach((filter) => {
      filter.setAttribute("aria-pressed", String(filter === button));
    });
    renderCourses();
  });
  elements.courseRows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-course]");
    if (!button) return;
    if (selectedIds.has(button.dataset.addCourse)) {
      selectedIds.delete(button.dataset.addCourse);
    } else {
      selectedIds.add(button.dataset.addCourse);
    }
    persistSelectedCourses();
    renderProgress();
    renderSelected();
    renderCourses();
  });
  elements.selectedCourses.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-course]");
    if (!button) return;
    selectedIds.delete(button.dataset.removeCourse);
    persistSelectedCourses();
    renderProgress();
    renderSelected();
    renderCourses();
  });
  elements.gradeFilter.addEventListener("change", () => {
    currentPage = 1;
    renderCourses();
  });
  elements.courseSearch.addEventListener("input", () => {
    currentPage = 1;
    renderCourses();
  });
  elements.previousPage.addEventListener("click", () => {
    currentPage -= 1;
    renderCourses();
  });
  elements.nextPage.addEventListener("click", () => {
    currentPage += 1;
    renderCourses();
  });
  elements.openCourseForm.addEventListener("click", () => elements.courseDialog.showModal());
  [elements.closeCourseForm, elements.cancelCourseForm].forEach((button) => {
    button.addEventListener("click", () => elements.courseDialog.close());
  });
  elements.courseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = new FormData(elements.courseForm);
    const name = String(fields.get("name")).trim();
    const category = name.includes("資工") ? "專業必修" : String(fields.get("category"));
    const grade = Number(fields.get("grade"));
    data.courses.push({
      id: `manual-${Date.now()}-${data.courses.length}`,
      name,
      category,
      group: groupForCategory(category),
      credits: Number(fields.get("credits")),
      time: String(fields.get("time")).trim(),
      teacher: String(fields.get("teacher")).trim(),
      location: String(fields.get("location")).trim(),
      grade,
    });
    activeCategory = groupForCategory(category);
    renderFilterOptions();
    elements.courseSearch.value = "";
    currentPage = 1;
    elements.courseDialog.close();
    elements.courseForm.reset();
    renderFilters();
    renderCourses();
  });

  Promise.all([
    fetch("data/progress.json"),
    fetch("/api/courses"),
  ])
    .then(async ([progressResponse, coursesResponse]) => {
      if (!progressResponse.ok) throw new Error(`無法載入學分進度設定（HTTP ${progressResponse.status}）`);
      if (!coursesResponse.ok) throw new Error(`無法載入課程資料（HTTP ${coursesResponse.status}）`);
      data = await progressResponse.json();
      const courseData = await coursesResponse.json();
      data.courses = courseData.courses;
      const storedSelection = sessionStorage.getItem(selectedCourseStorageKey);
      if (storedSelection) {
        const storedCourses = JSON.parse(storedSelection);
        if (!Array.isArray(storedCourses) || !storedCourses.every((course) => (
          course && typeof course.id === "string" && typeof course.name === "string"
          && typeof course.credits === "number" && typeof course.time === "string"
        ))) {
          throw new Error("暫存的選課資料格式錯誤");
        }
        storedCourses.forEach((storedCourse) => {
          if (!data.courses.some((course) => course.id === storedCourse.id)) {
            data.courses.push(storedCourse);
          }
          selectedIds.add(storedCourse.id);
        });
      }
      render();
    })
    .catch((error) => {
      elements.error.hidden = false;
      elements.error.textContent = `${error.message}，請確認學分進度設定與課程 API 是否可正常存取。`;
      dashboard.setAttribute("aria-busy", "false");
    });
}