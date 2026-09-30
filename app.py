import os
import json
import logging
import csv
import io
import base64
import re
from datetime import datetime, timezone, timedelta
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import requests
from google import genai
from google.genai import types
import openpyxl
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

# 한국 표준시(KST) 타임존 설정
KST = timezone(timedelta(hours=9))

# 1. 환경 변수 로드
load_dotenv()

# 2. 로깅(Logging) 설정
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s in %(module)s: %(message)s"
)
logger = logging.getLogger("WorkoutPlanner")

# 3. Flask 앱 생성
app = Flask(__name__)

# 4. API Key 환경변수 확인
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SERPER_API_KEY = os.getenv("SERPER_API_KEY")
ACCESS_PIN = os.getenv("ACCESS_PIN", "0301")
PORT = int(os.getenv("PORT", 5000))

if not GEMINI_API_KEY:
    logger.warning("경고: GEMINI_API_KEY가 .env 파일에 설정되지 않았습니다.")
if not SERPER_API_KEY:
    logger.warning("경고: SERPER_API_KEY가 .env 파일에 설정되지 않았습니다.")

# Gemini 클라이언트 초기화
gemini_client = None
if GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    except Exception as e:
        logger.error(f"Gemini Client 초기화 실패: {e}")


def check_hard_stop(pain_level: int, has_radiating_pain: bool, has_surgery: bool):
    """
    위험 케이스 차단 (Hard Stop) 검증 로직
    - 통증 강도 4점 이상
    - 방사통 및 저림 증상
    - 최근 수술 이력
    조건 중 하나라도 해당되면 즉각 AI 루틴 생성을 중단하고 전문의 진료 권고 안내를 반환합니다.
    """
    triggers = []
    if pain_level >= 4:
        triggers.append(f"중증 통증 강도({pain_level}/5점)")
    if has_radiating_pain:
        triggers.append("신경 압박 의심 증상(방사통 및 저림)")
    if has_surgery:
        triggers.append("최근 관절/척추 수술 이력")

    if triggers:
        return {
            "is_hard_stop": True,
            "reasons": triggers,
            "message": "입력하신 건강 상태에서 고위험 신호가 감지되었습니다. "
                       "추가 손상 및 영구적 손상을 예방하기 위해 즉각 AI 루틴 생성을 중단합니다. "
                       "반드시 정형외과, 재활의학과 또는 신경외과 전문의의 정밀 진단과 운동 허가를 먼저 받으시기 바랍니다."
        }
    return {"is_hard_stop": False}


def search_safe_exercises(pain_areas: list, exercise_environment: str) -> str:
    """
    Serper.dev API를 활용한 실시간 안전 대체 운동 및 관절 보호 레퍼런스 검색
    """
    if not SERPER_API_KEY or not pain_areas:
        return "참고할 외부 검색 결과 없음."

    pain_str = ", ".join(pain_areas)
    query = f"{pain_str} 통증 관절 보호 안전한 대체 운동 {exercise_environment} 루틴 가이드"
    logger.info(f"[Serper 검색 시작] 쿼리: {query}")

    url = "https://google.serper.dev/search"
    headers = {
        "X-API-KEY": SERPER_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "q": query,
        "gl": "kr",
        "hl": "ko",
        "num": 4
    }

    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=6)
        logger.info(f"[Serper 검색 완료] 상태 코드: {resp.status_code}")
        if resp.status_code == 200:
            data = resp.json()
            snippets = []
            for item in data.get("organic", []):
                title = item.get("title", "")
                snippet = item.get("snippet", "")
                snippets.append(f"- 제목: {title} | 내용: {snippet}")
            return "\n".join(snippets) if snippets else "검색 결과 요약 없음."
        else:
            logger.error(f"[Serper 검색 실패] 응답 내용: {resp.text}")
            return "검색 서비스 응답 지연으로 대체 기본 가이드 적용."
    except Exception as e:
        logger.error(f"[Serper 통신 오류]: {e}")
        return "외부 검색 통신 오류 발생."


