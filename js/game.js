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

    this.isPaused = true;
    this.marbles = [];
    this.spinners = [];
    this.punches = [];
    this.particles = [];
    this.finishedMarbles = [];
    this.viewportY = 0;
    this.cameraTarget = null;

    // 커스텀 루프 시작
    this.startLoop();
  },

  // 맵 로드 및 물리 경계 구축
  loadMap: function(mapType) {
    this.currentMapType = mapType;
    
    // 맵 높이 유동적 설정 (스피너 밸리는 2배 길이)
    this.height = (mapType === 'spinner') ? 3600 : 1800;

    World.clear(this.world, false);
    this.spinners = [];
    this.punches = [];
    this.particles = [];
    this.finishedMarbles = [];
    this.viewportY = 0;
    this.cameraTarget = null;

    // 공통 바운더리 생성
    const common = window.MarbleMaps.createCommonBoundaries(this.world, this.width, this.height);
    this.finishSensor = common.finishSensor;
    this.funnelY = common.funnelY;

    // 프리셋 맵 로드
    let mapData;
    if (mapType === 'pinball') {
      mapData = window.MarbleMaps.createPinballMap(this.world, this.width, this.height);
    } else if (mapType === 'spinner') {
      mapData = window.MarbleMaps.createSpinnerMap(this.world, this.width, this.height);
    } else if (mapType === 'zigzag') {
      mapData = window.MarbleMaps.createZigzagMap(this.world, this.width, this.height);
    } else if (mapType === 'vortex') {
      mapData = window.MarbleMaps.createVortexMap(this.world, this.width, this.height);
    }

    if (mapData && mapData.spinners) {
      this.spinners = mapData.spinners;
    }

    this.punches = common.punches || [];

    this.setupCollisionEvents();
  },

  // 구슬들 세팅 및 스폰
  setupMarbles: function(marbleConfigs) {
    this.marbles.forEach(m => World.remove(this.world, m.body));
    this.marbles = [];
    this.finishedMarbles = [];
    this.viewportY = 0;

    const spacing = Math.min(600 / (marbleConfigs.length + 1), 40);
    const startY = 40;

    marbleConfigs.forEach((config, idx) => {
      const offsetX = (idx % 2 === 0 ? 1 : -1) * (Math.floor(idx / 2) * spacing);
      const x = this.width / 2 + offsetX + (Math.random() - 0.5) * 5;
      const y = startY + Math.floor(idx / 8) * 30 + (Math.random() - 0.5) * 5;

      const radius = 16; // 구슬 크기 키움 (기존 12)
      const body = Bodies.circle(x, y, radius, {
        restitution: 0.7,   // 통통 튀는 정도 증가 (기존 0.5)
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
        nextSkillTime: Date.now() + 2000 + Math.random() * 2000,
        skillActiveTime: 0,
        portalCooldownTime: 0,
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
    this.slowMoFactor = 1.0;
    this.isTargetAnnounced = false;
    this.setSpeed(1.0); // 초기 속도 복구
    
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
      marble.body.collisionFilter.mask = 0xFFFFFFFF;
      
      Body.setPosition(marble.body, { x: x, y: y });
      Body.setVelocity(marble.body, { x: 0, y: 0 });
      Body.setAngularVelocity(marble.body, 0);
      Body.setAngle(marble.body, 0);

      marble.nextSkillTime = Date.now() + 2000 + Math.random() * 2000;
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
        const dt = (time - lastTime) || 16.666;
        
        // 슬로우 모션 적용 (slowMoFactor)
        const currentSpeed = this.gameSpeed * this.slowMoFactor;
        const steps = Math.ceil(currentSpeed);
        const stepSize = (16.666 * currentSpeed) / steps;
        
        for (let i = 0; i < steps; i++) {
          this.updateSpinners();
          this.updatePunches();
          this.processMapGimmicks();
          this.applyJitterToFunnels();
          
          if (this.enableSkills) {
            this.processSkills();
          }

          Engine.update(this.engine, stepSize);
        }
      }

      lastTime = time;

      this.updateCameraViewport();
      this.render();
    };

    requestAnimationFrame(loop);
  },

  updateSpinners: function() {
    this.spinners.forEach(spinner => {
      const nextAngle = spinner.angle + spinner.rotationSpeed * this.gameSpeed;
      Body.setAngle(spinner, nextAngle);
    });
  },

  updatePunches: function() {
    const time = Date.now();
    this.punches.forEach(punch => {
      const offset = Math.sin(time * punch.offsetSpeed * this.gameSpeed) * 160 * punch.direction;
      Body.setPosition(punch, { x: punch.startX + offset, y: punch.position.y });
    });
  },

  // 창의적 기믹(포탈, 가속 패드, 감속 늪) 실시간 물리 처리
  processMapGimmicks: function() {
    const bodies = Composite.allBodies(this.world);
    const now = Date.now();

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
          const dist = Vector.magnitude(Vector.sub(portal.position, pos));
          if (dist < 30) {
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
            x: body.velocity.x * 0.76,
            y: body.velocity.y * 0.76
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

    this.createPortalFlashParticles(body.position.x, body.position.y, portal.portalColor);
    Body.setPosition(body, { x: target.x, y: target.y });
    Body.setVelocity(body, { x: (Math.random() - 0.5) * 1.5, y: 3.5 });
    this.createPortalFlashParticles(target.x, target.y, '#f97316');
  },

  isPointInRectangle: function(point, rect) {
    return Matter.Vertices.contains(rect.vertices, point);
  },

  // 결승 통로 교착 상태 해소용 Jitter 쉐이킹
  applyJitterToFunnels: function() {
    this.marbles.forEach(marble => {
      if (marble.isFinished) return;

      const body = marble.body;
      const pos = body.position;

      if (pos.y > this.funnelY - 180 && pos.y < this.funnelY + 50) {
        const speed = Vector.magnitude(body.velocity);
        if (speed < 0.25) {
          Body.applyForce(body, pos, {
            x: (Math.random() - 0.5) * 0.00075 * body.mass,
            y: 0.00035 * body.mass
          });
        }
      }
    });
  },

  // 장풍 스킬 처리
  processSkills: function() {
    const now = Date.now();

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

    // 2. 근처 장애물(펙, 범퍼 등 작은 static body)도 일시적으로 튕겨내서 끼임 방지
    const allBodies = Composite.allBodies(this.world);
    allBodies.forEach(staticBody => {
      // 벽, 센서, 스피너, 깔때기는 제외 - 작은 장애물만 대상
      if (!staticBody.isStatic) return;
      if (staticBody.isSensor) return;
      if (staticBody.label === 'spinner') return;
      if (staticBody.label === 'finish_sensor') return;
      // 너무 큰 바디(벽, 깔때기 슬로프)는 제외: 넓이로 판단
      const bounds = staticBody.bounds;
      const bWidth = bounds.max.x - bounds.min.x;
      const bHeight = bounds.max.y - bounds.min.y;
      if (bWidth > 100 || bHeight > 100) return;

      const distVector = Vector.sub(staticBody.position, body.position);
      const dist = Vector.magnitude(distVector);

      if (dist < radius * 0.7 && dist > 1) {
        // 일시적으로 static 해제 후 힘 적용, 잠시 뒤 복원
        const originalPos = { x: staticBody.position.x, y: staticBody.position.y };
        const originalAngle = staticBody.angle;

        Body.setStatic(staticBody, false);
        Body.setMass(staticBody, 5); // 가벼운 질량 부여
        
        const forceMagnitude = (1 - dist / radius) * 0.008;
        const forceDirection = Vector.normalise(distVector);
        Body.applyForce(staticBody, staticBody.position, Vector.mult(forceDirection, forceMagnitude));

        // 300ms 뒤 원래 위치로 복귀 + static 복원
        setTimeout(() => {
          Body.setStatic(staticBody, true);
          Body.setPosition(staticBody, originalPos);
          Body.setAngle(staticBody, originalAngle);
        }, 300);
      }
    });
  },

  // 카메라 뷰포트 Y축 갱신
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

    const maxViewportY = this.height - this.viewportHeight;
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
    if (this.cameraZoom > 1.05 && this.cameraTarget) {
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
        const pulse = 1 + Math.sin(now * 0.008) * 0.08;

        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = color;
        
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 18 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#060813';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();

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
    });

    // 2. 일반 맵 장애물 및 벽체 렌더링
    bodies.forEach(body => {
      if (body.label === 'marble' || body.label === 'finish_sensor' || 
          body.label === 'portal_in' || body.label === 'portal_out' || 
          body.label === 'booster' || body.label === 'slow_zone') return;

      ctx.beginPath();
      const vertices = body.vertices;
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let i = 1; i < vertices.length; i++) {
        ctx.lineTo(vertices[i].x, vertices[i].y);
      }
      ctx.closePath();

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
        ctx.fillStyle = '#8b5cf6';
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 2;
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
