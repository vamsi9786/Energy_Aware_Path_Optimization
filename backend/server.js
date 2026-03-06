const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const graphPath = path.join(__dirname, 'graph.json');
let graphData = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

// ----------------- Pairing Heap -----------------
class PairingHeapNode {
  constructor(item, priority) {
    this.item = item;
    this.priority = priority;
    this.child = null;
    this.sibling = null;
    this.parent = null;
  }
}

class PairingHeap {
  constructor() { this.root = null; }

  isEmpty() { return this.root === null; }

  merge(h1, h2) {
    if (!h1) return h2;
    if (!h2) return h1;
    if (h1.priority <= h2.priority) {
      h2.sibling = h1.child;
      h1.child = h2;
      h2.parent = h1;
      return h1;
    } else {
      h1.sibling = h2.child;
      h2.child = h1;
      h1.parent = h2;
      return h2;
    }
  }

  insert(item, priority) {
    const node = new PairingHeapNode(item, priority);
    this.root = this.merge(this.root, node);
    return node; // return handle for decrease-key
  }

  pop() {
    if (!this.root) return null;
    const minItem = this.root.item;
    this.root = this._mergePairs(this.root.child);
    if (this.root) this.root.parent = null;
    return minItem;
  }

  _mergePairs(first) {
    if (!first || !first.sibling) return first;
    const a = first;
    const b = first.sibling;
    const rest = first.sibling.sibling;
    a.sibling = b.sibling = null;
    return this.merge(this.merge(a, b), this._mergePairs(rest));
  }

  decreaseKey(node, newPriority) {
    if (newPriority >= node.priority) return;
    node.priority = newPriority;
    if (node !== this.root) {
      if (node.parent.child === node) node.parent.child = node.sibling;
      else {
        let curr = node.parent.child;
        while (curr.sibling !== node) curr = curr.sibling;
        curr.sibling = node.sibling;
      }
      node.sibling = null;
      node.parent = null;
      this.root = this.merge(this.root, node);
    }
  }
}

// ----------------- Interval Tree -----------------
class IntervalNode {
  constructor(start, end, id) {
    this.start = start;
    this.end = end;
    this.id = id;
    this.maxEnd = end;
    this.left = null;
    this.right = null;
  }
}

class IntervalTree {
  constructor() { this.root = null; }

  insert(start, end, id) {
    this.root = this._insert(this.root, new IntervalNode(start, end, id));
  }

  _insert(node, newNode) {
    if (!node) return newNode;
    if (newNode.start < node.start) node.left = this._insert(node.left, newNode);
    else node.right = this._insert(node.right, newNode);
    node.maxEnd = Math.max(node.maxEnd, newNode.end);
    return node;
  }

  removeById(id) {
    const dfs = (node) => {
      if (!node) return null;
      if (node.id === id) {
        if (!node.left) return node.right;
        if (!node.right) return node.left;
        let succ = node.right;
        while (succ.left) succ = succ.left;
        node.start = succ.start;
        node.end = succ.end;
        node.id = succ.id;
        node.right = dfs(node.right, succ.id);
      } else {
        node.left = dfs(node.left);
        node.right = dfs(node.right);
      }
      node.maxEnd = node.end;
      if (node.left) node.maxEnd = Math.max(node.maxEnd, node.left.maxEnd);
      if (node.right) node.maxEnd = Math.max(node.maxEnd, node.right.maxEnd);
      return node;
    };
    this.root = dfs(this.root);
  }

  queryPoint(time) {
    const dfs = (node) => {
      if (!node) return false;
      if (time >= node.start && time <= node.end) return true;
      if (node.left && node.left.maxEnd >= time) return dfs(node.left);
      return dfs(node.right);
    };
    return dfs(this.root);
  }

  listIntervals() {
    const res = [];
    const dfs = node => {
      if (!node) return;
      dfs(node.left);
      res.push({ start: node.start, end: node.end, id: node.id });
      dfs(node.right);
    };
    dfs(this.root);
    return res;
  }
}

