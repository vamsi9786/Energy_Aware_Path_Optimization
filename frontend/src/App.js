import React, { useEffect, useState } from 'react';
import GraphView from './GraphView';

const BACKEND = 'http://localhost:4000'; // Ensure port matches backend

export default function App() {
  const [graph, setGraph] = useState(null);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [alpha, setAlpha] = useState(1);
  const [beta, setBeta] = useState(1);
  const [route, setRoute] = useState(null);
  const [running, setRunning] = useState(false);

  const [nodeForm, setNodeForm] = useState({ id: '', x: '', y: '' });
  const [edgeForm, setEdgeForm] = useState({ from: '', to: '', distance: '', energy: '' });
  const [updateEdgeForm, setUpdateEdgeForm] = useState({ id: '', distance: '', energy: '' });
  const [deleteEdgeForm, setDeleteEdgeForm] = useState({ id: '' });
  const [deleteNodeForm, setDeleteNodeForm] = useState({ id: '' });

  const [maintenanceForm, setMaintenanceForm] = useState({ edgeId: '', start: '', end: '' });

  // ----------------- Fetch Graph -----------------
  const fetchGraph = async () => {
    const res = await fetch(`${BACKEND}/graph`);
    const data = await res.json();
    setGraph(data);
    if (data.nodes.length > 0) {
      setSource(prev => prev || data.nodes[0].id);
      setTarget(prev => prev || data.nodes[data.nodes.length - 1].id);
    }
  };

  useEffect(() => { fetchGraph(); }, []);

  // Recompute route if graph changes while running
  useEffect(() => {
    if (running && source && target) runRoute();
  }, [graph]);

  // ----------------- Routing -----------------
  const runRoute = async (ignoreMaintenance = false) => {
  if (!source || !target) return;

  const currentTime = new Date().toISOString(); 

  const res = await fetch(`${BACKEND}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      source, 
      target, 
      alpha: Number(alpha), 
      beta: Number(beta), 
      ignoreMaintenance,
      currentTime
    })
  });
  const data = await res.json();
  if (data.error) { alert('No feasible path: ' + data.error); return; }
  setRoute(data);
  setRunning(true);
};


  // ----------------- Node / Edge CRUD -----------------
  const addNode = async e => {
    e.preventDefault();
    const { id, x, y } = nodeForm;
    if (!id || isNaN(Number(x)) || isNaN(Number(y))) return;
    await fetch(`${BACKEND}/node`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, x: Number(x), y: Number(y) })
    });
    setNodeForm({ id: '', x: '', y: '' });
    fetchGraph();
  };

  const deleteNode = async e => {
    e.preventDefault();
    const { id } = deleteNodeForm;
    if (!id) return;
    await fetch(`${BACKEND}/node/${id}`, { method: 'DELETE' });
    setDeleteNodeForm({ id: '' });
    fetchGraph();
  };

  const addEdge = async e => {
    e.preventDefault();
    const { from, to, distance, energy } = edgeForm;
    if (!from || !to || isNaN(Number(distance)) || isNaN(Number(energy))) return;
    await fetch(`${BACKEND}/edge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, distance: Number(distance), energy: Number(energy) })
    });
    setEdgeForm({ from: '', to: '', distance: '', energy: '' });
    fetchGraph();
  };

  const updateEdge = async e => {
    e.preventDefault();
    const { id, distance, energy } = updateEdgeForm;
    if (id === '' || isNaN(Number(id)) || isNaN(Number(distance)) || isNaN(Number(energy))) return;
    await fetch(`${BACKEND}/edge/${Number(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ distance: Number(distance), energy: Number(energy) })
    });
    setUpdateEdgeForm({ id: '', distance: '', energy: '' });
    fetchGraph();
  };

  const deleteEdge = async e => {
    e.preventDefault();
    const { id } = deleteEdgeForm;
    if (!id) return;
    await fetch(`${BACKEND}/edge/${id}`, { method: 'DELETE' });
    setDeleteEdgeForm({ id: '' });
    fetchGraph();
  };

  // ----------------- Maintenance -----------------
  const addMaintenance = async e => {
  e.preventDefault();
  const { edgeId, start, end } = maintenanceForm;
  if (!edgeId || !start || !end) return;

  const res = await fetch(`${BACKEND}/edge/${edgeId}/maintenance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ start, end })
  });
  const data = await res.json();
  if (!data.success) { alert('Failed to add maintenance'); return; }

  setGraph(prevGraph => {
    const newEdges = prevGraph.edges.map(e => {
      if (e.id === Number(edgeId)) {
        return {
          ...e,
          maintenance: [...e.maintenance, { start: new Date(start).getTime(), end: new Date(end).getTime(), id: data.id }]
        };
      }
      return e;
    });
    return { ...prevGraph, edges: newEdges };
  });

  setMaintenanceForm({ edgeId: '', start: '', end: '' });
};


 const deleteMaintenance = async (from, to, id) => {
  await fetch(`${BACKEND}/edge/${from}/${to}/maintenance/${id}`, { method: 'DELETE' });
  fetchGraph(); 
};

  return (
    <div className="app">
      <div className="controls-top">
        <h2>Dynamic Energy-Aware Routing</h2>

        {/* Source / Target */}
        <div className="row">
          <label>Source:</label>
          <select value={source} onChange={e => setSource(e.target.value)}>
            {graph?.nodes?.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
          </select>
          <label>Target:</label>
          <select value={target} onChange={e => setTarget(e.target.value)}>
            {graph?.nodes?.map(n => <option key={n.id} value={n.id}>{n.id}</option>)}
          </select>
        </div>

        {/* Alpha / Beta sliders */}
        <div className="row">
          <label>α (distance):</label>
          <input type="range" min="0" max="1" step="0.1" value={alpha} onChange={e => setAlpha(e.target.value)} />
          <span>{alpha}</span>
        </div>
        <div className="row">
          <label>β (energy):</label>
          <input type="range" min="0" max="1" step="0.1" value={beta} onChange={e => setBeta(e.target.value)} />
          <span>{beta}</span>
        </div>

        <div className="row">
          <button onClick={() => runRoute(false)}>Compute Route</button>
          <button onClick={() => runRoute(true)}>Compute Ignoring Maintenance</button>
          <button onClick={() => { setRoute(null); setRunning(false); }}>Reset</button>
        </div>

        {/* Route info */}
        {route && (
          <div className="info">
            <h4>Route Result</h4>
            <p><strong>Path:</strong> {route.path.join(' → ')}</p>
            <p><strong>Total distance:</strong> {route.distance}</p>
            <p><strong>Total energy:</strong> {route.energy}</p>
          </div>
        )}
        
        {/* Node / Edge / Maintenance Forms */}
        {/* Node */}
        <form onSubmit={addNode} className="form-section">
          <h4>Add Node</h4>
          <input placeholder="ID" value={nodeForm.id} onChange={e => setNodeForm({ ...nodeForm, id: e.target.value })} />
          <input placeholder="X" type="number" value={nodeForm.x} onChange={e => setNodeForm({ ...nodeForm, x: e.target.value })} />
          <input placeholder="Y" type="number" value={nodeForm.y} onChange={e => setNodeForm({ ...nodeForm, y: e.target.value })} />
          <button type="submit">Add Node</button>
        </form>
        <form onSubmit={deleteNode} className="form-section">
          <h4>Delete Node</h4>
          <input placeholder="Node ID" value={deleteNodeForm.id} onChange={e => setDeleteNodeForm({ id: e.target.value })} />
          <button type="submit">Delete Node</button>
        </form>

        {/* Edge */}
        <form onSubmit={addEdge} className="form-section">
          <h4>Add Edge</h4>
          <input placeholder="From" value={edgeForm.from} onChange={e => setEdgeForm({ ...edgeForm, from: e.target.value })} />
          <input placeholder="To" value={edgeForm.to} onChange={e => setEdgeForm({ ...edgeForm, to: e.target.value })} />
          <input placeholder="Distance" type="number" value={edgeForm.distance} onChange={e => setEdgeForm({ ...edgeForm, distance: e.target.value })} />
          <input placeholder="Energy" type="number" value={edgeForm.energy} onChange={e => setEdgeForm({ ...edgeForm, energy: e.target.value })} />
          <button type="submit">Add Edge</button>
        </form>
        <form onSubmit={updateEdge} className="form-section">
          <h4>Update Edge</h4>
          <input placeholder="Edge ID" value={updateEdgeForm.id} onChange={e => setUpdateEdgeForm({ ...updateEdgeForm, id: e.target.value })} />
          <input placeholder="Distance" type="number" value={updateEdgeForm.distance} onChange={e => setUpdateEdgeForm({ ...updateEdgeForm, distance: e.target.value })} />
          <input placeholder="Energy" type="number" value={updateEdgeForm.energy} onChange={e => setUpdateEdgeForm({ ...updateEdgeForm, energy: e.target.value })} />
          <button type="submit">Update Edge</button>
        </form>
        <form onSubmit={deleteEdge} className="form-section">
          <h4>Delete Edge</h4>
          <input placeholder="Edge ID" value={deleteEdgeForm.id} onChange={e => setDeleteEdgeForm({ ...deleteEdgeForm, id: e.target.value })} />
          <button type="submit">Delete Edge</button>
        </form>

        {/* Maintenance */}
        <form onSubmit={addMaintenance} className="form-section">
          <h4>Schedule Maintenance</h4>
          <input placeholder="Edge ID" value={maintenanceForm.edgeId} onChange={e => setMaintenanceForm({ ...maintenanceForm, edgeId: e.target.value })} />
          <input type="datetime-local" placeholder="Start" value={maintenanceForm.start} onChange={e => setMaintenanceForm({ ...maintenanceForm, start: e.target.value })} />
          <input type="datetime-local" placeholder="End" value={maintenanceForm.end} onChange={e => setMaintenanceForm({ ...maintenanceForm, end: e.target.value })} />
          <button type="submit">Add Maintenance</button>
        </form>

        {/* Display Maintenance */}
        {graph?.edges?.map(edge => (
  <div key={`${edge.from}-${edge.to}`} className="maintenance-info">
    <strong>Edge {edge.from} → {edge.to}</strong>
    {edge.maintenance?.length ? (
  <ul>
    {edge.maintenance.map(m => (
      <li key={m.id}>
        Start: {new Date(m.start).toLocaleString()} - End: {new Date(m.end).toLocaleString()}
        <button onClick={() => deleteMaintenance(edge.from, edge.to, m.id)}>Delete</button>
      </li>
    ))}
  </ul>
) : <p>No maintenance scheduled</p>}
  </div>
))}

      </div>

      {/* Graph Canvas */}
      <div className="canvas">
        {graph ? <GraphView graph={graph} route={route} /> : <p>Loading graph...</p>}
      </div>
    </div>
  );
}
