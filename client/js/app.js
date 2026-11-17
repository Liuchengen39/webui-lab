const dashboard = document.querySelector("#dashboard");

// 頁面沒有 #dashboard 就整支略過
if (dashboard) {
  // DOM 快取:啟動時只查一次 之後 render 與事件處理重複使用
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

  // 每個 tab 對應哪些課程類別
  const categoryGroups = [
    { label: "資工系必選修", categories: ["專業必修", "專業選修"] },
    { label: "體育", categories: ["體育", "特色運動"] },
    { label: "校共同必修", categories: ["校共同必修"] },
    { label: "通識", categories: ["通識"] },
  ];

  // 取得課程所屬的 tab
  const courseGroup = (course) => course.group
    || categoryGroups.find((group) => group.categories.includes(course.category))?.label
    || "其他系所";
  
  // 由 category反查所屬 tab
  const groupForCategory = (category) => categoryGroups.find((group) => (
    group.label === category || group.categories.includes(category)
  ))?.label || "其他系所";

  // 年級數字轉顯示文字
  const gradeLabel = (grade) => ({ 0: "其他年級", 1: "大一", 2: "大二", 3: "大三" }[grade] || `大${grade}`);
  const weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五"];

  // sessionStorage 的 key
  const selectedCourseStorageKey = "selectedCourses";

  // 旗標 key:值為 "true" 時會清空選課
  const clearSelectionFlag = "clearSelectedCoursesOnReturn";

  // uesr資料 API
  const userCoursesApi = "api/user/courses";

  // 類別對應顏色
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

  // 決定表格「類型」標籤的色調
  const courseTypeTone = (course) => {
    // 通識課對應領域
    if (course.category === "通識" && course.domain) {
      return {
        人文: "humanities",
        社會: "society",
        自然: "nature",
        特色: "featured",
      }[course.domain] || "general";
    }
    // 其他課程:先查細分表,再查通用表,最後用預設值
    return {
      專業必修: "major-required",
      專業選修: "major-elective",
      校共同必修: "common-required",
    }[course.category] || categoryTone[course.category] || "required";
  };

  let data;                                     // progress.json + 合併後的 data.courses;啟動 fetch 完成前為 undefined
  const selectedIds = new Set();                // 只存已選課程 id,課程資料只有 data.courses 一份來源
  let authStateKnown = false;                   // 登入狀態是否已回報
  let authenticatedUser = null;                 // 登入者資訊
  let authRevision = 0;                  
  let userCoursesEnabled = false;               // 雲端同步開關 雲端資料讀完後才開
  let serverSaveQueue = Promise.resolve();      // 儲存請求的串行佇列,確保 PUT 依序執行
  let selectionRevision = 0;                    // 使用者每改一次選課 +1 用來偵測「載入雲端期間使用者有操作」
  let activeCategory = categoryGroups[0].label; // 目前的 tab 預設第一個
  let currentPage = 1;
  const pageSize = 8;                           // 一頁八個

  // 建立 DOM 節點 用 textContent 而非 innerHTML 避免課程名稱等資料被當成 HTML 執行
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // 計算百分比
  const percentage = (value, target) => target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const updateProgress = (bar, value, target) => {
    bar.style.width = `${percentage(value, target)}%`;
  };

  // 把 id 還原成課程物件
  const selectedCourses = () => data.courses.filter((course) => selectedIds.has(course.id));

  // 課號 903166 雖然 category 不是校共同必修,學分計算時要算進去
  const creditCategory = (course) => (
    course.courseCode === "903166" ? "校共同必修" : course.category
  );
  // 已選課程的學分總和
  const plannedCreditsFor = (matches) => selectedCourses()
    .filter(matches)
    .reduce((sum, course) => sum + course.credits, 0);

  // 依學分要求項目的名稱算出已選課程對應的預計學分
  const plannedCreditsForRequirement = (requirement) => {
    const name = requirement.name.trim();
    // (通識的人文/社會/自然/特色):從名稱取出領域
    if (requirement.child) {
      const domain = name.match(/人文|社會|自然|特色/)?.[0];
      return domain ? plannedCreditsFor((course) => course.category === "通識" && course.domain === domain) : 0;
    }
    if (name.startsWith("系必修")) return plannedCreditsFor((course) => course.category === "專業必修");
    if (name === "專業選修") return plannedCreditsFor((course) => course.category === "專業選修");
    if (name === "校共同必修") return plannedCreditsFor((course) => creditCategory(course) === "校共同必修");
    if (name === "通識領域課程") return plannedCreditsFor((course) => course.category === "通識");
    // 體育與特色運動算在自由學分
    if (name === "自由學分") {
      return plannedCreditsFor((course) => ["體育", "特色運動"].includes(creditCategory(course)));
    }
    return 0;
  };

  // 把上課時間字串展開成「星期-節次」集合
  // 以節次字母的 charCode 當節次值,只需要能比較相等,不需轉成節次數字
  const courseTimeSlots = (course) => {
    const slots = new Set();
    for (const [, day, periodCodes] of String(course.time).matchAll(/([1-5])([a-k]+)/gi)) {
      [...new Set([...periodCodes.toLowerCase()].map((code) => code.charCodeAt(0)))]
        .forEach((period) => slots.add(`${day}-${period}`));
    }
    return slots;
  };

  // 兩門課只要有任一個時段重疊就算衝堂
  const coursesConflict = (first, second) => {
    const firstSlots = courseTimeSlots(first);
    return [...courseTimeSlots(second)].some((slot) => firstSlots.has(slot));
  };

  // 統一把訊息顯示到頁面上的錯誤區
  const showUserCoursesError = (message) => {
    elements.error.hidden = false;
    elements.error.textContent = message;
  };

  // 衝堂確認
  function confirmAddingConflictingCourse(course, conflictingCourses) {
    return window.confirmCourseConflict(
      course.name,
      conflictingCourses.map((conflict) => conflict.name),
    );
  }

  // 用 serverSaveQueue 串成 Promise 鏈,PUT 依序執行
  const saveUserCourses = (courses) => {
    const revision = authRevision; // 記下發出時的 revision
    serverSaveQueue = serverSaveQueue
      .then(async () => {
        // 排到時若登入狀態已變(登出、換帳號),就放棄這次儲存
        if (revision !== authRevision || !authenticatedUser) return;
        const response = await fetch(userCoursesApi, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin", // 帶上同源 cookie 以辨識登入者
          body: JSON.stringify({ courses }),
        });
        const result = await response.json();
        if (!response.ok) {
          // 401 代表登入失效,關閉雲端同步
          if (response.status === 401) userCoursesEnabled = false;
          throw new Error(result.detail || `雲端儲存失敗（HTTP ${response.status}）`);
        }
        // 儲存成功時,若畫面上是先前的雲端錯誤訊息就清掉
        if (elements.error.textContent.startsWith("雲端選課資料")) {
          elements.error.hidden = true;
          elements.error.textContent = "";
        }
      })
      .catch((error) => {
        // 只有「仍是同一次登入狀態」才顯示錯誤;舊請求的失敗不必打擾使用者
        if (revision === authRevision && authenticatedUser) {
          showUserCoursesError(`雲端選課資料儲存失敗：${error.message}`);
        }
      });
  };

  // revision:呼叫當下的 authRevision,回來時用來確認自己沒有過期
  async function loadUserCourses(revision) {
    // 記下發出時的選課版本,用來偵測等待期間使用者是否改過選課
    const loadedSelectionRevision = selectionRevision;
    try {
      const response = await fetch(userCoursesApi, { credentials: "same-origin" });
      // 401:未登入或登入失效,靜默結束(不視為錯誤)
      if (response.status === 401) return;
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || `雲端讀取失敗（HTTP ${response.status}）`);
      }
      // 驗證伺服器回傳的格式,避免髒資料進入畫面
      if (!Array.isArray(result.courses) || !result.courses.every((course) => (
        course && typeof course.id === "string" && typeof course.name === "string"
        && typeof course.credits === "number" && typeof course.time === "string"
      ))) {
        throw new Error("伺服器的選課資料格式錯誤");
      }

      // 登入狀態在等待期間變了(登出 / 換帳號),這份結果已過期,丟棄
      if (revision !== authRevision || !authenticatedUser) return;
      // 雲端資料確認可用,之後本地變動才允許回寫雲端
      userCoursesEnabled = true;
      // 等待期間使用者已操作過選課:以本地為準,回寫雲端而不是用舊的雲端資料覆蓋
      if (selectionRevision !== loadedSelectionRevision) {
        saveUserCourses(selectedCourses());
        return;
      }
      selectedIds.clear();
      let selectionNeedsSync = false;
      // 把雲端課程對齊到目前的課程目錄(以目錄的分類資訊為準)
      const canonicalSelection = result.courses.map((course) => {
        const catalogCourse = data.courses.find((existing) => existing.id === course.id);
        // 目錄找不到(例如手動新增的課程):原樣補進目錄
        if (!catalogCourse) {
          data.courses.push(course);
          return course;
        }
        // 雲端存的分類與目前目錄不一致,標記要回寫修正
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
      // 同步一份到 sessionStorage 作為本分頁暫存;失敗不影響主流程,只提示
      try {
        sessionStorage.setItem(selectedCourseStorageKey, JSON.stringify(canonicalSelection));
      } catch (error) {
        showUserCoursesError(`已從雲端載入選課資料，但無法同步到此分頁：${error.message}`);
      }
      if (selectionNeedsSync) saveUserCourses(canonicalSelection);
      render();
    } catch (error) {
      // 同樣只在仍是同一次登入狀態時才顯示錯誤
      if (revision === authRevision && authenticatedUser) {
        showUserCoursesError(`雲端選課資料載入失敗：${error.message}`);
      }
    }
  }

  // 選課有變動時呼叫
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

  // 學分進度區:總進度、各項要求、類別進度、通識領域、自由學分
  function renderProgress() {
    const plannedCredits = selectedCourses().reduce((sum, course) => sum + course.credits, 0);
    const currentCredits = data.credits.earned + plannedCredits;
    const percent = percentage(currentCredits, data.credits.required);
    // 先清空
    elements.progressRows.replaceChildren();
    elements.categoryProgress.replaceChildren();
    elements.domainCards.replaceChildren();

    // 總進度
    elements.creditTotal.textContent = `已修學分 ${currentCredits} / ${data.credits.required}`;
    elements.totalProgress.setAttribute("aria-valuemin", "0");
    elements.totalProgress.setAttribute("aria-valuemax", String(data.credits.required));
    elements.totalProgress.setAttribute("aria-valuenow", String(currentCredits));
    updateProgress(elements.totalProgressBar, currentCredits, data.credits.required);
    elements.totalPercent.textContent = `${percent}%`;
    elements.earnedCredits.textContent = `${currentCredits} / ${data.credits.required}`;
    elements.donutPercent.textContent = `${percent}%`;
    // 甜甜圈
    elements.creditDonut.style.background = `conic-gradient(var(--blue) ${percent}%, #dce7f5 ${percent}%)`;
    elements.progressNotice.textContent = data.notices.progress;

    // 各項學分要求列表
    data.creditRequirements.forEach((requirement) => {
      const earned = requirement.earned + plannedCreditsForRequirement(requirement);
      const row = make("div", `progress-row${requirement.child ? " child-row" : ""}`);
      row.append(make("span", "progress-row-name", requirement.name));
      row.append(make("span", "progress-row-value", `${earned} / ${requirement.required}`));
      row.append(make("span", "progress-row-percent", `${percentage(earned, requirement.required)}%`));
      elements.progressRows.append(row);
    });

    // 類別進度條(系必修 / 專業選修 / 校共同必修等)
    data.categories.forEach((category) => {
      // 「系必修」在課程資料中的 category 是「專業必修」,需特別對應
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

    // 通識領域
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
      // 每個領域進度條都補上 progressbar
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

    // 自由學分:體育與特色運動算在這裡
    const freeCreditsEarned = data.freeCredits.earned + plannedCreditsFor((course) => ["體育", "特色運動"].includes(creditCategory(course)));
    elements.freeCreditLabel.textContent = `${percentage(freeCreditsEarned, data.freeCredits.required)}%`;
    elements.freeCreditBar.style.background = "#6585a7";
    updateProgress(elements.freeCreditBar, freeCreditsEarned, data.freeCredits.required);
  }

  // 已選課程清單
  function renderSelected() {
    const selected = data.courses.filter((course) => selectedIds.has(course.id));
    const total = selected.reduce((sum, course) => sum + course.credits, 0);
    elements.selectedSummary.textContent = `${selected.length} 門・${total} 學分`;
    elements.selectedCourses.replaceChildren();
    elements.emptySelected.hidden = selected.length > 0; // 有選課就隱藏「尚未選課」提示
    selected.forEach((course) => {
      const item = make("li", "selected-item");
      item.append(make("span", "", course.name));
      const remove = make("button", "remove-course", "移除");
      remove.type = "button";
      remove.setAttribute("aria-label", `移除${course.name}`);
      // 用 data 屬性存 id,配合事件委派在容器上統一處理 click
      remove.dataset.removeCourse = course.id;
      item.append(remove);
      elements.selectedCourses.append(item);
    });
  }

  // 每個 tab 顯示該類課程數量
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

  // 下拉選單的內容與標籤會隨 tab 改變
  function renderFilterOptions() {
    let options; // 每項為 [value, 顯示文字]
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
      // value 為 1~5,對應上課時間字串開頭的星期數字
      options = weekdays.map((weekday, index) => [String(index + 1), weekday]);
    } else {
      // 其他分類:列出資料中實際出現的年級
      elements.gradeFilterLabel.textContent = "年級篩選";
      options = [["all", "全部年級"]];
      [...new Set(data.courses.map((course) => course.grade))]
        .sort((a, b) => a - b)
        .forEach((grade) => options.push([String(grade), gradeLabel(grade)]));
    }

    // 重建選項後 盡量保留使用者原本選的值
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

  // 課程表格:先依 tab、下拉篩選、搜尋字串過濾,再分頁,最後畫出當頁的列
  function renderCourses() {
    const search = elements.courseSearch.value.trim().toLocaleLowerCase();
    const filterValue = elements.gradeFilter.value;
    const activeGroup = categoryGroups.find((group) => group.label === activeCategory);
    const courses = data.courses.filter((course) => {
      const matchesCategory = activeGroup !== undefined && courseGroup(course) === activeGroup.label;
      // 下拉篩選的意義隨 tab 不同
      let matchesFilter;
      if (activeCategory === "資工系必選修") {
        matchesFilter = String(course.grade) === filterValue;
      } else if (activeCategory === "校共同必修") {
        matchesFilter = String(course.grade) === filterValue;
      } else if (activeCategory === "體育") {
        // 以課名是否以「體育」開頭區分:是 → 校共同必修體育,否 → 特色運動
        const isFeatureSport = course.name.startsWith("體育");
        matchesFilter = filterValue === "feature" ? isFeatureSport : !isFeatureSport;
      } else if (activeCategory === "通識") {
        // 用上課時間開頭的星期數字比對
        matchesFilter = String(course.time).match(/^([1-7])/)?.[1] === filterValue;
      } else {
        matchesFilter = filterValue === "all" || String(course.grade) === filterValue;
      }
      // 搜尋範圍:課名 + 教師
      const matchesSearch = `${course.name} ${course.teacher}`.toLocaleLowerCase().includes(search);
      return matchesCategory && matchesFilter && matchesSearch;
    });

    // 分頁:篩選後頁數可能變少,要把 currentPage 夾回有效範圍
    const pageCount = Math.ceil(courses.length / pageSize);
    currentPage = Math.min(currentPage, Math.max(pageCount, 1));
    const visibleCourses = courses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // 更新計數、空狀態、頁碼與上下頁按鈕
    elements.courseRows.replaceChildren();
    elements.courseCount.textContent = `共 ${courses.length} 門`;
    elements.emptyCourses.hidden = courses.length > 0;
    elements.pageSummary.textContent = `第 ${pageCount === 0 ? 0 : currentPage} / ${pageCount} 頁`;
    elements.previousPage.disabled = currentPage <= 1;
    elements.nextPage.disabled = currentPage >= pageCount;

    // 畫出當頁每一列
    visibleCourses.forEach((course) => {
      const row = make("tr");
      row.append(make("td", "", course.name));
      const type = make("td");
      const typeClass = `type-pill tone-${courseTypeTone(course)}`;
      type.append(make("span", typeClass, course.domain ? `${course.category}・${course.domain}` : course.category));
      row.append(type, make("td", "", String(course.credits)), make("td", "", course.time), make("td", "", course.teacher), make("td", "", course.location));

      // 狀態:已選 / 衝堂(與已選課程時段重疊)/ 未選
      const status = make("td");
      const isSelected = selectedIds.has(course.id);
      const hasConflict = !isSelected && selectedCourses().some((selected) => coursesConflict(course, selected));
      status.append(make(
        "span",
        `status-pill${isSelected ? " is-added" : hasConflict ? " is-conflict" : ""}`,
        isSelected ? "已選" : hasConflict ? "衝堂" : "未選",
      ));
      row.append(status);

      // 操作按鈕:用 data 屬性帶 id,由 courseRows 上的事件委派處理
      const action = make("td");
      const button = make("button", `add-course${isSelected ? " is-selected" : ""}`, isSelected ? "退選" : "加入");
      button.type = "button";
      button.dataset.addCourse = course.id;
      action.append(button);
      row.append(action);
      elements.courseRows.append(row);
    });
  }

  // 全部重繪的入口
  function render() {
    renderProgress();
    renderFilters();
    renderFilterOptions();
    renderSelected();
    renderCourses();
    dashboard.setAttribute("aria-busy", "false"); 
  }

  // 清空選取、移除手動新增的課程
  function clearSelectionAfterLogout() {
    if (!data) return; // 課程資料尚未載入,沒東西可清
    selectedIds.clear();
    data.courses = data.courses.filter((course) => !course.id.startsWith("manual-"));
    sessionStorage.removeItem(selectedCourseStorageKey);
    sessionStorage.removeItem(clearSelectionFlag);
    render();
  }

  // 登入狀態改變時:作廢舊請求
  function syncSelectionWithAuthState() {
    // 雙重閘門:課程資料與登入狀態兩個非同步來源都就緒才繼續
    if (!data || !authStateKnown) return;
    authRevision += 1;          // 讓所有舊請求作廢
    userCoursesEnabled = false; // 雲端資料讀完前,禁止把空的本地選課寫回雲端
    clearSelectionAfterLogout();
    if (authenticatedUser) loadUserCourses(authRevision);
  }

  // 外部 auth 腳本回報登入狀態(event.detail 為使用者資訊,未登入為 null)
  window.addEventListener("google-auth-state-change", (event) => {
    authenticatedUser = event.detail;
    authStateKnown = true;
    syncSelectionWithAuthState();
  });
  // 頁面顯示時:若有「返回時清除」旗標就清空;從 bfcache 還原時重新確認登入狀態
  window.addEventListener("pageshow", (event) => {
    if (sessionStorage.getItem(clearSelectionFlag) === "true") {
      clearSelectionAfterLogout();
    }
    if (event.persisted) {
      window.refreshGoogleAuthState().catch((error) => showUserCoursesError(error.message));
    }
  });
  // 切回此分頁時重新確認登入狀態(可能已在別的分頁登出)
  window.addEventListener("focus", () => {
    window.refreshGoogleAuthState().catch((error) => showUserCoursesError(error.message));
  });

  // 切換分類 tab(事件委派:tab 每次 render 都會重建,所以監聽在容器上)
  elements.courseFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category;
    currentPage = 1;
    renderFilterOptions();
    // 只更新 aria-pressed,不重建 tab
    elements.courseFilters.querySelectorAll("[data-category]").forEach((filter) => {
      filter.setAttribute("aria-pressed", String(filter === button));
    });
    renderCourses();
  });

  // 加入 / 退選課程(事件委派在表格容器上)
  elements.courseRows.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-add-course]");
    if (!button) return;
    const wasSelected = selectedIds.has(button.dataset.addCourse);
    const changedCourse = data.courses.find((course) => course.id === button.dataset.addCourse);
    if (!changedCourse) return;
    if (wasSelected) {
      selectedIds.delete(button.dataset.addCourse);
    } else {
      // 加入前先檢查衝堂,有衝堂就跳確認;等待期間停用按鈕避免重複點擊
      const conflictingCourses = selectedCourses().filter((selected) => coursesConflict(changedCourse, selected));
      if (conflictingCourses.length > 0) {
        button.disabled = true;
        let confirmed;
        try {
          confirmed = await confirmAddingConflictingCourse(changedCourse, conflictingCourses);
        } finally {
          button.disabled = false; // 無論確認結果或對話框出錯都要恢復按鈕
        }
        if (!confirmed) return;
      }
      selectedIds.add(button.dataset.addCourse);
    }
    window.showAppToast(`${wasSelected ? "已退選" : "已加入"}「${changedCourse.name}」`);
    persistSelectedCourses();
    // 局部重繪:選課只影響進度、已選清單與表格狀態
    renderProgress();
    renderSelected();
    renderCourses();
  });

  // 從已選清單移除課程
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

  // 篩選、搜尋、換頁:只需重繪表格;篩選與搜尋變動時都回到第 1 頁
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

  // ── 自訂課程 dialog ──
  // 關閉 dialog,可選擇連同表單一起重設(新增成功時用)
  const closeCourseDialog = (resetForm = false) => {
    const dialog = elements.courseDialog;
    if (!dialog.open) return;
    dialog.close();
    if (resetForm) elements.courseForm.reset();
  };
  elements.openCourseForm.addEventListener("click", () => {
    const dialog = elements.courseDialog;
    if (!dialog.open) dialog.showModal();
  });
  // 按 Esc 會觸發 cancel;攔下預設行為,改走自己的關閉流程
  elements.courseDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeCourseDialog();
  });
  // 點到 dialog 本體(即背景遮罩區)才關閉,點內容不會
  elements.courseDialog.addEventListener("click", (event) => {
    if (event.target === elements.courseDialog) closeCourseDialog();
  });
  [elements.closeCourseForm, elements.cancelCourseForm].forEach((button) => {
    button.addEventListener("click", () => closeCourseDialog());
  });

  // 新增手動課程:建立後直接加入已選,並切到該課程所屬的 tab
  elements.courseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = new FormData(elements.courseForm);
    const name = String(fields.get("name")).trim();
    // 課名含「資工」一律視為專業必修
    const category = name.includes("資工") ? "專業必修" : String(fields.get("category"));
    const grade = Number(fields.get("grade"));
    const course = {
      // manual- 前綴用來辨識手動課程,登出重置時會被移除
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
    // 切到新課程所在的 tab,清掉搜尋,回第 1 頁,才看得到剛新增的課
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


  // [網址, 顯示名稱] api對應
  const courseEndpoints = [
    ["api/courses/cs", "資工系必選修"],
    ["api/courses/physical", "體育"],
    ["api/courses/common", "校共同必修"],
    ["api/courses/general", "通識"],
  ];

  // 平行載入「學分進度設定」與四類課程,全部成功才 render
  Promise.all([
    // 進度設定不使用瀏覽器快取,確保拿到最新的學分規則
    fetch("data/progress.json", { cache: "no-store" }),
    ...courseEndpoints.map(([endpoint]) => fetch(endpoint)),
  ])
    .then(async ([progressResponse, ...courseResponses]) => {
      // fetch 遇到 404 / 500 不會 reject,必須自己檢查 ok 並手動 throw
      if (!progressResponse.ok) throw new Error(`無法載入學分進度設定（HTTP ${progressResponse.status}）`);
      // 用 index 對回名稱,錯誤訊息能指出是哪一類課程失敗
      const courseData = await Promise.all(courseResponses.map(async (response, index) => {
        if (!response.ok) {
          throw new Error(`無法載入${courseEndpoints[index][1]}課程資料（HTTP ${response.status}）`);
        }
        return response.json();
      }));
      // 以進度設定為基底,把四類課程攤平成單一陣列
      data = await progressResponse.json();
      data.courses = courseData.flatMap((result) => result.courses);
      // 重新載入頁面時從乾淨狀態開始;選課之後由登入流程決定是否從雲端載回
      selectedIds.clear();
      sessionStorage.removeItem(selectedCourseStorageKey);
      sessionStorage.removeItem(clearSelectionFlag);
      render();
      // 兩個非同步來源(課程資料、登入狀態)的會合點之一;登入狀態未回報時函式內會直接 return
      syncSelectionWithAuthState();
    })
    .catch((error) => {
      // 統一錯誤出口:涵蓋網路失敗、HTTP 錯誤、JSON 解析失敗、render 例外
      elements.error.hidden = false;
      elements.error.textContent = `${error.message}，請確認學分進度設定與課程 API 是否可正常存取。`;
      dashboard.setAttribute("aria-busy", "false");
    });
}