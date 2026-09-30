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
  const hasRadiatingPain = document.getElementById("has_radiating_pain");
  const hasSurgery = document.getElementById("has_surgery");
  const painLevelGroup = document.getElementById("painLevelGroup");
  const riskAlertText = document.getElementById("riskAlertText");

  // 신체 스펙 및 최초 사용자 영역 요소
  const firstTimeUserSection = document.getElementById("firstTimeUserSection");
  const userHeightInput = document.getElementById("user_height");
  const userWeightInput = document.getElementById("user_weight");
  const userStrengthInput = document.getElementById("user_strength");

  // 운동 환경 및 기구 특이사항 요소
  const environmentSelect = document.getElementById("environment");
  const facilityNotesGroup = document.getElementById("facilityNotesGroup");
  const facilityNotesInput = document.getElementById("facility_notes");

  // 결과 영역 요소
  const resultSection = document.getElementById("resultSection");
  const routineTitle = document.getElementById("routineTitle");
  const summaryMessage = document.getElementById("summaryMessage");
  const routineFlowContainer = document.getElementById("routineFlowContainer");
  const statWarningBanner = document.getElementById("statWarningBanner");
  const statWarningText = document.getElementById("statWarningText");

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
  const closePinModalBtn = document.getElementById("closePinModalBtn");
  let pendingPayload = null;
  let isSubmittingPin = false;

  // 도구 버튼
  const copyBtn = document.getElementById("copyBtn");
  const downloadJsonBtn = document.getElementById("downloadJsonBtn");
  const downloadExcelBtn = document.getElementById("downloadExcelBtn") || document.getElementById("downloadCsvBtn");

  // 운동 일지 불러오기 및 성취도 선택 요소
  const workoutLogFileInput = document.getElementById("workoutLogFileInput");
  const logFileStatus = document.getElementById("logFileStatus");
  const achievementSection = document.getElementById("achievementSection");
  const achievementSlider = document.getElementById("achievementSlider");
  const achievementLevelText = document.getElementById("achievementLevelText");
  let loadedHistory = [];
  // 현재 생성된 최신 루틴 데이터 캐시 (복사 및 다운로드용)
  let currentRoutineData = null;

  // =========================================================
  // 스마트 토스트 알림 헬퍼 (Toast Notification)
  // =========================================================
  let toastContainer = document.querySelector(".toast-container");
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
  }

  function showToast(message, type = "info", duration = 2800) {
    const iconMap = {
      success: "✅",
      warning: "⚠️",
      error: "❌",
      info: "ℹ️"
    };

    const toastItem = document.createElement("div");
    toastItem.className = `toast-item toast-${type}`;
    toastItem.innerHTML = `
      <span class="toast-icon">${iconMap[type] || "ℹ️"}</span>
      <span class="toast-msg">${escapeHtml(message)}</span>
    `;

    toastContainer.appendChild(toastItem);

    // duration 후 서서히 사라지면서 제거
    setTimeout(() => {
      toastItem.classList.add("toast-hiding");
      setTimeout(() => {
        if (toastItem.parentNode) {
          toastItem.parentNode.removeChild(toastItem);
        }
      }, 250);
    }, duration);
  }

  // 액션 버튼이 포함된 인터랙티브 토스트 헬퍼
  function showActionToast(message, confirmText, cancelText, onConfirm, onCancel) {
    const toastItem = document.createElement("div");
    toastItem.className = "toast-item toast-action";
    toastItem.innerHTML = `
      <div class="toast-action-content">
        <span class="toast-icon">📋</span>
        <span class="toast-msg">${escapeHtml(message)}</span>
      </div>
      <div class="toast-action-btns">
        <button type="button" class="toast-btn toast-btn-cancel">${escapeHtml(cancelText)}</button>
        <button type="button" class="toast-btn toast-btn-confirm">${escapeHtml(confirmText)}</button>
      </div>
    `;

    function closeToast() {
      toastItem.classList.add("toast-hiding");
      setTimeout(() => {
        if (toastItem.parentNode) {
          toastItem.parentNode.removeChild(toastItem);
        }
      }, 250);
    }

    const confirmBtn = toastItem.querySelector(".toast-btn-confirm");
    const cancelBtn = toastItem.querySelector(".toast-btn-cancel");

    confirmBtn.addEventListener("click", () => {
      closeToast();
      if (typeof onConfirm === "function") onConfirm();
    });

    cancelBtn.addEventListener("click", () => {
      closeToast();
      if (typeof onCancel === "function") onCancel();
    });

    toastContainer.appendChild(toastItem);
  }

  // URL에 남아있는 쿼리스트링(?user_height=... 등)이 있다면 폼 값에 채워주고 주소창을 깔끔하게 정리
  try {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("user_height") && userHeightInput) {
      userHeightInput.value = urlParams.get("user_height");
    }
    if (urlParams.has("user_weight") && userWeightInput) {
      userWeightInput.value = urlParams.get("user_weight");
    }
    if (urlParams.has("user_strength") && userStrengthInput) {
      userStrengthInput.value = urlParams.get("user_strength");
    }
    if (urlParams.has("notes") && document.getElementById("notes")) {
      document.getElementById("notes").value = urlParams.get("notes");
    }
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  } catch (err) {
    console.warn("쿼리 파라미터 복원 스킵:", err);
  }

  // 1. 통증 슬라이더 및 고위험 신호 실시간 감시 로직
  const painDescriptions = {
    1: "1단계 (경미한 뻐근함)",
    2: "2단계 (가벼운 통증)",
    3: "3단계 (보통 통증, 세심한 주의 필요)",
    4: "4단계 (심한 통증 - 고위험 신호)",
    5: "5단계 (극심한 통증 - 즉각 진료 권고)"
  };

  function updatePainLevelVisibility() {
    const checkedPainAreas = document.querySelectorAll("input[name='pain_area']:checked");
    if (!painLevelGroup) return;
    if (checkedPainAreas.length > 0) {
      painLevelGroup.classList.remove("hidden");
    } else {
      painLevelGroup.classList.add("hidden");
    }
    updateRiskState();
  }

  function updateRiskState() {
    const checkedPainAreas = document.querySelectorAll("input[name='pain_area']:checked");
    const hasCheckedPain = checkedPainAreas.length > 0;
    const painVal = (hasCheckedPain && painSlider) ? parseInt(painSlider.value, 10) : 0;
    const hasRadiation = hasRadiatingPain ? hasRadiatingPain.checked : false;
    const hasSurg = hasSurgery ? hasSurgery.checked : false;

    const isHighRisk = (hasCheckedPain && painVal >= 4) || hasRadiation || hasSurg;

    if (isHighRisk) {
      submitBtn.disabled = true;
      submitBtn.classList.add("btn-risk-blocked");
      btnText.textContent = "🚫 고위험 신호 감지: 생성 불가";
      if (riskAlertText) riskAlertText.classList.remove("hidden");
    } else {
      submitBtn.disabled = false;
      submitBtn.classList.remove("btn-risk-blocked");
      btnText.textContent = "안전 맞춤 루틴 생성하기";
      if (riskAlertText) riskAlertText.classList.add("hidden");
    }
  }

  painSlider.addEventListener("input", (e) => {
    const val = e.target.value;
    painLevelText.textContent = painDescriptions[val] || `${val}단계`;
    if (val >= 4) {
      painLevelText.style.color = "#dc2626";
      painLevelText.style.backgroundColor = "#fee2e2";
    } else {
      painLevelText.style.color = "#2563eb";
      painLevelText.style.backgroundColor = "#eff6ff";
    }
    updateRiskState();
  });

  // 관절 통증 부위 체크박스 변경 시 통증 강도 슬라이더 표시/숨김
  document.querySelectorAll("input[name='pain_area']").forEach((cb) => {
    cb.addEventListener("change", updatePainLevelVisibility);
  });

  if (hasRadiatingPain) {
    hasRadiatingPain.addEventListener("change", updateRiskState);
  }
  if (hasSurgery) {
    hasSurgery.addEventListener("change", updateRiskState);
  }

  // 헬스장 환경 선택 시 기구 특이사항 입력창 동적 표시/숨김
  function updateFacilityNotesVisibility() {
    if (!facilityNotesGroup || !environmentSelect) return;
    if (environmentSelect.value === "헬스장") {
      facilityNotesGroup.classList.remove("hidden");
    } else {
      facilityNotesGroup.classList.add("hidden");
    }
  }

  if (environmentSelect) {
    environmentSelect.addEventListener("change", updateFacilityNotesVisibility);
  }

  // 초기 상태 반영 (새로고침 시 브라우저 폼 복원 대응)
  updateRiskState();
  updatePainLevelVisibility();
  updateFacilityNotesVisibility();

  // 1-1. 운동 일지 파일 첨부 및 성취도 평가 처리
  const achievementMap = {
    1: "1단계 (80% 미만 성취 - 피로 누적)",
    2: "2단계 (90% 성취 - 아쉬운 완수)",
    3: "3단계 (100% 정상 완수 - 계획 완벽 달성)",
    4: "4단계 (110% 초과 성취 - 여유 있는 완료)",
    5: "5단계 (120% 이상 성취 - 충분한 초과)"
  };

  if (achievementSlider) {
    achievementSlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      achievementLevelText.textContent = achievementMap[val] || `${val}단계`;
      if (val === 1) {
        // 1단계: 연빨강 (피로/미달)
        achievementLevelText.style.backgroundColor = "#fee2e2";
        achievementLevelText.style.color = "#dc2626";
      } else if (val === 2) {
        // 2단계: 연주황 (아쉬운 완수)
        achievementLevelText.style.backgroundColor = "#fef3c7";
        achievementLevelText.style.color = "#d97706";
      } else if (val === 3) {
        // 3단계: 연파랑 (100% 정상 완수)
        achievementLevelText.style.backgroundColor = "#eff6ff";
        achievementLevelText.style.color = "#2563eb";
      } else if (val === 4) {
        // 4단계: 에메랄드 초록 (여유 완료)
        achievementLevelText.style.backgroundColor = "#dcfce7";
        achievementLevelText.style.color = "#15803d";
      } else if (val === 5) {
        // 5단계: 바이올렛 보라 (충분한 초과 / 증량)
        achievementLevelText.style.backgroundColor = "#f3e8ff";
        achievementLevelText.style.color = "#7e22ce";
      }
    });
  }

  // 헬퍼: 지난 회차의 신체 상태 및 환경 설정을 폼에 자동 복원
  function restoreUserProfileForm(profile) {
    if (!profile) return;

    if (profile.goal && document.getElementById("goal")) {
      document.getElementById("goal").value = profile.goal;
    }
    if (profile.experience && document.getElementById("experience")) {
      document.getElementById("experience").value = profile.experience;
    }
    if (profile.split_routine && document.getElementById("split_routine")) {
      document.getElementById("split_routine").value = profile.split_routine;
    }
    if (profile.session_duration && document.getElementById("session_duration")) {
      document.getElementById("session_duration").value = String(profile.session_duration);
    }
    if (profile.environment && document.getElementById("environment")) {
      document.getElementById("environment").value = profile.environment;
    }
    if (profile.cardio_option && document.getElementById("cardio_option")) {
      document.getElementById("cardio_option").value = profile.cardio_option;
    }

    const savedPainAreas = Array.isArray(profile.pain_areas) ? profile.pain_areas : [];
    document.querySelectorAll("input[name='pain_area']").forEach((cb) => {
      cb.checked = savedPainAreas.includes(cb.value);
    });

    if (profile.pain_level !== undefined && painSlider) {
      const pLevel = parseInt(profile.pain_level, 10) || 1;
      painSlider.value = pLevel;
      painLevelText.textContent = painDescriptions[pLevel] || `${pLevel}단계`;
      if (pLevel >= 4) {
        painLevelText.style.color = "#dc2626";
        painLevelText.style.backgroundColor = "#fee2e2";
      } else {
        painLevelText.style.color = "#2563eb";
        painLevelText.style.backgroundColor = "#eff6ff";
      }
    }

    if (hasRadiatingPain && profile.has_radiating_pain !== undefined) {
      hasRadiatingPain.checked = Boolean(profile.has_radiating_pain);
    }
    if (hasSurgery && profile.has_surgery !== undefined) {
      hasSurgery.checked = Boolean(profile.has_surgery);
    }

    if (facilityNotesInput && profile.facility_notes !== undefined) {
      facilityNotesInput.value = profile.facility_notes;
    }

    if (document.getElementById("notes") && profile.notes !== undefined) {
      document.getElementById("notes").value = profile.notes;
    }

    if (userHeightInput && profile.user_height !== undefined && profile.user_height !== null) {
      userHeightInput.value = profile.user_height;
    }
    if (userWeightInput && profile.user_weight !== undefined && profile.user_weight !== null) {
      userWeightInput.value = profile.user_weight;
    }
    if (userStrengthInput && profile.user_strength !== undefined) {
      userStrengthInput.value = profile.user_strength;
    }

    updateRiskState();
    updatePainLevelVisibility();
    updateFacilityNotesVisibility();
  }

  if (workoutLogFileInput) {
    workoutLogFileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          const historyArray = Array.isArray(parsed) ? parsed : (parsed.history || []);

          if (historyArray.length === 0) {
            showToast("일지 파일 내에 유효한 운동 기록이 없습니다.", "warning");
            return;
          }

          loadedHistory = historyArray;
          const lastSession = loadedHistory[loadedHistory.length - 1];
          const lastDate = lastSession.date || "최근";

          logFileStatus.innerHTML = `
            <span class="badge-log-state loaded">
              ✅ 이전 ${loadedHistory.length}회차 기록 로드 완료 (마지막 운동일: ${escapeHtml(lastDate)})
            </span>
          `;
          showToast(`이전 ${loadedHistory.length}회차 운동 기록을 불러왔습니다.`, "success");

          if (achievementSection) {
            achievementSection.classList.remove("hidden");
          }

          // 이전 일지가 로드되었으므로 최초 사용자 신체 정보 입력칸 자동 숨김
          if (firstTimeUserSection) {
            firstTimeUserSection.classList.add("hidden");
          }

          // 지난 회차 신체 상태 및 운동 환경 설정 복원 인터랙티브 액션 토스트
          const lastProfile = parsed.last_user_profile;
          if (lastProfile) {
            setTimeout(() => {
              showActionToast(
                "지난 회차의 운동 설정(목적, 분할, 장비, 통증 부위 등)을 불러올까요?",
                "불러오기",
                "현재 설정 유지",
                () => {
                  // [불러오기] 클릭 시 실행
                  restoreUserProfileForm(lastProfile);
                  logFileStatus.innerHTML = `
                    <span class="badge-log-state loaded">
                      ✅ 이전 ${loadedHistory.length}회차 기록 및 지난 설정 복원 완료 (마지막 운동일: ${escapeHtml(lastDate)})
                    </span>
                  `;
                  showToast("지난 회차의 운동 설정이 자동 적용되었습니다.", "info");
                },
                () => {
                  // [현재 설정 유지] 클릭 시 안내
                  showToast("현재 화면의 입력 설정을 유지합니다.", "info");
                }
              );
            }, 300);
          }
        } catch (err) {
          console.error("JSON 파싱 에러:", err);
          showToast("올바른 운동 일지(.json) 파일이 아닙니다.", "error");
        }
      };
      reader.readAsText(file, "UTF-8");
    });
  }

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
      btnSpinner.classList.add("hidden");
      updateRiskState();
    }
  }

  // 6. 결과 화면 렌더링 (단일 실전 루틴 플로우)
  function renderRoutine(data) {
    currentRoutineData = data;

    // 제목 및 요약
    routineTitle.textContent = data.routine_title || "맞춤형 관절 안전 운동 루틴";
    summaryMessage.textContent = data.summary_message || "";

    // 비정상 신체 스펙(신장/체중) 감지 시 상단 안내 배너 노출
    const heightVal = userHeightInput ? parseFloat(userHeightInput.value) : null;
    const weightVal = userWeightInput ? parseFloat(userWeightInput.value) : null;
    let statWarningMsg = "";

    const isAbnormalHeight = heightVal && (heightVal < 100 || heightVal > 250);
    const isAbnormalWeight = weightVal && (weightVal < 30 || weightVal > 200);

    if (isAbnormalHeight && isAbnormalWeight) {
      statWarningMsg = `입력하신 신장(${heightVal}cm)과 체중(${weightVal}kg)이 일반적인 범위를 벗어나 있습니다. 올바르게 기재하셨는지 확인해 주세요. 오타가 있다면 다음 회차 시 수정하시면 더욱 정밀한 가이드가 제공됩니다.`;
    } else if (isAbnormalHeight) {
      statWarningMsg = `입력하신 신장(${heightVal}cm)이 일반적인 범위를 벗어나 있습니다. 올바르게 기재하셨는지 확인해 주세요.`;
    } else if (isAbnormalWeight) {
      statWarningMsg = `입력하신 체중(${weightVal}kg)이 일반적인 범위를 벗어나 있습니다. 올바르게 기재하셨는지 확인해 주세요.`;
    }

    if (statWarningBanner && statWarningText) {
      if (statWarningMsg) {
        statWarningText.textContent = statWarningMsg;
        statWarningBanner.classList.remove("hidden");
      } else {
        statWarningBanner.classList.add("hidden");
      }
    }

    // 단일 실전 루틴 플로우 렌더링
    routineFlowContainer.innerHTML = "";
    const care = data.injury_prevention_care || {};
    const warmupItems = care.target_warmup || [];
    const cooldownItems = care.cooldown_routine || [];

    // 신규 1일치 today_workout이 있으면 단일 배열로 정규화, 없으면 weekly_split 폴백
    let workoutDays = [];
    if (data.today_workout && typeof data.today_workout === "object") {
      workoutDays = [data.today_workout];
    } else if (Array.isArray(data.weekly_split)) {
      workoutDays = data.weekly_split;
    }

    // STEP 1. 타깃 웜업 & 동적 스트레칭
    const step1Block = document.createElement("div");
    step1Block.className = "flow-step-block";
    let step1ListHtml = "";
    if (warmupItems.length > 0) {
      step1ListHtml = `
        <ul class="linear-care-list">
          ${warmupItems.map((item, idx) => `
            <li class="linear-care-item">
              <span class="linear-care-num">${idx + 1}</span>
              <span>${escapeHtml(item)}</span>
            </li>
          `).join("")}
        </ul>
      `;
    } else {
      step1ListHtml = `<p class="care-text">관절 가온을 위한 가벼운 동적 스트레칭 5분을 진행해 주세요.</p>`;
    }

    step1Block.innerHTML = `
      <div class="step-header step-warmup-header">
        <div class="step-tag-row">
          <span class="step-badge badge-step1">STEP 1</span>
          <span class="step-title">🔥 부상 방지 웜업 & 타깃 동적 스트레칭</span>
        </div>
        <span class="step-desc">체온 상승 및 관절 활성화 (약 5~10분)</span>
      </div>
      <div class="step-content-body">
        ${step1ListHtml}
      </div>
    `;
    routineFlowContainer.appendChild(step1Block);

    // STEP 2. 본운동 (오늘의 1일치 세션)
    const step2Block = document.createElement("div");
    step2Block.className = "flow-step-block";

    let splitDaysHtml = `<div class="split-container">`;
    workoutDays.forEach((day) => {
      let dayExercisesHtml = `<div class="exercise-list">`;
      (day.exercises || []).forEach((ex) => {
        let replacementTagHtml = "";
        const repType = ex.replacement_type || (ex.is_replacement ? "joint_safe" : "none");
        const replacedFrom = ex.replaced_from ? ` <span class="replaced-from-text">(기존: ${escapeHtml(ex.replaced_from)})</span>` : "";

        if (repType === "joint_safe") {
          replacementTagHtml = `<span class="safe-replacement-tag">🛡️ 관절 보호 대체${replacedFrom}</span>`;
        } else if (repType === "custom_request") {
          replacementTagHtml = `<span class="custom-replacement-tag">⚙️ 맞춤 요청 대체${replacedFrom}</span>`;
        }

        dayExercisesHtml += `
          <div class="exercise-item-card">
            <div class="ex-card-top">
              <div class="ex-title-wrap">
                ${ex.body_part ? `<span class="body-part-badge">${escapeHtml(ex.body_part)}</span>` : ""}
                <span class="ex-title">${escapeHtml(ex.name)}</span>
                ${replacementTagHtml}
              </div>
              <span class="rir-badge">${escapeHtml(ex.rir_guide || "").replace(/RIR\s*/gi, "여유 ")}</span>
            </div>
            <div class="ex-specs-row">
              ${ex.weight ? `<span class="spec-pill spec-weight"><strong>중량</strong> ${escapeHtml(ex.weight)}</span>` : ""}
              <span class="spec-pill"><strong>세트</strong> ${escapeHtml(ex.sets)}</span>
              <span class="spec-pill"><strong>반복</strong> ${escapeHtml(ex.reps)}</span>
            </div>
            <div class="ex-tip-box">
              <span class="tip-badge">💡 관절 보호 자세 팁</span>
              <p class="tip-content">${escapeHtml(ex.form_tips)}</p>
            </div>
          </div>
        `;
      });
      dayExercisesHtml += `</div>`;

      splitDaysHtml += `
        <div class="day-card">
          <div class="day-header">
            <span class="day-title">${escapeHtml(day.day_name)}</span>
            <span class="day-focus">타깃: ${escapeHtml(day.target_focus)}</span>
          </div>
          ${dayExercisesHtml}
        </div>
      `;
    });
    splitDaysHtml += `</div>`;

    const postureTip = care.posture_collapse_warning
      ? `<div class="posture-alert-bar">
           <span>⚠️</span>
           <span><strong>자세 붕괴 감지 팁:</strong> ${escapeHtml(care.posture_collapse_warning)}</span>
         </div>`
      : "";

    step2Block.innerHTML = `
      <div class="step-header step-main-header">
        <div class="step-tag-row">
          <span class="step-badge badge-step2">STEP 2</span>
          <span class="step-title">💪 오늘의 본운동 (관절 보호 1일치 집중 플랜)</span>
        </div>
        <span class="step-desc">오늘 당장 수행해야 할 1개 세션</span>
      </div>
      <div class="step-content-body">
        ${splitDaysHtml}
        ${postureTip}
      </div>
    `;
    routineFlowContainer.appendChild(step2Block);

    // STEP 3. 쿨다운 & 정적 스트레칭
    const step3Block = document.createElement("div");
    step3Block.className = "flow-step-block";
    let step3ListHtml = "";
    if (cooldownItems.length > 0) {
      step3ListHtml = `
        <ul class="linear-care-list">
          ${cooldownItems.map((item, idx) => `
            <li class="linear-care-item">
              <span class="linear-care-num">${idx + 1}</span>
              <span>${escapeHtml(item)}</span>
            </li>
          `).join("")}
        </ul>
      `;
    } else {
      step3ListHtml = `<p class="care-text">심박수를 안정시키고 근육 긴장을 풀어주는 정적 스트레칭 5분을 진행해 주세요.</p>`;
    }

    step3Block.innerHTML = `
      <div class="step-header step-cooldown-header">
        <div class="step-tag-row">
          <span class="step-badge badge-step3">STEP 3</span>
          <span class="step-title">🧊 관절 이완 & 정적 스트레칭 쿨다운</span>
        </div>
        <span class="step-desc">심박 안정 및 피로 물질 회복 촉진 (약 5분)</span>
      </div>
      <div class="step-content-body">
        ${step3ListHtml}
      </div>
    `;
    routineFlowContainer.appendChild(step3Block);

    // 결과 창 표시 및 부드러운 스크롤 이동
    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // 7. 4자리 PIN 모달 제어 및 입력 로직
  function openPinModal() {
    isSubmittingPin = false;
    pinDigits.forEach((d) => {
      d.value = "";
      d.disabled = false;
    });
    pinErrorMessage.classList.add("hidden");
    pinInputsContainer.classList.remove("shake");
    pinModal.classList.remove("hidden");
    setTimeout(() => pinDigits[0].focus(), 50);
  }

  function closePinModal() {
    isSubmittingPin = false;
    pinModal.classList.add("hidden");
    pinDigits.forEach((d) => {
      d.value = "";
      d.disabled = false;
    });
    pinErrorMessage.classList.add("hidden");
  }

  if (closePinModalBtn) {
    closePinModalBtn.addEventListener("click", closePinModal);
  }
  pinModal.addEventListener("click", (e) => {
    if (e.target === pinModal) closePinModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !pinModal.classList.contains("hidden")) {
      closePinModal();
    }
  });

  function tryAutoSubmitPin() {
    if (isSubmittingPin) return;
    const enteredPin = Array.from(pinDigits).map((d) => d.value.trim()).join("");
    if (enteredPin.length === 4) {
      isSubmittingPin = true;
      executeRoutineGeneration(enteredPin);
    }
  }

  // 4자리 입력 박스 자동 포커스 및 4자리 입력 시 즉시 자동 제출
  pinDigits.forEach((input, idx) => {
    input.addEventListener("input", (e) => {
      const val = e.target.value.replace(/[^0-9]/g, "");
      e.target.value = val;
      pinErrorMessage.classList.add("hidden");

      if (val && idx < pinDigits.length - 1) {
        pinDigits[idx + 1].focus();
      }

      tryAutoSubmitPin();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && idx > 0) {
        pinDigits[idx - 1].focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        tryAutoSubmitPin();
      }
    });

    // 붙여넣기 (Paste) 지원: 4자리 복사 붙여넣기 시 4칸에 자동 배분 후 즉시 실행
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pasteData = (e.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "").slice(0, 4);
      if (pasteData) {
        pasteData.split("").forEach((char, i) => {
          if (pinDigits[i]) pinDigits[i].value = char;
        });
        if (pasteData.length === 4) {
          tryAutoSubmitPin();
        } else {
          const nextIdx = Math.min(pasteData.length, pinDigits.length - 1);
          pinDigits[nextIdx].focus();
        }
      }
    });
  });

  function showPinError(msg) {
    isSubmittingPin = false;
    pinErrorMessage.textContent = msg;
    pinErrorMessage.classList.remove("hidden");
    pinInputsContainer.classList.remove("shake");
    void pinInputsContainer.offsetWidth; // CSS 리플로우
    pinInputsContainer.classList.add("shake");
    pinDigits.forEach((d) => {
      d.value = "";
      d.disabled = false;
    });
    pinDigits[0].focus();
  }

  // 8. 폼 제출 안전 핸들러 (Enter 키 새로고침 방지 및 PIN 모달 호출)
  function handleFormSubmit(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (submitBtn.disabled) {
      return;
    }

    const painVal = parseInt(painSlider.value, 10);
    const hasRadiation = hasRadiatingPain ? hasRadiatingPain.checked : false;
    const hasSurg = hasSurgery ? hasSurgery.checked : false;
    if (painVal >= 4 || hasRadiation || hasSurg) {
      updateRiskState();
      return;
    }

    const disclaimerCheckbox = document.getElementById("disclaimer_agree");
    if (!disclaimerCheckbox.checked) {
      showToast("안전한 운동 진행을 위해 필수 면책 조항에 동의해 주세요.", "warning");
      disclaimerCheckbox.focus();
      return;
    }

    // 선택된 통증 부위 수집
    const painCheckboxes = document.querySelectorAll("input[name='pain_area']:checked");
    const painAreas = Array.from(painCheckboxes).map((cb) => cb.value);
    const resolvedPainLevel = painAreas.length > 0 && painSlider ? parseInt(painSlider.value, 10) : 0;

    pendingPayload = {
      goal: document.getElementById("goal").value,
      experience: document.getElementById("experience").value,
      split_routine: document.getElementById("split_routine") ? document.getElementById("split_routine").value : "2분할",
      session_duration: parseInt(document.getElementById("session_duration").value, 10),
      environment: document.getElementById("environment").value,
      cardio_option: document.getElementById("cardio_option") ? document.getElementById("cardio_option").value : "none",
      pain_areas: painAreas,
      pain_level: resolvedPainLevel,
      has_radiating_pain: document.getElementById("has_radiating_pain").checked,
      has_surgery: document.getElementById("has_surgery").checked,
      notes: document.getElementById("notes").value.trim(),
      facility_notes: facilityNotesInput ? facilityNotesInput.value.trim() : "",
      history: loadedHistory,
      achievement_level: loadedHistory.length > 0 && achievementSlider ? parseInt(achievementSlider.value, 10) : null,
      user_height: userHeightInput && userHeightInput.value ? parseFloat(userHeightInput.value) : null,
      user_weight: userWeightInput && userWeightInput.value ? parseFloat(userWeightInput.value) : null,
      user_strength: userStrengthInput ? userStrengthInput.value.trim() : ""
    };

    // 비밀번호 입력 모달창 오픈
    openPinModal();
  }

  // 폼 제출 이벤트 바인딩
  plannerForm.addEventListener("submit", handleFormSubmit);
  submitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    handleFormSubmit(e);
  });

  // 입력칸들에서 Enter 키 입력 시 브라우저 강제 새로고침 방지
  const allFormInputs = plannerForm.querySelectorAll("input[type='text'], input[type='number']");
  allFormInputs.forEach((inp) => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleFormSubmit(e);
      }
    });
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
        setLoadingState(false);
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
        showToast("✨ 맞춤 운동 루틴이 성공적으로 생성되었습니다!", "success");
      } else {
        showToast(resData.message || "루틴을 생성할 수 없습니다.", "error");
      }
    } catch (err) {
      console.error("루틴 생성 요청 실패:", err);
      showToast(`오류 발생: ${err.message}`, "error");
    } finally {
      setLoadingState(false);
    }
  }

  // 헬퍼: 파일 다운로드 트리거
  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // 8. 앱 연동 일지 (.json) 다운로드
  if (downloadJsonBtn) {
    downloadJsonBtn.addEventListener("click", () => {
      if (!currentRoutineData) return;

      const currentProfile = currentRoutineData._last_user_profile || {
        goal: document.getElementById("goal") ? document.getElementById("goal").value : "근력 증진",
        experience: document.getElementById("experience") ? document.getElementById("experience").value : "초급",
        split_routine: document.getElementById("split_routine") ? document.getElementById("split_routine").value : "2분할",
        session_duration: document.getElementById("session_duration") ? parseInt(document.getElementById("session_duration").value, 10) : 50,
        environment: document.getElementById("environment") ? document.getElementById("environment").value : "헬스장",
        cardio_option: document.getElementById("cardio_option") ? document.getElementById("cardio_option").value : "none",
        pain_areas: Array.from(document.querySelectorAll("input[name='pain_area']:checked")).map(cb => cb.value),
        pain_level: document.querySelectorAll("input[name='pain_area']:checked").length > 0 && painSlider ? parseInt(painSlider.value, 10) : 0,
        has_radiating_pain: hasRadiatingPain ? hasRadiatingPain.checked : false,
        has_surgery: hasSurgery ? hasSurgery.checked : false,
        notes: document.getElementById("notes") ? document.getElementById("notes").value.trim() : "",
        facility_notes: facilityNotesInput ? facilityNotesInput.value.trim() : "",
        user_height: userHeightInput && userHeightInput.value ? parseFloat(userHeightInput.value) : null,
        user_weight: userWeightInput && userWeightInput.value ? parseFloat(userWeightInput.value) : null,
        user_strength: userStrengthInput ? userStrengthInput.value.trim() : ""
      };

      const historyData = {
        version: "1.1",
        export_date: new Date().toISOString(),
        history: currentRoutineData._workout_history || [],
        last_user_profile: currentProfile
      };
      const jsonContent = JSON.stringify(historyData, null, 2);
      const fileName = `${currentRoutineData._file_name_base || "운동_일지"}.json`;
      downloadFile(jsonContent, fileName, "application/json;charset=utf-8");
      showToast(`📥 일지 파일(${fileName})이 저장되었습니다.`, "success");
    });
  }

  // 9. 엑셀 일지 (.xlsx) 다운로드
  if (downloadExcelBtn) {
    downloadExcelBtn.addEventListener("click", () => {
      if (!currentRoutineData) return;
      const baseName = currentRoutineData._file_name_base || "운동_일지";

      if (currentRoutineData._workout_xlsx_base64) {
        // Base64 문자열을 바이너리 Blob으로 변환하여 .xlsx 파일 다운로드
        const byteCharacters = atob(currentRoutineData._workout_xlsx_base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const fileName = `${baseName}.xlsx`;

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(`📊 엑셀 일지(${fileName})가 저장되었습니다.`, "success");
      } else {
        // 폴백: CSV 다운로드
        const csvContent = currentRoutineData._workout_csv || "\ufeff회차,날짜,성취도,분할,부위,운동 종목명,세트,횟수,여유 횟수\n";
        const fileName = `${baseName}.csv`;
        downloadFile(csvContent, fileName, "text/csv;charset=utf-8");
        showToast(`📊 CSV 일지(${fileName})가 저장되었습니다.`, "success");
      }
    });
  }

  // 10. 텍스트 복사 기능
  copyBtn.addEventListener("click", () => {
    if (!currentRoutineData) return;
    const textContent = formatRoutineToMarkdown(currentRoutineData);
    navigator.clipboard.writeText(textContent)
      .then(() => showToast("📋 운동 루틴이 클립보드에 복사되었습니다!", "success"))
      .catch(() => showToast("클립보드 복사에 실패했습니다.", "error"));
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

  // 헬퍼: JSON 데이터를 깔끔한 Markdown 문자열로 변환 (STEP 1 -> STEP 2 -> STEP 3 단일 플로우)
  function formatRoutineToMarkdown(data) {
    let md = `# 🛡️ ${data.routine_title || "SafeFit 맞춤 운동 루틴"}\n\n`;
    md += `> **루틴 개요**: ${data.summary_message || ""}\n\n`;
    md += `---\n\n`;

    const care = data.injury_prevention_care || {};

    // STEP 1. 웜업
    md += `## 🔥 STEP 1. 부상 방지 웜업 & 타깃 동적 스트레칭\n`;
    (care.target_warmup || []).forEach((w, idx) => {
      md += `${idx + 1}. ${w}\n`;
    });
    md += `\n---\n\n`;

    // STEP 2. 본운동 (오늘의 1일치 집중 세션)
    md += `## 💪 STEP 2. 오늘의 본운동 (관절 보호 1일치 집중 플랜)\n\n`;
    let mdDays = [];
    if (data.today_workout && typeof data.today_workout === "object") {
      mdDays = [data.today_workout];
    } else if (Array.isArray(data.weekly_split)) {
      mdDays = data.weekly_split;
    }

    mdDays.forEach((day) => {
      md += `### ${day.day_name} (타깃: ${day.target_focus})\n`;
      md += `| 부위 | 종목명 | 중량 | 세트 | 반복 | 여유 횟수 | 관절 보호 팁 |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      (day.exercises || []).forEach((ex) => {
        const rirText = String(ex.rir_guide || "").replace(/RIR\s*/gi, "여유 ");
        let safeTag = "";
        const repType = ex.replacement_type || (ex.is_replacement ? "joint_safe" : "none");
        const fromInfo = ex.replaced_from ? ` (기존: ${ex.replaced_from})` : "";
        if (repType === "joint_safe") {
          safeTag = ` [🛡️관절보호 대체${fromInfo}]`;
        } else if (repType === "custom_request") {
          safeTag = ` [⚙️맞춤요청 대체${fromInfo}]`;
        }
        const weightText = ex.weight || "-";
        md += `| ${ex.body_part || "전신"} | ${ex.name}${safeTag} | ${weightText} | ${ex.sets} | ${ex.reps} | ${rirText} | ${ex.form_tips} |\n`;
      });
      md += `\n`;
    });

    if (care.posture_collapse_warning) {
      md += `> ⚠️ **자세 붕괴 감지 팁**: ${care.posture_collapse_warning}\n\n`;
    }

    if (data.joint_friendly_replacements && data.joint_friendly_replacements.length > 0) {
      md += `### 🔄 적용된 관절 보호 대체 매핑 참고\n`;
      data.joint_friendly_replacements.forEach((rep) => {
        md += `- **표준 운동**: ${rep.standard_exercise} ➔ **안전 대체**: ${rep.safe_replacement} (${rep.biomechanical_reason})\n`;
      });
      md += `\n`;
    }

    md += `---\n\n`;

    // STEP 3. 쿨다운
    md += `## 🧊 STEP 3. 관절 이완 & 정적 스트레칭 쿨다운\n`;
    (care.cooldown_routine || []).forEach((c, idx) => {
      md += `${idx + 1}. ${c}\n`;
    });

    const historyList = data._workout_history || [];
    const latestSession = historyList.length > 0 ? historyList[historyList.length - 1] : null;
    const sessionNum = data._current_session_num || (latestSession ? latestSession.session_num : 1);

    md += `\n---\n_${sessionNum}회차\n---\n`;

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
    // 앱이 설치되지 않은 상태라면 상단 배너를 항상 노출
    pwaInstallBanner.classList.remove("hidden");

    // 안드로이드 / 크롬 / 엣지 등 네이티브 PWA 설치 이벤트 감지
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      pwaInstallBanner.classList.remove("hidden");
    });
  }

  // QR 모달 요소
  const qrModal = document.getElementById("qrModal");
  const qrCodeImg = document.getElementById("qrCodeImg");
  const closeQrModalBtn = document.getElementById("closeQrModalBtn");
  const confirmQrModalBtn = document.getElementById("confirmQrModalBtn");

  function openQrModal() {
    if (!qrModal || !qrCodeImg) return;
    // 현재 접속 중인 풀 URL 생성
    const currentUrl = encodeURIComponent(window.location.origin + window.location.pathname);
    // Google Charts API 기반 선명하고 빠른 QR 코드 이미지 생성 (240x240)
    qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${currentUrl}`;
    qrModal.classList.remove("hidden");
  }

  function closeQrModal() {
    if (qrModal) qrModal.classList.add("hidden");
  }

  if (closeQrModalBtn) closeQrModalBtn.addEventListener("click", closeQrModal);
  if (confirmQrModalBtn) confirmQrModalBtn.addEventListener("click", closeQrModal);
  if (qrModal) {
    qrModal.addEventListener("click", (e) => {
      if (e.target === qrModal) closeQrModal();
    });
  }

  // 모바일 기기(터치/폰/태블릿)인지 여부 확인
  const isMobileDevice = /iphone|ipad|ipod|android|blackberry|mini|windows\sce|palm/i.test(window.navigator.userAgent.toLowerCase()) || (window.innerWidth <= 768);

  // 설치 버튼 클릭
  pwaInstallBtn.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
      // 1. 브라우저 네이티브 PWA 설치 프롬프트가 지원되는 경우 (안드로이드 크롬 등)
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === "accepted") {
        pwaInstallBanner.classList.add("hidden");
      }
      deferredInstallPrompt = null;
    } else if (isIos) {
      // 2. iOS 사파리 환경: 하단 공유 안내 툴팁 표시
      iosInstallTooltip.classList.toggle("hidden");
    } else if (!isMobileDevice) {
      // 3. PC/데스크톱 브라우저인 경우: QR 코드 팝업 모달을 띄워 스마트폰으로 간편 설치 유도
      openQrModal();
    } else {
      // 4. 기타 모바일 브라우저
      showToast("브라우저 메뉴(⋮)에서 '홈 화면에 추가' 또는 '앱 설치'를 클릭해 주세요.", "info", 4000);
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
