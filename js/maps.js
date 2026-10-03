(function() {
/**
 * bbobki 구슬 룰렛 게임 - 맵 프리셋 및 기믹 정의 파일
 */

const { Bodies, Body, Composite } = Matter;

window.MarbleMaps = {
  themes: {
    pinball: { color: '#34d399', background: '#122b28', description: '움직이는 범퍼와 돌풍이 구슬을 흩어 놓는 네온 숲.', finaleTitle: '잭팟 플리퍼', finaleHint: '쌍둥이 플리퍼와 마지막 잭팟 핀을 통과하라!', finaleOffset: 700 },
    spinner: { color: '#fb7185', background: '#291d30', description: '역회전 기어와 이동 장벽 사이에서 박자를 타는 기계 계곡.', finaleTitle: '박자 게이트', finaleHint: '기어를 지나 열린 틈으로! 셔터는 다시 닫힌다.', finaleOffset: 850 },
    zigzag: { color: '#7dd3fc', background: '#142a38', description: '점프홀·맞바람·스프링을 타고 추월하는 급경사 슬라이드.', finaleTitle: '라스트 점프', finaleHint: '움직이는 착지대와 한 번만 튀는 마지막 스프링!', finaleOffset: 650 },
    vortex: { color: '#c084fc', background: '#201b36', description: '회전하는 중력장과 웜홀을 오가는 우주 궤도 레이스.', finaleTitle: '웜홀 룰렛', finaleHint: '파랑은 급행, 빨강은 후퇴. 웜홀의 운명이 바뀐다!', finaleOffset: 600 },
    'fate-doors': { color: '#fbbf24', background: '#302438', description: '세 문을 지날 때마다 급행·우회·후퇴 경로가 달라지는 운명의 성.', finaleTitle: '마지막 세 문', finaleHint: '금빛 급행 · 푸른 우회 · 붉은 후퇴, 다음 변화 전 통과!', finaleOffset: 700 },
    'snakes-ladders': { color: '#86efac', background: '#1b3024', description: '흔들리는 다리와 사다리, 움직이는 뱀을 피해 달리는 정글.', finaleTitle: '코브라의 선택', finaleHint: '움직이는 코브라를 피해 양옆 구출 사다리를 노려라!', finaleOffset: 650 }
  },
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

    Composite.add(world, boundaries);
    
    return {
      finishSensor: finishSensor,
      funnelY: funnelY,
      punches: [] // 결승 장치는 각 맵이 직접 구성한다.
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

  // 이동·진자·개폐 장애물은 같은 엔진 시간으로 움직이고 재설정 때 기준 위치로 돌아간다.
  createMovingObstacle: function(world, x, y, length, thickness, motion, color) {
    const options = {
      isStatic: true, label: 'moving_obstacle', restitution: 0.65, friction: 0, frictionStatic: 0,
      angle: motion.angle || 0,
      render: { fillStyle: color, strokeStyle: '#e2e8f0', lineWidth: 2 }
    };
    const body = motion.radius ? Bodies.circle(x, y, motion.radius, options) : Bodies.rectangle(x, y, length, thickness, options);
    body.motion = { x, y, angle: options.angle, rangeX: 0, rangeY: 0, swing: 0, period: 3000, phase: Math.random() * Math.PI * 2, ...motion };
    body.bumperPower = motion.bumperPower;
    Composite.add(world, body);
    return body;
  },

  createWindZone: function(world, x, y, width, height, strength, period = 3000) {
    const zone = Bodies.rectangle(x, y, width, height, { isStatic: true, isSensor: true, label: 'wind_zone', render: { fillStyle: 'transparent' } });
    zone.fieldStrength = strength;
    zone.fieldPeriod = period;
    zone.fieldPhase = Math.random() * Math.PI * 2;
    Composite.add(world, zone);
    return zone;
  },

  // 벽을 따라 내려가는 직통 경로를 없앤다. 막힌 벽을 추가하지 않고 중앙 장애물로 합류시킨다.
  createEdgeGuides: function(world, width, height, mapType) {
    const guideWidth = { pinball: 150, spinner: 180, zigzag: 110, vortex: 190, 'fate-doors': 160, 'snakes-ladders': 150 }[mapType] || 150;
    const strength = mapType === 'spinner' ? 0.002 : 0.0018;
    const topY = 130;
    const bottomY = height - 350; // 결승 튜브와 골인 이후 구간에는 힘을 가하지 않는다.
    const color = (this.themes[mapType] || this.themes.pinball).color;
    return [1, -1].map(direction => {
      const x = direction === 1 ? guideWidth / 2 : width - guideWidth / 2;
      const guide = this.createWindZone(world, x, (topY + bottomY) / 2, guideWidth, bottomY - topY, strength);
      guide.edgeGuide = true;
      guide.fieldDirection = direction;
      guide.guideColor = color;
      return guide;
    });
  },

  createGravityWell: function(world, x, y, radius, direction = 1) {
    const well = Bodies.circle(x, y, radius, { isStatic: true, isSensor: true, label: 'gravity_well', render: { fillStyle: 'transparent' } });
    well.fieldDirection = direction;
    well.fieldPhase = Math.random() * Math.PI * 2;
    Composite.add(world, well);
    return well;
  },

  createLaunchPad: function(world, x, y, width, angle, vx, vy) {
    const pad = Bodies.rectangle(x, y, width, 38, { isStatic: true, isSensor: true, angle, label: 'launch_pad', render: { fillStyle: 'transparent' } });
    pad.launchVelocity = { x: vx, y: vy };
    Composite.add(world, pad);
    return pad;
  },

  createCrossRotor: function(world, x, y, length, speed, color) {
    const rotor = Body.create({
      parts: [Bodies.rectangle(x, y, length, 18), Bodies.rectangle(x, y, length, 18, { angle: Math.PI / 2 })],
      isStatic: true, label: 'spinner', restitution: 0.7, friction: 0,
      render: { fillStyle: color, strokeStyle: '#e2e8f0', lineWidth: 2 }
    });
    rotor.rotationSpeed = speed;
    rotor.reversePeriod = 4600;
    Composite.add(world, rotor);
    return rotor;
  },

  createChangingPortal: function(world, x, y, destinations, period, phase = 0) {
    const pair = this.createPortalPair(world, x, y, destinations[0].x, destinations[0].y, destinations[0].color, 30);
    pair.portalIn.destinations = destinations;
    pair.portalIn.changePeriod = period;
    pair.portalIn.choicePhase = phase;
    pair.portalIn.singleUse = true;
    pair.portalIn.portalIcon = '?';
    pair.portalOut.render.visible = false;
    return pair.portalIn;
  },

  // ----------------------------------------------------
  // 맵 1: 핀볼 숲 (Pinball Forest)
  // ----------------------------------------------------
  createPinballMap: function(world, width, height) {
    const startY = 150;
    const endY = height - 950; // 마지막 플리퍼 무대는 격자와 분리한다.
    const items = [];
    const spinners = [];

    const slowZones = [
      [width / 4, height * 0.2], [3 * width / 4, height * 0.38],
      [width / 3, height * 0.57], [2 * width / 3, height * 0.76]
    ];
    // 범퍼 사이에도 구슬 두 개가 엇갈려 빠져나갈 여유를 둔다.
    const rowSpacing = 100;
    const colSpacing = 92;
    
    for (let y = startY; y < endY; y += rowSpacing) {
      const isEven = Math.round(y / rowSpacing) % 2 === 0;
      const startX = isEven ? colSpacing : colSpacing / 2;
      
      for (let x = startX; x < width - 35; x += colSpacing) {
        // 늪 안에서 핀 위에 멈춰 서는 조합 자체를 만들지 않는다.
        if (slowZones.some(([sx, sy]) => Math.abs(x - sx) < 115 && Math.abs(y - sy) < 65)) continue;
        if ([height * 0.32, height * 0.52].some(clearingY => Math.abs(y - clearingY) < 90)) continue;

        const isBumper = Math.random() < 0.14 && y > 300 && y < endY - 120;
        
        if (isBumper) {
          items.push(Bodies.circle(x, y, 18, {
            isStatic: true,
            label: 'bumper',
            restitution: 1.05,
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

    slowZones.forEach(([x, y]) => this.createSlowZone(world, x, y, 150, 64));
    this.createBooster(world, width / 2, height * 0.27, 120, 30, 0, 0.0025);
    this.createBooster(world, width / 4, height * 0.46, 100, 30, 0.3, 0.0025);
    this.createBooster(world, 3 * width / 4, height * 0.46, 100, 30, -0.3, 0.0025);
    this.createBooster(world, width / 3, height * 0.65, 120, 30, 0.2, 0.003);
    this.createBooster(world, 2 * width / 3, height * 0.82, 120, 30, -0.2, 0.003);

    [0.32, 0.52].forEach((ratio, index) => {
      const y = height * ratio;
      this.createWindZone(world, width / 2, y, 660, 115, 0.0011, 2800 + index * 650);
      this.createMovingObstacle(world, width / 2, y, 0, 0,
        { radius: 23, rangeX: 235, period: 3500 + index * 500, bumperPower: 10 }, '#34d399');
    });
    this.createSign(world, width / 2, 105, '🌿 핀볼 숲 · 돌풍과 이동 범퍼', '#6ee7b7', 21);

    const funnelY = height - 190;
    this.createSign(world, width / 2, funnelY - 690, '🎰 잭팟 플리퍼 · 끝까지 반사!', '#fbbf24', 22);
    [235, 400, 565].forEach((x, index) => {
      const bumper = Bodies.circle(x, funnelY - 535 + (index === 1 ? 60 : 0), 27, {
        isStatic: true, label: 'bumper', restitution: 1.05, friction: 0,
        render: { fillStyle: '#f59e0b', strokeStyle: '#fde68a', lineWidth: 3 }
      });
      bumper.bumperPower = 12;
      Composite.add(world, bumper);
    });
    this.createMovingObstacle(world, 235, funnelY - 275, 280, 20,
      { angle: 0.22, swing: 0.62, period: 2400 }, '#10b981');
    this.createMovingObstacle(world, 565, funnelY - 275, 280, 20,
      { angle: -0.22, swing: -0.62, period: 2750 }, '#f59e0b');
    const jackpot = this.createMovingObstacle(world, width / 2, funnelY + 180, 0, 0,
      { radius: 12, rangeX: 68, period: 2700 }, '#fbbf24');

    return { spinners, finaleDevice: jackpot };
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

    // 회전 팔의 반경만큼 여유를 두어 연속 회전벽 사이에 갇히지 않게 한다.
    const gearYs = [height * 0.3, height * 0.65];
    for (let y = 150; y <= height - 1100; y += 180) {
      if (gearYs.some(gearY => Math.abs(y - gearY) < 250) || Math.abs(y - height / 2) < 350) continue;

      // 일반 층마다 2~3개의 스피너 생성
      const numSpinners = Math.floor(Math.random() * 2) + 2;
      const spacing = width / numSpinners;
      
      for (let i = 0; i < numSpinners; i++) {
        // 중심축은 벽 안쪽에 두고 좌우 배치를 조금씩 바꾼다.
        const cx = (spacing / 2) + i * spacing + (Math.random() - 0.5) * 70;
        
        // 팔 길이 115~210px: 옆 회전 팔과 구슬이 통과할 간격을 남긴다.
        const length = 115 + Math.random() * 95;
        const thickness = 10 + Math.random() * 8;
        
        // 다양한 회전 속도 (0.018 ~ 0.047)
        let speed = 0.018 + Math.random() * 0.029;
        
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

    spinners.push(this.createCrossRotor(world, width / 2, height / 2, 470, 0.024, '#f59e0b'));
    gearYs.forEach((y, index) => {
      spinners.push(this.createCrossRotor(world, 235, y, 230, 0.033, '#8b5cf6'));
      spinners.push(this.createCrossRotor(world, 565, y, 230, -0.031, '#f43f5e'));
      this.createWindZone(world, width / 2, y + 160, 600, 70, 0.001, 3200 + index * 500);
    });
    this.createSign(world, width / 2, 85, '⚙️ 스피너 밸리 · 역회전 기어', '#fda4af', 21);
    const funnelY = height - 190;
    this.createSign(world, width / 2, funnelY - 830, '⏱️ 박자 게이트 · 열린 순간을 노려라!', '#fb7185', 22);
    spinners.push(this.createCrossRotor(world, 245, funnelY - 650, 245, 0.028, '#ec4899'));
    spinners.push(this.createCrossRotor(world, 555, funnelY - 650, 245, -0.028, '#8b5cf6'));
    const phase = Math.random() * Math.PI * 2;
    this.createMovingObstacle(world, 195, funnelY - 330, 390, 18,
      { angle: 0.22, rangeX: -100, pulse: true, period: 3400, phase }, '#f43f5e');
    this.createMovingObstacle(world, 605, funnelY - 330, 390, 18,
      { angle: -0.22, rangeX: 100, pulse: true, period: 3400, phase }, '#8b5cf6');
    const shutter = this.createMovingObstacle(world, width / 2, funnelY + 185, 50, 12,
      { rangeX: 88, period: 3100 }, '#fb7185');
    return { spinners, finaleDevice: shutter };
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
      y: 210 + index * (height - 775) / (angles.length - 1),
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
        const spring = pointOnSlide(slide, -direction * (gap / 2 + 55), 27);
        this.createLaunchPad(world, spring.x, spring.y, 76, slide.angle, direction * 11, -6);
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
      if (index === 3 || index === 7) {
        this.createWindZone(world, width / 2, slide.y + 145, 630, 66, 0.0012, 3000);
      }
    });

    Composite.add(world, items);

    this.createSign(world, width / 2, 105, '급경사 10단 · 점프홀에서 순위가 뒤집힌다!', '#7dd3fc', 20);

    const funnelY = height - 190;
    this.createSign(world, width / 2, funnelY - 230, '🏄 라스트 점프 · 착지대가 움직인다!', '#7dd3fc', 20);
    [-1, 1].forEach(side => {
      const x = width / 2 + side * 200;
      const angle = -side * 0.3;
      Composite.add(world, Bodies.rectangle(x, funnelY - 155, 245, 14, {
        isStatic: true, angle, friction: 0, restitution: 0.25,
        render: { fillStyle: '#0369a1', strokeStyle: '#7dd3fc', lineWidth: 2 }
      }));
      this.createLaunchPad(world, x - side * 80, funnelY - 158, 78, angle, -side * 9, -6);
    });
    const landing = this.createMovingObstacle(world, width / 2, funnelY - 55, 165, 16,
      { rangeX: 170, period: 3300, swing: 0.1 }, '#0ea5e9');
    this.createLaunchPad(world, width / 2, funnelY + 155, 46, 0, 0, -7);
    return { spinners, finaleDevice: landing };
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

    // 겹친 원형 벽 대신 입구·배수구가 열린 4단 소용돌이. 옆 소용돌이와도 겹치지 않는다.
    const stages = [
      { y: height * 0.172, xs: [width / 2], radius: 245 },
      { y: height * 0.367, xs: [205, width - 205], radius: 155 },
      { y: height * 0.567, xs: [width / 2], radius: 250 },
      { y: height * 0.761, xs: [205, width - 205], radius: 155 }
    ];
    stages.forEach((stage, index) => {
      stage.xs.forEach((x, lane) => {
        this.buildVortexFunnel(items, x, stage.y, stage.radius);
        this.createGravityWell(world, x, stage.y + 20, stage.radius * 0.67, (index + lane) % 2 ? -1 : 1);
        const spinner = this.addSpinner(world, x, stage.y, stage.radius * 1.05, 12,
          (index + lane) % 2 ? -0.026 : 0.026);
        spinner.render.fillStyle = '#6d28d9';
        spinners.push(spinner);

        const next = stages[index + 1];
        const outX = next ? next.xs[lane % next.xs.length] : (lane ? 550 : 250);
        const outY = next ? next.y - next.radius - 65 : height - 520;
        // 가장 아래로 모이는 지점에 포탈을 두고, 놓쳐도 열린 바닥으로 계속 내려간다.
        const pair = this.createPortalPair(world, x, stage.y + stage.radius - 28,
          outX, outY, index % 2 ? '#c084fc' : '#38bdf8', 24);
        pair.portalIn.singleUse = true;
        pair.portalIn.portalIcon = '↓';
      });
    });
    Composite.add(world, items);
    this.createSign(world, width / 2, 85, '🌌 4단 블랙홀 · 궤도를 타고 탈출!', '#c4b5fd', 20);
    this.createSlowZone(world, width / 2, 390, 180, 48);
    this.createBooster(world, width / 2, 470, 100, 30, 0, 0.002);
    const funnelY = height - 190;
    this.createSign(world, width / 2, funnelY - 580, '🌀 웜홀 룰렛 · 파랑 급행 / 빨강 후퇴', '#c4b5fd', 20);
    this.createGravityWell(world, width / 2, funnelY - 285, 185, -1);
    [0, Math.PI].forEach(phase => {
      this.createMovingObstacle(world, width / 2, funnelY - 285, 0, 0,
        { radius: 19, rangeX: 145, rangeY: 65, phaseY: Math.PI / 2, phase, period: 3400, bumperPower: 7 }, '#a78bfa');
    });
    const destinations = [
      { x: width / 2, y: funnelY + 150, color: '#38bdf8', caption: '급행 ↓' },
      { x: width / 2, y: funnelY - 520, color: '#fb7185', caption: '후퇴 ↩' }
    ];
    const leftWormhole = this.createChangingPortal(world, 285, funnelY - 135, destinations.map(dest => ({ ...dest })), 2900);
    leftWormhole.statusName = '왼쪽 웜홀';
    this.createChangingPortal(world, 515, funnelY - 135, destinations.map(dest => ({ ...dest })), 2900, 1);
    return { spinners, finaleDevice: leftWormhole };
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

    this.createSign(world, width / 2, funnelY - 395, '🔮 마지막 세 문 · 운명이 다시 바뀐다!', '#fbbf24', 21);
    const destinations = [
      { x: width / 2, y: funnelY + 160, color: '#fbbf24', caption: '급행 ↓' },
      { x: 620, y: funnelY - 60, color: '#38bdf8', caption: '우회 →' },
      { x: 400, y: funnelY - 620, color: '#fb7185', caption: '후퇴 ↩' }
    ];
    const shift = Math.floor(Math.random() * 3);
    const finalDoors = laneXs.map((x, index) => {
      this.createMovingObstacle(world, x, funnelY - 265, 170, 16,
        { swing: 0.7, period: 2700 + index * 250 }, '#7c3aed');
      return this.createChangingPortal(world, x, funnelY - 165,
        destinations.map(dest => ({ ...dest })), 3200, (index + shift) % 3);
    });
    finalDoors[1].statusName = '가운데 문';
    return { spinners, finaleDevice: finalDoors[1] };
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
    rails.forEach((rail, index) => {
      if (index >= 4) {
        this.createMovingObstacle(world, rail.x, rail.y, 330, 14,
          { angle: rail.angle, swing: 0.2, period: 3400 + index * 220 }, '#16a34a');
      } else {
        items.push(Bodies.rectangle(rail.x, rail.y, 330, 14, { ...railOptions, angle: rail.angle }));
      }
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

    let cobra;
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
      if (portal.kind === 'final') {
        cobra = pair.portalIn;
        cobra.motion = { x: portal.x, y: portal.y, angle: 0, rangeX: 165, rangeY: 0, swing: 0, period: 4200, phase: Math.random() * Math.PI * 2 };
        cobra.pulsePeriod = 3600;
        cobra.openDuration = 1900;
        cobra.pulsePhase = Math.random() * 3600;
        cobra.portalCaption = '코브라 ↩';
      }
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
    this.createWindZone(world, width / 2, 1640, 620, 65, 0.0009, 3300);
    this.createLaunchPad(world, 130, 2420, 95, 0, 5, 8);

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
    this.createMovingObstacle(world, width / 2, funnelY - 340, 460, 18,
      { swing: 0.35, period: 3000 }, '#16a34a');
    [155, width - 155].forEach((x, index) => {
      const pair = this.createPortalPair(world, x, funnelY - 100, width / 2, funnelY + 190, '#4ade80', 25);
      pair.portalIn.singleUse = true;
      pair.portalIn.portalIcon = '↓';
      pair.portalIn.portalCaption = '구출 사다리';
      pair.portalIn.pulsePeriod = 3600;
      pair.portalIn.openDuration = 2300;
      pair.portalIn.pulsePhase = index * 1800;
    });
    return { spinners, finaleDevice: cobra };
  },

  // 소용돌이 조립
  buildVortexFunnel: function(items, centerX, centerY, radius) {
    const segments = 30;
    const thickness = 10;
    const segmentLength = 2 * radius * Math.sin(Math.PI / segments) + 2;

    for (let i = 0; i < segments; i++) {
      const angle = ((i + 0.5) / segments) * Math.PI * 2;
      // 위쪽은 넓은 진입구, 아래쪽은 구슬 여러 개가 통과할 배수구로 연다.
      if ((angle > Math.PI * 0.34 && angle < Math.PI * 0.66) ||
          (angle > Math.PI * 1.12 && angle < Math.PI * 1.88)) {
        continue;
      }

      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      items.push(Bodies.rectangle(x, y, segmentLength, thickness, {
        isStatic: true,
        label: 'vortex_wall',
        angle: angle + Math.PI / 2,
        restitution: 0.35,
        friction: 0,
        frictionStatic: 0,
        render: { fillStyle: '#312e81', strokeStyle: '#818cf8', lineWidth: 2 }
      }));
    }
  }
};
})();