def generate_routine_with_gemini(user_profile: dict, search_context: str) -> dict:
    """
    Gemini Flash Lite 모델을 호출하여 관절 부담을 줄인 구조화된 JSON 루틴 생성
    (이전 운동 일지 및 직전 성취도 피드백을 반영한 적응형 루틴 자동 조정 포함)
    """
    if not gemini_client:
        raise ValueError("Gemini API Client가 올바르게 설정되지 않았습니다.")

    history = user_profile.get("history") or []
    achievement_level = user_profile.get("achievement_level")

    achievement_text_map = {
        1: "1단계 (80% 미만 성취 - 피로 누적)",
        2: "2단계 (90% 성취 - 아쉬운 완수)",
        3: "3단계 (100% 성취 - 계획대로 정규 세트/횟수 완벽 완수)",
        4: "4단계 (110% 성취 - 여유 있는 초과 완수)",
        5: "5단계 (120% 이상 성취 - 충분한 초과)"
    }

    history_feedback_section = ""
    if history and achievement_level:
        split_routine = user_profile.get("split_routine", "3분할")
        cycle_size_map = {
            "무분할": 1,
            "2분할": 2,
            "3분할": 3,
            "4분할": 4
        }
        cycle_size = cycle_size_map.get(split_routine, 3)
        target_count = max(2, cycle_size * 2)  # 최근 2사이클 분량 (무분할: 2~3회, 2분할: 4회, 3분할: 6회, 4분할: 8회)
        recent_sessions = history[-target_count:]

        recent_summary_list = []
        for sess in recent_sessions:
            s_num = sess.get("session_num", "?")
            s_date = sess.get("date", "")
            s_lvl = sess.get("achievement_level", 3)
            s_desc = achievement_text_map.get(int(s_lvl), f"{s_lvl}단계")
            ex_details = [
                f"{ex.get('body_part', '전신')}: {ex.get('name', '')} ({ex.get('sets', '')} {ex.get('reps', '')}, {ex.get('rir_guide', '')})"
                for ex in sess.get("exercises", [])
            ]
            ex_summary_str = "; ".join(ex_details) if ex_details else "운동 기록 없음"
            recent_summary_list.append(f"  * {s_num}회차({s_date}) [{s_desc}] -> {ex_summary_str}")

        recent_history_text = "\n".join(recent_summary_list)

        history_feedback_section = f"""
[사용자의 이전 누적 운동 이력 및 최근 2사이클({len(recent_sessions)}회차) 성취도 분석]
- 누적 총 운동 횟수: 총 {len(history)}회차 보유
- 직전 세션 평가 성취도: {achievement_text_map.get(int(achievement_level), f'{achievement_level}단계')}
- 분석 대상 최근 2사이클 수행 이력:
{recent_history_text}

[성취도 및 2사이클 기반 적응형(Adaptive) 자동 수정 지침]
- 사용자가 선택한 {split_routine} 설정에 맞추어, 최근 2사이클 동안 각 부위별 수행 이력 및 성취도 추세를 종합 평가하세요.
- 1단계 (80% 미만): 사용자가 이전 루틴 수행 시 피로가 누적되었거나 목표량에 미달했습니다. 1세트를 줄이거나 여유 횟수를 1~2회 늘리고, 관절에 부담이 없는 가벼운 대체 동작으로 안전 마진을 확보하세요.
- 2단계 (90%): 마지막 세트에서 1~2회 모자라 아쉽게 미달한 상태입니다. 현재 중량/세트 구성을 동결 유지하고, 세트 간 휴식 시간을 15~30초 연장하여 회복을 돕도록 처방하세요.
- 3단계 (100%): 계획을 완벽하게 소화했으므로 이상적인 상태입니다. 계획된 정규 프로그램 및 균형 잡힌 표준 점진적 과부하를 적용하세요.
- 4단계 (110%): 목표 횟수를 다 채우고도 힘이 남아 여유가 있었습니다. 종목당 1~2회(Reps) 반복 횟수를 소폭 상향 조정하세요.
- 5단계 (120% 이상): 현재 부하가 너무 가볍게 느껴진 상태입니다. 안전한 범위 내에서 2.5kg~5kg 중량 증량 또는 1세트 추가를 권장하세요.
- 최근 2사이클 동안 연속으로 4~5단계를 기록한 부위는 안정적인 증량이 확인되었으므로 적극적 과부하를 처방하고, 미달(1~2단계)이 반복된 부위는 피로 누적/과부하로 판단하여 부하를 경감하거나 관절 보호 대체 동작으로 전환하세요.
"""

    # 유산소 운동 지침 생성
    cardio_option = user_profile.get("cardio_option", "none")
    cardio_desc_map = {
        "none": "유산소 미포함 (근력 운동만 집중)",
        "post_workout": "본운동 후 유산소 (10~15분 쿨다운 & 체지방 연소)",
        "warmup": "본운동 전 웜업 유산소 (5~10분 체온 상승 & 관절 가온)",
        "standalone": "별도 유산소 세션 (20~30분 심폐 지구력 강화)"
    }
    if cardio_option and cardio_option != "none":
        cardio_instruction = f"""
[유산소 운동 배치 및 장비/관절 맞춤 지침]
- 희망 유산소 유형: {cardio_desc_map.get(cardio_option, cardio_option)}
- 장비 환경: {user_profile.get('environment')}
- 유산소 지침:
  1) 각 일차별 운동 리스트(exercises)에 유산소 종목을 1개 포함하고 body_part를 '유산소'로 표기하세요.
  2) [환경별 종목 분기]:
     - '헬스장' 환경: 인클라인 트레드밀 경사 걷기, 좌식/입식 실내 사이클, 일립티컬, 천국의 계단, 로잉머신 등 헬스장 전문 유산소 머신을 처방하세요.
     - '맨몸' 또는 '홈짐 덤벨' 환경: 대형 기구가 없으므로 야외 러닝/조깅, 야외 파워워킹(빠른 걸음), 또는 층간소음 없는 실내 맨몸 저충격 유산소(슬로우 버피 등)를 처방하세요.
  3) [관절 통증 보호 분기]:
     - 무릎/허리/발목 통증이 있는 경우 착지 충격(Impact force)이 큰 러닝/점프를 엄격히 배제하고, 좌식 사이클, 일립티컬, 인클라인 트레드밀 완만한 경사 걷기, 야외 파워워킹 등 '관절 저충격(Low-Impact)' 유산소로 안전하게 배정하세요.
"""
    else:
        cardio_instruction = "\n[유산소 지침]: 사용자가 유산소 미포함을 선택했으므로 순수 근력/웨이트 트레이닝 종목으로만 구성하세요."

    prompt = f"""
당신은 부상 예방 및 재활 운동역학 전문 시니어 스트렝스 코치입니다.
사용자의 신체 상태, 통증 부위, 운동 환경에 맞추어 관절 부담을 최소화한 맞춤형 운동 루틴을 작성하세요.

[사용자 프로필 정보]
- 운동 목적: {user_profile.get('goal')}
- 숙련도: {user_profile.get('experience')}
- 운동 분할 방식: {user_profile.get('split_routine', '2분할')}
- 1회 운동 시간: {user_profile.get('session_duration')}분
- 장비 환경: {user_profile.get('environment')}
- 유산소 옵션: {cardio_desc_map.get(cardio_option, '미포함')}
- 통증 및 불편 부위: {', '.join(user_profile.get('pain_areas', [])) if user_profile.get('pain_areas') else '없음'}
- 통증 강도: {user_profile.get('pain_level')}/5점
- 기타 주의사항: {user_profile.get('notes', '없음')}
{history_feedback_section}
{cardio_instruction}
[실시간 웹 검색 레퍼런스 (Serper.dev 수집 데이터)]
{search_context}

[작성 및 설계 지침]
1. 통증 부위에 전단력(Shear force)이나 압박 부하가 큰 고위험 종목은 완전히 배제하세요.
2. 각 종목마다 여유 횟수(자세가 무너지지 않고 더 들 수 있는 여유 반복 수, 예: 여유 2~3회) 가이드를 명시하여 무리한 한계 도달(실패 지점)을 엄격히 방지하세요.
3. 각 운동 종목에는 주요 대상 '부위(body_part)'를 가슴, 등, 어깨, 하체, 팔, 복근/코어, 유산소, 전신 중 하나로 명확히 표기하세요.
4. 1:1 관절 보호 대체 매핑 섹션에서는 흔히 다치는 '표준 운동'을 어떤 '대체 운동'으로 바꿨는지와 그 이유(관절 보호 원리)를 설명하세요.
5. 부상 방지 케어 가이드에는 타깃 웜업, 실패 지점 도달 전 자세 붕괴 감지 팁, 쿨다운을 반드시 포함하세요.
6. 사용자가 선택한 운동 분할 방식('{user_profile.get('split_routine', '2분할')}')에 맞추어 weekly_split의 각 일차(day_name 및 target_focus)를 정확히 구성하세요. (예: 무분할=전신 루틴, 2분할=1일차 상체/2일차 하체, 3분할=1일차 밀기(Push)/2일차 당기기(Pull)/3일차 하체(Legs), 4분할=가슴/등/어깨/하체)

[반드시 준수할 출력 형식]
아래 JSON 스키마를 만족하는 순수 JSON 형식으로만 응답하세요. 백틱(```json) 마크다운 문법을 제외하고 오직 유효한 JSON 문자열만 출력해야 합니다.

{{
  "routine_title": "루틴 제목 요약",
  "summary_message": "사용자 맞춤 루틴의 설계 방향성 및 핵심 요약 2~3문장",
  "weekly_split": [
    {{
      "day_name": "1일차 (예: 상체 안전 분할 또는 월요일)",
      "target_focus": "주요 타깃 근육 및 관절 보호 콘셉트",
      "exercises": [
        {{
          "body_part": "부위 (가슴 / 등 / 어깨 / 하체 / 팔 / 복근 / 유산소 중 택1)",
          "name": "운동 종목명",
          "sets": "3세트 또는 15분",
          "reps": "12-15회 또는 심박수 Zone 2 유지",
          "rir_guide": "여유 2~3회 또는 대화 가능한 수준",
          "form_tips": "관절 부담을 줄이는 안전 자세 핵심 포인트"
        }}
      ]
    }}
  ],
  "joint_friendly_replacements": [
    {{
      "standard_exercise": "통증을 유발하기 쉬운 기존 표준 운동명 (예: 바벨 벤치프레스)",
      "safe_replacement": "안전 대체 종목명 (예: 뉴트럴그립 덤벨 프레스 / 플로어 프레스)",
      "biomechanical_reason": "관절 전단력 및 회전근개 충돌 완화 원리 설명"
    }}
  ],
  "injury_prevention_care": {{
    "target_warmup": [
      "관절 가동성 및 활성화 웜업 동작 1",
      "관절 가동성 및 활성화 웜업 동작 2"
    ],
    "posture_collapse_warning": "반복 중 자세가 무너지거나 타깃 근육 대신 관절로 무게가 쏠릴 때 나타나는 징후",
    "cooldown_routine": [
      "긴장된 길항근 및 관절 주변부 스트레칭 동작 1",
      "호흡 및 긴장 완화 쿨다운 2"
    ]
  }}
}}
"""

    logger.info("[Gemini AI 루틴 생성 요청 시작]")
    
    # 모델 우선순위: gemini-3.5-flash-lite -> gemini-2.5-flash -> gemini-1.5-flash
    candidate_models = ["gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-1.5-flash"]
    last_err = None

    for model_name in candidate_models:
        try:
            logger.info(f"Gemini 모델 시도: {model_name}")
            response = gemini_client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.3
                )
            )
            raw_text = response.text.strip()
            # JSON 파싱
            if raw_text.startswith("```json"):
                raw_text = raw_text[7:]
            if raw_text.startswith("```"):
                raw_text = raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3]
            raw_text = raw_text.strip()
            parsed_json = json.loads(raw_text)
            logger.info(f"[Gemini AI 루틴 생성 성공] 모델: {model_name}")
            return parsed_json
        except Exception as e:
            logger.warning(f"모델 {model_name} 실패: {e}")
            last_err = e
            continue

    raise RuntimeError(f"모든 Gemini 모델 호출 실패: {last_err}")


