import React, { useState, useEffect, useRef } from 'react';
import Chart from 'react-apexcharts';
import L from 'leaflet';
import { EVSimulator } from './data-simulator';

// Fast chargers data in Mumbai
const CHARGERS = [
    { name: "DBIT Fast Charger (Kurla)", lat: 19.0790, lng: 72.8884 },
    { name: "Powai Plaza DC Charger", lat: 19.1176, lng: 72.9060 },
    { name: "Bandra Reclamation Charging Hub", lat: 19.0550, lng: 72.8250 }
];

export default function App() {
    // 1. Simulator & State Setup
    const simulatorRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef({});
    
    const [vehicles, setVehicles] = useState([]);
    const [alerts, setAlerts] = useState([]);
    const [sessionDist, setSessionDist] = useState(0);
    const [activeVehicleId, setActiveVehicleId] = useState("EV-101");
    const [activeView, setActiveView] = useState("fleet-overview");
    const [simSpeed, setSimSpeed] = useState(1);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
    const [toasts, setToasts] = useState([]);

    // Federated Learning Simulation States
    const [flRound, setFlRound] = useState(1);
    const [flAccuracy, setFlAccuracy] = useState(82.40);
    const [flEpoch, setFlEpoch] = useState(1);
    const [flPhase, setFlPhase] = useState("training"); // training, uploading, aggregating, broadcast
    const [flCentralStatus, setFlCentralStatus] = useState("Waiting for local edge training weight matrix uploads...");

    // Telemetry History for Selected Vehicle
    const [telemetryHistory, setTelemetryHistory] = useState({
        speed: [],
        mtemp: [],
        energy: [],
        counter: 0
    });

    const activeEV = vehicles.find(v => v.id === activeVehicleId) || null;

    // Toast Generator Helper
    const addToast = (title, message, type = "info") => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, title, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 5000);
    };

    // 2. Initialize Simulator Instance
    useEffect(() => {
        const sim = new EVSimulator();
        simulatorRef.current = sim;
        
        // Initial set
        setVehicles([...sim.vehicles]);
        
        sim.start((updatedVehicles, updatedAlerts, dist) => {
            setVehicles(updatedVehicles);
            setAlerts(updatedAlerts);
            setSessionDist(dist);
        });

        // Listen for simulation triggers
        const handleNewAlert = (e) => {
            const alert = e.detail;
            if (alert.severity === 'critical') {
                addToast(`CRITICAL: ${alert.title}`, `${alert.desc} (Vehicle ${alert.vehicleId})`, "danger");
            } else if (alert.severity === 'warning') {
                addToast(`WARNING: ${alert.title}`, `${alert.desc} (Vehicle ${alert.vehicleId})`, "warning");
            }
        };
        document.addEventListener("new_simulation_alert", handleNewAlert);

        return () => {
            sim.stop();
            document.removeEventListener("new_simulation_alert", handleNewAlert);
        };
    }, []);

    // 3. Telemetry Graph Buffer update on Tick
    useEffect(() => {
        if (!activeEV) return;

        setTelemetryHistory(prev => {
            const nextCounter = prev.counter + 1;
            const nextSpeed = [...prev.speed, { x: nextCounter, y: activeEV.performance.speed }];
            const nextMtemp = [...prev.mtemp, { x: nextCounter, y: activeEV.performance.motorTemp }];
            const nextEnergy = [...prev.energy, { x: nextCounter, y: Math.round(activeEV.performance.energyCons * 100) }];

            // Slice arrays to fit sliding window limit
            if (nextSpeed.length > 20) {
                nextSpeed.shift();
                nextMtemp.shift();
                nextEnergy.shift();
            }

            return {
                speed: nextSpeed,
                mtemp: nextMtemp,
                energy: nextEnergy,
                counter: nextCounter
            };
        });
    }, [vehicles, activeVehicleId]);

    // Reset history when switching selected vehicles
    useEffect(() => {
        setTelemetryHistory({ speed: [], mtemp: [], energy: [], counter: 0 });
    }, [activeVehicleId]);

    // 4. Leaflet Map Binding
    useEffect(() => {
        if (activeView !== "fleet-overview" || vehicles.length === 0) return;

        // Initialize Map
        if (!mapRef.current) {
            mapRef.current = L.map("leaflet-map", {
                zoomControl: false,
                attributionControl: false
            }).setView([19.1000, 72.8800], 12);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                maxZoom: 19
            }).addTo(mapRef.current);

            L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);

            // Charger stations
            const chargerIcon = L.divIcon({
                className: 'custom-leaflet-marker',
                html: `<div class="marker-pin marker-charging" style="background:#00e5ff; box-shadow: 0 0 8px rgba(0, 229, 255, 0.4);"><i class="fa-solid fa-charging-station"></i></div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            CHARGERS.forEach(ch => {
                L.marker([ch.lat, ch.lng], { icon: chargerIcon })
                    .addTo(mapRef.current)
                    .bindPopup(`<strong style="color:#fff;">${ch.name}</strong><br/><span style="color:#a1a1aa; font-size:10px;">Level 3 DC Fast Charger (150kW)</span>`);
            });
        }

        // Update markers coordinate mapping
        vehicles.forEach(ev => {
            let marker = markersRef.current[ev.id];
            
            let statusColorClass = "marker-ok";
            let iconHtml = '<i class="fa-solid fa-truck"></i>';
            if (ev.status === "Critical") statusColorClass = "marker-critical";
            if (ev.status === "Warning") statusColorClass = "marker-warning";
            if (ev.status === "Charging") {
                statusColorClass = "marker-charging";
                iconHtml = '<i class="fa-solid fa-charging-station"></i>';
            }
            if (ev.status === "Maintenance") {
                statusColorClass = "marker-maintenance";
                iconHtml = '<i class="fa-solid fa-wrench"></i>';
            }

            const markerIcon = L.divIcon({
                className: 'custom-leaflet-marker',
                html: `<div class="marker-pin ${statusColorClass}">${iconHtml}<span>${ev.id}</span></div>`,
                iconSize: [42, 42],
                iconAnchor: [21, 21]
            });

            // Popup layout
            let popupBadge = `<span class="mini-badge success">Active</span>`;
            if (ev.status === "Critical") popupBadge = `<span class="mini-badge danger">CRITICAL</span>`;
            if (ev.status === "Warning") popupBadge = `<span class="mini-badge warning">WARNING</span>`;
            if (ev.status === "Charging") popupBadge = `<span class="mini-badge info">CHARGING</span>`;
            if (ev.status === "Maintenance") popupBadge = `<span class="mini-badge muted">MAINTENANCE</span>`;

            const popupContent = `
                <div style="font-family: var(--font-body); color: #fff; min-width: 160px; padding: 4px;">
                    <div style="font-weight: 700; font-family: var(--font-header); font-size: 13px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                        <span>${ev.id}</span> ${popupBadge}
                    </div>
                    <div style="font-size: 11px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 8px;">
                        <strong>Driver:</strong> ${ev.driver}<br/>
                        <strong>Battery:</strong> ${ev.battery.soc}%<br/>
                        <strong>Speed:</strong> ${ev.performance.speed} km/h
                    </div>
                </div>
            `;

            if (!marker) {
                marker = L.marker([ev.lat, ev.lng], { icon: markerIcon }).addTo(mapRef.current);
                marker.bindPopup(popupContent);
                marker.on('click', () => {
                    setActiveVehicleId(ev.id);
                });
                markersRef.current[ev.id] = marker;
            } else {
                marker.setLatLng([ev.lat, ev.lng]);
                marker.setIcon(markerIcon);
                marker.setPopupContent(popupContent);
            }
        });

    }, [activeView, vehicles]);

    // Force map dimensions recalculation on tab changes
    useEffect(() => {
        if (activeView === "fleet-overview" && mapRef.current) {
            setTimeout(() => mapRef.current.invalidateSize(), 250);
        }
    }, [activeView]);

    // 5. Federated Learning Loop (React state tick)
    useEffect(() => {
        if (activeView !== "federated-learning") return;

        const timer = setInterval(() => {
            setFlPhase(prevPhase => {
                if (prevPhase === "training") {
                    setFlEpoch(prevEpoch => {
                        if (prevEpoch >= 5) {
                            setFlCentralStatus("Receiving weight updates from edge EV nodes...");
                            return 1;
                        }
                        return prevEpoch + 1;
                    });
                    return flEpoch >= 5 ? "uploading" : "training";
                }
                if (prevPhase === "uploading") {
                    setFlCentralStatus("Running Federated Averaging (FedAvg) aggregation...");
                    return "aggregating";
                }
                if (prevPhase === "aggregating") {
                    setFlCentralStatus("Aggregated global weights completed. Broadcasting model update...");
                    return "broadcast";
                }
                if (prevPhase === "broadcast") {
                    setFlRound(r => r + 1);
                    setFlAccuracy(acc => Math.min(99.6, acc + (100 - acc) * 0.08 + Math.random() * 0.2));
                    setFlCentralStatus("Broadcasting aggregated global model parameters back to edge EVs...");
                    addToast("FL Round Aggregated", `Federated Learning update round complete. Global Accuracy is now ${flAccuracy.toFixed(2)}%`, "info");
                    return "training";
                }
                return "training";
            });
        }, 2000);

        return () => clearInterval(timer);
    }, [activeView, flEpoch, flAccuracy]);

    // 6. Interactive Command Actions
    const handleSpeedChange = (speed) => {
        setSimSpeed(speed);
        if (simulatorRef.current) {
            simulatorRef.current.setSpeed(speed, (updatedVehicles, updatedAlerts, dist) => {
                setVehicles(updatedVehicles);
                setAlerts(updatedAlerts);
                setSessionDist(dist);
            });
        }
    };

    const handleInjectFault = (type) => {
        if (simulatorRef.current) {
            const ev = vehicles.find(v => v.id === activeVehicleId);
            if (ev) {
                if (ev.activeFaults.includes(type)) {
                    simulatorRef.current.resolveFault(activeVehicleId);
                } else {
                    simulatorRef.current.injectFault(activeVehicleId, type);
                }
                setVehicles([...simulatorRef.current.vehicles]);
            }
        }
    };

    const handleScheduleService = () => {
        if (simulatorRef.current) {
            simulatorRef.current.scheduleService(activeVehicleId);
            setVehicles([...simulatorRef.current.vehicles]);
            addToast("Maintenance Routed", `Vehicle ${activeVehicleId} has been pulled from active duty.`);
        }
    };

    const handleClearFaults = () => {
        if (simulatorRef.current) {
            simulatorRef.current.resolveFault(activeVehicleId);
            setVehicles([...simulatorRef.current.vehicles]);
            addToast("Faults Reset", `Diagnostic trouble codes cleared for ${activeVehicleId}.`);
        }
    };

    // 7. ApexCharts Plot options
    // Fleet SoC Donut Chart
    let crit = 0, mod = 0, healthy = 0;
    vehicles.forEach(v => {
        if (v.battery.soc < 20) crit++;
        else if (v.battery.soc < 60) mod++;
        else healthy++;
    });

    const fleetSocChart = {
        options: {
            chart: { type: 'donut', background: 'transparent', foreColor: '#94a3b8', fontFamily: 'Outfit, sans-serif' },
            labels: ['Critical (< 20%)', 'Moderate (20 - 60%)', 'Healthy (> 60%)'],
            colors: ['#e63946', '#ffb703', '#06d6a0'],
            plotOptions: {
                pie: {
                    donut: {
                        size: '75%',
                        labels: {
                            show: true,
                            name: { show: true, fontSize: '11px', fontFamily: 'Outfit, sans-serif' },
                            value: { show: true, fontSize: '18px', fontFamily: 'Outfit, sans-serif', fontWeight: 'bold', color: '#fff' },
                            total: { show: true, label: 'Vehicles', formatter: () => vehicles.length }
                        }
                    }
                }
            },
            stroke: { show: false },
            legend: { position: 'bottom', labels: { colors: '#94a3b8' } },
            dataLabels: { enabled: false },
            tooltip: { theme: 'dark' }
        },
        series: [crit, mod, healthy]
    };

    // State of Health vs Cycles Line Chart
    const sohDegradationChart = {
        options: {
            chart: { type: 'line', toolbar: { show: false }, background: 'transparent', foreColor: '#94a3b8', fontFamily: 'Outfit, sans-serif' },
            xaxis: { categories: vehicles.map(v => v.id), labels: { style: { colors: '#94a3b8' } } },
            yaxis: [
                { title: { text: 'SoH %', style: { color: '#fd9e02' } }, labels: { style: { colors: '#94a3b8' } }, max: 100, min: 80 },
                { opposite: true, title: { text: 'Cycles', style: { color: '#fb8500' } }, labels: { style: { colors: '#94a3b8' } } }
            ],
            colors: ['#fd9e02', '#fb8500'],
            stroke: { width: [3, 2], curve: 'smooth' },
            grid: { borderColor: 'rgba(255, 255, 255, 0.05)' },
            legend: { labels: { colors: '#94a3b8' } },
            tooltip: { theme: 'dark' }
        },
        series: [
            { name: 'State of Health (SoH %)', data: vehicles.map(v => v.battery.soh) },
            { name: 'Charge Cycles', data: vehicles.map(v => v.battery.cycles) }
        ]
    };

    // Live Telemetry Line Chart
    const liveTelemetryChart = {
        options: {
            chart: { id: 'realtime-telemetry', type: 'line', toolbar: { show: false }, animations: { enabled: true, easing: 'linear', dynamicAnimation: { speed: 1000 } }, background: 'transparent', foreColor: '#94a3b8', fontFamily: 'Outfit, sans-serif' },
            stroke: { width: 2.5, curve: 'smooth' },
            colors: ['#e63946', '#fd9e02', '#06d6a0'],
            xaxis: { type: 'numeric', range: 10, labels: { show: false } },
            yaxis: { labels: { style: { colors: '#94a3b8' } }, min: 0, max: 120 },
            grid: { borderColor: 'rgba(255, 255, 255, 0.05)' },
            legend: { labels: { colors: '#94a3b8' } },
            tooltip: { theme: 'dark' }
        },
        series: [
            { name: 'Motor Temp (°C)', data: telemetryHistory.mtemp },
            { name: 'Speed (km/h)', data: telemetryHistory.speed },
            { name: 'Energy Cons (x100 kWh/km)', data: telemetryHistory.energy }
        ]
    };

    // Component Wear Bar Chart
    const getComponentWearSeries = () => {
        if (!activeEV) return [0, 0, 0, 0];
        const batteryDeg = 100 - activeEV.battery.soh;
        const brakeWear = activeEV.performance.brakeWear;
        
        let maxPressureDrop = 0;
        ["fl", "fr", "rl", "rr"].forEach(t => {
            const press = activeEV.performance.tirePressure[t];
            const drop = press < 32 ? ((32 - press) / 32) * 100 : 0;
            if (drop > maxPressureDrop) maxPressureDrop = drop;
        });

        const motorStress = activeEV.activeFaults.includes("motor_vibration") ? 88 : (activeEV.performance.motorTemp / 120) * 100;

        return [
            Math.round(batteryDeg * 8), 
            Math.round(brakeWear),
            Math.round(maxPressureDrop * 2), 
            Math.round(motorStress)
        ];
    };

    const componentWearChart = {
        options: {
            chart: { type: 'bar', toolbar: { show: false }, background: 'transparent', foreColor: '#94a3b8', fontFamily: 'Outfit, sans-serif' },
            plotOptions: { bar: { borderRadius: 3, horizontal: true, distributed: true, barHeight: '50%' } },
            xaxis: { categories: ['Battery Deg', 'Brake Wear', 'Tire Wear', 'Motor Stress'], labels: { style: { colors: '#94a3b8' } }, max: 100 },
            colors: ['#fd9e02', '#ffb703', '#cbd5e1', '#e63946'],
            grid: { borderColor: 'rgba(255, 255, 255, 0.05)' },
            legend: { show: false },
            tooltip: { theme: 'dark' }
        },
        series: [{ name: 'Wear / Risk (%)', data: getComponentWearSeries() }]
    };

    // 8. Search & Table Filter Logic
    const filteredVehicles = vehicles.filter(ev => {
        const matchesSearch = ev.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              ev.driver.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              ev.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              ev.route.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = statusFilter === "ALL" || ev.status.toUpperCase() === statusFilter;
        return matchesSearch && matchesFilter;
    });

    // 9. Generative AI Diagnostic Report Generator
    const getAIDiagnosticReport = () => {
        if (!activeEV || activeEV.dtcCodes.length === 0) {
            return (
                <div style={{ border: '1px dashed rgba(0, 242, 254, 0.15)', padding: '20px', borderRadius: '10px', textAlign: 'center', color: 'var(--text-secondary)', background: 'rgba(0, 242, 254, 0.02)', fontFamily: 'var(--font-mono)' }}>
                    <i className="fa-solid fa-microchip" style={{ fontSize: '28px', marginBottom: '12px', color: 'var(--primary)', filter: 'drop-shadow(0 0 5px var(--primary-glow))' }}></i>
                    <p style={{ fontSize: '12px' }}>SYSTEM OPTIMAL: No active sensor exceptions. AI Copilot diagnostics report zero anomalies.</p>
                </div>
            );
        }

        const activeCode = activeEV.dtcCodes[0];
        let workOrderId = `WO-${activeEV.id}-${Math.floor(Math.random() * 8000 + 1000)}`;
        let bay = "Bay 1 - Battery & Staging Bay";
        let tech = "Prof. J. Baikerikar";
        let steps = [];

        if (activeCode.startsWith("P0A7F")) {
            bay = "Bay A - Thermal Analysis Lab";
            tech = "S. Alegaonkar (IT Roll-01)";
            steps = [
                "1. Connect cooling bypass lines to coolant port B2.",
                "2. Throttle EV maximum motor current coefficients to 30% to control heat generation.",
                "3. Perform resistance checks on battery cell modules 3-8.",
                "4. Replace cell group block 4 core elements if degradation > 8% SOH."
            ];
        } else if (activeCode.startsWith("P0A1B")) {
            bay = "Bay C - Mechanical & Vibs Bay";
            tech = "S. Ansari (IT Roll-03)";
            steps = [
                "1. Align motor driveshaft coupling using laser indicators.",
                "2. Apply lubrication viscosity check on mechanical bearings.",
                "3. Rebalance wheel cargo load weights to prevent axle friction spikes.",
                "4. Clear and recalibrate motor control speed feedback controller."
            ];
        } else if (activeCode.startsWith("C1201")) {
            bay = "Bay D - Pneumatic & Wheel Service";
            tech = "A. Coelho (IT Roll-16)";
            steps = [
                "1. Inflate leaking tires to standard pressure 33 psi.",
                "2. Check tread line for puncture debris or microscopic leakage.",
                "3. Replace TPMS battery or replace the transponder module if faulty.",
                "4. Recalibrate TPMS trigger alert pressure limit to 24 psi."
            ];
        } else if (activeCode.startsWith("C1095")) {
            bay = "Bay B - Brake & Hydraulics Section";
            tech = "G. D'Mello (IT Roll-18)";
            steps = [
                "1. Check ABS hydro-pump pressure output indices.",
                "2. Flush hydraulic lines to clear potential bubbles.",
                "3. Replace carbon-degraded front disc pad components.",
                "4. Check caliper caliper cylinder travel distances."
            ];
        }

        return (
            <div style={{ background: 'rgba(3, 5, 12, 0.5)', border: '1px solid rgba(0, 242, 254, 0.15)', borderRadius: '10px', padding: '20px', fontFamily: 'var(--font-mono)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--primary)' }}>{workOrderId}</span>
                    <span style={{ fontSize: '11px', color: 'var(--warning)', fontWeight: '700', textTransform: 'uppercase' }}>{bay}</span>
                </div>
                <div style={{ fontSize: '12.5px', lineHeight: '1.6', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    <strong>DIAGNOSTICIAN:</strong> {tech}<br />
                    <strong>EXCEPTION:</strong> Sensor anomaly triggered telemetry fault code <strong style={{ color: 'var(--danger)' }}>{activeCode}</strong>.
                </div>
                <div style={{ fontSize: '12px', background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.03)', borderRadius: '6px', padding: '12px', color: 'var(--text-secondary)' }}>
                    <strong style={{ color: '#fff', display: 'block', marginBottom: '8px' }}>REMEDY INSTRUCTIONS:</strong>
                    {steps.map((s, idx) => <div key={idx} style={{ marginBottom: '6px' }}>{s}</div>)}
                </div>
            </div>
        );
    };

    return (
        <div className="app-container">
            {/* Sidebar Navigation */}
            <aside className="sidebar">
                <div className="logo-container">
                    <i className="fa-solid fa-circle-nodes logo-icon"></i>
                    <div className="logo-text">
                        <h1>IoE Smart EV</h1>
                        <span>Fleet Portal</span>
                    </div>
                </div>

                <nav className="nav-menu">
                    <li className={`nav-item ${activeView === "fleet-overview" ? "active" : ""}`}>
                        <button onClick={() => setActiveView("fleet-overview")}><i className="fa-solid fa-chart-line"></i> Fleet Overview</button>
                    </li>
                    <li className={`nav-item ${activeView === "battery-analytics" ? "active" : ""}`}>
                        <button onClick={() => setActiveView("battery-analytics")}><i className="fa-solid fa-battery-three-quarters"></i> Battery & Energy</button>
                    </li>
                    <li className={`nav-item ${activeView === "vehicle-health" ? "active" : ""}`}>
                        <button onClick={() => setActiveView("vehicle-health")}><i className="fa-solid fa-gauge-high"></i> Vehicle Health</button>
                    </li>
                    <li className={`nav-item ${activeView === "predictive-maintenance" ? "active" : ""}`}>
                        <button onClick={() => setActiveView("predictive-maintenance")}><i className="fa-solid fa-screwdriver-wrench"></i> Predictive Maint</button>
                    </li>
                    <li className={`nav-item ${activeView === "federated-learning" ? "active" : ""}`}>
                        <button onClick={() => setActiveView("federated-learning")}><i className="fa-solid fa-network-wired"></i> Federated Learning</button>
                    </li>
                </nav>

                <div className="sidebar-footer">
                    <button className="btn-action secondary" onClick={() => setIsInfoModalOpen(true)} style={{ width: '100%', marginBottom: '12px' }}>
                        <i className="fa-solid fa-circle-info"></i> Project Details
                    </button>
                    <div className="dbit-card">
                        <strong>DBIT IT Department</strong>
                        IOE Lab Miniproject<br />
                        Sem-VII | Group 01
                    </div>
                </div>
            </aside>

            {/* Main View Port */}
            <main className="main-content">
                <header className="topbar">
                    <div className="page-title">
                        <h2>EV Telemetry & Diagnostics</h2>
                    </div>

                    <div className="system-status">
                        {/* Simulation Controls */}
                        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 12px', borderRadius: '12px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sim Speed:</span>
                            <div className="sim-controls">
                                <button className={`btn-action ${simSpeed === 1 ? "" : "secondary"}`} onClick={() => handleSpeedChange(1)} style={{ padding: '4px 8px', fontSize: '10px' }}>1x</button>
                                <button className={`btn-action ${simSpeed === 5 ? "" : "secondary"}`} onClick={() => handleSpeedChange(5)} style={{ padding: '4px 8px', fontSize: '10px' }}>5x</button>
                                <button className={`btn-action ${simSpeed === 10 ? "" : "secondary"}`} onClick={() => handleSpeedChange(10)} style={{ padding: '4px 8px', fontSize: '10px' }}>10x</button>
                            </div>
                            <span className="sim-speed-indicator">{simSpeed}x</span>
                        </div>

                        {/* Top Alarms */}
                        <div className={`status-badge ${alerts.filter(a => a.severity === 'critical').length > 0 ? "critical" : ""}`}>
                            <span className="status-dot"></span>
                            <span>{alerts.filter(a => a.severity === 'critical').length > 0 ? "CRITICAL ALERTS" : "SYSTEMS OPTIMAL"}</span>
                        </div>

                        <div className={`active-alerts-badge ${alerts.filter(a => a.severity === 'critical').length > 0 ? "has-alerts" : ""}`}>
                            <i className="fa-solid fa-bell"></i>
                            <span>{alerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length} Active</span>
                        </div>
                    </div>
                </header>

                {/* Dashboard View Routing */}
                <div className="dashboard-viewport">
                    
                    {/* VIEW 1: FLEET OVERVIEW */}
                    <div className={`dashboard-view ${activeView === "fleet-overview" ? "active" : ""}`}>
                        {/* Metrics Grid */}
                        <div className="metrics-grid">
                            <div className="glass-panel metric-card">
                                <div className="metric-header">
                                    <span>TOTAL FLEET SIZE</span>
                                    <i className="fa-solid fa-truck-ramp-box metric-icon"></i>
                                </div>
                                <div className="metric-body">
                                    <div className="metric-value">10</div>
                                    <div className="metric-footer">
                                        <span className="metric-trend-up"><i className="fa-solid fa-circle-check"></i> 100%</span>
                                        <span>Online & Connected</span>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-panel metric-card danger" style={{ borderLeftColor: 'var(--danger)' }}>
                                <div className="metric-header">
                                    <span>ACTIVE ANOMALIES</span>
                                    <i className="fa-solid fa-triangle-exclamation metric-icon"></i>
                                </div>
                                <div className="metric-body">
                                    <div className="metric-value">{alerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length}</div>
                                    <div className="metric-footer">
                                        <span>Requiring immediate attention</span>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-panel metric-card success" style={{ borderLeftColor: 'var(--success)' }}>
                                <div className="metric-header">
                                    <span>FLEET AVG SOC</span>
                                    <i className="fa-solid fa-battery-half metric-icon"></i>
                                </div>
                                <div className="metric-body">
                                    <div className="metric-value">
                                        {vehicles.length > 0 ? Math.round(vehicles.reduce((acc, v) => acc + v.battery.soc, 0) / vehicles.length) : 0}%
                                    </div>
                                    <div className="metric-footer">
                                        <span>Combined battery load</span>
                                    </div>
                                </div>
                            </div>

                            <div className="glass-panel metric-card accent" style={{ borderLeftColor: 'var(--accent)' }}>
                                <div className="metric-header">
                                    <span>AVG REMAINING LIFE</span>
                                    <i className="fa-solid fa-hourglass-half metric-icon"></i>
                                </div>
                                <div className="metric-body">
                                    <div className="metric-value">
                                        {vehicles.length > 0 ? Math.round(vehicles.reduce((acc, v) => acc + v.predictive.rul, 0) / vehicles.length) : 0}d
                                    </div>
                                    <div className="metric-footer">
                                        <span>Scheduled service cycles</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sustainability Cards */}
                        <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
                            <div className="glass-panel metric-card success" style={{ borderLeftColor: 'var(--success)' }}>
                                <div className="metric-header">
                                    <span>CO2 SAVED (FLEET)</span>
                                    <i className="fa-solid fa-leaf metric-icon"></i>
                                </div>
                                <div className="metric-body">
                                    <div className="metric-value" style={{ color: 'var(--success)' }}>{(sessionDist * 0.4).toFixed(1)} kg</div>
                                    <div className="metric-footer"><span>Reduced carbon footprint</span></div>
                                </div>
                            </div>

                            <div className="glass-panel metric-card accent" style={{ borderLeftColor: 'var(--primary)' }}>
                                <div className="metric-header">
                                    <span>FUEL COST SAVINGS</span>
                                    <i className="fa-solid fa-indian-rupee-sign metric-icon"></i>
                                </div>
                                <div className="metric-body">
                                    <div className="metric-value" style={{ color: 'var(--primary)' }}>₹{Math.round(sessionDist * 8.5).toLocaleString('en-IN')}</div>
                                    <div className="metric-footer"><span>Compared to diesel cargo trucks</span></div>
                                </div>
                            </div>

                            <div className="glass-panel metric-card" style={{ borderLeftColor: 'var(--warning)' }}>
                                <div className="metric-header">
                                    <span>TREES PLANTED EQ</span>
                                    <i className="fa-solid fa-tree metric-icon"></i>
                                </div>
                                <div className="metric-body">
                                    <div className="metric-value" style={{ color: 'var(--warning)' }}>{Math.floor(sessionDist * 0.4 / 20)}</div>
                                    <div className="metric-footer"><span>Forestry offset metrics</span></div>
                                </div>
                            </div>

                            <div className="glass-panel metric-card" style={{ borderLeftColor: 'var(--accent)' }}>
                                <div className="metric-header">
                                    <span>TOTAL SESSION DISTANCE</span>
                                    <i className="fa-solid fa-road metric-icon"></i>
                                </div>
                                <div className="metric-body">
                                    <div className="metric-value" style={{ color: 'var(--accent)' }}>{sessionDist.toFixed(2)} km</div>
                                    <div className="metric-footer"><span>Combined fleet mileage</span></div>
                                </div>
                            </div>
                        </div>

                        {/* Interactive Leaflet Map & Alerts Feed */}
                        <div className="layout-2col">
                            <div className="glass-panel section-card">
                                <div className="section-header">
                                    <h3><i className="fa-solid fa-map-location-dot"></i> Live Fleet Tracker (Mumbai Suburban)</h3>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Real-time GPS nodes drift</span>
                                </div>
                                <div className="map-container">
                                    <div id="leaflet-map" style={{ height: '100%', width: '100%' }}></div>
                                </div>
                            </div>

                            <div className="glass-panel section-card">
                                <div className="section-header">
                                    <h3><i className="fa-solid fa-bell"></i> Real-time Sensor Alerts</h3>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Live IoE Logs Feed</span>
                                </div>
                                <div className="alert-feed">
                                    {alerts.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '20px', color: '#52525b', fontSize: '12px' }}>No active alerts. Systems optimal.</div>
                                    ) : (
                                        alerts.slice(0, 10).map((alert, idx) => (
                                            <div key={idx} className={`alert-item ${alert.severity}`}>
                                                <i className={`fas ${alert.severity === 'critical' ? 'fa-triangle-exclamation' : (alert.severity === 'warning' ? 'fa-circle-exclamation' : 'fa-circle-info')} alert-icon`}></i>
                                                <div className="alert-content">
                                                    <div className="alert-title">{alert.title} (Vehicle: {alert.vehicleId})</div>
                                                    <div className="alert-desc">{alert.desc}</div>
                                                    <div className="alert-time">{alert.time}</div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Fleet Grid Table */}
                        <div className="glass-panel section-card">
                            <div className="section-header">
                                <h3><i className="fa-solid fa-list-check"></i> Connected Fleet Status Table</h3>
                                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Click rows to select EV for details</span>
                            </div>

                            <div className="search-filter-bar">
                                <div className="search-input-wrapper">
                                    <i className="fa-solid fa-magnifying-glass"></i>
                                    <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by ID, Driver, Model, Route..." />
                                </div>
                                <select className="select-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                                    <option value="ALL">All Statuses</option>
                                    <option value="ACTIVE">Active</option>
                                    <option value="CHARGING">Charging</option>
                                    <option value="WARNING">Warning</option>
                                    <option value="CRITICAL">Critical</option>
                                    <option value="MAINTENANCE">Maintenance</option>
                                </select>
                            </div>

                            <div className="table-container">
                                <table className="custom-table">
                                    <thead>
                                        <tr>
                                            <th>Vehicle ID</th>
                                            <th>Model</th>
                                            <th>Driver</th>
                                            <th>Status</th>
                                            <th>Battery SoC</th>
                                            <th>Speed</th>
                                            <th>Failure Risk</th>
                                            <th>Est RUL</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredVehicles.map((ev, idx) => (
                                            <tr key={idx} className={ev.id === activeVehicleId ? "active-row" : ""} onClick={() => setActiveVehicleId(ev.id)}>
                                                <td style={{ fontWeight: 700, color: '#fff' }}>{ev.id}</td>
                                                <td>{ev.model}</td>
                                                <td>{ev.driver}</td>
                                                <td>
                                                    <span className={`mini-badge ${ev.status === 'Active' ? 'success' : (ev.status === 'Critical' ? 'danger' : (ev.status === 'Warning' ? 'warning' : (ev.status === 'Charging' ? 'info' : 'muted')))}`}>
                                                        {ev.status}
                                                    </span>
                                                </td>
                                                <td style={{ fontFamily: 'Space Grotesk', fontWeight: 600 }}>{ev.battery.soc}%</td>
                                                <td>{ev.performance.speed} km/h</td>
                                                <td>{ev.predictive.failureProbability}%</td>
                                                <td>{ev.predictive.rul} days</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* VIEW 2: BATTERY & ENERGY ANALYTICS */}
                    <div className={`dashboard-view ${activeView === "battery-analytics" ? "active" : ""}`}>
                        <div className="vehicle-selector-panel">
                            <span className="vehicle-selector-label">SELECT VEHICLE:</span>
                            <select className="select-filter" value={activeVehicleId} onChange={(e) => setActiveVehicleId(e.target.value)}>
                                {vehicles.map(v => <option key={v.id} value={v.id}>{v.id} ({v.driver})</option>)}
                            </select>
                        </div>

                        {activeEV && (
                            <div className="battery-grid">
                                <div className="glass-panel section-card">
                                    <div className="section-header">
                                        <h3><i className="fa-solid fa-car-battery"></i> Cell Status Indicator</h3>
                                    </div>
                                    <div className="battery-visualizer">
                                        <div className="battery-shape">
                                            <div className={`battery-fill ${activeEV.battery.soc < 20 ? "danger" : (activeEV.battery.soc < 50 ? "warning" : "")}`} style={{ height: `${activeEV.battery.soc}%` }}>
                                                <div className="battery-percentage-label">{Math.round(activeEV.battery.soc)}%</div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="telemetry-grid">
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">State of Charge</div>
                                            <div className="telemetry-number" style={{ color: 'var(--success)' }}>{activeEV.battery.soc}%</div>
                                        </div>
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">State of Health</div>
                                            <div className="telemetry-number">{activeEV.battery.soh}%</div>
                                        </div>
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">Module Temp</div>
                                            <div className="telemetry-number">{activeEV.battery.temp} °C</div>
                                        </div>
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">Pack Voltage</div>
                                            <div className="telemetry-number">{activeEV.battery.voltage} V</div>
                                        </div>
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">Current Flow</div>
                                            <div className="telemetry-number">{activeEV.battery.current} A</div>
                                        </div>
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">Charge Cycles</div>
                                            <div className="telemetry-number">{activeEV.battery.cycles}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="glass-panel section-card">
                                    <div className="section-header">
                                        <h3><i className="fa-solid fa-chart-area"></i> State of Health (SoH) vs Charge Cycles</h3>
                                    </div>
                                    <Chart options={sohDegradationChart.options} series={sohDegradationChart.series} type="line" height={230} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* VIEW 3: VEHICLE HEALTH & TELEMATICS */}
                    <div className={`dashboard-view ${activeView === "vehicle-health" ? "active" : ""}`}>
                        <div className="vehicle-selector-panel">
                            <span className="vehicle-selector-label">SELECT VEHICLE:</span>
                            <select className="select-filter" value={activeVehicleId} onChange={(e) => setActiveVehicleId(e.target.value)}>
                                {vehicles.map(v => <option key={v.id} value={v.id}>{v.id} ({v.driver})</option>)}
                            </select>
                        </div>

                        {activeEV && (
                            <div className="layout-2col">
                                <div className="glass-panel section-card">
                                    <div className="section-header">
                                        <h3><i className="fa-solid fa-gears"></i> Powertrain & Telematics Telemetry</h3>
                                    </div>

                                    <div className="telemetry-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">Driving Speed</div>
                                            <div className="telemetry-number" style={{ color: 'var(--primary)' }}>{activeEV.performance.speed} km/h</div>
                                        </div>
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">Motor RPM</div>
                                            <div className="telemetry-number">{activeEV.performance.motorRPM} RPM</div>
                                        </div>
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">Motor Temp</div>
                                            <div className="telemetry-number">{activeEV.performance.motorTemp} °C</div>
                                        </div>
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">Energy Consumption</div>
                                            <div className="telemetry-number">{activeEV.performance.energyCons.toFixed(3)} kWh/km</div>
                                        </div>
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">Odometer (Total)</div>
                                            <div className="telemetry-number">{Math.round(activeEV.performance.odometer)} km</div>
                                        </div>
                                        <div className="telemetry-indicator">
                                            <div className="telemetry-label">Suspension Deflection</div>
                                            <div className="telemetry-number">{activeEV.performance.suspensionDeflection} mm</div>
                                        </div>
                                    </div>

                                    <div className="section-header" style={{ marginTop: '30px', marginBottom: '15px' }}>
                                        <h3 style={{ fontSize: '13px' }}><i className="fa-solid fa-circle-notch"></i> TPMS Pressure Monitor</h3>
                                    </div>

                                    <div className="car-diagram-container">
                                        <div className="car-silhouette">
                                            <div className={`tire tire-fl ${activeEV.performance.tirePressure.fl < 18 ? "critical" : (activeEV.performance.tirePressure.fl < 26 ? "warn" : "ok")}`}>{Math.round(activeEV.performance.tirePressure.fl)}</div>
                                            <div className="tire-label label-fl">Front-Left</div>
                                            
                                            <div className={`tire tire-fr ${activeEV.performance.tirePressure.fr < 18 ? "critical" : (activeEV.performance.tirePressure.fr < 26 ? "warn" : "ok")}`}>{Math.round(activeEV.performance.tirePressure.fr)}</div>
                                            <div className="tire-label label-fr">Front-Right</div>
                                            
                                            <div className={`tire tire-rl ${activeEV.performance.tirePressure.rl < 18 ? "critical" : (activeEV.performance.tirePressure.rl < 26 ? "warn" : "ok")}`}>{Math.round(activeEV.performance.tirePressure.rl)}</div>
                                            <div className="tire-label label-rl">Rear-Left</div>
                                            
                                            <div className={`tire tire-rr ${activeEV.performance.tirePressure.rr < 18 ? "critical" : (activeEV.performance.tirePressure.rr < 26 ? "warn" : "ok")}`}>{Math.round(activeEV.performance.tirePressure.rr)}</div>
                                            <div className="tire-label label-rr">Rear-Right</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="glass-panel section-card">
                                    <div className="section-header">
                                        <h3><i className="fa-solid fa-chart-line"></i> Dynamic Live Telemetry Stream</h3>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>1-second updating buffer</span>
                                    </div>
                                    <Chart options={liveTelemetryChart.options} series={liveTelemetryChart.series} type="line" height={250} />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* VIEW 4: PREDICTIVE MAINTENANCE & ALERTS */}
                    <div className={`dashboard-view ${activeView === "predictive-maintenance" ? "active" : ""}`}>
                        <div className="vehicle-selector-panel">
                            <span className="vehicle-selector-label">SELECT VEHICLE:</span>
                            <select className="select-filter" value={activeVehicleId} onChange={(e) => setActiveVehicleId(e.target.value)}>
                                {vehicles.map(v => <option key={v.id} value={v.id}>{v.id} ({v.driver})</option>)}
                            </select>
                        </div>

                        {/* Interactive Fault Injection console */}
                        <div className="simulator-panel">
                            <div className="sim-header">
                                <div className="sim-title">
                                    <i className="fa-solid fa-flask"></i> Interactive IoE Fault Injection Console
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Inject anomalies to test ML model prediction values</span>
                            </div>
                            <div className="fault-injection-zone">
                                <button className={`fault-btn ${activeEV?.activeFaults.includes("battery_overheat") ? "active" : ""}`} onClick={() => handleInjectFault("battery_overheat")}>
                                    <i className="fa-solid fa-fire"></i> Inject Battery Overheat
                                </button>
                                <button className={`fault-btn ${activeEV?.activeFaults.includes("motor_vibration") ? "active" : ""}`} onClick={() => handleInjectFault("motor_vibration")}>
                                    <i className="fa-solid fa-wave-square"></i> Inject Motor Vibrations
                                </button>
                                <button className={`fault-btn ${activeEV?.activeFaults.includes("tire_blowout") ? "active" : ""}`} onClick={() => handleInjectFault("tire_blowout")}>
                                    <i className="fa-solid fa-burst"></i> Inject Tire Deflation
                                </button>
                                <button className={`fault-btn ${activeEV?.activeFaults.includes("brake_failure") ? "active" : ""}`} onClick={() => handleInjectFault("brake_failure")}>
                                    <i className="fa-solid fa-triangle-exclamation"></i> Inject Brake Pad Wear
                                </button>
                            </div>
                        </div>

                        {activeEV && (
                            <div className="layout-2col">
                                <div className="glass-panel section-card">
                                    <div className="section-header">
                                        <h3><i className="fa-solid fa-shield-halved"></i> Predictive Health Diagnostics</h3>
                                    </div>

                                    <div style={{ marginBottom: '24px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                                            <span>Failure Probability Risk</span>
                                            <span style={{ fontWeight: 700 }}>{activeEV.predictive.failureProbability}%</span>
                                        </div>
                                        <div className="progress-container">
                                            <div className={`progress-bar ${activeEV.predictive.failureProbability > 75 ? "danger" : (activeEV.predictive.failureProbability > 35 ? "warning" : "success")}`} style={{ width: `${activeEV.predictive.failureProbability}%` }}></div>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '24px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                                            <span>Remaining Useful Life (RUL)</span>
                                            <span style={{ fontWeight: 700 }}>{activeEV.predictive.rul} Days</span>
                                        </div>
                                        <div className="progress-container">
                                            <div className={`progress-bar ${activeEV.predictive.rul < 50 ? "danger" : (activeEV.predictive.rul < 120 ? "warning" : "success")}`} style={{ width: `${Math.min(100, (activeEV.predictive.rul / 250) * 100)}%` }}></div>
                                        </div>
                                    </div>

                                    <div className="telemetry-grid" style={{ marginBottom: '24px' }}>
                                        <div className="telemetry-indicator" style={{ background: 'rgba(255,255,255,0.01)' }}>
                                            <div className="telemetry-label">Time to Failure (Est)</div>
                                            <div className="telemetry-number" style={{ color: 'var(--warning)' }}>{activeEV.predictive.ttf} Hrs</div>
                                        </div>
                                    </div>

                                    <div className="section-header" style={{ marginTop: '10px', marginBottom: '12px' }}>
                                        <h3 style={{ fontSize: '13px' }}><i className="fa-solid fa-microchip"></i> Active DTC Error Logs</h3>
                                    </div>
                                    <div style={{ marginBottom: '24px', minHeight: '80px' }}>
                                        {activeEV.dtcCodes.length === 0 ? (
                                            <div style={{ padding: '10px', color: '#52525b', fontSize: '12px' }}>No active DTC trouble codes. OBD-II System Optimal.</div>
                                        ) : (
                                            activeEV.dtcCodes.map((code, idx) => {
                                                let desc = "Unknown Diagnostic trouble code";
                                                if (code.startsWith("P0A7F")) desc = "Hybrid Battery Pack Degradation / Core Temperature Extreme";
                                                if (code.startsWith("P0A1B")) desc = "Motor Bearing Micro-Fractures / High Vibration Coefficient";
                                                if (code.startsWith("C1201")) desc = "TPMS Sensor Triggered - Critical Deflation Hazard (< 18 psi)";
                                                if (code.startsWith("C1095")) desc = "Brake Hydro-pump wear threshold overrun. Pads < 10% life";
                                                return (
                                                    <div key={idx} style={{ background: 'rgba(255, 0, 85, 0.05)', border: '1px solid rgba(255, 0, 85, 0.2)', color: '#ffa6b8', padding: '10px', borderRadius: '4px', marginBottom: '8px', fontSize: '11px' }}>
                                                        <strong>DTC {code}</strong>: {desc}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* DBIT AI diagnostics copilot report */}
                                    <div className="section-header" style={{ marginTop: '10px', marginBottom: '12px' }}>
                                        <h3 style={{ fontSize: '13px' }}><i className="fa-solid fa-robot"></i> DBIT AI Diagnostics Assistant</h3>
                                    </div>
                                    <div style={{ marginBottom: '24px' }}>
                                        {getAIDiagnosticReport()}
                                    </div>

                                    <div className="modal-footer" style={{ marginTop: 'auto' }}>
                                        <button className="btn-action danger" onClick={handleScheduleService}>
                                            <i className="fa-solid fa-truck-medical"></i> Route to Staging & Service
                                        </button>
                                        <button className="btn-action secondary" onClick={handleClearFaults}>
                                            <i className="fa-solid fa-rotate-left"></i> Clear DTC Codes
                                        </button>
                                    </div>
                                </div>

                                <div className="glass-panel section-card">
                                    <div className="section-header">
                                        <h3><i className="fa-solid fa-chart-bar"></i> Component Health Distribution</h3>
                                    </div>
                                    <Chart options={componentWearChart.options} series={componentWearChart.series} type="bar" height={250} />

                                    <div className="section-header" style={{ marginTop: '24px', marginBottom: '12px' }}>
                                        <h3><i className="fa-solid fa-clock-rotate-left"></i> Past Service Records</h3>
                                    </div>
                                    <div className="table-container">
                                        <table className="custom-table" style={{ fontSize: '11px' }}>
                                            <thead>
                                                <tr>
                                                    <th>Date</th>
                                                    <th>Action Item</th>
                                                    <th>Technician</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {activeEV.maintenanceHistory.map((h, idx) => (
                                                    <tr key={idx}>
                                                        <td>{h.date}</td>
                                                        <td>{h.action}</td>
                                                        <td>{h.technician}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* VIEW 5: FEDERATED LEARNING */}
                    <div className={`dashboard-view ${activeView === "federated-learning" ? "active" : ""}`}>
                        <div className="layout-2col" style={{ gridTemplateColumns: '1fr 2fr' }}>
                            <div className="glass-panel section-card fl-server-card">
                                <i className="fa-solid fa-server fl-server-logo"></i>
                                <h3 style={{ fontFamily: 'Space Grotesk', fontSize: '16px', color: '#fff', marginBottom: '6px' }}>DBIT Central Server</h3>
                                <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>FedAvg Aggregator Node</p>
                                
                                <div className="telemetry-grid" style={{ width: '100%', gridTemplateColumns: '1fr', gap: '10px' }}>
                                    <div className="telemetry-indicator" style={{ background: '#18181c' }}>
                                        <div className="telemetry-label">Global Model Iteration</div>
                                        <div className="telemetry-number" style={{ color: 'var(--primary)' }}>Round {flRound}</div>
                                    </div>
                                    <div className="telemetry-indicator" style={{ background: '#18181c' }}>
                                        <div className="telemetry-label">Predictive Accuracy</div>
                                        <div className="telemetry-number" style={{ color: 'var(--success)' }}>{flAccuracy.toFixed(2)}%</div>
                                    </div>
                                </div>

                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '20px', textAlign: 'center', fontWeight: 600, lineHeight: '1.4' }}>
                                    {flCentralStatus}
                                </div>
                            </div>

                            <div className="glass-panel section-card">
                                <div className="section-header">
                                    <h3><i className="fa-solid fa-microchip"></i> Edge Training Devices (Fleet Vehicles)</h3>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Real-time local gradient computation</span>
                                </div>
                                <div id="fl-nodes-grid">
                                    {vehicles.map(ev => {
                                        let nodeStatusText = "Idle";
                                        if (flPhase === "training") {
                                            nodeStatusText = `Local Training (Epoch ${flEpoch}/5)`;
                                        } else if (flPhase === "uploading") {
                                            nodeStatusText = "Encrypting & Uploading...";
                                        } else if (flPhase === "aggregating") {
                                            nodeStatusText = "Weights Uploaded";
                                        } else if (flPhase === "broadcast") {
                                            nodeStatusText = "Downloading Global Model...";
                                        }

                                        return (
                                            <div key={ev.id} className="glass-panel" style={{ padding: '14px', background: '#121215', border: '1px solid var(--panel-border)', borderRadius: '6px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '90px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                    <strong style={{ fontFamily: 'Space Grotesk', fontSize: '12px', color: '#fff' }}>{ev.id}</strong>
                                                    <i className="fa-solid fa-laptop-code" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}></i>
                                                </div>
                                                <div style={{ fontSize: '11px', fontWeight: 600, color: flPhase === 'training' ? 'var(--primary)' : (flPhase === 'uploading' ? 'var(--warning)' : 'var(--success)') }}>
                                                    {nodeStatusText}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            </main>

            {/* TOAST SYSTEM CONTAINER */}
            <div id="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`glass-panel toast-item ${t.type}`} style={{
                        borderLeft: `3px solid ${t.type === 'danger' ? 'var(--danger)' : (t.type === 'warning' ? 'var(--warning)' : 'var(--primary)')}`,
                        background: '#121215',
                        padding: '10px 14px',
                        borderRadius: '4px',
                        marginBottom: '8px',
                        boxShadow: 'var(--card-shadow)',
                        fontSize: '11.5px',
                        pointerEvents: 'auto'
                    }}>
                        <div style={{ fontWeight: 700, color: '#fff', marginBottom: '2px', fontFamily: 'Space Grotesk' }}>{t.title}</div>
                        <div style={{ color: 'var(--text-secondary)' }}>{t.message}</div>
                    </div>
                ))}
            </div>

            {/* MODAL: PRESENTATION INFO */}
            {isInfoModalOpen && (
                <div className="modal-backdrop active" onClick={() => setIsInfoModalOpen(false)}>
                    <div className="modal-card glass-panel" style={{ color: '#fff' }} onClick={(e) => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setIsInfoModalOpen(false)} aria-label="Close modal"><i className="fa-solid fa-xmark"></i></button>
                        <div className="modal-title">
                            <i className="fa-solid fa-graduation-cap"></i> Project Presentation Metadata
                        </div>
                        <div className="modal-body" style={{ lineHeight: 1.6, fontSize: '13px', color: 'var(--text-secondary)' }}>
                            <div style={{ borderBottom: '1px solid var(--panel-border)', paddingBottom: '12px', marginBottom: '12px', textAlign: 'center' }}>
                                <h3 style={{ color: '#fff', fontFamily: 'Space Grotesk', fontSize: '16px' }}>Don Bosco Institute of Technology</h3>
                                <p style={{ fontSize: '11px', color: 'var(--primary)' }}>Department of Information Technology</p>
                            </div>
                            
                            <p style={{ marginBottom: '12px' }}><strong>Subject:</strong> Internet of Everything (IoE) Lab Miniproject (Sem-VII)</p>
                            <p style={{ marginBottom: '12px', color: '#fff' }}>
                                <strong>Project Title:</strong><br />
                                <span style={{ fontSize: '14px', fontFamily: 'Space Grotesk', fontWeight: 700, color: 'var(--primary)' }}>IoE-Based Smart EV Fleet Monitoring & Predictive Maintenance Dashboard</span>
                            </p>
                            
                            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '8px', border: '1px solid var(--panel-border)', marginBottom: '12px' }}>
                                <strong>Group Members:</strong>
                                <ul style={{ listStyle: 'none', paddingLeft: 0, marginTop: '4px' }}>
                                    <li>1. Smruti Alegaonkar - Roll 01</li>
                                    <li>2. Shariya Ansari - Roll 03</li>
                                    <li>3. Alston Coelho - Roll 16</li>
                                    <li>4. Glynis D’Mello - Roll 18</li>
                                </ul>
                            </div>
                            <p style={{ marginBottom: '6px' }}><strong>Guided By:</strong> Prof. Janhavi Baikerikar</p>
                            <p><strong>Date of Presentation:</strong> 11.08.2026</p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn-action" onClick={() => setIsInfoModalOpen(false)} style={{ width: '100%' }}>Close Info</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