// ----------------- LCT Node -----------------
class LCTNode {
  constructor(id) { this.id = id; this.parent = null; this.left = null; this.right = null; this.edgeWeight = 0; }
}

// ----------------- Graph Storage -----------------
const nodesMap = {};
const edgesMap = {};

graphData.nodes.forEach(n => nodesMap[n.id] = new LCTNode(n.id));
graphData.edges.forEach((e, idx) => {
  edgesMap[idx] = { 
    id: idx, ...e, inMST: false, maintenanceTree: new IntervalTree() 
  };
  e.maintenance.forEach(m => edgesMap[idx].maintenanceTree.insert(m.start, m.end, m.id || Date.now()));
});

// ----------------- Dynamic Adjacency -----------------
function buildAdj(currentTime = null, ignoreMaintenance = false) {
  const adj = {};
  Object.keys(nodesMap).forEach(n => adj[n] = []);
  Object.values(edgesMap).forEach(e => {
    if (!ignoreMaintenance && currentTime !== null && e.maintenanceTree.queryPoint(currentTime)) return;
    adj[e.from].push({ to: e.to, distance: e.distance, energy: e.energy });
    adj[e.to].push({ to: e.from, distance: e.distance, energy: e.energy });
  });
  return adj;
}

// ----------------- Energy-Aware Dijkstra -----------------
function energyAwareRoute(source, target, alpha=1, beta=1, ignoreMaintenance=false, currentTime=null) {
  const adj = buildAdj(currentTime, ignoreMaintenance);
  if (!adj[source] || !adj[target]) return {error:'invalid source/target'};

  const dist = {}, energy = {}, fScore = {}, prev = {};
  const nodeHandles = {};
  Object.keys(adj).forEach(n => { dist[n]=Infinity; energy[n]=Infinity; fScore[n]=Infinity; prev[n]=null; });

  dist[source] = 0; energy[source] = 0; fScore[source] = 0;
  const heap = new PairingHeap();
  nodeHandles[source] = heap.insert(source, fScore[source]);

  while(!heap.isEmpty()) {
    const u = heap.pop();
    if(u === undefined) break;

    for(const e of adj[u]) {
      const v = e.to;
      const newDist = dist[u] + e.distance;
      const newEnergy = energy[u] + e.energy;
      const newF = alpha*newDist + beta*newEnergy;
      if(newF < fScore[v]){
        dist[v]=newDist; energy[v]=newEnergy; fScore[v]=newF; prev[v]=u;
        if(!nodeHandles[v]) nodeHandles[v] = heap.insert(v,newF);
        else heap.decreaseKey(nodeHandles[v], newF);
      }
    }
  }

  if(fScore[target]===Infinity) return {error:'no feasible path'};
  const path = []; let cur = target;
  while(cur){ path.push(cur); cur=prev[cur]; }
  path.reverse();
  return {path, distance: dist[target], energy: energy[target], fScore: fScore[target]};
}

// ----------------- LCT & MST -----------------
function findRoot(u) { while(u.parent) u = u.parent; return u; }
function link(u,v,weight){ u.parent=v; u.edgeWeight=weight; }
function addEdgeMST(edge){ const u=nodesMap[edge.from]; const v=nodesMap[edge.to]; if(findRoot(u)!==findRoot(v)){ link(u,v,edge.distance); edge.inMST=true; } }
function buildInitialMST(){ Object.values(edgesMap).sort((a,b)=>a.distance-b.distance).forEach(e=>addEdgeMST(e)); }
buildInitialMST();

// ----------------- API Endpoints -----------------
app.get('/graph',(req,res)=>res.json(graphData));

app.post('/route',(req,res)=>{
  const {source,target,alpha,beta,ignoreMaintenance,currentTime} = req.body;
  let timeMs = currentTime ? new Date(currentTime).getTime() : null;
  res.json(energyAwareRoute(source, target, alpha||1, beta||1, ignoreMaintenance===true, timeMs));
});

