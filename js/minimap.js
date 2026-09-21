(function() {
/** 전체 경기를 같은 물리 상태로 그리는 탐색용 미리보기. 게임은 한 번만 진행한다. */
window.MarbleOverview = {
  init: function(game) {
    this.game = game;
    this.canvas = document.getElementById('overview-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.followButton = document.getElementById('camera-follow');
    this.status = document.getElementById('overview-mode');
    this.count = document.getElementById('overview-count');
    this.drag = null;
    this.followButton.addEventListener('click', () => game.resumeCameraTracking());

    const worldY = event => {
      const rect = this.canvas.getBoundingClientRect();
      return (event.clientY - rect.top - this.layout.y) / this.layout.scale;
    };
    this.canvas.addEventListener('pointerdown', event => {
      if (!this.layout || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      this.canvas.focus({ preventScroll: true });
      const y = worldY(event);
      const view = game.getCameraBounds();
      this.drag = {
        id: event.pointerId,
        offset: y >= view.y && y <= view.y + view.height ? game.zoomFocusY - y : 0
      };
      this.canvas.setPointerCapture(event.pointerId);
      game.setManualCamera(y + this.drag.offset);
    });
    this.canvas.addEventListener('pointermove', event => {
      if (this.drag?.id === event.pointerId) game.setManualCamera(worldY(event) + this.drag.offset);
    });
    const stopDrag = event => {
      if (this.drag?.id !== event.pointerId) return;
      this.drag = null;
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    };
    this.canvas.addEventListener('pointerup', stopDrag);
    this.canvas.addEventListener('pointercancel', stopDrag);
    this.canvas.addEventListener('lostpointercapture', () => { this.drag = null; });
    this.canvas.addEventListener('keydown', event => {
      const moves = { ArrowUp: -150, ArrowDown: 150, PageUp: -700, PageDown: 700 };
      if (event.key in moves) game.setManualCamera(game.zoomFocusY + moves[event.key]);
      else if (event.key === 'Home') game.setManualCamera(0);
      else if (event.key === 'End') game.setManualCamera(game.getWorldHeight());
      else if (event.key === 'Escape') game.resumeCameraTracking();
      else return;
      event.preventDefault();
    });

    new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      this.size = { width, height };
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
    }).observe(this.canvas);
  },

  render: function(game, bodies) {
    if (!this.size || !game.finishSensor) return;
    const { width, height } = this.size;
    if (width < 1 || height < 1) return;
    const ctx = this.ctx;
    const worldHeight = game.getWorldHeight();
    const scale = Math.min((width - 16) / game.width, (height - 36) / worldHeight);
    const x = (width - game.width * scale) / 2;
    const y = (height - worldHeight * scale) / 2;
    this.layout = { x, y, scale };
    ctx.setTransform(this.canvas.width / width, 0, 0, this.canvas.height / height, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#1a2435';
    ctx.fillRect(x, y, game.width * scale, worldHeight * scale);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, game.width * scale, worldHeight * scale);
    ctx.clip();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    bodies.forEach(body => {
      if (body.label === 'marble' || body.label === 'map_sign' || body.label === 'finish_sensor') return;
      const portal = body.label === 'portal_in' || body.label === 'portal_out';
      ctx.fillStyle = body.label === 'booster' ? '#0e7490' : body.label === 'slow_zone' ? '#854d0e' : body.render.fillStyle || '#64748b';
      ctx.strokeStyle = portal ? body.portalColor : body.render.strokeStyle || '#64748b';
      ctx.lineWidth = 0.7 / scale;
      if (body.circleRadius) {
        ctx.beginPath();
        ctx.arc(body.position.x, body.position.y, Math.max(body.circleRadius, 1 / scale), 0, Math.PI * 2);
        if (portal) ctx.stroke();
        else ctx.fill();
      } else {
        const parts = body.parts.length > 1 ? body.parts.slice(1) : [body];
        parts.forEach(part => {
          ctx.beginPath();
          part.vertices.forEach((vertex, i) => i ? ctx.lineTo(vertex.x, vertex.y) : ctx.moveTo(vertex.x, vertex.y));
          ctx.closePath();
          ctx.fill();
        });
      }
    });

    const finishY = game.finishSensor.position.y;
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(0, finishY, game.width, 1.5 / scale);
    game.marbles.forEach(marble => {
      if (marble.isFinished) return;
      const pos = marble.body.position;
      const radius = Math.max(marble.body.circleRadius, 2.5 / scale);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = marble.color;
      ctx.fill();
      ctx.strokeStyle = '#0b1020';
      ctx.lineWidth = 0.6 / scale;
      ctx.stroke();
      if (marble === game.cameraTarget) {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius + 2 / scale, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2 / scale;
        ctx.stroke();
      }
    });

    const view = game.getCameraBounds();
    ctx.fillStyle = 'rgba(125, 211, 252, 0.10)';
    ctx.fillRect(view.x, view.y, view.width, view.height);
    ctx.strokeStyle = game.cameraMode === 'manual' ? '#fbbf24' : '#7dd3fc';
    ctx.lineWidth = 2 / scale;
    ctx.strokeRect(view.x + 1 / scale, view.y, view.width - 2 / scale, view.height);
    ctx.restore();
    ctx.font = '600 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('START', x, y - 6);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('FINISH', x + 4, y + finishY * scale - 5);

    const manual = game.cameraMode === 'manual';
    const mode = manual ? '자유 탐색 중' : '당첨 후보 자동 추적';
    if (this.status.textContent !== mode) this.status.textContent = mode;
    this.followButton.disabled = !manual;
    const counts = `도착 ${game.finishedMarbles.length} / ${game.marbles.length}`;
    if (this.count.textContent !== counts) this.count.textContent = counts;
    this.canvas.setAttribute('aria-valuemax', String(Math.round(worldHeight)));
    this.canvas.setAttribute('aria-valuenow', String(Math.round(game.zoomFocusY)));
    this.canvas.setAttribute('aria-valuetext', `${mode}, 맵 ${Math.round(game.zoomFocusY / worldHeight * 100)}% 위치`);
  }
};
})();
