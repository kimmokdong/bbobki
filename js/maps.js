(function() {
/**
 * bbobki 구슬 룰렛 게임 - 맵 프리셋 및 기믹 정의 파일
 */

const { Bodies, Body, Composite } = Matter;

window.MarbleMaps = {
  // 공통 맵 바운더리 (외부 벽 및 하단 결승선 깔때기)
  // width: 800, height: 1800
  createCommonBoundaries: function(world, width, height) {
    const wallOptions = { 
      isStatic: true, 
      restitution: 0.5, 
      friction: 0, // 마찰 완전 제로
      render: { fillStyle: '#141b2d' } 
    };

    const boundaries = [];

    // 1. 좌우 수직 벽 (두께 40px)
    boundaries.push(Bodies.rectangle(-20, height / 2, 40, height, wallOptions));
    boundaries.push(Bodies.rectangle(width + 20, height / 2, 40, height, wallOptions));

    // 2. 상단 천장
    boundaries.push(Bodies.rectangle(width / 2, -20, width, 40, wallOptions));

    // 하단 바닥 제거 (구슬이 골인 후 밑으로 떨어져 화면 밖으로 사라지도록 함)

    // 4. 하단 결승선 깔때기 (y = 1600 ~ 1720 지점)
    const funnelY = height - 190;
    const gateX = width / 2;

    // 좌측 비스듬한 판 (마찰 0)
    const leftFunnel = Bodies.rectangle(gateX - 220, funnelY, 440, 16, {
      isStatic: true,
      angle: Math.PI / 5.5,
      restitution: 0.1,
      friction: 0,
      render: { fillStyle: '#1e293b' }
    });

    // 우측 비스듬한 판 (마찰 0)
    const rightFunnel = Bodies.rectangle(gateX + 220, funnelY, 440, 16, {
      isStatic: true,
      angle: -Math.PI / 5.5,
      restitution: 0.1,
      friction: 0,
      render: { fillStyle: '#1e293b' }
    });

    // 깔때기 아래로 이어지는 수직 관 (튜브)
    // 깔때기 끝단 y좌표는 대략 funnelY + 118
    const tubeY = funnelY + 220; // 280에서 220으로 축소
    const leftTube = Bodies.rectangle(gateX - 35, tubeY, 10, 200, {
      isStatic: true,
      restitution: 0.1,
      friction: 0,
      render: { fillStyle: '#1e293b' }
    });
    const rightTube = Bodies.rectangle(gateX + 35, tubeY, 10, 200, {
      isStatic: true,
      restitution: 0.1,
      friction: 0,
      render: { fillStyle: '#1e293b' }
    });

    boundaries.push(leftFunnel, rightFunnel, leftTube, rightTube);

    // 5. 결승 센서 (관 맨 아래쪽 깊숙한 곳에 배치)
    const finishSensor = Bodies.rectangle(gateX, tubeY + 80, 60, 12, {
      isStatic: true,
      isSensor: true,
      label: 'finish_sensor',
      render: {
        visible: true,
        fillStyle: 'rgba(56, 189, 248, 0.3)'
      }
    });
    boundaries.push(finishSensor);

    // 6. 가로로 튕기며 움직이는 펀치 막대 2개 배치 (관 안쪽)
    const punches = [];
    
    const createSawtoothPunch = (x, y, w, h, opts) => {
      const parts = [];
      const numTeeth = 5;
      const tw = w / numTeeth;
      parts.push(Bodies.rectangle(x, y + h/4, w, h/2, { render: opts.render }));
      for (let i = 0; i < numTeeth; i++) {
        const tx = x - w/2 + tw/2 + i*tw;
        parts.push(Bodies.polygon(tx, y - h/4, 3, tw*0.6, { angle: Math.PI/2, render: opts.render }));
      }
      return Body.create({
        parts: parts,
        isStatic: true,
        label: opts.label,
        restitution: opts.restitution,
        friction: opts.friction,
        render: opts.render
      });
    };

    // 상단 펀치 (좌->우 시작)
    const punchLeft = createSawtoothPunch(gateX - 25, funnelY + 140, 70, 14, {
      label: 'punch',
      restitution: 3.0, // 튕기는 힘
      friction: 0,
      render: { fillStyle: '#ef4444', strokeStyle: '#fca5a5', lineWidth: 2 }
    });
    punchLeft.startX = gateX - 25;
    punchLeft.direction = 1; // 이동 방향
    punchLeft.offsetSpeed = 0.005; // 펀치 속도
    punches.push(punchLeft);

    // 하단 펀치 (우->좌 시작)
    const punchRight = createSawtoothPunch(gateX + 25, funnelY + 190, 70, 14, {
      label: 'punch',
      restitution: 3.0,
      friction: 0,
      render: { fillStyle: '#3b82f6', strokeStyle: '#93c5fd', lineWidth: 2 }
    });
    punchRight.startX = gateX + 25;
    punchRight.direction = -1;
    punchRight.offsetSpeed = 0.006;
    punches.push(punchRight);

    Composite.add(world, punches);
    Composite.add(world, boundaries);
    
    return {
      finishSensor: finishSensor,
      funnelY: funnelY,
      punches: punches  // game.js에서 위치를 업데이트하도록 전달
    };
  },

  // ----------------------------------------------------
  // 기믹 생성 헬퍼 함수들 (game.js에서 상태 체크용으로 속성 주입)
  // ----------------------------------------------------
  // 1. 순간이동 포탈 쌍 생성
  createPortalPair: function(world, inX, inY, outX, outY, color) {
    const portalIn = Bodies.circle(inX, inY, 18, {
      isStatic: true,
      isSensor: true,
      label: 'portal_in',
      render: { fillStyle: 'transparent' } // game.js 커스텀 렌더러에서 네온으로 드로잉
    });

    // 출구 위치 메타데이터 연결
    portalIn.targetPos = { x: outX, y: outY };
    portalIn.portalColor = color || '#38bdf8';

    // 맵 내 출구 시각 표시용 센서
    const portalOut = Bodies.circle(outX, outY, 18, {
      isStatic: true,
      isSensor: true,
      label: 'portal_out',
      render: { fillStyle: 'transparent' }
    });
    portalOut.portalColor = color || '#f97316';

    Composite.add(world, [portalIn, portalOut]);
    return { portalIn, portalOut };
  },

  // 2. 가속 패드 (Speed Booster) 생성
  createBooster: function(world, x, y, width, height, angle, forceMag) {
    const booster = Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      isSensor: true,
      angle: angle,
      label: 'booster',
      render: { fillStyle: 'transparent' }
    });

    // 가속 힘 벡터 계산 (로컬 기준 아래 방향으로 작용)
    const forceDirection = { x: Math.sin(angle), y: Math.cos(angle) };
    booster.forceVector = {
      x: forceDirection.x * forceMag,
      y: forceDirection.y * forceMag
    };

    Composite.add(world, booster);
    return booster;
  },

  // 3. 감속 영역 (Slow Zone) 생성
  createSlowZone: function(world, x, y, width, height) {
    const slowZone = Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      isSensor: true,
      label: 'slow_zone',
      render: { fillStyle: 'transparent' }
    });

    Composite.add(world, slowZone);
    return slowZone;
  },

  // ----------------------------------------------------
  // 맵 1: 핀볼 숲 (Pinball Forest)
  // ----------------------------------------------------
  createPinballMap: function(world, width, height) {
    const startY = 150;
    const endY = height - 170; // 제일 아랫줄 핀 제거 (height - 80에서 수정)
    const items = [];
    const spinners = [];

    // 펙 격자 생성 (기둥 제거 및 마찰 최소화)
    const rowSpacing = 85;
    const colSpacing = 72;
    
    for (let y = startY; y < endY; y += rowSpacing) {
      const isEven = Math.round(y / rowSpacing) % 2 === 0;
      const startX = isEven ? colSpacing : colSpacing / 2;
      
      for (let x = startX; x < width; x += colSpacing) {
        if (y > height - 380 && (x < 140 || x > width - 140)) continue;

        // 랜덤 범퍼 생성 확률 증가 (0.12 -> 0.18)
        const isBumper = Math.random() < 0.18 && y > 300 && y < endY - 120;
        
        if (isBumper) {
          items.push(Bodies.circle(x, y, 18, {
            isStatic: true,
            label: 'bumper',
            restitution: 2.0,
            friction: 0,
            render: {
              fillStyle: '#10b981',
              strokeStyle: '#34d399',
              lineWidth: 3
            }
          }));
        } else {
          items.push(Bodies.circle(x, y, 5, {
            isStatic: true,
            restitution: 0.8,
            friction: 0,
            render: { fillStyle: '#475569' }
          }));
        }
      }
    }

    Composite.add(world, items);

    // [기믹 배치]
    // 1. 감속 늪지대 4개 배치 (구슬 정체/전략 변화 확대)
    this.createSlowZone(world, width / 4, 400, 150, 80);
    this.createSlowZone(world, 3 * width / 4, 600, 150, 80);
    this.createSlowZone(world, width / 3, 1000, 180, 80); // Y축 하향 조정
    this.createSlowZone(world, 2 * width / 3, 1300, 180, 80); // Y축 대폭 하향

    // 2. 가속 부스터 5개 배치 (속도감 증가)
    this.createBooster(world, width / 2, 500, 120, 30, 0, 0.0025);
    this.createBooster(world, width / 4, 750, 100, 30, 0.3, 0.0025);
    this.createBooster(world, 3 * width / 4, 750, 100, 30, -0.3, 0.0025);
    this.createBooster(world, width / 3, 1150, 120, 30, 0.2, 0.003);
    this.createBooster(world, 2 * width / 3, 1450, 120, 30, -0.2, 0.003); // Y축 대폭 하향

    return { spinners };
  },

  // ----------------------------------------------------
  // 맵 2: 스피너 밸리 (Spinner Valley)
  // ----------------------------------------------------
  createSpinnerMap: function(world, width, height) {
    const spinners = [];

    // 다채로운 네온 스피너 팔레트
    const colors = [
      { fill: '#f43f5e', stroke: '#fb7185' }, // 핑크/레드
      { fill: '#8b5cf6', stroke: '#c084fc' }, // 보라
      { fill: '#3b82f6', stroke: '#93c5fd' }, // 파랑
      { fill: '#10b981', stroke: '#34d399' }, // 초록
      { fill: '#f59e0b', stroke: '#fbbf24' }  // 노랑
    ];

    // Y축 150부터 끝단(height - 220)까지 약 105px 간격으로 촘촘히 층 형성
    for (let y = 150; y <= height - 220; y += 105) {
      // 맵 정중앙 부근(height / 2)에는 엄청나게 큰 '보스 스피너' 하나만 배치하고 건너뜀
      if (Math.abs(y - (height / 2)) < 60) {
        const giantSpinner = this.addSpinner(world, width / 2, y, width - 180, 40, 0.035);
        giantSpinner.render.fillStyle = '#f43f5e';
        giantSpinner.render.strokeStyle = '#fda4af';
        spinners.push(giantSpinner);
        continue;
      }

      // 일반 층마다 2~4개의 스피너 생성
      const numSpinners = Math.floor(Math.random() * 3) + 2;
      const spacing = width / numSpinners;
      
      for (let i = 0; i < numSpinners; i++) {
        // x 좌표 무작위 변주를 크게 주어 벽 바깥쪽으로 중심축이 나갈 수도 있게 허용
        const cx = (spacing / 2) + i * spacing + (Math.random() - 0.5) * 160;
        
        // 다양한 길이(100 ~ 280)로 사이드 공간까지 확실히 쓸어내게 함
        const length = 100 + Math.random() * 180;
        const thickness = 10 + Math.random() * 8;
        
        // 다양한 회전 속도 (0.015 ~ 0.08)
        let speed = 0.015 + Math.random() * 0.065;
        
        // 벽쪽 스피너는 밖으로 떨어지는 구슬을 안으로 '퍼올리도록' 회전 방향 고정
        if (cx < width / 3) {
          // 좌측 벽 근처: 시계 방향(+) -> 왼쪽에서 위로 퍼올림
          speed = Math.abs(speed);
        } else if (cx > (width * 2) / 3) {
          // 우측 벽 근처: 반시계 방향(-) -> 오른쪽에서 위로 퍼올림
          speed = -Math.abs(speed);
        } else {
          // 중앙부: 랜덤 방향
          speed *= (Math.random() > 0.5 ? 1 : -1);
        }
        
        const s = this.addSpinner(world, cx, y, length, thickness, speed);
        
        // 무작위 네온 색상 부여
        const colorObj = colors[Math.floor(Math.random() * colors.length)];
        s.render.fillStyle = colorObj.fill;
        s.render.strokeStyle = colorObj.stroke;
        
        spinners.push(s);
      }
    }

    return { spinners };
  },

  // 스피너 바디 생성
  addSpinner: function(world, x, y, length, width, speed) {
    const spinner = Bodies.rectangle(x, y, length, width, {
      isStatic: true,
      label: 'spinner',
      restitution: 0.8,
      friction: 0,
      render: { fillStyle: '#a855f7', strokeStyle: '#c084fc', lineWidth: 2 }
    });
    
    spinner.rotationSpeed = speed;
    Composite.add(world, spinner);
    return spinner;
  },

  // ----------------------------------------------------
  // 맵 3: 지그재그 슬라이드 (Zigzag Slides)
  // ----------------------------------------------------
  createZigzagMap: function(world, width, height) {
    const items = [];
    const spinners = [];

    const slideOptions = {
      isStatic: true,
      restitution: 0.4,
      friction: 0.002, // 슬라이딩 미끄러짐 극대화
      render: { fillStyle: '#1e293b' }
    };

    // 지그재그 사선 슬라이드들
    const slides = [
      { x: 260, y: 220, w: 580, h: 16, angle: 0.16 },
      { x: width - 260, y: 440, w: 580, h: 16, angle: -0.16 },
      { x: 260, y: 660, w: 580, h: 16, angle: 0.16 },
      { x: width - 260, y: 880, w: 580, h: 16, angle: -0.16 },
      { x: 260, y: 1100, w: 580, h: 16, angle: 0.16 },
      { x: width - 260, y: 1320, w: 580, h: 16, angle: -0.16 }
    ];

    slides.forEach(s => {
      items.push(Bodies.rectangle(s.x, s.y, s.w, s.h, { ...slideOptions, angle: s.angle }));

      const dir = s.angle > 0 ? 1 : -1;
      const lipX = dir === 1 ? s.x + s.w / 2 - 30 : s.x - s.w / 2 + 30;
      const lipY = s.y + Math.abs(s.w / 2 * Math.sin(s.angle)) - 10;
      
      // 도약턱
      items.push(Bodies.rectangle(lipX, lipY, 20, 20, {
        isStatic: true, angle: s.angle - dir * 0.4, render: { fillStyle: '#f59e0b' }
      }));

      // 가이드 벽
      const wallX = dir === 1 ? width - 20 : 20;
      items.push(Bodies.rectangle(wallX, s.y + 120, 16, 120, {
        isStatic: true, render: { fillStyle: '#334155' }
      }));
    });

    Composite.add(world, items);

    // [기믹 배치]
    // 1. 슬라이드 슬로프 중간에 '가속 부스터 패드'를 달아 구슬이 점프대에서 폭발적으로 날아가게 함
    this.createBooster(world, 180, 200, 80, 15, 0.16, 0.0035);
    this.createBooster(world, width - 180, 420, 80, 15, -0.16, 0.0035);
    this.createBooster(world, 180, 1080, 80, 15, 0.16, 0.0035);

    // 2. 포탈 루프 설치 (하방 y=1200 부근의 대형 블랙홀 포탈을 통해 최상단으로 구슬을 던져 역전 연출)
    // 20% 확률 혹은 스킬 작동 유도를 위해 깔대기 진입 전 중앙에 흡입 포탈을 두고 상단으로 던짐
    this.createPortalPair(world, width / 2, 1200, width / 2, 120, '#e11d48');

    return { spinners };
  },

  // ----------------------------------------------------
  // 맵 4: 블랙홀 소용돌이 (Vortex Hole)
  // ----------------------------------------------------
  createVortexMap: function(world, width, height) {
    const items = [];
    const spinners = [];

    // 상단 격자 펙
    const pegOptions = { isStatic: true, restitution: 0.6, friction: 0, render: { fillStyle: '#475569' } };
    for (let y = 140; y < 350; y += 70) {
      const isEven = Math.round(y / 70) % 2 === 0;
      for (let x = (isEven ? 60 : 30); x < width; x += 60) {
        items.push(Bodies.circle(x, y, 5, pegOptions));
      }
    }

    // 소용돌이 벽면 생성
    // 1. 소용돌이 1 (y = 580)
    this.buildVortexFunnel(items, width / 2, 580, 240, true);
    
    // 2. 소용돌이 2 (y = 1050)
    this.buildVortexFunnel(items, width / 2 - 120, 1050, 190, false);
    this.buildVortexFunnel(items, width / 2 + 120, 1050, 190, true);

    Composite.add(world, items);

    // [기믹 배치]
    // 1. 블랙홀 소용돌이 입구 3개 각각에 포탈 입구 설치
    // 소용돌이 1의 중앙(580y)에 도달하면 소용돌이 2의 좌/우 사이드로 순간이동 방출
    this.createPortalPair(world, width / 2, 580, width / 4, 820, '#0ea5e9');
    
    // 소용돌이 2의 흡입구 2개에 도달한 공들은 각각 마지막 결승 게이트 바로 위로 급강하 방출
    this.createPortalPair(world, width / 2 - 120, 1050, 120, 1380, '#f43f5e');
    this.createPortalPair(world, width / 2 + 120, 1050, width - 120, 1380, '#f43f5e');

    // 2. 감속 늪지대와 부스터 배치
    this.createSlowZone(world, width / 2, 380, 220, 50); // 소용돌이 1 진입 직전 감속
    this.createBooster(world, width / 2, 480, 100, 30, 0, 0.002);

    return { spinners };
  },

  // 소용돌이 조립
  buildVortexFunnel: function(items, centerX, centerY, radius, clockwise) {
    const segments = 18;
    const thickness = 10;
    const segmentLength = (2 * Math.PI * radius) / segments;
    
    const exitAngleStart = Math.PI * 0.45;
    const exitAngleEnd = Math.PI * 0.75;

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      
      // 출구 부분 제외 (소용돌이에 닿으면 센서 포탈로 타게 하거나 탈출)
      if (angle > exitAngleStart && angle < exitAngleEnd) {
        continue;
      }

      const spiralRadius = radius * (1 - (angle / (Math.PI * 8)) * (clockwise ? 1 : -1));
      const x = centerX + spiralRadius * Math.cos(angle);
      const y = centerY + spiralRadius * Math.sin(angle);
      const wallAngle = angle + Math.PI / 2 + (clockwise ? 0.1 : -0.1);

      items.push(Bodies.rectangle(x, y, segmentLength, thickness, {
        isStatic: true,
        angle: wallAngle,
        restitution: 0.5,
        friction: 0,
        render: { fillStyle: '#171717', strokeStyle: '#3f3f46', lineWidth: 1 }
      }));
    }
  }
};
})();