// ----------------- Node / Edge CRUD -----------------

app.post('/node',(req,res)=>{
  const { id, x, y } = req.body;
  if(nodesMap[id]) return res.json({error:'node exists'});
  nodesMap[id]=new LCTNode(id);
  graphData.nodes.push({id,x,y});
  fs.writeFileSync(graphPath, JSON.stringify(graphData,null,2));
  res.json({success:true});
});

app.delete('/node/:id',(req,res)=>{
  const id=req.params.id;
  if(!nodesMap[id]) return res.json({error:'invalid node'});
  delete nodesMap[id];
  graphData.nodes = graphData.nodes.filter(n=>n.id!==id);
  Object.keys(edgesMap).forEach(k=>{
    const e=edgesMap[k]; if(e.from===id||e.to===id) delete edgesMap[k];
  });
  graphData.edges=Object.values(edgesMap).map((e, idx)=>({...e, id: idx, maintenance:e.maintenanceTree.listIntervals()}));
  fs.writeFileSync(graphPath, JSON.stringify(graphData,null,2));
  res.json({success:true});
});

app.post('/edge',(req,res)=>{
  const { from, to, distance, energy } = req.body;
  const idx=Object.keys(edgesMap).length;
  edgesMap[idx]={ id: idx, from, to, distance, energy, inMST:false, maintenanceTree:new IntervalTree() };
  addEdgeMST(edgesMap[idx]);
  graphData.edges.push({ id: idx, from, to, distance, energy, maintenance: [] });
  fs.writeFileSync(graphPath, JSON.stringify(graphData,null,2));
  res.json({success:true});
});

app.put('/edge/:id',(req,res)=>{
  const id=Number(req.params.id);
  if(!edgesMap[id]) return res.json({error:'invalid edge'});
  const { distance, energy }=req.body;
  edgesMap[id].distance=distance; edgesMap[id].energy=energy;
  graphData.edges=Object.values(edgesMap).map((e, idx)=>({...e, id: idx, maintenance:e.maintenanceTree.listIntervals()}));
  fs.writeFileSync(graphPath, JSON.stringify(graphData,null,2));
  res.json({success:true, edge: edgesMap[id]});
});

app.delete('/edge/:id',(req,res)=>{
  const id=Number(req.params.id);
  if(!edgesMap[id]) return res.json({error:'invalid edge'});
  delete edgesMap[id];
  graphData.edges=Object.values(edgesMap).map((e, idx)=>({...e, id: idx, maintenance:e.maintenanceTree.listIntervals()}));
  fs.writeFileSync(graphPath, JSON.stringify(graphData,null,2));
  res.json({success:true});
});

// ----------------- Maintenance -----------------
app.post('/edge/:id/maintenance', (req,res)=>{
  const id = Number(req.params.id); 
  if(!edgesMap[id]) return res.json({error:'invalid edge'});

  const startTime = new Date(req.body.start).getTime();
  const endTime = new Date(req.body.end).getTime();
  const intervalId = Date.now(); // unique ID

  edgesMap[id].maintenanceTree.insert(startTime, endTime, intervalId);

  if(!graphData.edges[id].maintenance) graphData.edges[id].maintenance = [];
  graphData.edges[id].maintenance.push({ start: startTime, end: endTime, id: intervalId });

  fs.writeFileSync(graphPath, JSON.stringify(graphData, null, 2));
  res.json({success:true, id: intervalId});
});

app.delete('/edge/:from/:to/maintenance/:id', (req, res) => {
  const { from, to, id } = req.params;
  const edge = graphData.edges.find(e => e.from === from && e.to === to);
  if (!edge) return res.status(404).json({ error: 'Edge not found' });

  const intervalId = Number(id);
  edge.maintenance = edge.maintenance.filter(m => m.id !== intervalId);

  fs.writeFileSync('graph.json', JSON.stringify(graphData, null, 2));
  res.json({ success: true });
});

// ----------------- Start Server -----------------
const PORT = 4000;
app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
