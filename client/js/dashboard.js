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
    selectedCard: document.querySelector(".selected-card"),
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
  const selectedCourseStorageKey = "selectedCourses.v2";
  const clearSelectionFlag = "clearSelectedCoursesOnReturn";
  const userCoursesApi = "api/user/courses";
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
  let authStateKnown = false;
  let authenticatedUser = null;
  let authRevision = 0;
  let userCoursesEnabled = false;
  let serverSaveQueue = Promise.resolve();
  let selectionRevision = 0;
  let activeCategory = categoryGroups[0].label;
  let currentPage = 1;
  const pageSize = 8;
  let selectedCardResizeFrame;
  let selectedCardResizeTimer;
  let finishSelectedCardResize = () => {};

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
  const resizeSelectedCard = (update) => {
    finishSelectedCardResize();
    const card = elements.selectedCard;
    const originalHeight = card.style.height;
    const originalOverflow = card.style.overflow;
    const startHeight = card.getBoundingClientRect().height;
    card.style.height = `${startHeight}px`;
    card.style.overflow = "hidden";
    update();

    const styles = getComputedStyle(card);
    const borderHeight = Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth);
    const endHeight = card.scrollHeight + borderHeight;
    const restore = () => {
      cancelAnimationFrame(selectedCardResizeFrame);
      clearTimeout(selectedCardResizeTimer);
      card.removeEventListener("transitionend", handleTransitionEnd);
      card.style.height = originalHeight;
      card.style.overflow = originalOverflow;
      if (finishSelectedCardResize === restore) finishSelectedCardResize = () => {};
    };
    const handleTransitionEnd = (event) => {
      if (event.target === card && event.propertyName === "height") restore();
    };
    finishSelectedCardResize = restore;

    if (matchMedia("(prefers-reduced-motion: reduce)").matches || Math.abs(endHeight - startHeight) < 1) {
      restore();
      return;
    }

    card.addEventListener("transitionend", handleTransitionEnd);
    selectedCardResizeFrame = requestAnimationFrame(() => {
      card.style.height = `${endHeight}px`;
    });
    selectedCardResizeTimer = window.setTimeout(restore, 350);
  };

  const selectedCourses = () => data.courses.filter((course) => selectedIds.has(course.id));
  const creditCategory = (course) => (
    course.courseCode === "903166" ? "校共同必修" : course.category
  );
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
    if (name === "校共同必修") return plannedCreditsFor((course) => creditCategory(course) === "校共同必修");
    if (name === "通識領域課程") return plannedCreditsFor((course) => course.category === "通識");
    if (name === "自由學分") {
      return plannedCreditsFor((course) => ["體育", "特色運動"].includes(creditCategory(course)));
    }
    return 0;
  };
  const courseTimeSlots = (course) => {
    const slots = new Set();
    for (const [, day, periodCodes] of String(course.time).matchAll(/([1-5])([a-k]+)/gi)) {
      [...new Set([...periodCodes.toLowerCase()].map((code) => code.charCodeAt(0)))]
        .forEach((period) => slots.add(`${day}-${period}`));
    }
    return slots;
  };
  const coursesConflict = (first, second) => {
    const firstSlots = courseTimeSlots(first);
    return [...courseTimeSlots(second)].some((slot) => firstSlots.has(slot));
  };
  const showUserCoursesError = (message) => {
    elements.error.hidden = false;
    elements.error.textContent = message;
  };
  function confirmAddingConflictingCourse(course, conflictingCourses) {
    return window.confirmCourseConflict(
      course.name,
      conflictingCourses.map((conflict) => conflict.name),
    );
  }
  const saveUserCourses = (courses) => {
    const revision = authRevision;
    serverSaveQueue = serverSaveQueue
      .then(async () => {
        if (revision !== authRevision || !authenticatedUser) return;
        const response = await fetch(userCoursesApi, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ courses }),
        });
        const result = await response.json();
        if (!response.ok) {
          if (response.status === 401) userCoursesEnabled = false;
          throw new Error(result.detail || `雲端儲存失敗（HTTP ${response.status}）`);
        }
        if (elements.error.textContent.startsWith("雲端選課資料")) {
          elements.error.hidden = true;
          elements.error.textContent = "";
        }
      })
      .catch((error) => {
        if (revision === authRevision && authenticatedUser) {
          showUserCoursesError(`雲端選課資料儲存失敗：${error.message}`);
        }
      });
  };
  async function loadUserCourses(revision) {
    const loadedSelectionRevision = selectionRevision;
    try {
      const response = await fetch(userCoursesApi, { credentials: "same-origin" });
      if (response.status === 401) return;
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || `雲端讀取失敗（HTTP ${response.status}）`);
      }
      if (!Array.isArray(result.courses) || !result.courses.every((course) => (
        course && typeof course.id === "string" && typeof course.name === "string"
        && typeof course.credits === "number" && typeof course.time === "string"
      ))) {
        throw new Error("伺服器的選課資料格式錯誤");
      }

      if (revision !== authRevision || !authenticatedUser) return;
      userCoursesEnabled = true;
      if (selectionRevision !== loadedSelectionRevision) {
        saveUserCourses(selectedCourses());
        return;
      }
      selectedIds.clear();
      let selectionNeedsSync = false;
      const canonicalSelection = result.courses.map((course) => {
        const catalogCourse = data.courses.find((existing) => existing.id === course.id);
        if (!catalogCourse) {
          data.courses.push(course);
          return course;
        }
        if (
          course.category !== catalogCourse.category
          || course.group !== catalogCourse.group
          || (course.domain ?? null) !== (catalogCourse.domain ?? null)
        ) {
          selectionNeedsSync = true;
        }
        return {
          ...course,
          category: catalogCourse.category,
          group: catalogCourse.group,
          domain: catalogCourse.domain,
        };
      });
      canonicalSelection.forEach((course) => {
        selectedIds.add(course.id);
      });
      try {
        sessionStorage.setItem(selectedCourseStorageKey, JSON.stringify(canonicalSelection));
      } catch (error) {
        showUserCoursesError(`已從雲端載入選課資料，但無法同步到此分頁：${error.message}`);
      }
      if (selectionNeedsSync) saveUserCourses(canonicalSelection);
      render();
    } catch (error) {
      if (revision === authRevision && authenticatedUser) {
        showUserCoursesError(`雲端選課資料載入失敗：${error.message}`);
      }
    }
  }
  const persistSelectedCourses = () => {
    selectionRevision += 1;
    try {
      sessionStorage.setItem(selectedCourseStorageKey, JSON.stringify(selectedCourses()));
    } catch (error) {
      elements.error.hidden = false;
      elements.error.textContent = `無法暫存選課資料：${error.message}`;
    }
    if (userCoursesEnabled) saveUserCourses(selectedCourses());
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
        ? plannedCreditsFor((course) => creditCategory(course) === "專業必修")
        : plannedCreditsFor((course) => creditCategory(course) === category.name);
      const earned = category.earned + planned;
      const line = make("div", `category-line tone-${categoryTone[category.name] || "required"}`);
      const labels = make("div");
      labels.append(make("strong", "", category.name));
      labels.append(make("span", "", `${percentage(earned, category.required)}%`));
      const track = make("div", "progress-track");
      const fill = make("span");
      fill.style.background = {
        required: "#2874df",
        elective: "#168a83",
        common: "#7651a6",
      }[categoryTone[category.name] || "required"];
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
      fill.style.background = domain.color;
      updateProgress(fill, earned, domain.required);
      track.append(fill);
      chip.append(heading, track);
      elements.domainCards.append(chip);
    });
    elements.domainNotice.textContent = data.notices.domains;
    const freeCreditsEarned = data.freeCredits.earned + plannedCreditsFor((course) => ["體育", "特色運動"].includes(creditCategory(course)));
    elements.freeCreditLabel.textContent = `${percentage(freeCreditsEarned, data.freeCredits.required)}%`;
    elements.freeCreditBar.style.background = "#6585a7";
    updateProgress(elements.freeCreditBar, freeCreditsEarned, data.freeCredits.required);
  }

  function renderSelected() {
    const selected = data.courses.filter((course) => selectedIds.has(course.id));
    const total = selected.reduce((sum, course) => sum + course.credits, 0);
    resizeSelectedCard(() => {
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

  function clearSelectionAfterLogout() {
    if (!data) return;
    selectedIds.clear();
    data.courses = data.courses.filter((course) => !course.id.startsWith("manual-"));
    sessionStorage.removeItem(selectedCourseStorageKey);
    sessionStorage.removeItem(clearSelectionFlag);
    render();
  }

  function syncSelectionWithAuthState() {
    if (!data || !authStateKnown) return;
    authRevision += 1;
    userCoursesEnabled = false;
    clearSelectionAfterLogout();
    if (authenticatedUser) loadUserCourses(authRevision);
  }

  window.addEventListener("google-auth-state-change", (event) => {
    authenticatedUser = event.detail;
    authStateKnown = true;
    syncSelectionWithAuthState();
  });
  window.addEventListener("pageshow", (event) => {
    if (sessionStorage.getItem(clearSelectionFlag) === "true") {
      clearSelectionAfterLogout();
    }
    if (event.persisted) {
      window.refreshGoogleAuthState().catch((error) => showUserCoursesError(error.message));
    }
  });
  window.addEventListener("focus", () => {
    window.refreshGoogleAuthState().catch((error) => showUserCoursesError(error.message));
  });

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
  elements.courseRows.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-add-course]");
    if (!button) return;
    const wasSelected = selectedIds.has(button.dataset.addCourse);
    const changedCourse = data.courses.find((course) => course.id === button.dataset.addCourse);
    if (!changedCourse) return;
    if (wasSelected) {
      selectedIds.delete(button.dataset.addCourse);
    } else {
      const conflictingCourses = selectedCourses().filter((selected) => coursesConflict(changedCourse, selected));
      if (conflictingCourses.length > 0) {
        button.disabled = true;
        let confirmed;
        try {
          confirmed = await confirmAddingConflictingCourse(changedCourse, conflictingCourses);
        } finally {
          button.disabled = false;
        }
        if (!confirmed) return;
      }
      selectedIds.add(button.dataset.addCourse);
    }
    window.showAppToast(`${wasSelected ? "已退選" : "已加入"}「${changedCourse.name}」`);
    persistSelectedCourses();
    renderProgress();
    renderSelected();
    renderCourses();
  });
  elements.selectedCourses.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-course]");
    if (!button) return;
    const removedCourse = data.courses.find((course) => course.id === button.dataset.removeCourse);
    selectedIds.delete(button.dataset.removeCourse);
    window.showAppToast(`已移除「${removedCourse.name}」`);
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
  let dialogCloseTimer;
  let dialogOpenFrame;
  const dialogCloseDuration = () => (
    matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--modal-close-dur")) || 150
  );
  const closeCourseDialog = (resetForm = false) => {
    const dialog = elements.courseDialog;
    if (!dialog.open || dialog.classList.contains("is-closing")) return;
    cancelAnimationFrame(dialogOpenFrame);
    dialog.classList.remove("is-open");
    dialog.classList.add("is-closing");
    dialogCloseTimer = window.setTimeout(() => {
      dialog.classList.remove("is-closing");
      dialog.close();
      if (resetForm) elements.courseForm.reset();
    }, dialogCloseDuration());
  };
  elements.openCourseForm.addEventListener("click", () => {
    const dialog = elements.courseDialog;
    window.clearTimeout(dialogCloseTimer);
    if (!dialog.open) dialog.showModal();
    dialog.classList.remove("is-closing", "is-open");
    dialogOpenFrame = requestAnimationFrame(() => dialog.classList.add("is-open"));
  });
  elements.courseDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeCourseDialog();
  });
  elements.courseDialog.addEventListener("click", (event) => {
    if (event.target === elements.courseDialog) closeCourseDialog();
  });
  [elements.closeCourseForm, elements.cancelCourseForm].forEach((button) => {
    button.addEventListener("click", () => closeCourseDialog());
  });
  elements.courseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = new FormData(elements.courseForm);
    const name = String(fields.get("name")).trim();
    const category = name.includes("資工") ? "專業必修" : String(fields.get("category"));
    const grade = Number(fields.get("grade"));
    const course = {
      id: `manual-${Date.now()}-${data.courses.length}`,
      name,
      category,
      group: groupForCategory(category),
      credits: Number(fields.get("credits")),
      time: String(fields.get("time")).trim(),
      teacher: String(fields.get("teacher")).trim(),
      location: String(fields.get("location")).trim(),
      grade,
    };
    data.courses.push(course);
    selectedIds.add(course.id);
    persistSelectedCourses();
    activeCategory = groupForCategory(category);
    renderFilterOptions();
    elements.courseSearch.value = "";
    currentPage = 1;
    closeCourseDialog(true);
    window.showAppToast(`已新增並加入「${name}」`);
    renderFilters();
    renderProgress();
    renderSelected();
    renderCourses();
  });

  const courseEndpoints = [
    ["api/courses/cs", "資工系必選修"],
    ["api/courses/physical", "體育"],
    ["api/courses/common", "校共同必修"],
    ["api/courses/general", "通識"],
  ];
  Promise.all([
    fetch("data/progress.json?v=3", { cache: "no-store" }),
    ...courseEndpoints.map(([endpoint]) => fetch(endpoint)),
  ])
    .then(async ([progressResponse, ...courseResponses]) => {
      if (!progressResponse.ok) throw new Error(`無法載入學分進度設定（HTTP ${progressResponse.status}）`);
      const courseData = await Promise.all(courseResponses.map(async (response, index) => {
        if (!response.ok) {
          throw new Error(`無法載入${courseEndpoints[index][1]}課程資料（HTTP ${response.status}）`);
        }
        return response.json();
      }));
      data = await progressResponse.json();
      data.courses = courseData.flatMap((result) => result.courses);
      selectedIds.clear();
      sessionStorage.removeItem(selectedCourseStorageKey);
      sessionStorage.removeItem(clearSelectionFlag);
      render();
      syncSelectionWithAuthState();
    })
    .catch((error) => {
      elements.error.hidden = false;
      elements.error.textContent = `${error.message}，請確認學分進度設定與課程 API 是否可正常存取。`;
      dashboard.setAttribute("aria-busy", "false");
    });
}