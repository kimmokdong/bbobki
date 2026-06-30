(function() {
/**
 * bbobki 구슬 룰렛 게임 - 메인 애플리케이션 및 UI 제어 (조작 기능 제거 버전)
 */

document.addEventListener('DOMContentLoaded', () => {
  // UI 요소 참조
  const marblesInput = document.getElementById('marbles-input');
  const btnAddMarbles = document.getElementById('btn-add-marbles');
  const btnClearMarbles = document.getElementById('btn-clear-marbles');
  const marblesListContainer = document.getElementById('marbles-list-container');
  const marbleCountSpan = document.getElementById('marble-count');
  
  const mapSelector = document.getElementById('map-selector');
  const enableSkillsCheckbox = document.getElementById('enable-skills');
  const speedBtns = document.querySelectorAll('.btn-speed');
  
  const leaderboardContainer = document.getElementById('leaderboard-container');
  const gameStatusBadge = document.getElementById('game-status-badge');
  
  const btnStart = document.getElementById('btn-start');
  const btnPause = document.getElementById('btn-pause');
  const btnReset = document.getElementById('btn-reset');
  
  const cameraFocusBadge = document.getElementById('camera-focus-badge');
  const cameraTargetName = document.getElementById('camera-target-name');
  const cameraTargetRank = document.getElementById('camera-target-rank');
  
  const resultOverlay = document.getElementById('result-overlay');
  const btnModalClose = document.getElementById('btn-close-result');
  const finalRanksList = document.getElementById('final-ranks-list');
  
  // 당첨 순위 설정 UI 참조
  const radioCards = document.querySelectorAll('.radio-card');
  const customRankInputWrapper = document.getElementById('custom-rank-input-wrapper');
  const customRankInput = document.getElementById('custom-rank-input');

  // 내부 상태 데이터
  let marblesList = []; // { id, name, color }
  let resultModalTimeout = null;

  // 13가지 확연히 구분되는 파스텔 네온 색상 리스트
  const neon13Colors = [
    '#ff3b30', // 네온 레드 (1)
    '#ff9500', // 네온 오렌지 (2)
    '#ffcc00', // 네온 옐로우 (3)
    '#4cd964', // 네온 그린 (4)
    '#00c7be', // 민트/티알 (5)
    '#5ac8fa', // 네온 스카이블루 (6)
    '#007aff', // 네온 블루 (7)
    '#af52de', // 일렉트릭 바이올렛 (8)
    '#ff2d55', // 네온 핑크 (9)
    '#f59e0b', // 골드 앰버 (10)
    '#10b981', // 에메랄드 그린 (11)
    '#5856d6', // 인디고 퍼플 (12)
    '#f2f2f7'  // 라이트 실버/화이트 (13)
  ];

  // ----------------------------------------------------
  // 로컬 스토리지 연동
  // ----------------------------------------------------
  function loadSettingsFromStorage() {
    const savedMarbles = localStorage.getItem('bbobki_marbles');
    if (savedMarbles) {
      try {
        marblesList = JSON.parse(savedMarbles);
      } catch (e) {
        initDefaultMarbles();
      }
    } else {
      initDefaultMarbles();
    }
    renderMarblesList();
  }

  function initDefaultMarbles() {
    marblesList = [];
    const defaultNames = ['체리', '망고', '레몬', '멜론', '민트', '베리', '로즈', '실버'];
    defaultNames.forEach((name, idx) => {
      marblesList.push({
        id: 'm_' + idx,
        name: name,
        color: neon13Colors[idx % neon13Colors.length]
      });
    });
  }

  function saveSettingsToStorage() {
    localStorage.setItem('bbobki_marbles', JSON.stringify(marblesList));
  }

  // ----------------------------------------------------
  // 구슬 관리 UI 렌더링
  // ----------------------------------------------------
  function renderMarblesList() {
    marblesListContainer.innerHTML = '';
    marbleCountSpan.textContent = marblesList.length;

    if (marblesList.length === 0) {
      marblesListContainer.innerHTML = '<p class="empty-msg">등록된 구슬이 없습니다. 위에 이름을 입력해 주세요.</p>';
      return;
    }

    marblesList.forEach(marble => {
      const item = document.createElement('div');
      item.className = 'marble-item';
      
      item.innerHTML = `
        <div class="marble-info">
          <div class="marble-color-dot" style="background-color: ${marble.color};"></div>
          <span class="marble-name-tag">${escapeHtml(marble.name)}</span>
        </div>
        <div class="marble-actions">
          <button class="btn-item-delete" data-id="${marble.id}" title="삭제">🗑️</button>
        </div>
      `;

      // 삭제 버튼 이벤트
      item.querySelector('.btn-item-delete').addEventListener('click', () => {
        deleteMarble(marble.id);
      });

      marblesListContainer.appendChild(item);
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // 구슬 개별 삭제
  function deleteMarble(id) {
    marblesList = marblesList.filter(m => m.id !== id);
    
    // 색상 재정렬
    marblesList.forEach((m, idx) => {
      m.color = neon13Colors[idx % neon13Colors.length];
    });

    saveSettingsToStorage();
    renderMarblesList();
    
    if (window.MarbleGame.isPaused && window.MarbleGame.finishedMarbles.length === 0) {
      syncMarblesToPhysics();
    }
  }

  // 구슬 추가 액션
  btnAddMarbles.addEventListener('click', () => {
    const rawInput = marblesInput.value.trim();
    if (!rawInput) return;

    const names = rawInput
      .split(/[\n,]+/)
      .map(n => n.trim())
      .filter(n => n.length > 0);

    if (names.length === 0) return;

    names.forEach(name => {
      const id = 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
      const colorIndex = marblesList.length;
      let color;
      
      if (colorIndex < neon13Colors.length) {
        color = neon13Colors[colorIndex];
      } else {
        const goldenRatioConjugate = 0.618033988749895;
        const h = (colorIndex * goldenRatioConjugate * 360) % 360;
        color = hslToHex(h, 85, 62);
      }

      marblesList.push({
        id: id,
        name: name,
        color: color
      });
    });

    marblesInput.value = '';
    saveSettingsToStorage();
    renderMarblesList();
    
    if (window.MarbleGame.isPaused && window.MarbleGame.finishedMarbles.length === 0) {
      syncMarblesToPhysics();
    }
  });

  function hslToHex(h, s, l) {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  // 구슬 전체 삭제
  btnClearMarbles.addEventListener('click', () => {
    if (confirm('모든 구슬을 삭제하시겠습니까?')) {
      marblesList = [];
      saveSettingsToStorage();
      renderMarblesList();
      syncMarblesToPhysics();
    }
  });

  // ----------------------------------------------------
  // 물리 엔진 데이터 동기화
  // ----------------------------------------------------
  function syncMarblesToPhysics() {
    window.MarbleGame.setupMarbles(marblesList);
    updateLiveLeaderboard(window.MarbleGame.getCurrentRankings());
  }

  // ----------------------------------------------------
  // 우측 고정 실시간 순위판 UI 렌더링
  // ----------------------------------------------------
  function updateLiveLeaderboard(rankedMarbles) {
    if (rankedMarbles.length === 0) {
      leaderboardContainer.innerHTML = '<p class="empty-msg">게임을 시작하면 실시간 순위가 표시됩니다.</p>';
      cameraFocusBadge.classList.add('hidden');
      return;
    }

    leaderboardContainer.innerHTML = '';

    // 당첨 순위 계산
    let winnerTargetRank;
    const mode = window.MarbleGame.winnerRankMode;
    if (mode === 'first') {
      winnerTargetRank = 1;
    } else if (mode === 'last') {
      winnerTargetRank = rankedMarbles.length;
    } else {
      winnerTargetRank = Math.min(window.MarbleGame.winnerRankNumber, rankedMarbles.length);
    }

    const cameraTarget = window.MarbleGame.cameraTarget;
    if (cameraTarget && !window.MarbleGame.isPaused) {
      cameraFocusBadge.classList.remove('hidden');
      cameraTargetName.textContent = cameraTarget.name;
      
      const currentRank = rankedMarbles.findIndex(m => m.id === cameraTarget.id) + 1;
      const modeLabel = mode === 'first' ? '1등' : mode === 'last' ? '꼴등' : `${winnerTargetRank}등`;
      cameraTargetRank.textContent = `(${modeLabel} 당첨 · 현재 ${currentRank}위)`;
    } else {
      cameraFocusBadge.classList.add('hidden');
    }

    // 큼직하고 뚜렷한 텍스트로만 랭킹 목록 렌더링
    rankedMarbles.forEach((marble, idx) => {
      const rank = idx + 1;
      const item = document.createElement('div');
      
      item.className = `leaderboard-item ${marble.isFinished ? 'finished' : ''}`;
      if (cameraTarget && cameraTarget.id === marble.id) {
        item.classList.add('focused');
      }
      // 당첨 후보 구슬 강조
      if (rank === winnerTargetRank) {
        item.classList.add('winner-focus');
      }

      item.innerHTML = `
        <span class="rank-name-text" style="color: ${marble.color};">${escapeHtml(marble.name)}</span>
        <span class="rank-number-text" style="color: ${marble.color};">${rank}위</span>
      `;
      
      leaderboardContainer.appendChild(item);
    });
  }

  // ----------------------------------------------------
  // 시뮬레이터 제어 버튼 핸들러
  // ----------------------------------------------------
  btnStart.addEventListener('click', () => {
    if (marblesList.length === 0) {
      alert('최소 1개 이상의 구슬을 등록해 주세요.');
      return;
    }

    window.MarbleGame.start();
    
    btnStart.disabled = true;
    btnPause.disabled = false;
    mapSelector.disabled = true;
    
    gameStatusBadge.textContent = '경기 중';
    gameStatusBadge.className = 'badge-status running';
    
    const rightStatusBadge = document.querySelector('#right-sidebar .badge-status');
    if (rightStatusBadge) {
      rightStatusBadge.textContent = '경기 중';
      rightStatusBadge.className = 'badge-status running';
    }
  });

  btnPause.addEventListener('click', () => {
    window.MarbleGame.pause();
    
    btnStart.disabled = false;
    btnPause.disabled = true;
    
    gameStatusBadge.textContent = '일시 정지';
    gameStatusBadge.className = 'badge-status paused';

    const rightStatusBadge = document.querySelector('#right-sidebar .badge-status');
    if (rightStatusBadge) {
      rightStatusBadge.textContent = '일시 정지';
      rightStatusBadge.className = 'badge-status paused';
    }
  });

  btnReset.addEventListener('click', () => {
    window.MarbleGame.reset();
    resultOverlay.classList.add('hidden');
    
    // 진행 중이던 모달 타이머가 있다면 즉시 취소
    if (resultModalTimeout) {
      clearTimeout(resultModalTimeout);
      resultModalTimeout = null;
    }
    
    // 당첨 모달도 숨기기
    const highlightOverlay = document.getElementById('highlight-overlay');
    if (highlightOverlay) highlightOverlay.classList.add('hidden');

    // 맵 상태 및 구슬 리셋 (완전 처음 시작 전 상태로 구슬 재배치)
    syncMarblesToPhysics();

    btnStart.disabled = false;
    btnPause.disabled = true;
    mapSelector.disabled = false;

    gameStatusBadge.textContent = '대기 중';
    gameStatusBadge.className = 'badge-status idle';

    const rightStatusBadge = document.querySelector('#right-sidebar .badge-status');
    if (rightStatusBadge) {
      rightStatusBadge.textContent = '대기 중';
      rightStatusBadge.className = 'badge-status idle';
    }
  });

  // 맵 변경 핸들러
  mapSelector.addEventListener('change', () => {
    window.MarbleGame.loadMap(mapSelector.value);
    syncMarblesToPhysics();
  });

  enableSkillsCheckbox.addEventListener('change', () => {
    window.MarbleGame.enableSkills = enableSkillsCheckbox.checked;
  });

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const speed = btn.getAttribute('data-speed');
      window.MarbleGame.setSpeed(speed);
    });
  });

  // 당첨 순위 라디오 카드 이벤트 바인딩
  radioCards.forEach(card => {
    card.addEventListener('click', () => {
      // 모든 카드에서 active 제거
      radioCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      
      const radio = card.querySelector('input[type="radio"]');
      radio.checked = true;
      const value = radio.value;
      
      window.MarbleGame.winnerRankMode = value;
      
      if (value === 'custom') {
        customRankInputWrapper.classList.remove('hidden');
        window.MarbleGame.winnerRankNumber = parseInt(customRankInput.value) || 1;
      } else {
        customRankInputWrapper.classList.add('hidden');
        window.MarbleGame.winnerRankNumber = value === 'first' ? 1 : marblesList.length;
      }
    });
  });

  // 커스텀 등수 입력 변경 이벤트
  customRankInput.addEventListener('input', () => {
    const val = parseInt(customRankInput.value) || 1;
    window.MarbleGame.winnerRankNumber = Math.max(1, val);
  });

  // 최종 결과 모달 출력
  btnModalClose.addEventListener('click', () => {
    resultOverlay.classList.add('hidden');
  });

  // 단일 당첨자 모달 닫기
  const btnCloseHighlight = document.getElementById('btn-close-highlight');
  const highlightOverlay = document.getElementById('highlight-overlay');
  
  if (btnCloseHighlight) {
    btnCloseHighlight.addEventListener('click', () => {
      highlightOverlay.classList.add('hidden');
    });
  }

  function showResultModal(finalRanks) {
    if (finalRanks.length === 0) return;

    finalRanksList.innerHTML = '';
    finalRanks.forEach((marble, idx) => {
      const item = document.createElement('li');
      item.className = 'result-rank-item';
      item.innerHTML = `
        <span class="result-rank-label">${idx + 1}등</span>
        <span class="result-rank-name" style="color: ${marble.color};">${escapeHtml(marble.name)}</span>
      `;
      finalRanksList.appendChild(item);
    });

    resultOverlay.classList.remove('hidden');

    // 꽃가루 효과
    const duration = 2.5 * 1000;
    const end = Date.now() + duration;

    (function frame() {
      confetti({
        particleCount: 4,
        angle: 60,
        spread: 55,
        origin: { x: 0 },
        colors: [finalRanks[0].color, '#ffffff', '#fbbf24']
      });
      confetti({
        particleCount: 4,
        angle: 120,
        spread: 55,
        origin: { x: 1 },
        colors: [finalRanks[0].color, '#ffffff', '#fbbf24']
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    }());
  }

  // ----------------------------------------------------
  // 물리 엔진 콜백 수신 설정
  // ----------------------------------------------------
  window.MarbleGame.init(
    'canvas-container',
    (rankedMarbles) => {
      updateLiveLeaderboard(rankedMarbles);
    },
    (marble, rankNum) => {
      if (rankNum === 1) {
        confetti({
          particleCount: 50,
          spread: 80,
          origin: { y: 0.6 },
          colors: [marble.color, '#ffffff']
        });
      }
      updateLiveLeaderboard(window.MarbleGame.getCurrentRankings());
    },
    (finalRanks) => {
      gameStatusBadge.textContent = '경기 종료';
      gameStatusBadge.className = 'badge-status idle';
      
      const rightStatusBadge = document.querySelector('#right-sidebar .badge-status');
      if (rightStatusBadge) {
        rightStatusBadge.textContent = '경기 종료';
        rightStatusBadge.className = 'badge-status idle';
      }
      
      btnStart.disabled = false;
      btnPause.disabled = true;
      mapSelector.disabled = false;

      if (resultModalTimeout) {
        clearTimeout(resultModalTimeout);
      }
      resultModalTimeout = setTimeout(() => {
        showResultModal(finalRanks);
      }, 800);
    },
    // 단일 당첨자 골인 시 호출
    (marble, rankNum) => {
      const hOverlay = document.getElementById('highlight-overlay');
      const hRank = document.getElementById('highlight-rank');
      const hName = document.getElementById('highlight-name');

      hRank.textContent = `${rankNum}등 당첨!`;
      hName.textContent = marble.name;
      hName.style.color = marble.color;
      hOverlay.classList.remove('hidden');

      // 화려한 파티클
      confetti({
        particleCount: 150,
        spread: 120,
        origin: { y: 0.5 },
        colors: [marble.color, '#ffffff', '#fbbf24']
      });
    }
  );

  window.MarbleGame.loadMap('pinball');
  loadSettingsFromStorage();
  syncMarblesToPhysics();
});
})();
