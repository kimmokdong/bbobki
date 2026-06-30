import os
import sys

def insert_after_heading(filepath, content_to_insert):
    if not os.path.exists(filepath):
        print(f"File not found: {filepath}")
        return
        
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
        
    insert_idx = 0
    # Try to find the line with "---" or first heading
    for i, line in enumerate(lines):
        if line.startswith("---") or line.strip() == "---":
            insert_idx = i + 1
            break
            
    # If no separator found, just put it at line 1 (after title)
    if insert_idx == 0:
        insert_idx = 2 if len(lines) > 2 else 0
        
    lines.insert(insert_idx, "\n" + content_to_insert + "\n")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print(f"Updated {filepath}")

# 1. 로컬 프롬프트 히스토리
local_history = r"c:\Users\user\Desktop\02. 개발 및 프로젝트\bbobki\prompt_history.md"
local_content = """## [2026-06-30] Canvas 2D 배경색 누락 (clearRect) 이슈 및 스피너 물리 방향 제어 노하우
- **에러/이슈**: CSS에서 배경색을 바꿨으나 Canvas에 적용되지 않고 투명하게 렌더링 됨.
- **해결책**: 매 프레임 `ctx.clearRect()`로 지우는 대신 `ctx.fillStyle`과 `ctx.fillRect()`를 사용하여 확실히 배경을 덧칠하도록 수정.
- **레벨 디자인 트릭 (골든 프롬프트)**: 가장자리로 구슬이 빠지는 현상을 막기 위해, 사이드 스피너의 회전축을 벽 바깥으로 빼고 좌/우측 위치에 따라 회전 방향(시계/반시계)을 강제하여 무조건 중앙으로 퍼올리게 조치함.
"""
insert_after_heading(local_history, local_content)

# 2. 옵시디언 골든 프롬프트 모음
golden = r"G:\내 드라이브\00.김현승\0000.옵시디언\김목동 두뇌\05. 바이브코딩\노하우 라이브러\🏆 골든 프롬프트 모음.md"
# 경로에 오타 수정 '노하우 라이브러리'
golden = r"G:\내 드라이브\00.김현승\0000.옵시디언\김목동 두뇌\05. 바이브코딩\노하우 라이브러리\🏆 골든 프롬프트 모음.md"
golden_content = """## [2026-06-30] Matter.js 벽 뚫기 및 퍼올리기 맵 디자인 트릭 (스피너 밸리)
- **상황**: 구슬들이 가장자리 벽을 타고 미끄러져 내려가는(얌체 진행) 문제를 해결해야 함.
- **해결 패턴 (골든 프롬프트)**: 
  "벽쪽에 있는 스피너들은 벽에 붙어서 오는 구슬을 퍼올리는 방향으로 되도록 해줘"
- **적용 로직**: 
  - 스피너의 중심축(`cx`)을 맵 바깥(벽 너머)으로 과감하게 내어, 스피너 날개가 벽을 '관통'하며 회전하도록 허용.
  - 좌표 기반 회전 강제: 좌측 벽 근처(`cx < width/3`) 스피너는 시계 방향(양수 speed)으로 고정하여 왼쪽 벽에서 위로 쳐올리게 하고, 우측 벽 근처는 반시계 방향(음수 speed)으로 고정하여 오른쪽 벽에서 위로 퍼올리게 구성함.
  - 이로 인해 사이드 진행을 원천 봉쇄하고 화면 중앙으로 구슬들을 튕겨내어 엄청난 긴박감을 부여함.
"""
insert_after_heading(golden, golden_content)

# 3. 옵시디언 시행착오 패턴 모음
error = r"G:\내 드라이브\00.김현승\0000.옵시디언\김목동 두뇌\05. 바이브코딩\노하우 라이브러리\⚠️ 시행착오 패턴 모음.md"
error_content = """## [2026-06-30] Canvas 2D 렌더링 시 배경색 누락 및 투명화 현상 (clearRect의 함정)
- **상황**: CSS에서 `<canvas>` 또는 그 부모의 `background-color`를 다크 톤으로 지정했음에도 불구하고, 실제 게임 화면 배경이 변경되지 않음.
- **원인**: 게임 렌더 루프(requestAnimationFrame) 매 프레임마다 `ctx.clearRect(0, 0, width, height)`로 캔버스를 지우면, 캔버스 자체가 투명해져 부모나 HTML `body`의 배경이 비치게 됨. 만약 CSS 우선순위나 구조 상 `canvas` 자체에 배경이 적용되지 않고 컨테이너 밖의 색상이 반영되고 있다면 의도한 색상이 묻힘.
- **해결책**: `ctx.clearRect()` 대신, 명시적으로 `ctx.fillStyle = '#1e2532'; ctx.fillRect(0, 0, width, height);` 와 같이 매 프레임마다 원하는 배경색으로 캔버스 전체를 덧칠하도록 강제하면 크로스 브라우징 및 CSS 충돌 없이 확실하게 배경색을 제어할 수 있음.
"""
insert_after_heading(error, error_content)
