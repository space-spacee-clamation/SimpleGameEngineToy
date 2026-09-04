// J4 · 2D 光照与视野多边形
export default {
  id: 'J4',
  title: '2D 光照与视野多边形',
  est: '2 小时',
  coreQuestions: [
    '「光被墙挡住」在渲染里等价于一个什么几何问题？',
    '可见多边形为什么要在每个墙角打三根射线（±ε）？',
    'roguelike 的格子 FOV 和光照多边形是什么关系？',
    '引擎的 canvas light occlusion 在哪一步把遮挡物算进光照？'
  ],
  sections: [
  {
    type: 'text',
    title: '光照=几何：被墙挡住的其实是「多边形」',
    html: `<p>2D 光照的本质是一道几何题：<b>从光源出发，能看到的空间区域是一个多边形</b>——它的每条边要么是墙的一段、要么是射到墙角的视线。把这个「可见多边形」画亮、其余画暗，阴影就出现了。</p>
<p>求法：从光源向<b>每个墙角</b>打射线（为避免恰好擦过角点，每个角打三根：角度-ε、角度、角度+ε），每根射线找最近的相交墙段，得到一组命中点；按角度排序连成多边形。墙角数 n，射线 3n，每根要和所有墙段求交——O(n²) 在几百条边内绰绰有余。</p>`
  },
  {
    type: 'text',
    title: '同一个几何问题的另一件外套：格子 FOV',
    html: `<p>roguelike 的视野（FOV）是同一道题的离散版：以玩家为中心，对可见半径内每个格子问一句「从玩家到你，视线被墙挡了吗？」——没挡就算可见。它是「逐格采样的可见多边形」，粗糙但够用，还免费送出「已探索记忆」的实现基础。</p>
<table>
  <tr><th>表示</th><th>精度</th><th>成本</th><th>用户</th></tr>
  <tr><td>可见多边形</td><td>连续、锐利阴影</td><td>射线×墙段求交</td><td>2D 光照渲染</td></tr>
  <tr><td>格子 FOV</td><td>格子粒度</td><td>格子×墙段 LOS</td><td>roguelike/战棋</td></tr>
</table>
<p>Godot 的 2D 光照：LightOccluder2D 把遮挡多边形注册给画布渲染，灯光着色时用遮挡图（canvas occlusion）逐像素判断——思想同源，实现搬进了 shader。</p>`
  },
  {
    type: 'lab',
    lab: 'code',
    key: 'fov',
    title: '实验：光源遮挡沙盘（可见多边形 + 格子 FOV）',
    height: 620,
    code: `// 鼠标=移动光源  Tab=多边形/格子FOV  R=重撒墙  G=墙隐身(看穿墙效果)  空格=定格

engine.run({
  setup: function (state) {
    state.mode = 0;              // 0=光照多边形 1=格子FOV
    state.hideWalls = false;
    state.frozen = false;
    state.seed = 20260903;
    state.light = { x: 300, y: 220 };
    state.mouse = { x: 300, y: 220 };
    state.log = ['Tab 切换光照多边形/格子FOV'];
    buildWalls(state);
    buildCells(state);
  },

  update: function (state, dt, input) {
    if (input.pressed('Tab')) { state.mode = 1 - state.mode; pushLog(state, state.mode === 0 ? '光照多边形:连续阴影' : '格子FOV:逐格视线'); }
    if (input.pressed('KeyR')) { state.seed = (state.seed * 48271) % 2147483647; buildWalls(state); buildCells(state); pushLog(state, '重撒墙段'); }
    if (input.pressed('KeyG')) { state.hideWalls = !state.hideWalls; pushLog(state, state.hideWalls ? '墙隐身:光「穿墙」现形' : '墙恢复显示'); }
    if (input.pressed('Space')) state.frozen = !state.frozen;
    if (!state.frozen) {
      state.mouse.x = input.mouse.x;
      state.mouse.y = input.mouse.y;
      state.light.x = clamp(input.mouse.x, 8, 708);
      state.light.y = clamp(input.mouse.y, 8, 608);
    }
    if (state.mode === 1) computeCellFov(state);
    else state.poly = visibilityPolygon(state, state.light.x, state.light.y);
    while (state.log.length > 3) state.log.shift();
  },

  draw: function (state, ctx) {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, engine.W, engine.H);
    if (state.mode === 0) {
      // 光照多边形:先画全域暗,再画亮区
      ctx.fillStyle = '#0d1220';
      ctx.fillRect(0, 0, engine.W, engine.H);
      var poly = state.poly;
      if (poly && poly.length > 2) {
        ctx.fillStyle = 'rgba(255,220,140,0.9)';
        ctx.beginPath();
        for (var i = 0; i < poly.length; i++) {
          if (i === 0) ctx.moveTo(poly[i].x, poly[i].y); else ctx.lineTo(poly[i].x, poly[i].y);
        }
        ctx.closePath();
        ctx.fill();
        // 光衰减:再叠几圈递减亮度的多边形
        for (var ring = 3; ring >= 1; ring--) {
          ctx.fillStyle = 'rgba(255,240,200,' + (0.10 * ring) + ')';
          ctx.beginPath();
          for (var j = 0; j < poly.length; j++) {
            var p = poly[j];
            var dx = p.x - state.light.x, dy = p.y - state.light.y;
            var f = 1 - ring * 0.22;
            var px = state.light.x + dx * f, py = state.light.y + dy * f;
            if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
    } else {
      // 格子 FOV
      for (var r = 0; r < state.rows; r++) {
        for (var c = 0; c < state.cols; c++) {
          var vis = state.fov[r * state.cols + c];
          ctx.fillStyle = vis ? 'rgba(255,220,140,0.16)' : '#0d1220';
          ctx.fillRect(12 + c * 25, 12 + r * 25, 24, 24);
        }
      }
    }
    // 墙
    if (!state.hideWalls) {
      ctx.strokeStyle = '#8fa7c7';
      ctx.lineWidth = 3;
      for (var w = 0; w < state.walls.length; w++) {
        var seg = state.walls[w];
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }
    // 光源
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(state.light.x, state.light.y, 5, 0, 6.2832);
    ctx.fill();
    drawHud(state, ctx);
  }
});

// ---------- 墙与射线几何 ----------

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

function dist(x1, y1, x2, y2) {
  var dx = x1 - x2, dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

function buildWalls(state) {
  var rng = mulberry32(state.seed);
  state.walls = [];
  // 外框(4 段)
  state.walls.push({ x1: 8, y1: 8, x2: 712, y2: 8 });
  state.walls.push({ x1: 712, y1: 8, x2: 712, y2: 612 });
  state.walls.push({ x1: 712, y1: 612, x2: 8, y2: 612 });
  state.walls.push({ x1: 8, y1: 612, x2: 8, y2: 8 });
  // 内部随机墙段
  for (var i = 0; i < 14; i++) {
    var x1 = 40 + rng() * 600;
    var y1 = 40 + rng() * 520;
    var dx = (rng() - 0.5) * 220;
    var dy = (rng() - 0.5) * 220;
    state.walls.push({ x1: x1, y1: y1, x2: clamp(x1 + dx, 12, 708), y2: clamp(y1 + dy, 12, 608) });
  }
}

// 射线与线段求交:返回距离 t(无穷远=没有交点)
function raySeg(ox, oy, dx, dy, seg) {
  var sx = seg.x2 - seg.x1, sy = seg.y2 - seg.y1;
  var den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-9) return Infinity;
  var t2 = (dx * (seg.y1 - oy) - dy * (seg.x1 - ox)) / den;
  var t1 = (sx * (seg.y1 - oy) - sy * (seg.x1 - ox)) / den;
  if (t1 > 0.0001 && t2 >= 0 && t2 <= 1) return t1;
  return Infinity;
}

function castRay(state, ox, oy, ang) {
  var dx = Math.cos(ang), dy = Math.sin(ang);
  var best = 2000;
  for (var i = 0; i < state.walls.length; i++) {
    var t = raySeg(ox, oy, dx, dy, state.walls[i]);
    if (t < best) best = t;
  }
  return best;
}

// 可见多边形:每个墙角三根射线,按角度排序连多边形
function visibilityPolygon(state, ox, oy) {
  var angles = [];
  for (var i = 0; i < state.walls.length; i++) {
    angles.push(Math.atan2(state.walls[i].y1 - oy, state.walls[i].x1 - ox));
    angles.push(Math.atan2(state.walls[i].y2 - oy, state.walls[i].x2 - ox));
  }
  var hits = [];
  for (var a = 0; a < angles.length; a++) {
    for (var off = -0.0002; off <= 0.0002; off += 0.0002) {
      var ang = angles[a] + off;
      var d = castRay(state, ox, oy, ang);
      hits.push({ ang: ang, x: ox + Math.cos(ang) * d, y: oy + Math.sin(ang) * d });
    }
  }
  hits.sort(function (p, q) { return p.ang - q.ang; });
  return hits;
}

// ---------- 格子 FOV ----------

function buildCells(state) {
  state.cols = 28;
  state.rows = 24;
  state.fov = new Uint8Array(state.cols * state.rows);
}

function los(state, x1, y1, x2, y2) {
  var steps = Math.ceil(dist(x1, y1, x2, y2) / 6);
  for (var s = 1; s < steps; s++) {
    var t = s / steps;
    var px = x1 + (x2 - x1) * t;
    var py = y1 + (y2 - y1) * t;
    for (var w = 0; w < state.walls.length; w++) {
      var seg = state.walls[w];
      // 点到线段距离 < 3 视为被挡
      var sx = seg.x2 - seg.x1, sy = seg.y2 - seg.y1;
      var len2 = sx * sx + sy * sy || 1;
      var tt = clamp(((px - seg.x1) * sx + (py - seg.y1) * sy) / len2, 0, 1);
      var cx2 = seg.x1 + sx * tt, cy2 = seg.y1 + sy * tt;
      if (dist(px, py, cx2, cy2) < 2.5) return false;
    }
  }
  return true;
}

function computeCellFov(state) {
  for (var r = 0; r < state.rows; r++) {
    for (var c = 0; c < state.cols; c++) {
      var cx2 = 12 + c * 25 + 12, cy2 = 12 + r * 25 + 12;
      state.fov[r * state.cols + c] = dist(state.light.x, state.light.y, cx2, cy2) < 230 &&
        los(state, state.light.x, state.light.y, cx2, cy2) ? 1 : 0;
    }
  }
}

function pushLog(state, s) {
  state.log.push(s);
  if (state.log.length > 3) state.log.shift();
}

function drawHud(state, ctx) {
  ctx.fillStyle = 'rgba(11,15,23,0.92)';
  ctx.fillRect(8, 6, 704, 24);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8fa7c7';
  var modeName = state.mode === 0 ? '光照多边形(墙角×3射线)' : '格子FOV(逐格视线采样)';
  ctx.fillText('模式:' + modeName + '  墙段 ' + state.walls.length + '  隐身 ' + (state.hideWalls ? '开' : '关') +
    (state.frozen ? '  [定格]' : ''), 16, 22);
  ctx.fillStyle = '#5b7397';
  ctx.font = '11px monospace';
  ctx.fillText('鼠标=移动光源  Tab=切模式  R=重撒墙  G=墙隐身  空格=定格', 16, 640 - 6);
  ctx.fillStyle = '#ffd479';
  ctx.fillText('G 隐身墙后:亮区仍是一个多边形——它记得墙,只是不再画给你看', 16, 640 - 22);
}`
  },
  {
    type: 'text',
    title: '试一试（课内可选）',
    html: `<ul>
  <li><b>把光源拖进墙角：</b>可见多边形瞬间塌成一条缝——阴影的锐利边缘全由「墙角射线」定义，一个角一条硬边。</li>
  <li><b>切到格子 FOV（Tab）：</b>同样的墙，同样的光——连续多边形变成了格子颗粒。光照渲染和 roguelike 视野是同一道几何题的连续版与离散版。</li>
  <li><b>按 G 隐身墙：</b>墙消失但亮区纹丝不动——可见多边形只算一次，渲染只是把结果「上色」；遮挡信息在几何里，不在像素里。</li>
  <li><b>空格定格后移开鼠标：</b>沙盘停在上一刻——方便你数墙角射线（调试视图思维：把不可见的中间量画出来）。</li>
</ul>`
  },
  {
    type: 'source',
    title: '源码走读：Godot 的 2D 光照遮挡',
    files: [
      { path: 'servers/rendering/renderer_rd/shaders/canvas_occlusion.glsl', note: '2D 遮挡在 shader 侧的执行：遮挡图逐像素判定「这条光线被谁挡了」——本课射线求交的 GPU 化。建议搜索：occlusion、shadow。' },
      { path: 'scene/2d/light_occluder_2d.cpp', note: 'LightOccluder2D：把多边形遮挡体注册进画布——「墙段列表」在引擎里的资产形态。建议搜索：occluder、set_occluder_light_mask。' },
      { path: 'scene/2d/light_2d.cpp', note: '2D 灯光节点：位置/能量/阴影开关——灯光与遮挡体在画布渲染时汇合。建议搜索：set_shadow_enabled、texture、_update。' }
    ]
  },
  {
    type: 'text',
    title: '小结',
    html: `<p>2D 光照与视野，几何上就是「从一点出发的可见区域」：连续表示是可见多边形（墙角射线法），离散表示是格子 FOV（逐格 LOS）。把遮挡多边形注册进引擎，剩下的交给 shader 逐像素判——光照从来不是「亮度魔术」，是几何题。</p>
<ul>
  <li><b>数据怎么流动？</b>光源+遮挡多边形→射线求交→可见多边形→（多边形填充 或 逐格 LOS）→明暗上色。</li>
  <li><b>所有权归谁？</b>遮挡体归场景资产（LightOccluder2D），可见结果是每帧的临时品——光源动一动，全部重算。</li>
  <li><b>什么时候发生？</b>多边形每帧重算（几百次求交毫厘之间）；格子 FOV 按玩家移动/墙变化增量更新——roguelike 的「已探索记忆」就攒在它的输出上。</li>
</ul>`
  }
  ]
};