def create_workout_excel_bytes(history: list) -> bytes:
    """
    사용자의 누적 운동 일지를 전문 엑셀(.xlsx) 파일 바이너리로 생성
    1) 관절 안전 자세 팁 열 제거
    2) 동일 회차의 연속 운동들에 대해 회차(A), 날짜(B), 성취도(C) 세로 병합
    3) 날짜 열 너비를 16으로 확보하여 ######## 현상 원천 방지
    4) 운동 종목명 열 너비를 35(3칸 크기)로 확보하여 긴 명칭 잘림 방지
    5) 횟수 앞의 '양쪽 번갈아', '각각', '좌우 각각' 등 불필요한 수식어 자동 제거
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "운동 일지"

    # 엑셀 격자선(Gridlines) 표시 설정
    ws.views.sheetView[0].showGridLines = True

    # 스타일 정의
    header_fill = PatternFill(start_color="EBF3FB", end_color="EBF3FB", fill_type="solid")
    header_font = Font(name="Malgun Gothic", size=11, bold=True, color="1E3A8A")
    data_font = Font(name="Malgun Gothic", size=10, color="1F2937")

    center_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    left_align = Alignment(horizontal="left", vertical="center", wrap_text=True)

    thin_border = Border(
        left=Side(style="thin", color="D1D5DB"),
        right=Side(style="thin", color="D1D5DB"),
        top=Side(style="thin", color="D1D5DB"),
        bottom=Side(style="thin", color="D1D5DB")
    )

    # 1. 헤더 (관절 안전 자세 팁 및 분할/요일 제외 8개 열)
    headers = ["회차", "날짜", "성취도", "부위", "운동 종목명", "세트", "횟수", "여유 횟수"]
    ws.append(headers)
    ws.row_dimensions[1].height = 28

    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = center_align
        cell.border = thin_border

    # 2. 데이터 행 작성
    current_row = 2

    for sess in history:
        s_num = f"{sess.get('session_num', 1)}회차"
        s_date = sess.get("date", "")
        s_lvl = f"{sess.get('achievement_level', 3)}단계"
        exercises = sess.get("exercises", [])

        if not exercises:
            exercises = [{"day": "-", "body_part": "-", "name": "기록 없음", "sets": "-", "reps": "-", "rir_guide": "-"}]

        session_start_row = current_row

        for ex in exercises:
            raw_reps = str(ex.get("reps", ""))
            # 횟수 앞의 '양쪽 번갈아', '각각', '좌우 각각', '한쪽당' 등 수식어 제거
            clean_reps = re.sub(r'^(양쪽\s*번갈아\s*|좌우\s*각각\s*|각각\s*|양쪽\s*|한쪽당\s*)', '', raw_reps).strip()

            raw_rir = str(ex.get("rir_guide", ""))
            clean_rir = re.sub(r'RIR\s*', '여유 ', raw_rir, flags=re.IGNORECASE)
            # 괄호 및 괄호 안 설명 제거 (예: '여유 2회 (더 할 수 있을 거 같을 때 중단)' -> '여유 2회')
            clean_rir = re.sub(r'\(.*?\)', '', clean_rir).strip()

            row_data = [
                s_num,
                s_date,
                s_lvl,
                ex.get("body_part", "전신"),
                ex.get("name", ""),
                ex.get("sets", ""),
                clean_reps,
                clean_rir
            ]
            ws.append(row_data)
            ws.row_dimensions[current_row].height = 24

            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=current_row, column=col_idx)
                cell.font = data_font
                cell.border = thin_border
                if col_idx == 5:  # 운동 종목명은 좌측 정렬 (E열)
                    cell.alignment = left_align
                else:
                    cell.alignment = center_align

            current_row += 1

        session_end_row = current_row - 1

        # 같은 회차에 운동이 2개 이상이면 회차(col 1), 날짜(col 2), 성취도(col 3) 세로 병합
        if session_end_row > session_start_row:
            ws.merge_cells(start_row=session_start_row, start_column=1, end_row=session_end_row, end_column=1)
            ws.merge_cells(start_row=session_start_row, start_column=2, end_row=session_end_row, end_column=2)
            ws.merge_cells(start_row=session_start_row, start_column=3, end_row=session_end_row, end_column=3)

    # 3. 열 너비 지정 (날짜 16으로 ######## 방지, 종목명 35로 3칸 분량 확보)
    col_widths = {
        "A": 11,  # 회차
        "B": 16,  # 날짜 (YYYY-MM-DD 안 잘림)
        "C": 14,  # 성취도
        "D": 12,  # 부위
        "E": 35,  # 운동 종목명 (일반 셀 3칸 너비)
        "F": 12,  # 세트
        "G": 16,  # 횟수
        "H": 15   # 여유 횟수
    }
    for col_letter, width in col_widths.items():
        ws.column_dimensions[col_letter].width = width

    excel_io = io.BytesIO()
    wb.save(excel_io)
    excel_io.seek(0)
    return excel_io.getvalue()


def update_workout_history(previous_history: list, current_routine: dict, achievement_level: int = None):
    """
    영구 무제한 누적 운동 일지 생성 및 엑셀(.xlsx) / CSV 생성
    - 1회차부터 영구 보존 누적
    """
    achievement_map = {
        1: "1단계 (80% 미만 성취 - 피로 누적)",
        2: "2단계 (90% 성취 - 아쉬운 완수)",
        3: "3단계 (100% 정상 완수 - 계획 달성)",
        4: "4단계 (110% 초과 성취 - 여유 완료)",
        5: "5단계 (120% 이상 성취 - 충분한 초과)"
    }

    history = list(previous_history) if previous_history else []
    now_kst = datetime.now(KST)
    date_str = now_kst.strftime("%Y-%m-%d")
    file_date_str = now_kst.strftime("%Y_%m_%d")

    level = int(achievement_level) if achievement_level else 3
    desc = achievement_map.get(level, f"{level}단계")

    new_session_num = (history[-1].get("session_num", len(history)) + 1) if history else 1

    new_session = {
        "session_num": new_session_num,
        "date": date_str,
        "achievement_level": level,
        "achievement_desc": desc,
        "routine_title": current_routine.get("routine_title", "관절 안전 맞춤 운동 루틴"),
        "exercises": []
    }

    for day in current_routine.get("weekly_split", []):
        day_name = day.get("day_name", "")
        for ex in day.get("exercises", []):
            new_session["exercises"].append({
                "day": day_name,
                "body_part": ex.get("body_part", "전신"),
                "name": ex.get("name", ""),
                "sets": ex.get("sets", ""),
                "reps": ex.get("reps", ""),
                "rir_guide": ex.get("rir_guide", ""),
                "form_tips": ex.get("form_tips", "")
            })

    # 영구 누적 (제한 없이 계속 누적)
    history.append(new_session)

    # 1. 엑셀 .xlsx 바이너리 생성 및 Base64 인코딩
    excel_bytes = create_workout_excel_bytes(history)
    excel_base64 = base64.b64encode(excel_bytes).decode("utf-8")

    # 2. 엑셀 열람용 CSV 생성 (한글 깨짐 방지 UTF-8 BOM 포함, 자세 팁 열 제외)
    csv_io = io.StringIO()
    csv_io.write('\ufeff')
    writer = csv.writer(csv_io)
    writer.writerow(["회차", "날짜", "성취도 단계", "성취도 설명", "부위", "운동 종목명", "세트", "횟수", "여유 횟수"])

    for sess in history:
        s_num = f"{sess.get('session_num', 1)}회차"
        s_date = sess.get("date", "")
        s_lvl = f"{sess.get('achievement_level', 3)}단계"
        s_desc = sess.get("achievement_desc", "")
        exercises = sess.get("exercises", [])
        for ex_idx, ex in enumerate(exercises):
            # 연속 행 회차/날짜 깔끔 표기 (첫 번째 행만 표기, 이후 빈칸)
            row_s_num = s_num if ex_idx == 0 else ""
            row_s_date = s_date if ex_idx == 0 else ""
            row_s_lvl = s_lvl if ex_idx == 0 else ""
            row_s_desc = s_desc if ex_idx == 0 else ""
            clean_reps = re.sub(r'^(양쪽\s*번갈아\s*|좌우\s*각각\s*|각각\s*|양쪽\s*|한쪽당\s*)', '', str(ex.get("reps", ""))).strip()
            clean_rir = re.sub(r'RIR\s*', '여유 ', str(ex.get("rir_guide", "")), flags=re.IGNORECASE)
            clean_rir = re.sub(r'\(.*?\)', '', clean_rir).strip()

            writer.writerow([
                row_s_num,
                row_s_date,
                row_s_lvl,
                row_s_desc,
                ex.get("body_part", ""),
                ex.get("name", ""),
                ex.get("sets", ""),
                clean_reps,
                clean_rir
            ])

    file_name_base = f"{file_date_str}_{new_session_num}회차_운동_일지"
    return history, excel_base64, csv_io.getvalue(), file_name_base, new_session_num


@app.route("/")
def index():
    """메인 페이지 화면 렌더링"""
    return render_template("index.html")


@app.route("/manifest.json")
def manifest():
    """PWA 매니페스트 제공 (CORS 헤더 포함)"""
    response = app.send_static_file("manifest.json")
    response.headers["Content-Type"] = "application/manifest+json"
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


@app.route("/favicon.ico")
def favicon():
    """파비콘 제공"""
    return app.send_static_file("icons/icon-192.png")


@app.route("/generate", methods=["POST"])
def generate_routine():
    """
    운동 루틴 생성 API 엔드포인트
    1. 클라이언트 입력 데이터 수신 및 파싱 (이전 일지 및 성취도 포함)
    2. 위험 케이스 차단 (Hard Stop) 확인
    3. Serper.dev 실시간 웹 검색
    4. Gemini Flash Lite 구조화 루틴 생성 (성취도 피드백 반영)
    5. FIFO 10회 누적 일지 및 엑셀 CSV 생성
    6. JSON 결과 반환
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "입력 데이터가 없습니다."}), 400

        goal = data.get("goal", "체력 증진")
        experience = data.get("experience", "입문")
        split_routine = data.get("split_routine", data.get("days_per_week", "2분할"))
        session_duration = data.get("session_duration", 50)
        environment = data.get("environment", "맨몸")
        pain_areas = data.get("pain_areas", [])
        pain_level = int(data.get("pain_level", 1))
        has_radiating_pain = bool(data.get("has_radiating_pain", False))
        has_surgery = bool(data.get("has_surgery", False))
        notes = data.get("notes", "")
        history = data.get("history", [])
        achievement_level = data.get("achievement_level")
        cardio_option = data.get("cardio_option", "none")

        logger.info(f"[요청 수신] 목적: {goal}, 분할: {split_routine}, 환경: {environment}, 유산소: {cardio_option}, 통증: {pain_level}")

        # 0. 이용 비밀번호(PIN) 검증
        access_pin = str(data.get("access_pin", "")).strip()
        if access_pin != ACCESS_PIN:
            logger.warning(f"[접근 차단] 비밀번호 불일치: {access_pin}")
            return jsonify({
                "status": "error",
                "message": "비밀번호가 일치하지 않습니다. 올바른 4자리 PIN을 입력해 주세요."
            }), 403

        # 1. Hard Stop 로직 검증
        hard_stop_result = check_hard_stop(pain_level, has_radiating_pain, has_surgery)
        if hard_stop_result["is_hard_stop"]:
            logger.warning(f"[Hard Stop 차단 발생] 사유: {hard_stop_result['reasons']}")
            return jsonify({
                "status": "hard_stop",
                "data": hard_stop_result
            }), 200

        # 2. Serper.dev 검색 수행
        search_context = search_safe_exercises(pain_areas, environment)

        # 3. Gemini Flash Lite 루틴 생성 (이전 일지 및 성취도 전달)
        user_profile = {
            "goal": goal,
            "experience": experience,
            "split_routine": split_routine,
            "session_duration": session_duration,
            "environment": environment,
            "cardio_option": cardio_option,
            "pain_areas": pain_areas,
            "pain_level": pain_level,
            "notes": notes,
            "history": history,
            "achievement_level": achievement_level
        }
        routine_json = generate_routine_with_gemini(user_profile, search_context)

        # 4. 영구 누적 일지 업데이트 및 엑셀(.xlsx) / CSV 생성
        updated_history, excel_base64, csv_content, file_name_base, current_session_num = update_workout_history(
            history, routine_json, achievement_level
        )

        routine_json["_workout_history"] = updated_history
        routine_json["_workout_xlsx_base64"] = excel_base64
        routine_json["_workout_csv"] = csv_content
        routine_json["_file_name_base"] = file_name_base
        routine_json["_current_session_num"] = current_session_num

        return jsonify({
            "status": "success",
            "data": routine_json
        }), 200

    except Exception as e:
        logger.error(f"[서버 오류 발생] 상세 내역: {e}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": f"서버 내부 오류가 발생했습니다: {str(e)}"
        }), 500


if __name__ == "__main__":
    logger.info(f"AI 맞춤형 운동 플래너 서버 시작 (포트: {PORT})")
    app.run(host="0.0.0.0", port=PORT, debug=True)
