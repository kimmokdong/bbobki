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
    const punchLeft = createSawtoothPunch(gateX - 25, funnelY + 140, 52, 14, {
      label: 'punch',
      restitution: 1.6,
      friction: 0,
      render: { fillStyle: '#ef4444', strokeStyle: '#fca5a5', lineWidth: 2 }
    });
    punchLeft.startX = gateX - 25;
    punchLeft.direction = 1; // 이동 방향
    punchLeft.offsetSpeed = 0.005; // 펀치 속도
    punches.push(punchLeft);

    // 하단 펀치 (우->좌 시작)
    const punchRight = createSawtoothPunch(gateX + 25, funnelY + 190, 52, 14, {
      label: 'punch',
      restitution: 1.6,
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
  createPortalPair: function(world, inX, inY, outX, outY, color, radius = 18) {
    const portalIn = Bodies.circle(inX, inY, radius, {
      isStatic: true,
      isSensor: true,
      label: 'portal_in',
      render: { fillStyle: 'transparent' } // game.js 커스텀 렌더러에서 네온으로 드로잉
    });

    // 출구 위치 메타데이터 연결
    portalIn.targetPos = { x: outX, y: outY };
    portalIn.portalColor = color || '#38bdf8';
    portalIn.portalRadius = radius;
    portalIn.triggerRadius = radius + 12;
    portalIn.portalId = `${inX}:${inY}:${outX}:${outY}`;

    // 맵 내 출구 시각 표시용 센서
    const portalOut = Bodies.circle(outX, outY, radius, {
      isStatic: true,
      isSensor: true,
      label: 'portal_out',
      render: { fillStyle: 'transparent' }
    });
    portalOut.portalColor = color || '#f97316';
    portalOut.portalRadius = radius;

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

  // 물리에 영향을 주지 않는 맵 안내 표지판
  createSign: function(world, x, y, text, color, fontSize = 18) {
    const sign = Bodies.rectangle(x, y, 2, 2, {
      isStatic: true,
      isSensor: true,
      label: 'map_sign',
      collisionFilter: { mask: 0 },
      render: { visible: false }
    });
    sign.signText = text;
    sign.signColor = color || '#f8fafc';
    sign.signFontSize = fontSize;
    Composite.add(world, sign);
    return sign;
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

    const angles = [0.24, -0.27, 0.22, -0.29, 0.25, -0.23, 0.28, -0.24, 0.27, -0.25];
    const slides = angles.map((angle, index) => ({
      x: index % 2 === 0 ? 285 : width - 285,
      y: 210 + index * 225,
      w: 650,
      h: 16,
      angle
    }));
    const choiceSlides = new Set([2, 5, 8]);
    const turnSlides = new Set([0, 3, 6]);
    const shuffleSlides = new Set([1, 4, 7]);

    const pointOnSlide = (slide, localX, lift = 0) => ({
      x: slide.x + localX * Math.cos(slide.angle) + lift * Math.sin(slide.angle),
      y: slide.y + localX * Math.sin(slide.angle) - lift * Math.cos(slide.angle)
    });

    const addRail = (slide, localX, length, index) => {
      const point = pointOnSlide(slide, localX);
      items.push(Bodies.rectangle(point.x, point.y, length, slide.h, {
        isStatic: true,
        label: 'zigzag_slide',
        angle: slide.angle,
        restitution: 0.22,
        friction: 0,
        frictionStatic: 0,
        render: {
          fillStyle: index % 2 === 0 ? '#17365f' : '#3b1f5f',
          strokeStyle: index % 2 === 0 ? '#38bdf8' : '#c084fc',
          lineWidth: 2
        }
      }));
    };

    // 기존 부스터의 수직 하방 힘을 덮어써 경사면 진행 방향으로만 밀어 준다.
    const addSlideCurrent = (slide, localX, length) => {
      const point = pointOnSlide(slide, localX, 27);
      const horizontalForce = 0.0176;
      const verticalForce = 0.0044;
      const direction = Math.sign(slide.angle);
      const current = this.createBooster(world, point.x, point.y, length, 46, slide.angle, horizontalForce);
      current.forceVector = {
        x: direction * Math.cos(slide.angle) * horizontalForce,
        y: Math.abs(Math.sin(slide.angle)) * verticalForce
      };
    };

    slides.forEach((slide, index) => {
      const direction = Math.sign(slide.angle);

      if (choiceSlides.has(index)) {
        // 점프에 성공하면 판을 계속 타고, 실패하면 다음 판으로 먼저 떨어지는 추월 분기점.
        const gap = 82;
        const segmentLength = (slide.w - gap) / 2;
        [-1, 1].forEach(side => {
          const localX = side * (gap / 2 + segmentLength / 2);
          addRail(slide, localX, segmentLength, index);
          addSlideCurrent(slide, localX, segmentLength - 34);
        });

        const kickerPoint = pointOnSlide(slide, -direction * (gap / 2 + 20), 24);
        items.push(Bodies.circle(kickerPoint.x, kickerPoint.y, 14, {
          isStatic: true,
          label: 'zigzag_bumper',
          restitution: 1.35,
          friction: 0,
          render: { fillStyle: '#f59e0b', strokeStyle: '#fde68a', lineWidth: 3 }
        }));
        this.createSign(world, slide.x, slide.y - 62, '⚡ 점프 or 지름길', '#fbbf24', 16);
      } else {
        addRail(slide, 0, slide.w, index);
        addSlideCurrent(slide, 0, slide.w - 70);
      }

      if (shuffleSlides.has(index)) {
        // 서로 다른 크기의 범퍼가 구슬 무리를 흩어 추월 공간을 만든다.
        [-80, 95].forEach((progress, bumperIndex) => {
          const point = pointOnSlide(slide, direction * progress, bumperIndex === 0 ? 25 : 29);
          items.push(Bodies.circle(point.x, point.y, bumperIndex === 0 ? 13 : 17, {
            isStatic: true,
            label: 'zigzag_bumper',
            restitution: 1.25,
            friction: 0,
            render: {
              fillStyle: bumperIndex === 0 ? '#06b6d4' : '#ec4899',
              strokeStyle: bumperIndex === 0 ? '#a5f3fc' : '#fbcfe8',
              lineWidth: 3
            }
          }));
        });
      }

      if (turnSlides.has(index)) {
        const exit = pointOnSlide(slide, direction * (slide.w / 2 - 8));
        const nextSlide = slides[index + 1];
        const nextDirection = Math.sign(nextSlide.angle);
        const entrance = pointOnSlide(nextSlide, -nextDirection * (nextSlide.w / 2 - 8));
        const spinner = this.addSpinner(
          world,
          (exit.x + entrance.x) / 2,
          (exit.y + entrance.y) / 2,
          135,
          13,
          direction > 0 ? -0.052 : 0.052
        );
        Body.setAngle(spinner, direction * 0.22);
        spinner.render.fillStyle = '#f97316';
        spinner.render.strokeStyle = '#fed7aa';
        spinners.push(spinner);
      }
    });

    Composite.add(world, items);

    this.createSign(world, width / 2, 105, '급경사 10단 · 점프홀에서 순위가 뒤집힌다!', '#7dd3fc', 20);

    // 결승 직전 두 회전 막대가 좌우로 벌어진 구슬을 다시 섞는다.
    const finalMixers = [
      this.addSpinner(world, width / 2, height - 390, 360, 18, 0.034),
      this.addSpinner(world, width / 2, height - 290, 220, 16, -0.049)
    ];
    finalMixers[0].render.fillStyle = '#0ea5e9';
    finalMixers[0].render.strokeStyle = '#bae6fd';
    finalMixers[1].render.fillStyle = '#a855f7';
    finalMixers[1].render.strokeStyle = '#e9d5ff';
    spinners.push(...finalMixers);

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

  // ----------------------------------------------------
  // 맵 5: 운명의 세 문 (Fate Doors)
  // 세 포탈의 급행/보통/후퇴 결과가 맵 생성 때마다 뒤섞임
  // ----------------------------------------------------
  createFateDoorsMap: function(world, width, height) {
    const items = [];
    const spinners = [];
    const laneXs = [width / 6, width / 2, width * 5 / 6];
    const funnelY = height - 190;
    const railOptions = {
      isStatic: true,
      restitution: 0.35,
      friction: 0,
      render: { fillStyle: '#312e81', strokeStyle: '#818cf8', lineWidth: 2 }
    };
    const bumperOptions = {
      isStatic: true,
      label: 'bumper',
      restitution: 1.8,
      friction: 0,
      render: { fillStyle: '#ec4899', strokeStyle: '#f9a8d4', lineWidth: 3 }
    };

    this.createSign(world, width / 2, 70, '🚪 운명의 세 문 · 두 번의 선택', '#f8fafc', 24);

    const buildDoorStage = (topY, stageNumber, outcomes) => {
      this.createSign(world, width / 2, topY + 35, `${stageNumber}차 운명의 문`, '#ddd6fe', 20);

      const gateSpinner = this.addSpinner(world, width / 2, topY + 100, 430, 18, stageNumber === 1 ? 0.032 : -0.036);
      gateSpinner.render.fillStyle = stageNumber === 1 ? '#7c3aed' : '#db2777';
      gateSpinner.render.strokeStyle = stageNumber === 1 ? '#c4b5fd' : '#f9a8d4';
      spinners.push(gateSpinner);

      items.push(Bodies.rectangle(width / 3, topY + 380, 12, 460, railOptions));
      items.push(Bodies.rectangle(width * 2 / 3, topY + 380, 12, 460, railOptions));
      items.push(Bodies.circle(130, topY + 220, 20, bumperOptions));
      items.push(Bodies.circle(400, topY + 235, 20, bumperOptions));
      items.push(Bodies.circle(670, topY + 220, 20, bumperOptions));

      laneXs.forEach((x, index) => {
        items.push(Bodies.rectangle(x - 85, topY + 480, 100, 12, { ...railOptions, angle: 0.42 }));
        items.push(Bodies.rectangle(x + 85, topY + 480, 100, 12, { ...railOptions, angle: -0.42 }));
        this.createSign(world, x, topY + 405, `${index + 1}번 문 ?`, '#c4b5fd', 17);
      });

      const shuffled = outcomes.map(outcome => ({ ...outcome }));
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      laneXs.forEach((x, index) => {
        const outcome = shuffled[index];
        const pair = this.createPortalPair(world, x, topY + 560, outcome.x, outcome.y, '#a855f7', 26);
        pair.portalIn.portalIcon = '?';
        pair.portalIn.singleUse = true;
        pair.portalOut.portalColor = outcome.color;
        this.createSign(world, outcome.x, outcome.y - 45, outcome.label, outcome.color, 17);
      });
    };

    buildDoorStage(100, 1, [
      { x: 130, y: 1120, label: '⚡ 1차 급행!', color: '#22c55e' },
      { x: 400, y: 900, label: '➖ 1차 보통', color: '#38bdf8' },
      { x: 670, y: 270, label: '↩ 1차 후퇴!', color: '#f43f5e' }
    ]);

    const middleMixer = this.addSpinner(world, width / 2, 1180, 540, 20, -0.025);
    middleMixer.render.fillStyle = '#0ea5e9';
    middleMixer.render.strokeStyle = '#7dd3fc';
    spinners.push(middleMixer);

    buildDoorStage(1280, 2, [
      { x: 130, y: 2450, label: '⚡ 최종 급행!', color: '#22c55e' },
      { x: 400, y: 2200, label: '➖ 최종 보통', color: '#38bdf8' },
      { x: 670, y: 1350, label: '↩ 최종 후퇴!', color: '#f43f5e' }
    ]);

    const lowerBumpers = [
      [170, 2080], [630, 2080], [250, 2300], [550, 2300],
      [180, 2520], [620, 2520]
    ].map(([x, y]) => Bodies.circle(x, y, 22, {
      ...bumperOptions,
      render: { fillStyle: '#10b981', strokeStyle: '#6ee7b7', lineWidth: 3 }
    }));
    items.push(...lowerBumpers);
    Composite.add(world, items);

    this.createSlowZone(world, width / 2, funnelY - 570, 250, 82);
    this.createBooster(world, 160, funnelY - 430, 120, 28, 0.28, 0.0035);
    this.createBooster(world, 640, funnelY - 430, 120, 28, -0.28, 0.0035);

    // 전용 피니시: 크기가 다른 세 회전문을 통과해야 결승 깔때기에 진입한다.
    this.createSign(world, width / 2, funnelY - 390, '🔐 삼중 회전 자물쇠', '#fbbf24', 22);
    const finalLocks = [
      this.addSpinner(world, width / 2, funnelY - 300, 520, 20, 0.018),
      this.addSpinner(world, width / 2, funnelY - 190, 360, 20, -0.029),
      this.addSpinner(world, width / 2, funnelY - 85, 260, 18, 0.042)
    ];
    const lockColors = [
      ['#f59e0b', '#fde68a'],
      ['#ec4899', '#f9a8d4'],
      ['#8b5cf6', '#c4b5fd']
    ];
    finalLocks.forEach((lock, index) => {
      lock.render.fillStyle = lockColors[index][0];
      lock.render.strokeStyle = lockColors[index][1];
    });
    spinners.push(...finalLocks);

    return { spinners };
  },

  // ----------------------------------------------------
  // 맵 6: 뱀과 사다리 (Snakes & Ladders)
  // 초록 포탈은 크게 전진하고 빨간 포탈은 위로 되돌려 보냄
  // ----------------------------------------------------
  createSnakesAndLaddersMap: function(world, width, height) {
    const items = [];
    const spinners = [];
    const funnelY = height - 190;

    this.createSign(world, width / 2, 80, '🐍 뱀과 사다리 · 4단 대역전 레이스', '#f8fafc', 23);

    const portals = [
      { kind: 'ladder', icon: '↓', x: 650, y: 520, outX: 135, outY: 1130, color: '#22c55e', text: '🪜 사다리 +600' },
      { kind: 'snake', icon: '↩', x: 400, y: 850, outX: 120, outY: 340, color: '#ef4444', text: '🐍 뱀 -500' },
      { kind: 'ladder', icon: '↓', x: 150, y: 1020, outX: 650, outY: 1570, color: '#22c55e', text: '🪜 사다리 +550' },
      { kind: 'snake', icon: '↩', x: 620, y: 1450, outX: 680, outY: 900, color: '#ef4444', text: '🐍 뱀 -550' },
      { kind: 'ladder', icon: '↓', x: 650, y: 1760, outX: 130, outY: 2350, color: '#22c55e', text: '🪜 사다리 +600' },
      { kind: 'snake', icon: '↩', x: 380, y: 2070, outX: 100, outY: 1420, color: '#ef4444', text: '🐍 뱀 -650' },
      { kind: 'ladder', icon: '↓', x: 150, y: 2400, outX: 650, outY: 2920, color: '#22c55e', text: '🪜 사다리 +500' },
      { kind: 'snake', icon: '↩', x: 620, y: 2700, outX: 680, outY: 2150, color: '#ef4444', text: '🐍 뱀 -550' },
      { kind: 'final', icon: '↩', x: 400, y: funnelY - 90, outX: 680, outY: funnelY - 690, color: '#fb7185', text: '🐍 최후의 코브라 -600' }
    ];
    const portalClearPoints = portals.flatMap(portal => [
      { x: portal.x, y: portal.y },
      { x: portal.outX, y: portal.outY }
    ]);
    const rails = [
      { x: 250, y: 470, angle: 0.2 },
      { x: 550, y: 760, angle: -0.2 },
      { x: 250, y: 1250, angle: 0.2 },
      { x: 250, y: 2020, angle: 0.2 },
      { x: 550, y: 2380, angle: -0.2 },
      { x: 250, y: 2770, angle: 0.2 }
    ];
    const railYs = rails.map(rail => rail.y);

    // 열린 핀볼 격자: 구슬이 포탈을 맞거나 비껴갈 여지를 함께 준다.
    const rowGap = 105;
    const colGap = 90;
    for (let y = 180, row = 0; y < funnelY - 320; y += rowGap, row++) {
      // 레일 위·아래에 구슬 지름보다 넓은 통로를 확보해 핀 사이 끼임을 막는다.
      if (railYs.some(railY => Math.abs(y - railY) < 105)) continue;
      const startX = row % 2 === 0 ? 55 : 100;
      for (let x = startX, col = 0; x < width - 40; x += colGap, col++) {
        if (portalClearPoints.some(point => Math.hypot(x - point.x, y - point.y) < 110)) continue;
        const isBumper = (row + col) % 7 === 0;
        items.push(Bodies.circle(x, y, isBumper ? 19 : 6, {
          isStatic: true,
          label: isBumper ? 'bumper' : 'peg',
          restitution: isBumper ? 1.9 : 0.75,
          friction: 0,
          render: isBumper
            ? { fillStyle: '#f59e0b', strokeStyle: '#fde68a', lineWidth: 3 }
            : { fillStyle: '#475569' }
        }));
      }
    }

    // 대각 레일이 구슬을 포탈 쪽으로 밀었다가 다시 중앙으로 합류시킨다.
    const railOptions = {
      isStatic: true,
      restitution: 0.45,
      friction: 0,
      render: { fillStyle: '#1e3a5f', strokeStyle: '#60a5fa', lineWidth: 2 }
    };
    rails.forEach(rail => {
      items.push(Bodies.rectangle(rail.x, rail.y, 330, 14, { ...railOptions, angle: rail.angle }));
    });
    Composite.add(world, items);

    const fieldSpinners = [
      this.addSpinner(world, width / 2, 665, 460, 18, 0.026),
      this.addSpinner(world, width / 2, 1160, 500, 18, -0.029),
      this.addSpinner(world, width / 2, 1870, 520, 18, 0.024),
      this.addSpinner(world, width / 2, 2520, 480, 18, -0.031)
    ];
    fieldSpinners.forEach((spinner, index) => {
      const isLadderColor = index % 2 === 0;
      spinner.render.fillStyle = isLadderColor ? '#16a34a' : '#dc2626';
      spinner.render.strokeStyle = isLadderColor ? '#86efac' : '#fca5a5';
    });
    spinners.push(...fieldSpinners);

    portals.forEach(portal => {
      const pair = this.createPortalPair(
        world,
        portal.x,
        portal.y,
        portal.outX,
        portal.outY,
        portal.color,
        28
      );
      pair.portalIn.portalIcon = portal.icon;
      pair.portalIn.portalKind = portal.kind;
      pair.portalIn.singleUse = true;
      this.createSign(world, portal.x, portal.y - 48, portal.text, portal.color, 16);
    });

    // 사다리 진입을 돕는 가속 패드와 뱀 구간의 늪
    this.createBooster(world, 565, 450, 110, 26, 0.35, 0.0035);
    this.createBooster(world, 235, 950, 110, 26, -0.35, 0.0035);
    this.createBooster(world, 565, 1680, 110, 26, 0.35, 0.0035);
    this.createBooster(world, 235, 2320, 110, 26, -0.35, 0.0035);
    this.createSlowZone(world, width / 2, 800, 210, 62);
    this.createSlowZone(world, 620, 1395, 170, 62);
    this.createSlowZone(world, 380, 2015, 180, 62);
    this.createSlowZone(world, 620, 2645, 170, 62);

    // 전용 피니시: 중앙 코브라를 밟으면 한 번만 크게 후퇴한다.
    this.createSign(world, width / 2, funnelY - 200, '🐍 최후의 코브라 · 중앙을 피하라!', '#fb7185', 21);
    Composite.add(world, [
      Bodies.circle(270, funnelY - 150, 28, {
        isStatic: true,
        label: 'bumper',
        restitution: 2.1,
        friction: 0,
        render: { fillStyle: '#ef4444', strokeStyle: '#fecaca', lineWidth: 4 }
      }),
      Bodies.circle(530, funnelY - 150, 28, {
        isStatic: true,
        label: 'bumper',
        restitution: 2.1,
        friction: 0,
        render: { fillStyle: '#ef4444', strokeStyle: '#fecaca', lineWidth: 4 }
      })
    ]);

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
