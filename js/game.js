(function() {
/**
 * bbobki 구슬 룰렛 게임 - 물리 시뮬레이션 및 커스텀 렌더러
 */

const { Engine, World, Runner, Bodies, Body, Composite, Events, Vector } = Matter;

window.MarbleGame = {
  // 엔진 및 실행 환경 상태
  engine: null,
  runner: null,
  world: null,
  canvas: null,
  ctx: null,
  
  // 게임 크기 규격
  width: 800,
  height: 1800,
  viewportHeight: 900,
  
  // 상태 변수
  marbles: [],         // 현재 게임의 구슬 객체 목록
  spinners: [],        // 맵 내 회전 스피너 바디 목록
  particles: [],       // 충돌/장풍/포탈 파티클 이펙트 목록
  finishedMarbles: [], // 골인 지점을 통과 완료한 구슬 목록
  
  // 카메라 뷰포트 Y축 좌표 (부드러운 추적용)
  viewportY: 0,
  cameraTarget: null,
  cameraMode: 'auto',
  manualCameraY: 450,
  
  // 센서 정보
  finishSensor: null,
  funnelY: 1610,
  
  // 설정 및 제어 플래그
  isPaused: false,
  gameSpeed: 1,        // 배속 (1, 1.5, 2, 3)
  enableSkills: true,  // 장풍 스킬 온/오프
  
  // 당첨 순위 설정: 카메라가 이 순위의 구슬을 실시간으로 추적
  winnerRankMode: 'first', // 'first' | 'last' | 'custom'
  winnerRankNumber: 1,     // custom 모드일 때 사용할 등수
  
  // 줌인 및 슬로우 모션 제어
  cameraZoom: 1.0,
  targetZoom: 1.0,
  zoomFocusX: 400,
  zoomFocusY: 450,
  slowMoFactor: 1.0,
  isTargetAnnounced: false,

  // 외부 콜백
  onRankUpdate: null,
  onGameFinished: null,
  onMarbleFinished: null,
  onTargetFinished: null,

  // 초기화 함수
  init: function(containerId, onRankUpdate, onMarbleFinished, onGameFinished, onTargetFinished) {
    this.onRankUpdate = onRankUpdate;
    this.onMarbleFinished = onMarbleFinished;
    this.onGameFinished = onGameFinished;
    this.onTargetFinished = onTargetFinished;

    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    // Canvas 생성
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.viewportHeight;
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    // Matter.js 엔진 초기화
    this.engine = Engine.create({
      gravity: { y: 0.9, x: 0 }
    });
    this.world = this.engine.world;

    // 물리 엔진 충돌 이벤트 감지 (고무줄/트램폴린 튕김 처리)
    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      event.pairs.forEach(pair => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        if ((bodyA.label === 'punch' && bodyB.label === 'marble') ||
            (bodyB.label === 'punch' && bodyA.label === 'marble') ||
            (bodyA.label === 'bumper' && bodyB.label === 'marble') ||
            (bodyB.label === 'bumper' && bodyA.label === 'marble')) {
          
          const marble = bodyA.label === 'marble' ? bodyA : bodyB;
          const obstacle = bodyA.label === 'marble' ? bodyB : bodyA;
          const now = this.engine.timing.timestamp;
          // 같은 범퍼가 에너지를 계속 보충해 제자리 왕복하는 현상을 막는다.
          if (this.currentMapType === 'pinball' && obstacle.label === 'bumper') {
            const hits = marble.marbleRef.bumperHits;
            if (now - (hits.get(obstacle.id) ?? -Infinity) < 1000) return;
            hits.set(obstacle.id, now);
          }
          
          // 장애물의 중심에서 구슬을 밀어내는 방향 계산
          let vx = (Math.random() - 0.5) * 8; // 좌우 분산
          let vy = -20; // 기본적으로 강하게 위로 튕김
          
          // 범퍼일 경우 위치 기반으로 튕겨냄
          if (obstacle.label === 'bumper') {
            const dx = marble.position.x - obstacle.position.x;
            const dy = marble.position.y - obstacle.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const impulse = this.currentMapType === 'pinball' ? 9 : 15;
            vx = (dx / dist) * impulse;
            vy = (dy / dist) * impulse - (this.currentMapType === 'pinball' ? 1 : 5);
          }

          Body.setVelocity(marble, { x: vx, y: vy });
        }
      });
    });

    this.isPaused = true;
    this.marbles = [];
    this.spinners = [];
    this.punches = [];
    this.particles = [];
    this.finishedMarbles = [];
    this.viewportY = 0;
    this.cameraTarget = null;

    this.setupCollisionEvents();
    window.MarbleOverview.init(this);
    // 커스텀 루프 시작
    this.startLoop();
  },

  // 맵 로드 및 물리 경계 구축
  loadMap: function(mapType) {
    this.currentMapType = mapType;
    this.setSpeed(1.0);
    this.slowMoFactor = 1.0;
    this.isTargetAnnounced = false;
    
    const mapHeights = {
      pinball: 3200,
      vortex: 3600,
      spinner: 4200,
      zigzag: 3400,
      'fate-doors': 3800,
      'snakes-ladders': 4000
    };
    this.height = mapHeights[mapType] || 1800;

    World.clear(this.world, false);
    Engine.clear(this.engine);
    this.spinners = [];
    this.punches = [];
    this.particles = [];
    this.finishedMarbles = [];
    this.viewportY = 0;
    this.cameraTarget = null;
    this.resumeCameraTracking();
    this.cameraZoom = this.targetZoom = 1;
    this.zoomFocusX = this.width / 2;
    this.zoomFocusY = this.viewportHeight / 2;

    // 공통 바운더리 생성
    const common = window.MarbleMaps.createCommonBoundaries(this.world, this.width, this.height);
    this.finishSensor = common.finishSensor;
    this.funnelY = common.funnelY;

    // 신규 장거리 맵은 각자의 전용 피니시 기믹을 사용한다.
    if (mapType === 'fate-doors' || mapType === 'snakes-ladders') {
      common.punches.forEach(punch => Composite.remove(this.world, punch));
      common.punches = [];
    }

    // 프리셋 맵 로드
    const boundaryIds = new Set(Composite.allBodies(this.world).map(body => body.id));
    let mapData;
    if (mapType === 'pinball') {
      mapData = window.MarbleMaps.createPinballMap(this.world, this.width, this.height);
    } else if (mapType === 'spinner') {
      mapData = window.MarbleMaps.createSpinnerMap(this.world, this.width, this.height);
    } else if (mapType === 'zigzag') {
      mapData = window.MarbleMaps.createZigzagMap(this.world, this.width, this.height);
    } else if (mapType === 'vortex') {
      mapData = window.MarbleMaps.createVortexMap(this.world, this.width, this.height);
    } else if (mapType === 'fate-doors') {
      mapData = window.MarbleMaps.createFateDoorsMap(this.world, this.width, 3200);
    } else if (mapType === 'snakes-ladders') {
      mapData = window.MarbleMaps.createSnakesAndLaddersMap(this.world, this.width, 3400);
    }

    // 수작업 관문은 간격을 늘리고, 결승 전 700px는 그대로 이동해 마지막 함정 위치를 유지한다.
    const layoutHeight = { 'fate-doors': 3200, 'snakes-ladders': 3400 }[mapType];
    if (layoutHeight) {
      const pivotY = layoutHeight - 890;
      const extra = this.height - layoutHeight;
      const stretchY = y => y < 100 ? y : y + extra * Math.min(1, (y - 100) / (pivotY - 100));
      Composite.allBodies(this.world).filter(body => !boundaryIds.has(body.id)).forEach(body => {
        Body.setPosition(body, { x: body.position.x, y: stretchY(body.position.y) });
        if (body.targetPos) body.targetPos.y = stretchY(body.targetPos.y);
      });
    }

    if (mapData && mapData.spinners) {
      this.spinners = mapData.spinners;
    }

    this.punches = common.punches || [];

  },

  // 구슬들 세팅 및 스폰
  setupMarbles: function(marbleConfigs) {
    this.marbles.forEach(m => World.remove(this.world, m.body));
    this.marbles = [];
    this.finishedMarbles = [];
    this.viewportY = 0;
    this.resumeCameraTracking();

    const spacing = Math.min(600 / (marbleConfigs.length + 1), 40);
    const startY = 40;

    marbleConfigs.forEach((config, idx) => {
      const offsetX = (idx % 2 === 0 ? 1 : -1) * (Math.floor(idx / 2) * spacing);
      const x = this.width / 2 + offsetX + (Math.random() - 0.5) * 5;
      const y = startY + Math.floor(idx / 8) * 30 + (Math.random() - 0.5) * 5;

      const radius = 16; // 구슬 크기 키움 (기존 12)
      const body = Bodies.circle(x, y, radius, {
        restitution: 0.9,   // 모든 맵에서 통통 튀는 움직임 강화
        friction: 0.0,
        density: 0.0005,    // 질량 가벼워짐 (기존 0.001)
        label: 'marble',
        collisionFilter: { group: 0 }
      });

      const marble = {
        id: config.id,
        name: config.name,
        color: config.color,
        body: body,
        trail: [],
        maxTrailLength: 15,
        skillCooldown: 2000 + Math.random() * 3000,
        nextSkillTime: this.engine.timing.timestamp + 2000 + Math.random() * 2000,
        skillActiveTime: 0,
        portalCooldownTime: 0,
        usedPortals: new Set(),
        bumperHits: new Map(),
        progressY: y,
        progressAt: this.engine.timing.timestamp,
        lastNudgeAt: this.engine.timing.timestamp,
        recoveryCount: 0,
        isFinished: false,
        finishTime: null
      };

      body.marbleRef = marble;
      this.marbles.push(marble);
      World.add(this.world, body);
    });

    this.updateCameraTarget();
  },

  // 충돌 감지 바인딩
  setupCollisionEvents: function() {
    Events.on(this.engine, 'collisionStart', (event) => {
      event.pairs.forEach(pair => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // 결승 센서 통과 감지
        if (bodyA === this.finishSensor || bodyB === this.finishSensor) {
          const marbleBody = bodyA === this.finishSensor ? bodyB : bodyA;
          if (marbleBody.label === 'marble' && marbleBody.marbleRef) {
            this.handleMarbleFinish(marbleBody.marbleRef);
          }
        }

        // 범퍼 충돌
        if (bodyA.label === 'bumper' || bodyB.label === 'bumper') {
          const marbleBody = bodyA.label === 'bumper' ? bodyB : bodyA;
          if (marbleBody.label === 'marble') {
            this.createBumperParticles(marbleBody.position.x, marbleBody.position.y, '#10b981');
          }
        }
      });
    });
  },

  // 구슬 골인 처리
  handleMarbleFinish: function(marble) {
    if (marble.isFinished) return;

    marble.isFinished = true;
    marble.finishTime = Date.now();
    
    marble.body.collisionFilter.mask = 0; // 완료 구슬은 다른 물리 방해 안 받게 통과 마스크 제거
    Body.setVelocity(marble.body, { x: 0, y: 1.5 });

    this.finishedMarbles.push(marble);

    this.updateCameraTarget();

    if (this.onMarbleFinished) {
      this.onMarbleFinished(marble, this.finishedMarbles.length);
    }

    // 당첨자 모달 즉시 호출 로직
    let targetRank = 1;
    if (this.winnerRankMode === 'first') targetRank = 1;
    else if (this.winnerRankMode === 'last') targetRank = this.marbles.length;
    else targetRank = this.winnerRankNumber;

    const currentRank = this.finishedMarbles.length;
    if (currentRank === targetRank && !this.isTargetAnnounced) {
      this.isTargetAnnounced = true;
      if (this.onTargetFinished) {
        this.onTargetFinished(marble, currentRank);
      }
      this.setSpeed(3.0); // 나머지 게임 3배속으로 빠르게 마무리
    }

    const activeMarblesCount = this.marbles.filter(m => !m.isFinished).length;
    if (activeMarblesCount === 0 || this.finishedMarbles.length >= this.marbles.length) {
      this.finishGame();
    }
  },

  // 당첨 순위 기반 카메라 타겟 설정
  // 실시간 순위에서 당첨 순위에 해당하는 구슬을 카메라가 추적
  updateCameraTarget: function() {
    const pendingMarbles = this.marbles.filter(m => !m.isFinished);
    
    if (pendingMarbles.length === 0) {
      this.cameraTarget = null;
      return;
    }

    // 현재 실시간 순위 계산 (골인한 구슬 + 아직 달리는 구슬 순)
    const rankings = this.getCurrentRankings();
    
    // 당첨 순위 결정
    let targetRank;
    if (this.winnerRankMode === 'first') {
      targetRank = 1;
    } else if (this.winnerRankMode === 'last') {
      targetRank = this.marbles.length;
    } else {
      targetRank = Math.min(this.winnerRankNumber, this.marbles.length);
    }

    // 해당 순위(1-indexed)의 구슬을 추적
    const targetIndex = targetRank - 1;
    if (targetIndex >= 0 && targetIndex < rankings.length) {
      const targetMarble = rankings[targetIndex];
      // 이미 골인한 구슬이면 카메라를 다음 아직 달리는 구슬 중 선두로
      if (targetMarble.isFinished && pendingMarbles.length > 0) {
        pendingMarbles.sort((a, b) => b.body.position.y - a.body.position.y);
        this.cameraTarget = pendingMarbles[0];
      } else {
        this.cameraTarget = targetMarble;
      }
    } else {
      pendingMarbles.sort((a, b) => b.body.position.y - a.body.position.y);
      this.cameraTarget = pendingMarbles[0];
    }
  },

  // 게임 시작
  start: function() {
    if (this.marbles.length === 0) return;
    this.isPaused = false;
  },

  // 게임 일시정지
  pause: function() {
    this.isPaused = true;
  },

  // 게임 리셋 (맵 재생성 + 랜덤 셔플)
  reset: function() {
    this.isPaused = true;
    this.finishedMarbles = [];
    this.particles = [];
    this.viewportY = 0;
    this.cameraTarget = null;
    this.cameraZoom = 1.0;
    this.targetZoom = 1.0;
    this.zoomFocusX = this.width / 2;
    this.zoomFocusY = this.viewportHeight / 2;
    // 맵 재생성 (핀볼 숲 등의 장애물 랜덤성 다시 부여)
    this.loadMap(this.currentMapType);

    const spacing = Math.min(600 / (this.marbles.length + 1), 40);
    const startY = 40;

    // 위치 무작위 셔플을 위한 인덱스 배열 섞기
    const shuffledIndices = Array.from(this.marbles.keys());
    for (let i = shuffledIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
    }

    this.marbles.forEach((marble, idx) => {
      const targetIdx = shuffledIndices[idx];
      const offsetX = (targetIdx % 2 === 0 ? 1 : -1) * (Math.floor(targetIdx / 2) * spacing);
      const x = this.width / 2 + offsetX + (Math.random() - 0.5) * 5;
      const y = startY + Math.floor(targetIdx / 8) * 30 + (Math.random() - 0.5) * 5;

      marble.isFinished = false;
      marble.finishTime = null;
      marble.trail = [];
      marble.portalCooldownTime = 0;
      marble.usedPortals.clear();
      marble.bumperHits.clear();
      marble.progressY = y;
      marble.progressAt = marble.lastNudgeAt = this.engine.timing.timestamp;
      marble.recoveryCount = 0;
      marble.body.collisionFilter.mask = 0xFFFFFFFF;
      
      Body.setPosition(marble.body, { x: x, y: y });
      Body.setVelocity(marble.body, { x: 0, y: 0 });
      Body.setAngularVelocity(marble.body, 0);
      Body.setAngle(marble.body, 0);

      marble.nextSkillTime = this.engine.timing.timestamp + 2000 + Math.random() * 2000;
      marble.skillActiveTime = 0;

      // loadMap 과정에서 월드가 초기화되었으므로 구슬을 다시 추가
      Composite.add(this.world, marble.body);
    });

    this.updateCameraTarget();
    if (this.onRankUpdate) {
      this.onRankUpdate(this.getCurrentRankings());
    }
  },



  // 게임 완전 종료
  finishGame: function() {
    this.isPaused = true;
    if (this.onGameFinished) {
      this.onGameFinished(this.finishedMarbles);
    }
  },

  // 배속 설정
  setSpeed: function(speed) {
    this.gameSpeed = parseFloat(speed);
  },

  // ----------------------------------------------------
  // 물리 갱신 및 시뮬레이션 제어 루프
  // ----------------------------------------------------
  startLoop: function() {
    let lastTime = performance.now();
    
    const loop = (time) => {
      requestAnimationFrame(loop);
      
      if (!this.isPaused) {
        const dt = Math.min(Math.max(time - lastTime, 0), 50) || 16.666;
        
        // 슬로우 모션 적용 (slowMoFactor)
        const currentSpeed = this.gameSpeed * this.slowMoFactor;
        const steps = Math.max(1, Math.ceil(dt * currentSpeed / 16.666));
        const stepSize = dt * currentSpeed / steps;
        
        for (let i = 0; i < steps; i++) {
          this.stepPhysics(stepSize);
          if (this.isPaused) break;
        }
      }

      lastTime = time;

      this.updateCameraViewport();
      this.render();
    };

    requestAnimationFrame(loop);
  },

  // 본 경기와 회귀 검증이 같은 물리 경로를 사용한다. 시간은 배속·슬로모션을 반영한 엔진 시간이다.
  stepPhysics: function(delta) {
    this.updateSpinners(delta);
    this.updatePunches();
    this.processMapGimmicks(delta);
    this.applyJitterToFunnels();
    if (this.enableSkills) this.processSkills();
    Engine.update(this.engine, delta);
    this.recoverStalledMarbles();
  },

  updateSpinners: function(delta = 16.666) {
    this.spinners.forEach(spinner => {
      const nextAngle = spinner.angle + spinner.rotationSpeed * delta / 16.666;
      Body.setAngle(spinner, nextAngle);
    });
  },

  updatePunches: function() {
    const time = this.engine.timing.timestamp;
    this.punches.forEach(punch => {
      const offset = Math.sin(time * punch.offsetSpeed) * 160 * punch.direction;
      Body.setPosition(punch, { x: punch.startX + offset, y: punch.position.y });
    });
  },

  // 창의적 기믹(포탈, 가속 패드, 감속 늪) 실시간 물리 처리
  processMapGimmicks: function(delta = 16.666) {
    const bodies = Composite.allBodies(this.world);
    const now = this.engine.timing.timestamp;

    const portals = bodies.filter(b => b.label === 'portal_in');
    const boosters = bodies.filter(b => b.label === 'booster');
    const slowZones = bodies.filter(b => b.label === 'slow_zone');

    this.marbles.forEach(marble => {
      if (marble.isFinished) return;

      const body = marble.body;
      const pos = body.position;

      // 1. 순간이동 포탈 감지
      if (now > marble.portalCooldownTime) {
        for (let portal of portals) {
          if (portal.singleUse && marble.usedPortals.has(portal.portalId)) continue;
          const dist = Vector.magnitude(Vector.sub(portal.position, pos));
          if (dist < (portal.triggerRadius || 30)) {
            this.triggerPortalTransfer(marble, portal, now);
            break;
          }
        }
      }

      // 2. 가속 패드 (Booster) 감지
      for (let booster of boosters) {
        if (this.isPointInRectangle(pos, booster)) {
          Body.applyForce(body, pos, Vector.mult(booster.forceVector, 0.2 * body.mass));
          
          if (Math.random() < 0.2) {
            this.particles.push({
              x: pos.x, y: pos.y,
              vx: (Math.random() - 0.5) * 1, vy: (Math.random() - 0.5) * 1,
              radius: 1.5 + Math.random() * 2, color: '#10b981',
              alpha: 0.8, decay: 0.05, type: 'sparkle'
            });
          }
        }
      }

      // 3. 감속 영역 (Slow Zone) 감지
      for (let slowZone of slowZones) {
        if (this.isPointInRectangle(pos, slowZone)) {
          Body.setVelocity(body, {
            x: body.velocity.x * Math.pow(0.90, delta / 16.666),
            y: Math.max(1.2, body.velocity.y * Math.pow(0.90, delta / 16.666))
          });

          if (Math.random() < 0.1) {
            this.particles.push({
              x: pos.x + (Math.random() - 0.5) * 20,
              y: pos.y + (Math.random() - 0.5) * 20,
              vx: 0, vy: -0.3,
              radius: 2 + Math.random() * 2, color: '#eab308',
              alpha: 0.6, decay: 0.03, type: 'wave'
            });
          }
        }
      }
    });
  },

  // 포탈 순간이동 상세 연산
  triggerPortalTransfer: function(marble, portal, now) {
    const body = marble.body;
    const target = portal.targetPos;

    marble.portalCooldownTime = now + 2200;
    if (portal.singleUse) marble.usedPortals.add(portal.portalId);

    this.createPortalFlashParticles(body.position.x, body.position.y, portal.portalColor);
    Body.setPosition(body, { x: target.x, y: target.y });
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.5, y: 3.5 });
    marble.progressY = target.y;
    marble.progressAt = marble.lastNudgeAt = now;
    marble.trail = [];
    this.createPortalFlashParticles(target.x, target.y, '#f97316');
  },

  isPointInRectangle: function(point, rect) {
    return Matter.Vertices.contains(rect.vertices, point);
  },

  // 정지뿐 아니라 같은 높이에서 반복해서 튀는 경우도 감지한다. 모든 구슬에 같은 기준을 적용한다.
  recoverStalledMarbles: function() {
    const now = this.engine.timing.timestamp;
    let obstacles;
    this.marbles.forEach(marble => {
      if (marble.isFinished) return;
      const body = marble.body;
      const pos = body.position;
      if (pos.y > marble.progressY + 60) {
        marble.progressY = pos.y;
        marble.progressAt = now;
      }
      const stalledFor = now - marble.progressAt;
      if (stalledFor < 4000) return;

      if (stalledFor >= 10000) {
        obstacles ||= Composite.allBodies(this.world).filter(obstacle => !obstacle.isSensor);
        // 결승 센서를 건너뛰지 않고, 실제로 구슬 하나가 들어갈 빈 공간만 찾는다.
        const radius = body.circleRadius + 3;
        const probe = Bodies.circle(0, 0, radius);
        const finishY = this.finishSensor.position.y;
        const startY = Math.min(Math.max(pos.y, marble.progressY) + 70, finishY - 80);
        const offsets = [0, -48, 48, -100, 100, -180, 180, -300, 300];
        const side = Math.random() < 0.5 ? -1 : 1;
        for (let y = startY; y <= Math.min(startY + 440, finishY - 40); y += 35) {
          const inFinishTube = y > this.funnelY + 110;
          for (const offset of inFinishTube ? [0] : offsets) {
            const x = inFinishTube ? this.width / 2 : Math.max(radius + 2, Math.min(this.width - radius - 2, pos.x + offset * side));
            Body.setPosition(probe, { x, y });
            if (Matter.Query.collides(probe, obstacles.filter(other => other !== body)).length) continue;
            this.createPortalFlashParticles(pos.x, pos.y, '#7dd3fc');
            Body.setPosition(body, { x, y });
            Body.setVelocity(body, { x: side * 1.5, y: 3 });
            marble.progressY = y;
            marble.progressAt = marble.lastNudgeAt = now;
            marble.recoveryCount++;
            marble.trail = [];
            return;
          }
        }
      }
      if (now - marble.lastNudgeAt >= 1800) {
        Body.setVelocity(body, { x: (Math.random() < 0.5 ? -1 : 1) * 3.5, y: -4 });
        marble.lastNudgeAt = now;
        this.createWindWaveParticles(pos.x, pos.y, '#7dd3fc');
      }
    });
  },

  // 결승 통로 교착 상태 해소용 Jitter 쉐이킹
  applyJitterToFunnels: function() {
    this.marbles.forEach(marble => {
      if (marble.isFinished) return;

      const body = marble.body;
      const pos = body.position;

      const finishY = this.finishSensor ? this.finishSensor.position.y : this.funnelY + 300;
      if (pos.y > finishY + 80) {
        Body.setPosition(body, { x: this.width / 2 + (Math.random() - 0.5) * 40, y: this.funnelY - 120 });
        Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: 3.5 });
        return;
      }

      if (pos.y > this.funnelY - 180 && pos.y < finishY + 20) {
        const speed = Vector.magnitude(body.velocity);
        if (pos.y > this.funnelY + 70) {
          Body.applyForce(body, pos, { x: 0, y: 0.0012 * body.mass });
        }
        if (speed < 0.25) {
          Body.applyForce(body, pos, {
            x: (Math.random() - 0.5) * 0.00075 * body.mass,
            y: 0.0008 * body.mass
          });
        }
      }
    });
  },

  // 장풍 스킬 처리
  processSkills: function() {
    const now = this.engine.timing.timestamp;

    this.marbles.forEach(marble => {
      if (marble.isFinished) return;

      if (now >= marble.nextSkillTime) {
        if (marble.body.position.y > this.funnelY - 40) return;

        this.castWindSkill(marble);
        marble.nextSkillTime = now + (4000 + Math.random() * 3000);
      }
    });
  },

  // 장풍 시전 - 다른 구슬 + 근처 장애물에도 영향
  castWindSkill: function(marble) {
    const body = marble.body;
    const radius = 125;
    const baseForce = 0.0028;
    
    marble.skillActiveTime = 15;

    this.createWindWaveParticles(body.position.x, body.position.y, marble.color);

    // 1. 다른 구슬 밀어내기
    this.marbles.forEach(other => {
      if (other === marble || other.isFinished) return;

      const otherBody = other.body;
      const distVector = Vector.sub(otherBody.position, body.position);
      const dist = Vector.magnitude(distVector);

      if (dist < radius && dist > 1) {
        const forceMagnitude = (1 - dist / radius) * baseForce * otherBody.mass;
        const forceDirection = Vector.normalise(distVector);
        const force = Vector.mult(forceDirection, forceMagnitude);

        Body.applyForce(otherBody, otherBody.position, force);
      }
    });

    // 2. 근처 장애물(펙, 범퍼 등 static body) 및 벽체 처리
    const allBodies = Composite.allBodies(this.world);
    allBodies.forEach(staticBody => {
      if (!staticBody.isStatic) return;
      if (staticBody.isSensor) return;
      if (staticBody.label === 'spinner') return;
      
      const bounds = staticBody.bounds;
      
      // 구슬과 장애물 경계 상자(AABB) 간의 가장 가까운 지점 계산
      const closestX = Math.max(bounds.min.x, Math.min(body.position.x, bounds.max.x));
      const closestY = Math.max(bounds.min.y, Math.min(body.position.y, bounds.max.y));
      
      const distVector = { x: closestX - body.position.x, y: closestY - body.position.y };
      const dist = Math.sqrt(distVector.x * distVector.x + distVector.y * distVector.y);

      if (dist < radius && dist > 1) {
        // [추가] 벽에 장풍을 쏘면 구슬 자신이 반작용으로 튕겨나감 (끼임 방지)
        const reactionDirection = { x: -distVector.x / dist, y: -distVector.y / dist }; 
        const reactionMagnitude = (1 - dist / radius) * baseForce * body.mass * 1.5; // 반작용 증폭
        Body.applyForce(body, body.position, { 
          x: reactionDirection.x * reactionMagnitude, 
          y: reactionDirection.y * reactionMagnitude 
        });

        // 장애물을 이동했다 되돌리면 구슬 속에 다시 생성될 수 있어 반작용만 적용한다.
      }
    });
  },

  // 카메라 뷰포트 Y축 갱신
  getWorldHeight: function() {
    return Math.max(this.height, (this.finishSensor?.position.y || this.height) + 80);
  },

  getCameraBounds: function() {
    const width = this.width / this.cameraZoom;
    const height = this.viewportHeight / this.cameraZoom;
    return { x: this.zoomFocusX - width / 2, y: this.zoomFocusY - height / 2, width, height };
  },

  setManualCamera: function(centerY) {
    this.cameraMode = 'manual';
    this.cameraZoom = this.targetZoom = 1;
    this.manualCameraY = Math.max(this.viewportHeight / 2,
      Math.min(this.getWorldHeight() - this.viewportHeight / 2, centerY));
    this.viewportY = this.manualCameraY - this.viewportHeight / 2;
    this.zoomFocusX = this.width / 2;
    this.zoomFocusY = this.manualCameraY;
  },

  resumeCameraTracking: function() {
    this.cameraMode = 'auto';
  },

  updateCameraViewport: function() {
    let targetY = 0;

    // 매 프레임마다 카메라 타겟을 실시간 갱신 (당첨 순위 구슬 추적)
    this.updateCameraTarget();
    
    // 매 프레임마다 순위판 콜백을 호출하여 실시간 순위 반영
    if (this.onRankUpdate && !this.isPaused) {
      this.onRankUpdate(this.getCurrentRankings());
    }

    if (this.cameraTarget) {
      targetY = this.cameraTarget.body.position.y - this.viewportHeight * 0.45;

      // 타겟 구슬이 피니시 라인 근처(깔때기 부근)에 진입했을 때 연출 발동!
      if (this.cameraTarget.body.position.y > this.funnelY - 80 && !this.cameraTarget.isFinished) {
        this.targetZoom = 2.4;        // 줌인 2.4배로 상향
        this.slowMoFactor = 0.25;      // 슬로우 모션 (0.25배속)
      } else {
        this.targetZoom = 1.0;
        this.slowMoFactor = 1.0;
      }
    } else {
      this.targetZoom = 1.0;
      this.slowMoFactor = 1.0;
    }

    // 탐색 중에도 당첨 구슬 기준 슬로모션은 유지하며 화면의 위치만 수동으로 제어한다.
    if (this.cameraMode === 'manual') {
      this.targetZoom = 1;
      this.viewportY = this.manualCameraY - this.viewportHeight / 2;
      return;
    }
    const maxViewportY = this.getWorldHeight() - this.viewportHeight;
    if (targetY < 0) targetY = 0;
    if (targetY > maxViewportY) targetY = maxViewportY;

    this.viewportY += (targetY - this.viewportY) * 0.08;
  },

  getCurrentRankings: function() {
    const sortedFinished = [...this.finishedMarbles].sort((a, b) => a.finishTime - b.finishTime);
    const sortedRunning = this.marbles
      .filter(m => !m.isFinished)
      .sort((a, b) => b.body.position.y - a.body.position.y);
    return [...sortedFinished, ...sortedRunning];
  },

  // ----------------------------------------------------
  // 커스텀 Canvas 2D 렌더러
  // ----------------------------------------------------
  render: function() {
    if (!this.ctx) return;

    const ctx = this.ctx;
    ctx.fillStyle = '#1e2532'; // 약간 회색빛이 도는 다크 네이비/그레이
    ctx.fillRect(0, 0, this.width, this.viewportHeight);

    // 카메라 줌인 보간 스무딩
    this.cameraZoom += (this.targetZoom - this.cameraZoom) * 0.05;

    ctx.save();
    
    // 화면 한가운데(Canvas 중앙) 기준
    const canvasCenterX = this.width / 2;
    const canvasCenterY = this.viewportHeight / 2;
    
    // 포커스할 대상 좌표 부드럽게 추적
    if (this.cameraMode === 'auto' && this.cameraZoom > 1.05 && this.cameraTarget) {
      this.zoomFocusX += (this.cameraTarget.body.position.x - this.zoomFocusX) * 0.1;
      this.zoomFocusY += (this.cameraTarget.body.position.y - this.zoomFocusY) * 0.1;
    } else {
      this.zoomFocusX += (canvasCenterX - this.zoomFocusX) * 0.1;
      this.zoomFocusY += (this.viewportY + canvasCenterY - this.zoomFocusY) * 0.1;
    }

    // 1. 화면 중앙으로 좌표계 이동
    ctx.translate(canvasCenterX, canvasCenterY);
    // 2. 줌인 스케일 적용
    ctx.scale(this.cameraZoom, this.cameraZoom);
    // 3. 포커스할 대상이 중앙에 오도록 좌표계 이동 (포커스 좌표의 역방향)
    ctx.translate(-this.zoomFocusX, -this.zoomFocusY);

    const bodies = Composite.allBodies(this.world);
    const now = Date.now();

    // 1. 기믹 영역들
    bodies.forEach(body => {
      if (body.label === 'portal_in' || body.label === 'portal_out') {
        const pos = body.position;
        const color = body.portalColor;
        const radius = body.portalRadius || 18;
        const pulse = 1 + Math.sin(now * 0.008) * 0.08;

        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = color;
        
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#060813';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();

        if (body.portalIcon) {
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.font = `bold ${Math.max(13, radius * 0.7)}px Noto Sans KR`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(body.portalIcon, pos.x, pos.y + 1);
        }

        ctx.restore();
      }

      if (body.label === 'booster') {
        const vertices = body.vertices;
        const pos = body.position;
        const angle = body.angle;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
          ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.translate(pos.x, pos.y);
        ctx.rotate(angle);
        
        ctx.beginPath();
        const yOffset = (now * 0.1) % 20 - 10;
        ctx.moveTo(-15, yOffset - 5);
        ctx.lineTo(0, yOffset + 5);
        ctx.lineTo(15, yOffset - 5);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
        
        ctx.restore();
      }

      if (body.label === 'slow_zone') {
        const vertices = body.vertices;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
          ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(234, 179, 8, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();

        const pos = body.position;
        ctx.fillStyle = 'rgba(234, 179, 8, 0.4)';
        ctx.font = 'bold 10px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText('SLOW ZONE', pos.x, pos.y + 4);
        ctx.restore();
      }

      if (body.label === 'map_sign') {
        ctx.save();
        ctx.font = `800 ${body.signFontSize || 18}px Noto Sans KR`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = body.signColor || '#f8fafc';
        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
        ctx.fillText(body.signText || '', body.position.x, body.position.y);
        ctx.restore();
      }
    });

    // 2. 일반 맵 장애물 및 벽체 렌더링
    bodies.forEach(body => {
      if (body.label === 'marble' || body.label === 'finish_sensor' || 
          body.label === 'portal_in' || body.label === 'portal_out' || 
          body.label === 'booster' || body.label === 'slow_zone' ||
          body.label === 'map_sign') return;

      ctx.beginPath();
      const partsToDraw = body.parts.length > 1 ? body.parts.slice(1) : [body];
      partsToDraw.forEach(part => {
        const vertices = part.vertices;
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let i = 1; i < vertices.length; i++) {
          ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        ctx.closePath();
      });

      if (body.label === 'bumper') {
        ctx.fillStyle = body.render.fillStyle || '#10b981';
        ctx.strokeStyle = body.render.strokeStyle || '#34d399';
        ctx.lineWidth = body.render.lineWidth || 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#10b981';
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
      } 
      else if (body.label === 'spinner') {
        ctx.fillStyle = body.render.fillStyle || '#8b5cf6';
        ctx.strokeStyle = body.render.strokeStyle || '#c084fc';
        ctx.lineWidth = body.render.lineWidth || 2;
        ctx.fill();
        ctx.stroke();
      } 
      else if (body.label === 'punch') {
        ctx.fillStyle = body.render.fillStyle || '#ef4444';
        ctx.strokeStyle = body.render.strokeStyle || '#fca5a5';
        ctx.lineWidth = body.render.lineWidth || 2;
        ctx.shadowBlur = 10;
        ctx.shadowColor = ctx.fillStyle;
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      else {
        ctx.fillStyle = body.render.fillStyle || '#1e293b';
        ctx.fill();
      }
    });

    // 3. 결승 센서 라인 (턱이 없는 개방 통로 바로 밑)
    if (this.finishSensor) {
      const vertices = this.finishSensor.vertices;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(vertices[0].x, vertices[0].y);
      ctx.lineTo(vertices[1].x, vertices[1].y);
      ctx.lineTo(vertices[2].x, vertices[2].y);
      ctx.lineTo(vertices[3].x, vertices[3].y);
      ctx.closePath();
      
      ctx.fillStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#38bdf8';
      ctx.stroke();
      ctx.restore();
    }

    // 4. 이펙트 파티클
    this.updateAndRenderParticles(ctx);

    // 5. 구슬 렌더링 (꼬리 포함)
    this.marbles.forEach(marble => {
      const pos = marble.body.position;
      const radius = 16;

      // 꼬리
      if (!this.isPaused && !marble.isFinished) {
        marble.trail.push({ x: pos.x, y: pos.y });
        if (marble.trail.length > marble.maxTrailLength) {
          marble.trail.shift();
        }
      }

      if (marble.trail.length > 1) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(marble.trail[0].x, marble.trail[0].y);
        for (let i = 1; i < marble.trail.length; i++) {
          ctx.lineTo(marble.trail[i].x, marble.trail[i].y);
        }
        ctx.strokeStyle = marble.color;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.25;
        ctx.stroke();
        ctx.restore();
      }

      // 장풍 펄싱 충격파
      if (marble.skillActiveTime > 0) {
        ctx.save();
        const progress = (15 - marble.skillActiveTime) / 15;
        const waveRadius = 15 + progress * 110;
        const opacity = 1 - progress;
        
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, waveRadius, 0, Math.PI * 2);
        ctx.strokeStyle = marble.color;
        ctx.lineWidth = 3 * (1 - progress);
        ctx.globalAlpha = opacity * 0.8;
        ctx.shadowBlur = 10;
        ctx.shadowColor = marble.color;
        ctx.stroke();
        ctx.restore();
        
        if (!this.isPaused) {
          marble.skillActiveTime--;
        }
      }

      // 구슬 본체
      ctx.save();
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);

      const grad = ctx.createRadialGradient(
        pos.x - radius * 0.3, pos.y - radius * 0.3, radius * 0.1,
        pos.x, pos.y, radius
      );
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.2, marble.color);
      grad.addColorStop(1, this.shadeColor(marble.color, -30));

      ctx.fillStyle = grad;
      ctx.shadowBlur = 6;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.fill();
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // 구슬 이름표
      ctx.save();
      ctx.font = 'bold 11px Noto Sans KR';
      ctx.textAlign = 'center';
      
      const txt = marble.name;
      const textWidth = ctx.measureText(txt).width;
      
      ctx.fillStyle = 'rgba(7, 9, 19, 0.65)';
      ctx.fillRect(pos.x - textWidth / 2 - 4, pos.y - radius - 18, textWidth + 8, 14);
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.strokeRect(pos.x - textWidth / 2 - 4, pos.y - radius - 18, textWidth + 8, 14);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(txt, pos.x, pos.y - radius - 8);
      ctx.restore();
    });

    ctx.restore();
    window.MarbleOverview.render(this, bodies);
  },

  // ----------------------------------------------------
  // 파티클 유틸리티
  // ----------------------------------------------------
  createBumperParticles: function(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: 2 + Math.random() * 3, color: color,
        alpha: 1.0, decay: 0.03 + Math.random() * 0.03, type: 'sparkle'
      });
    }
  },

  createWindWaveParticles: function(x, y, color) {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const speed = 1.0;
      this.particles.push({
        x: x + Math.cos(angle) * 15, y: y + Math.sin(angle) * 15,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 2, color: color,
        alpha: 0.6, decay: 0.04, type: 'wave'
      });
    }
  },

  createPortalFlashParticles: function(x, y, color) {
    for (let i = 0; i < 15; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 3.0;
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        radius: 2.5 + Math.random() * 2, color: color,
        alpha: 0.9, decay: 0.04, type: 'sparkle'
      });
    }
  },

  updateAndRenderParticles: function(ctx) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      
      if (!this.isPaused) {
        p.x += p.vx * this.gameSpeed;
        p.y += p.vy * this.gameSpeed;
        p.alpha -= p.decay * this.gameSpeed;
      }

      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      
      if (p.type === 'sparkle') {
        ctx.shadowBlur = 6;
        ctx.shadowColor = p.color;
      }
      
      ctx.fill();
      ctx.restore();
    }
  },

  shadeColor: function(color, percent) {
    let R = parseInt(color.substring(1, 3), 16);
    let G = parseInt(color.substring(3, 5), 16);
    let B = parseInt(color.substring(5, 7), 16);

    R = parseInt((R * (100 + percent)) / 100);
    G = parseInt((G * (100 + percent)) / 100);
    B = parseInt((B * (100 + percent)) / 100);

    R = R < 255 ? R : 255;
    G = G < 255 ? G : 255;
    B = B < 255 ? B : 255;

    R = R > 0 ? R : 0;
    G = G > 0 ? G : 0;
    B = B > 0 ? B : 0;

    const rHex = R.toString(16).padStart(2, '0');
    const gHex = G.toString(16).padStart(2, '0');
    const bHex = B.toString(16).padStart(2, '0');

    return `#${rHex}${gHex}${bHex}`;
  }
};
})();
