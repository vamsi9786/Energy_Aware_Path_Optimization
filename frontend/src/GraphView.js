import React, { useEffect, useState, useRef } from 'react';

// Compute Dijkstra shortest path considering maintenance
function computeDijkstra(graph, start, end, currentTime = null, ignoreMaintenance = false) {
  const adj = {};
  graph.nodes.forEach(n => (adj[n.id] = []));
  graph.edges.forEach(e => {
    const underMaintenance = !ignoreMaintenance && currentTime !== null && e.maintenance?.some(m => {
      const startTime = new Date(m.start).getTime();
      const endTime = new Date(m.end).getTime();
      return currentTime >= startTime && currentTime <= endTime;
    });
    if (underMaintenance) return;
    adj[e.from].push({ to: e.to, weight: e.distance });
    adj[e.to].push({ to: e.from, weight: e.distance });
  });

  const dist = {};
  const prev = {};
  const pq = [];

  graph.nodes.forEach(n => {
    dist[n.id] = Infinity;
    prev[n.id] = null;
  });

  dist[start] = 0;
  pq.push([0, start]);

  while (pq.length > 0) {
    pq.sort((a, b) => a[0] - b[0]);
    const [d, node] = pq.shift();
    if (node === end) break;

    for (const edge of adj[node]) {
      const alt = d + edge.weight;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = node;
        pq.push([alt, edge.to]);
      }
    }
  }

  const path = [];
  let u = end;
  while (u != null) {
    path.unshift(u);
    u = prev[u];
  }
  return path.length > 1 ? path : [];
}

export default function GraphView({ graph, route, currentTime, ignoreMaintenance = false }) {
  const padding = 30;
  const svgWidth = 1180;
  const svgHeight = 900;

  const maxX = Math.max(...graph.nodes.map(n => n.x));
  const maxY = Math.max(...graph.nodes.map(n => n.y));
  const scaleX = (svgWidth - 2 * padding) / maxX;
  const scaleY = (svgHeight - 2 * padding) / maxY;
  const getPos = n => ({ x: n.x * scaleX + padding, y: n.y * scaleY + padding });

  const [cursorPos, setCursorPos] = useState(null);
  const animationRef = useRef(null);

  // Build edges for route animation
  const buildEdges = (path) => {
    if (!path || path.length < 2) return [];
    const nodesMap = Object.fromEntries(graph.nodes.map(n => [n.id, getPos(n)]));
    const edges = [];
    for (let i = 0; i < path.length - 1; i++) {
      const fromId = path[i];
      const toId = path[i + 1];
      edges.push({ from: nodesMap[fromId], to: nodesMap[toId], fromId, toId });
    }
    return edges;
  };

  // Animate moving cursor along route
  useEffect(() => {
    if (!route?.path || route.path.length < 2) {
      setCursorPos(null);
      return;
    }

    const pathEdges = buildEdges(route.path);
    let edgeIndex = 0;
    let t = 0;
    let lastTime = performance.now();

    const animate = (time) => {
      const delta = time - lastTime;
      lastTime = time;

      if (edgeIndex >= pathEdges.length) {
        setCursorPos(null);
        return cancelAnimationFrame(animationRef.current);
      }

      const { from, to } = pathEdges[edgeIndex];
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      const speed = 0.08; // Adjust speed
      t += (speed * delta) / length;

      if (t >= 1) {
        t = 0;
        edgeIndex++;
        if (edgeIndex < pathEdges.length) {
          setCursorPos({ ...pathEdges[edgeIndex].from });
        } else {
          setCursorPos(null);
          return cancelAnimationFrame(animationRef.current);
        }
      } else {
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        setCursorPos({ x, y });
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    cancelAnimationFrame(animationRef.current);
    animationRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationRef.current);
  }, [route]);

  const nowTime = currentTime ? new Date(currentTime).getTime() : Date.now();

  return (
    <svg width={svgWidth} height={svgHeight} style={{ border: '1px solid #ddd', background: '#fafafa' }}>

      {/* Draw edges */}
      {graph.edges.map((e, idx) => {
        const from = getPos(graph.nodes.find(n => n.id === e.from));
        const to = getPos(graph.nodes.find(n => n.id === e.to));

        const isOnRoute = route?.path?.some((p, i) =>
          route.path[i + 1] &&
          ((p === e.from && route.path[i + 1] === e.to) ||
           (p === e.to && route.path[i + 1] === e.from))
        );

        const isMaintenance = !ignoreMaintenance && e.maintenance?.some(m => {
          const startTime = typeof m.start === 'number' ? m.start : new Date(m.start).getTime();
          const endTime = typeof m.end === 'number' ? m.end : new Date(m.end).getTime();
          return nowTime >= startTime && nowTime <= endTime;
        });

        let strokeColor = '#999';
        if (isOnRoute) strokeColor = '#ff7f0e';
        else if (isMaintenance) strokeColor = 'green';

        return (
          <line
            key={idx}
            x1={from.x} y1={from.y}
            x2={to.x} y2={to.y}
            stroke={strokeColor}
            strokeWidth={isOnRoute ? 5 : 3}
          />
        );
      })}

      {/* Edge labels */}
      {graph.edges.map((e, idx) => {
        const from = getPos(graph.nodes.find(n => n.id === e.from));
        const to = getPos(graph.nodes.find(n => n.id === e.to));
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        const offset = Math.min(15, length / 4);
        const ox = -dy / length * offset;
        const oy = dx / length * offset;

        return (
          <text
            key={idx}
            x={mx + ox}
            y={my + oy}
            fontSize="12"
            fill="#222"
            textAnchor="middle"
            alignmentBaseline="middle"
          >
            {`ID:${idx} d:${e.distance}, e:${e.energy}`}
          </text>
        );
      })}

      {/* Draw nodes */}
      {graph.nodes.map(n => {
        const pos = getPos(n);
        const isInPath = route?.path?.includes(n.id);
        return (
          <g key={n.id}>
            <circle cx={pos.x} cy={pos.y} r={isInPath ? 12 : 10} fill={isInPath ? '#1f77b4' : '#555'} />
            <text x={pos.x + 14} y={pos.y + 5} fontSize="16" fill="#222">{n.id}</text>
          </g>
        );
      })}

      {/* Moving cursor */}
      {cursorPos && (
        <circle
          cx={cursorPos.x}
          cy={cursorPos.y}
          r={8}
          fill="red"
          stroke="#fff"
          strokeWidth={2}
          style={{ filter: "drop-shadow(0 0 6px red)" }}
        />
      )}
    </svg>
  );
}
