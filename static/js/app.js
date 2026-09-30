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
  const riskAlertText = document.getElementById("riskAlertText");

  // 신체 스펙 및 최초 사용자 영역 요소
  const firstTimeUserSection = document.getElementById("firstTimeUserSection");
  const userHeightInput = document.getElementById("user_height");
  const userWeightInput = document.getElementById("user_weight");
  const userStrengthInput = document.getElementById("user_strength");

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

  // 1. 통증 슬라이더 및 고위험 신호 실시간 감시 로직
  const painDescriptions = {
    1: "1단계 (경미한 뻐근함)",
    2: "2단계 (가벼운 통증)",
    3: "3단계 (보통 통증, 세심한 주의 필요)",
    4: "4단계 (심한 통증 - 고위험 신호)",
    5: "5단계 (극심한 통증 - 즉각 진료 권고)"
  };

  function updateRiskState() {
    const painVal = parseInt(painSlider.value, 10);
    const hasRadiation = hasRadiatingPain ? hasRadiatingPain.checked : false;
    const hasSurg = hasSurgery ? hasSurgery.checked : false;

    const isHighRisk = painVal >= 4 || hasRadiation || hasSurg;

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

  if (hasRadiatingPain) {
    hasRadiatingPain.addEventListener("change", updateRiskState);
  }
  if (hasSurgery) {
    hasSurgery.addEventListener("change", updateRiskState);
  }

  // 초기 상태 반영 (새로고침 시 브라우저 폼 복원 대응)
  updateRiskState();

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
            alert("일지 파일 내에 유효한 운동 기록이 없습니다.");
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

          if (achievementSection) {
            achievementSection.classList.remove("hidden");
          }

          // 이전 일지가 로드되었으므로 최초 사용자 신체 정보 입력칸 자동 숨김
          if (firstTimeUserSection) {
            firstTimeUserSection.classList.add("hidden");
          }

          // 지난 회차 신체 상태 및 운동 환경 설정 복원 여부 확인창
          const lastProfile = parsed.last_user_profile;
          if (lastProfile) {
            setTimeout(() => {
              const confirmRestore = confirm(
                "지난 회차의 신체 상태 및 운동 환경 설정을 불러오시겠습니까?\n\n[확인]: 직전 설정(목적, 분할, 환경, 통증 부위 등) 자동 적용\n[취소]: 현재 화면의 입력 설정 유지"
              );
              if (confirmRestore) {
                restoreUserProfileForm(lastProfile);
                logFileStatus.innerHTML = `
                  <span class="badge-log-state loaded">
                    ✅ 이전 ${loadedHistory.length}회차 기록 및 지난 설정 복원 완료 (마지막 운동일: ${escapeHtml(lastDate)})
                  </span>
                `;
              }
            }, 60);
          }
        } catch (err) {
          console.error("JSON 파싱 에러:", err);
          alert("올바른 운동 일지(.json) 파일이 아닙니다.");
        }
      };
      reader.readAsText(file, "UTF-8");
    });
  }

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
    const weeklySplit = data.weekly_split || [];

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

    // STEP 2. 본운동 (근력 / 머신 / 유산소)
    const step2Block = document.createElement("div");
    step2Block.className = "flow-step-block";

    let splitDaysHtml = `<div class="split-container">`;
    weeklySplit.forEach((day) => {
      let dayExercisesHtml = `<div class="exercise-list">`;
      (day.exercises || []).forEach((ex) => {
        const isSafeReplacement = Boolean(ex.is_replacement);
        dayExercisesHtml += `
          <div class="exercise-item-card">
            <div class="ex-card-top">
              <div class="ex-title-wrap">
                ${ex.body_part ? `<span class="body-part-badge">${escapeHtml(ex.body_part)}</span>` : ""}
                <span class="ex-title">${escapeHtml(ex.name)}</span>
                ${isSafeReplacement ? `<span class="safe-replacement-tag">🛡️ 관절 보호 대체</span>` : ""}
              </div>
              <span class="rir-badge">${escapeHtml(ex.rir_guide || "").replace(/RIR\s*/gi, "여유 ")}</span>
            </div>
            <div class="ex-specs-row">
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
          <span class="step-title">💪 본운동 (통증 관절 보호 안전 루틴)</span>
        </div>
        <span class="step-desc">관절 통증 부위는 안전 대체 운동으로 자동 구성됨</span>
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

  // 8. 폼 제출 이벤트 핸들러: 먼저 PIN 모달을 띄움
  plannerForm.addEventListener("submit", (e) => {
    e.preventDefault();

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
      alert("안전한 운동 진행을 위해 면책 조항 및 즉시 중단 기준에 동의해 주세요.");
      return;
    }

    // 선택된 통증 부위 수집
    const painCheckboxes = document.querySelectorAll("input[name='pain_area']:checked");
    const painAreas = Array.from(painCheckboxes).map((cb) => cb.value);

    pendingPayload = {
      goal: document.getElementById("goal").value,
      experience: document.getElementById("experience").value,
      split_routine: document.getElementById("split_routine") ? document.getElementById("split_routine").value : "2분할",
      session_duration: parseInt(document.getElementById("session_duration").value, 10),
      environment: document.getElementById("environment").value,
      cardio_option: document.getElementById("cardio_option") ? document.getElementById("cardio_option").value : "none",
      pain_areas: painAreas,
      pain_level: parseInt(painSlider.value, 10),
      has_radiating_pain: document.getElementById("has_radiating_pain").checked,
      has_surgery: document.getElementById("has_surgery").checked,
      notes: document.getElementById("notes").value.trim(),
      history: loadedHistory,
      achievement_level: loadedHistory.length > 0 && achievementSlider ? parseInt(achievementSlider.value, 10) : null,
      user_height: userHeightInput && userHeightInput.value ? parseFloat(userHeightInput.value) : null,
      user_weight: userWeightInput && userWeightInput.value ? parseFloat(userWeightInput.value) : null,
      user_strength: userStrengthInput ? userStrengthInput.value.trim() : ""
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
        pain_level: painSlider ? parseInt(painSlider.value, 10) : 1,
        has_radiating_pain: hasRadiatingPain ? hasRadiatingPain.checked : false,
        has_surgery: hasSurgery ? hasSurgery.checked : false,
        notes: document.getElementById("notes") ? document.getElementById("notes").value.trim() : "",
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
      } else {
        // 폴백: CSV 다운로드
        const csvContent = currentRoutineData._workout_csv || "\ufeff회차,날짜,성취도,분할,부위,운동 종목명,세트,횟수,여유 횟수\n";
        const fileName = `${baseName}.csv`;
        downloadFile(csvContent, fileName, "text/csv;charset=utf-8");
      }
    });
  }

  // 10. 텍스트 복사 기능
  copyBtn.addEventListener("click", () => {
    if (!currentRoutineData) return;
    const textContent = formatRoutineToMarkdown(currentRoutineData);
    navigator.clipboard.writeText(textContent)
      .then(() => alert("운동 루틴 내용이 클립보드에 복사되었습니다!"))
      .catch(() => alert("클립보드 복사에 실패했습니다."));
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

    // STEP 2. 본운동
    md += `## 💪 STEP 2. 본운동 (통증 관절 보호 안전 루틴)\n\n`;
    (data.weekly_split || []).forEach((day) => {
      md += `### ${day.day_name} (타깃: ${day.target_focus})\n`;
      md += `| 부위 | 종목명 | 세트 | 반복 | 여유 횟수 | 관절 보호 팁 |\n`;
      md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      (day.exercises || []).forEach((ex) => {
        const rirText = String(ex.rir_guide || "").replace(/RIR\s*/gi, "여유 ");
        const safeTag = ex.is_replacement ? " [🛡️관절보호 대체]" : "";
        md += `| ${ex.body_part || "전신"} | ${ex.name}${safeTag} | ${ex.sets} | ${ex.reps} | ${rirText} | ${ex.form_tips} |\n`;
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
