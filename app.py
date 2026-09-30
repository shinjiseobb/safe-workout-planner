import os
import json
import logging
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
import requests
from google import genai
from google.genai import types

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
    """
    if not gemini_client:
        raise ValueError("Gemini API Client가 올바르게 설정되지 않았습니다.")

    prompt = f"""
당신은 부상 예방 및 재활 운동역학 전문 시니어 스트렝스 코치입니다.
사용자의 신체 상태, 통증 부위, 운동 환경에 맞추어 관절 부담을 최소화한 맞춤형 운동 루틴을 작성하세요.

[사용자 프로필 정보]
- 운동 목적: {user_profile.get('goal')}
- 숙련도: {user_profile.get('experience')}
- 주당 운동 일수: {user_profile.get('days_per_week')}일
- 1회 운동 시간: {user_profile.get('session_duration')}분
- 장비 환경: {user_profile.get('environment')}
- 통증 및 불편 부위: {', '.join(user_profile.get('pain_areas', [])) if user_profile.get('pain_areas') else '없음'}
- 통증 강도: {user_profile.get('pain_level')}/5점
- 기타 주의사항: {user_profile.get('notes', '없음')}

[실시간 웹 검색 레퍼런스 (Serper.dev 수집 데이터)]
{search_context}

[작성 및 설계 지침]
1. 통증 부위에 전단력(Shear force)이나 압박 부하가 큰 고위험 종목은 완전히 배제하세요.
2. 각 종목마다 RIR(Reps in Reserve, 남은 여유 횟수) 가이드를 명시하여 무리한 한계 도달(실패 지점)을 엄격히 방지하세요.
3. 1:1 관절 보호 대체 매핑 섹션에서는 흔히 다치는 '표준 운동'을 어떤 '대체 운동'으로 바꿨는지와 그 이유(관절 보호 원리)를 설명하세요.
4. 부상 방지 케어 가이드에는 타깃 웜업, 실패 지점 도달 전 자세 붕괴 감지 팁, 쿨다운을 반드시 포함하세요.

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
          "name": "운동 종목명",
          "sets": "3세트",
          "reps": "12-15회",
          "rir_guide": "RIR 2-3 (2~3회 더 들 수 있는 여유)",
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


@app.route("/")
def index():
    """메인 페이지 화면 렌더링"""
    return render_template("index.html")


@app.route("/generate", methods=["POST"])
def generate_routine():
    """
    운동 루틴 생성 API 엔드포인트
    1. 클라이언트 입력 데이터 수신 및 파싱
    2. 위험 케이스 차단 (Hard Stop) 확인
    3. Serper.dev 실시간 웹 검색
    4. Gemini Flash Lite 구조화 루틴 생성
    5. JSON 결과 반환
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "입력 데이터가 없습니다."}), 400

        goal = data.get("goal", "체력 증진")
        experience = data.get("experience", "입문")
        days_per_week = data.get("days_per_week", 3)
        session_duration = data.get("session_duration", 50)
        environment = data.get("environment", "맨몸")
        pain_areas = data.get("pain_areas", [])
        pain_level = int(data.get("pain_level", 1))
        has_radiating_pain = bool(data.get("has_radiating_pain", False))
        has_surgery = bool(data.get("has_surgery", False))
        notes = data.get("notes", "")

        logger.info(f"[요청 수신] 목적: {goal}, 환경: {environment}, 통증강도: {pain_level}, 부위: {pain_areas}")

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

        # 3. Gemini Flash Lite 루틴 생성
        user_profile = {
            "goal": goal,
            "experience": experience,
            "days_per_week": days_per_week,
            "session_duration": session_duration,
            "environment": environment,
            "pain_areas": pain_areas,
            "pain_level": pain_level,
            "notes": notes
        }
        routine_json = generate_routine_with_gemini(user_profile, search_context)

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
