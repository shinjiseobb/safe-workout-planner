/**
 * SafeFit AI 플래너 - 프론트엔드 비즈니스 로직 (app.js)
 */

document.addEventListener("DOMContentLoaded", () => {
  // DOM 요소 참조
  const plannerForm = document.getElementById("plannerForm");
  const painSlider = document.getElementById("pain_level");
  const painLevelText = document.getElementById("painLevelText");
  const submitBtn = document.getElementById("submitBtn");
  const btnText = submitBtn.querySelector(".btn-text");
  const btnSpinner = submitBtn.querySelector(".btn-spinner");

  // 결과 영역 요소
  const resultSection = document.getElementById("resultSection");
  const routineTitle = document.getElementById("routineTitle");
  const summaryMessage = document.getElementById("summaryMessage");
  const splitRoutineContainer = document.getElementById("splitRoutineContainer");
  const replacementsContainer = document.getElementById("replacementsContainer");
  const warmupList = document.getElementById("warmupList");
  const postureWarning = document.getElementById("postureWarning");
  const cooldownList = document.getElementById("cooldownList");

  // 모달 요소
  const hardStopModal = document.getElementById("hardStopModal");
  const hardStopReasonsList = document.getElementById("hardStopReasonsList");
  const hardStopMessage = document.getElementById("hardStopMessage");
  const closeModalBtn = document.getElementById("closeModalBtn");

  // 4자리 PIN 모달 요소
  const pinModal = document.getElementById("pinModal");
  const pinDigits = document.querySelectorAll(".pin-digit");
  const pinInputsContainer = document.getElementById("pinInputsContainer");
  const pinErrorMessage = document.getElementById("pinErrorMessage");
  const cancelPinBtn = document.getElementById("cancelPinBtn");
  const confirmPinBtn = document.getElementById("confirmPinBtn");
  let pendingPayload = null;

  // 도구 버튼
  const copyBtn = document.getElementById("copyBtn");
  const downloadMdBtn = document.getElementById("downloadMdBtn");

  // 탭 버튼들
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabPanes = document.querySelectorAll(".tab-pane");

  // 현재 생성된 최신 루틴 데이터 캐시 (복사 및 다운로드용)
  let currentRoutineData = null;

  // 1. 통증 슬라이더 레이블 실시간 동기화
  const painDescriptions = {
    1: "1점 (경미한 뻐근함)",
    2: "2점 (가벼운 통증)",
    3: "3점 (보통 통증, 세심한 주의 필요)",
    4: "4점 (심한 통증 - 고위험 신호)",
    5: "5점 (극심한 통증 - 즉각 진료 권고)"
  };

  painSlider.addEventListener("input", (e) => {
    const val = e.target.value;
    painLevelText.textContent = painDescriptions[val] || `${val}점`;
    if (val >= 4) {
      painLevelText.style.color = "#dc2626";
    } else {
      painLevelText.style.color = "#2563eb";
    }
  });

  // 2. 탭 전환 처리
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabPanes.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      const targetPane = document.getElementById(targetId);
      if (targetPane) {
        targetPane.classList.add("active");
      }
    });
  });

  // 3. 모달 닫기 이벤트
  closeModalBtn.addEventListener("click", () => {
    hardStopModal.classList.add("hidden");
  });

  hardStopModal.addEventListener("click", (e) => {
    if (e.target === hardStopModal) {
      hardStopModal.classList.add("hidden");
    }
  });

  // 4. Hard Stop 모달 표시 함수
  function showHardStopModal(data) {
    hardStopReasonsList.innerHTML = "";
    (data.reasons || []).forEach((reason) => {
      const li = document.createElement("li");
      li.textContent = reason;
      hardStopReasonsList.appendChild(li);
    });
    hardStopMessage.textContent = data.message || "고위험 신호가 감지되어 루틴 생성이 중단되었습니다.";
    hardStopModal.classList.remove("hidden");
  }

  // 5. 로딩 상태 토글
  function setLoadingState(isLoading) {
    if (isLoading) {
      submitBtn.disabled = true;
      btnSpinner.classList.remove("hidden");
      btnText.textContent = "AI 안전 가이드 검색 및 루틴 생성 중...";
    } else {
      submitBtn.disabled = false;
      btnSpinner.classList.add("hidden");
      btnText.textContent = "안전 맞춤 루틴 생성하기";
    }
  }

  // 6. 결과 화면 렌더링
  function renderRoutine(data) {
    currentRoutineData = data;

    // 제목 및 요약
    routineTitle.textContent = data.routine_title || "맞춤형 관절 안전 운동 루틴";
    summaryMessage.textContent = data.summary_message || "";

    // 탭 1: 분할 루틴 렌더링
    splitRoutineContainer.innerHTML = "";
    (data.weekly_split || []).forEach((day) => {
      const dayCard = document.createElement("div");
      dayCard.className = "day-card";

      let exercisesHtml = `
        <table class="exercise-table">
          <thead>
            <tr>
              <th style="width: 28%;">종목명</th>
              <th style="width: 15%;">세트</th>
              <th style="width: 15%;">반복</th>
              <th style="width: 20%;">강도 (RIR)</th>
              <th style="width: 22%;">관절 보호 팁</th>
            </tr>
          </thead>
          <tbody>
      `;

      (day.exercises || []).forEach((ex) => {
        exercisesHtml += `
          <tr>
            <td><strong>${escapeHtml(ex.name)}</strong></td>
            <td>${escapeHtml(ex.sets)}</td>
            <td>${escapeHtml(ex.reps)}</td>
            <td><span class="rir-badge">${escapeHtml(ex.rir_guide)}</span></td>
            <td><span class="form-tip-text">${escapeHtml(ex.form_tips)}</span></td>
          </tr>
        `;
      });

      exercisesHtml += `</tbody></table>`;

      dayCard.innerHTML = `
        <div class="day-header">
          <span class="day-title">${escapeHtml(day.day_name)}</span>
          <span class="day-focus">타깃: ${escapeHtml(day.target_focus)}</span>
        </div>
        ${exercisesHtml}
      `;
      splitRoutineContainer.appendChild(dayCard);
    });

    // 탭 2: 1:1 관절 보호 대체 매핑 렌더링
    replacementsContainer.innerHTML = "";
    if (data.joint_friendly_replacements && data.joint_friendly_replacements.length > 0) {
      data.joint_friendly_replacements.forEach((rep) => {
        const repCard = document.createElement("div");
        repCard.className = "replace-card";
        repCard.innerHTML = `
          <div class="replace-header-row">
            <span class="badge-standard">기존 위험: ${escapeHtml(rep.standard_exercise)}</span>
            <span class="badge-arrow">➔</span>
            <span class="badge-safe">안전 대체: ${escapeHtml(rep.safe_replacement)}</span>
          </div>
          <div class="replace-reason">
            <strong>관절 보호 원리:</strong> ${escapeHtml(rep.biomechanical_reason)}
          </div>
        `;
        replacementsContainer.appendChild(repCard);
      });
    } else {
      replacementsContainer.innerHTML = "<p class='care-text'>별도의 대체 동작이 필요하지 않은 안전 종목 위주로 구성되었습니다.</p>";
    }

    // 탭 3: 케어 가이드 렌더링
    warmupList.innerHTML = "";
    const care = data.injury_prevention_care || {};
    (care.target_warmup || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      warmupList.appendChild(li);
    });

    postureWarning.textContent = care.posture_collapse_warning || "자세가 무너지거나 타깃 부위 외 관절에 압박이 느껴지면 즉시 세트를 종료하세요.";

    cooldownList.innerHTML = "";
    (care.cooldown_routine || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      cooldownList.appendChild(li);
    });

    // 결과 창 표시 및 부드러운 스크롤 이동
    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 7. 4자리 PIN 모달 제어 및 입력 로직
  function openPinModal() {
    pinDigits.forEach((d) => (d.value = ""));
    pinErrorMessage.classList.add("hidden");
    pinInputsContainer.classList.remove("shake");
    pinModal.classList.remove("hidden");
    setTimeout(() => pinDigits[0].focus(), 50);
  }

  function closePinModal() {
    pinModal.classList.add("hidden");
    pinDigits.forEach((d) => (d.value = ""));
    pinErrorMessage.classList.add("hidden");
  }

  cancelPinBtn.addEventListener("click", closePinModal);
  pinModal.addEventListener("click", (e) => {
    if (e.target === pinModal) closePinModal();
  });

  // 4자리 입력 박스 자동 포커스 이동 처리
  pinDigits.forEach((input, idx) => {
    input.addEventListener("input", (e) => {
      const val = e.target.value.replace(/[^0-9]/g, "");
      e.target.value = val;
      pinErrorMessage.classList.add("hidden");

      if (val && idx < pinDigits.length - 1) {
        pinDigits[idx + 1].focus();
      }

      const allFilled = Array.from(pinDigits).every((d) => d.value.length === 1);
      if (allFilled && idx === pinDigits.length - 1) {
        confirmPinBtn.focus();
      }
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && idx > 0) {
        pinDigits[idx - 1].focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        handlePinConfirm();
      }
    });

    // 붙여넣기 (Paste) 지원: 4자리 복사 붙여넣기 시 4칸에 자동 배분
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "").slice(0, 4);
      if (pasteData) {
        pasteData.split("").forEach((char, i) => {
          if (pinDigits[i]) pinDigits[i].value = char;
        });
        const nextIdx = Math.min(pasteData.length, pinDigits.length - 1);
        pinDigits[nextIdx].focus();
      }
    });
  });

  confirmPinBtn.addEventListener("click", handlePinConfirm);

  function handlePinConfirm() {
    const enteredPin = Array.from(pinDigits).map((d) => d.value.trim()).join("");
    if (enteredPin.length < 4) {
      showPinError("4자리 비밀번호를 모두 입력해 주세요.");
      return;
    }

    executeRoutineGeneration(enteredPin);
  }

  function showPinError(msg) {
    pinErrorMessage.textContent = msg;
    pinErrorMessage.classList.remove("hidden");
    pinInputsContainer.classList.remove("shake");
    void pinInputsContainer.offsetWidth; // CSS 리플로우
    pinInputsContainer.classList.add("shake");
    pinDigits.forEach((d) => (d.value = ""));
    pinDigits[0].focus();
  }

  // 8. 폼 제출 이벤트 핸들러: 먼저 PIN 모달을 띄움
  plannerForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const disclaimerCheckbox = document.getElementById("disclaimer_agree");
    if (!disclaimerCheckbox.checked) {
      alert("안전한 운동 진행을 위해 면책 조항 및 즉시 중단 기준에 동의해 주세요.");
      return;
    }

    // 선택된 통증 부위 수집
    const painCheckboxes = document.querySelectorAll("input[name='pain_area']:checked");
    const painAreas = Array.from(painCheckboxes).map((cb) => cb.value);

    pendingPayload = {
      goal: document.getElementById("goal").value,
      experience: document.getElementById("experience").value,
      days_per_week: parseInt(document.getElementById("days_per_week").value, 10),
      session_duration: parseInt(document.getElementById("session_duration").value, 10),
      environment: document.getElementById("environment").value,
      pain_areas: painAreas,
      pain_level: parseInt(painSlider.value, 10),
      has_radiating_pain: document.getElementById("has_radiating_pain").checked,
      has_surgery: document.getElementById("has_surgery").checked,
      notes: document.getElementById("notes").value.trim()
    };

    // 비밀번호 입력 모달창 오픈
    openPinModal();
  });

  // 9. 실제 API 비동기 호출
  async function executeRoutineGeneration(accessPin) {
    if (!pendingPayload) return;

    pendingPayload.access_pin = accessPin;
    closePinModal();
    setLoadingState(true);

    try {
      const response = await fetch("/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(pendingPayload)
      });

      const resData = await response.json();

      if (response.status === 403 || (resData.message && resData.message.includes("비밀번호"))) {
        // 비밀번호 오류 시 모달 다시 열고 에러 표시
        openPinModal();
        showPinError("비밀번호가 일치하지 않습니다.");
        return;
      }

      if (!response.ok) {
        throw new Error(resData.message || "서버 통신 중 오류가 발생했습니다.");
      }

      if (resData.status === "hard_stop") {
        showHardStopModal(resData.data);
      } else if (resData.status === "success") {
        renderRoutine(resData.data);
      } else {
        alert(resData.message || "루틴을 생성할 수 없습니다.");
      }
    } catch (err) {
      console.error("루틴 생성 요청 실패:", err);
      alert(`오류 발생: ${err.message}`);
    } finally {
      setLoadingState(false);
    }
  }

  // 8. 텍스트 복사 기능
  copyBtn.addEventListener("click", () => {
    if (!currentRoutineData) return;
    const textContent = formatRoutineToMarkdown(currentRoutineData);
    navigator.clipboard.writeText(textContent)
      .then(() => alert("운동 루틴 내용이 클립보드에 복사되었습니다!"))
      .catch(() => alert("클립보드 복사에 실패했습니다."));
  });

  // 9. Markdown 파일 다운로드 기능
  downloadMdBtn.addEventListener("click", () => {
    if (!currentRoutineData) return;
    const mdContent = formatRoutineToMarkdown(currentRoutineData);
    const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SafeFit_AI_Routine_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // 헬퍼: HTML 특수문자 이스케이프 (XSS 방지)
  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // 헬퍼: JSON 데이터를 깔끔한 Markdown 문자열로 변환
  function formatRoutineToMarkdown(data) {
    let md = `# 🛡️ ${data.routine_title || "SafeFit 맞춤 운동 루틴"}\n\n`;
    md += `> **루틴 개요**: ${data.summary_message || ""}\n\n`;
    md += `---\n\n`;

    md += `## 📅 주간 안전 분할 루틴\n\n`;
    (data.weekly_split || []).forEach((day) => {
      md += `### ${day.day_name} (타깃: ${day.target_focus})\n`;
      md += `| 종목명 | 세트 | 반복 | RIR 강도 | 관절 보호 팁 |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- |\n`;
      (day.exercises || []).forEach((ex) => {
        md += `| ${ex.name} | ${ex.sets} | ${ex.reps} | ${ex.rir_guide} | ${ex.form_tips} |\n`;
      });
      md += `\n`;
    });

    md += `## 🔄 1:1 관절 보호 대체 매핑\n\n`;
    (data.joint_friendly_replacements || []).forEach((rep) => {
      md += `- **기존 표준 운동**: ${rep.standard_exercise}\n`;
      md += `  - **안전 대체 운동**: ${rep.safe_replacement}\n`;
      md += `  - **관절 보호 원리**: ${rep.biomechanical_reason}\n\n`;
    });

    const care = data.injury_prevention_care || {};
    md += `## 🧘 부상 방지 케어 가이드\n\n`;
    md += `### 🔥 타깃 웜업\n`;
    (care.target_warmup || []).forEach((w) => {
      md += `- ${w}\n`;
    });
    md += `\n### ⚠️ 자세 붕괴 경고 신호\n`;
    md += `${care.posture_collapse_warning || ""}\n\n`;
    md += `### 🧊 쿨다운 스트레칭\n`;
    (care.cooldown_routine || []).forEach((c) => {
      md += `- ${c}\n`;
    });

    return md;
  }

  // =========================================================
  // 10. PWA 스마트 앱 설치 배너 로직
  // =========================================================
  const pwaInstallBanner = document.getElementById("pwaInstallBanner");
  const pwaInstallBtn = document.getElementById("pwaInstallBtn");
  const pwaCloseBtn = document.getElementById("pwaCloseBtn");
  const iosInstallTooltip = document.getElementById("iosInstallTooltip");

  let deferredInstallPrompt = null;

  // 이미 독립 실행형(Standalone, 앱 상태)으로 켜져 있는지 확인
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isBannerDismissed = sessionStorage.getItem("pwa_banner_dismissed") === "true";
  const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());

  if (!isStandalone && !isBannerDismissed) {
    if (isIos) {
      // iOS 사파리는 beforeinstallprompt 이벤트가 지원되지 않으므로 배너 노출
      pwaInstallBanner.classList.remove("hidden");
    }

    // 안드로이드 / 크롬 / 엣지 등 PWA 설치 지원 브라우저
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      pwaInstallBanner.classList.remove("hidden");
    });
  }

  // 설치 버튼 클릭
  pwaInstallBtn.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === "accepted") {
        pwaInstallBanner.classList.add("hidden");
      }
      deferredInstallPrompt = null;
    } else if (isIos) {
      // iOS의 경우 하단 공유 버튼 안내 툴팁 표시
      iosInstallTooltip.classList.toggle("hidden");
    } else {
      alert("브라우저 오른쪽 상단 메뉴(⋮)에서 '홈 화면에 추가' 또는 '앱 설치'를 클릭해 주세요.");
    }
  });

  // 닫기 버튼 클릭
  pwaCloseBtn.addEventListener("click", () => {
    pwaInstallBanner.classList.add("hidden");
    sessionStorage.setItem("pwa_banner_dismissed", "true");
  });

  // 앱 설치 완료 감지 시 배너 숨김
  window.addEventListener("appinstalled", () => {
    pwaInstallBanner.classList.add("hidden");
    deferredInstallPrompt = null;
  });
});
