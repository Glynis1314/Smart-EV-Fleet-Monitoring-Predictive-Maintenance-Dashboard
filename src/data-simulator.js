// IoE Smart EV Fleet - Data Simulator Engine (React/ES6 Module version)
// Generates realistic real-time telemetry for EV fleets running in Mumbai area.

export class EVSimulator {
    constructor() {
        this.vehicles = [];
        this.simulationSpeed = 1; // 1x, 5x, 10x
        this.updateInterval = 3000; // 3 seconds real-time tick
        this.timer = null;
        this.alertHistory = [];
        this.sessionDistance = 0; // Cumulative session driving distance in km
        
        // Base route coordinate points in Mumbai for vehicle paths
        this.mumbaiRoutes = {
            'Route-A': [ // Kurla -> Powai -> Chembur -> Kurla
                { lat: 19.0790, lng: 72.8884 }, // DBIT Kurla
                { lat: 19.0968, lng: 72.8950 }, // Sakinaka
                { lat: 19.1176, lng: 72.9060 }, // Powai Lake
                { lat: 19.1150, lng: 72.9250 }, // Kanjurmarg
                { lat: 19.0855, lng: 72.9282 }, // Vikhroli
                { lat: 19.0620, lng: 72.8980 }, // Chembur
                { lat: 19.0730, lng: 72.8800 }  // Kurla
            ],
            'Route-B': [ // Bandra -> Santacruz -> Andheri -> Kurla
                { lat: 19.0607, lng: 72.8362 }, // Bandra
                { lat: 19.0822, lng: 72.8396 }, // Santacruz
                { lat: 19.1136, lng: 72.8696 }, // Andheri East
                { lat: 19.1155, lng: 72.8850 }, // Marol
                { lat: 19.0950, lng: 72.8750 }, // Jarimari
                { lat: 19.0790, lng: 72.8884 }  // DBIT Kurla
            ],
            'Route-C': [ // Thane -> Mulund -> Ghatkopar -> Kurla
                { lat: 19.2183, lng: 72.9781 }, // Thane
                { lat: 19.1726, lng: 72.9565 }, // Mulund
                { lat: 19.1479, lng: 72.9372 }, // Bhandup
                { lat: 19.0863, lng: 72.9080 }, // Ghatkopar
                { lat: 19.0790, lng: 72.8884 }  // DBIT Kurla
            ]
        };

        this.initFleet();
    }

    initFleet() {
        const drivers = ["Amit Sharma", "Priya Nair", "Rahul Verma", "Sneha Patel", "Vikram Singh", 
                         "Anjali Gupta", "Rohan Mehta", "Neha Shah", "Sandeep Patil", "Karan Johar"];
        const models = ["Tata Nexon EV Prime", "Tata Nexon EV Max", "MG ZS EV", "Hyundai Kona Electric", "BYD Atto 3"];
        
        for (let i = 1; i <= 10; i++) {
            const id = `EV-${100 + i}`;
            const routeName = i % 3 === 0 ? 'Route-C' : (i % 2 === 0 ? 'Route-B' : 'Route-A');
            const route = this.mumbaiRoutes[routeName];
            const routeIndex = Math.floor(Math.random() * route.length);
            const coord = route[routeIndex];
            
            const soc = Math.floor(Math.random() * 45) + 50; // 50% to 95%
            const soh = Math.floor(Math.random() * 8) + 92;   // 92% to 100%
            const cycles = Math.floor(Math.random() * 120) + 80;
            const speed = Math.floor(Math.random() * 30) + 20;
            const odometer = Math.floor(Math.random() * 15000) + 5000;
            
            const baseFailureProb = 100 - soh - (100 - soc) * 0.05;
            const rul = Math.floor(soh * 2.5) + Math.floor(Math.random() * 20);
            const ttf = Math.floor(rul * 24 * (1.2 - (baseFailureProb / 100)));
            
            this.vehicles.push({
                id: id,
                name: `Smart EV Cargo #${i}`,
                model: models[i % models.length],
                driver: drivers[i - 1],
                status: "Active",
                route: routeName,
                routeNodes: route,
                currentNodeIndex: routeIndex,
                lat: coord.lat,
                lng: coord.lng,
                heading: Math.floor(Math.random() * 360),
                
                battery: {
                    soc: soc,
                    soh: soh,
                    temp: Math.floor(Math.random() * 8) + 28,
                    voltage: 380 + (soc * 0.4) + (Math.random() * 2 - 1),
                    current: (speed * 0.8) + (Math.random() * 5),
                    cycles: cycles,
                    degradationFactor: (100 - soh).toFixed(1)
                },
                
                performance: {
                    speed: speed,
                    motorRPM: speed * 85,
                    motorTemp: Math.floor(Math.random() * 15) + 45,
                    energyCons: 0.12 + (speed * 0.001) + (Math.random() * 0.01),
                    odometer: odometer,
                    brakeWear: Math.floor(Math.random() * 30) + 15,
                    suspensionDeflection: Math.floor(Math.random() * 6) + 4,
                    tirePressure: {
                        fl: 33 + Math.floor(Math.random() * 4 - 2),
                        fr: 33 + Math.floor(Math.random() * 4 - 2),
                        rl: 33 + Math.floor(Math.random() * 4 - 2),
                        rr: 33 + Math.floor(Math.random() * 4 - 2)
                    }
                },
                
                predictive: {
                    failureProbability: parseFloat(baseFailureProb.toFixed(1)),
                    rul: rul,
                    ttf: ttf,
                    wearRate: parseFloat((0.08 + Math.random() * 0.04).toFixed(3))
                },
                
                activeFaults: [],
                dtcCodes: [],
                maintenanceHistory: [
                    { date: '2026-05-10', action: 'Brake Fluid Top-up', technician: 'M. Shinde' },
                    { date: '2026-02-14', action: 'Tire Rotation & Alignment', technician: 'A. Khan' }
                ]
            });
        }
    }

    start(onTickCallback) {
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => {
            this.tick(onTickCallback);
        }, this.updateInterval / this.simulationSpeed);
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    setSpeed(speed, onTickCallback) {
        this.simulationSpeed = speed;
        this.start(onTickCallback);
    }

    async tick(onTickCallback) {
        let tickDist = 0;
        
        // Execute updates sequentially or asynchronously
        for (let ev of this.vehicles) {
            if (ev.status !== "Maintenance" && ev.status !== "Charging") {
                tickDist += ev.performance.speed * 0.00083 * this.simulationSpeed;
            }
            this.updateGPSLocation(ev);
            this.updateBatteryTelemetry(ev);
            this.updateComponentWear(ev);
            await this.checkDiagnostics(ev);
        }
        
        this.sessionDistance += tickDist;

        if (onTickCallback) {
            onTickCallback([...this.vehicles], [...this.alertHistory], this.sessionDistance);
        }
    }

    updateGPSLocation(ev) {
        if (ev.status === "Maintenance" || ev.status === "Charging") {
            ev.performance.speed = 0;
            ev.performance.motorRPM = 0;
            return;
        }

        const route = ev.routeNodes;
        const targetNodeIndex = (ev.currentNodeIndex + 1) % route.length;
        const currentLoc = { lat: ev.lat, lng: ev.lng };
        const targetLoc = route[targetNodeIndex];

        const speedFactor = 0.05 * this.simulationSpeed;
        const dLat = targetLoc.lat - currentLoc.lat;
        const dLng = targetLoc.lng - currentLoc.lng;
        const distance = Math.sqrt(dLat * dLat + dLng * dLng);

        if (distance < 0.005) {
            ev.currentNodeIndex = targetNodeIndex;
            ev.lat = targetLoc.lat;
            ev.lng = targetLoc.lng;
        } else {
            ev.lat += (dLat / distance) * speedFactor * 0.005;
            ev.lng += (dLng / distance) * speedFactor * 0.005;
        }

        const angle = Math.atan2(dLng, dLat) * (180 / Math.PI);
        ev.heading = Math.round(angle < 0 ? angle + 360 : angle);
        
        ev.performance.speed = Math.floor(Math.random() * 20) + 30; // 30 - 50 km/h
        ev.performance.motorRPM = ev.performance.speed * 85;
        ev.performance.odometer += parseFloat((ev.performance.speed * 0.00083 * this.simulationSpeed).toFixed(4));
    }

    updateBatteryTelemetry(ev) {
        if (ev.status === "Charging") {
            ev.battery.soc += (1.5 * this.simulationSpeed);
            ev.battery.temp = Math.max(28, ev.battery.temp - 0.2);
            ev.battery.voltage = 410 + (ev.battery.soc * 0.1);
            ev.battery.current = -45;
            if (ev.battery.soc >= 100) {
                ev.battery.soc = 100;
                ev.status = "Active";
                ev.battery.cycles += 1;
                this.addAlert(ev.id, "Charging Completed", `Vehicle ${ev.id} battery is fully charged (100%). Returning to service.`, "info");
            }
            return;
        }

        if (ev.status === "Maintenance") {
            ev.battery.current = 0;
            ev.battery.temp = 25;
            return;
        }

        const drain = (ev.performance.energyCons * ev.performance.speed * 0.00083 * this.simulationSpeed * 0.5);
        ev.battery.soc = parseFloat((ev.battery.soc - drain).toFixed(2));
        
        if (ev.activeFaults.includes("battery_overheat")) {
            ev.battery.temp = parseFloat((ev.battery.temp + 0.8 * this.simulationSpeed).toFixed(1));
            ev.battery.voltage = parseFloat((ev.battery.voltage - 1.2 * this.simulationSpeed).toFixed(1));
            ev.battery.current = parseFloat((ev.battery.current + 3.0 * this.simulationSpeed).toFixed(1));
        } else {
            ev.battery.temp = parseFloat((30 + (ev.performance.speed * 0.15) + (Math.random() * 1 - 0.5)).toFixed(1));
            ev.battery.voltage = parseFloat((380 + (ev.battery.soc * 0.38)).toFixed(1));
            ev.battery.current = parseFloat(((ev.performance.speed * 0.85) + (Math.random() * 4)).toFixed(1));
        }

        if (ev.battery.soc < 15 && ev.status === "Active") {
            ev.status = "Charging";
            this.addAlert(ev.id, "Low Battery Warning", `Vehicle ${ev.id} battery is critically low (${ev.battery.soc}%). Rerouted to nearest charger.`, "warning");
        }
    }

    updateComponentWear(ev) {
        if (ev.status === "Maintenance") return;

        const distanceTraveled = ev.performance.speed * 0.00083 * this.simulationSpeed;
        ev.performance.brakeWear = parseFloat((ev.performance.brakeWear + distanceTraveled * ev.predictive.wearRate).toFixed(3));
        
        const heatExpansion = (ev.battery.temp - 30) * 0.08;
        ["fl", "fr", "rl", "rr"].forEach(t => {
            if (ev.activeFaults.includes("tire_blowout") && t === "fl") {
                ev.performance.tirePressure.fl = Math.max(4, ev.performance.tirePressure.fl - 3 * this.simulationSpeed);
            } else {
                ev.performance.tirePressure[t] = parseFloat((32 + heatExpansion + Math.sin(Date.now() / 50000) * 0.5).toFixed(1));
            }
        });

        ev.performance.suspensionDeflection = parseFloat((4 + Math.sin(Date.now() / 1000) * 2 + Math.random()).toFixed(1));
    }

    async checkDiagnostics(ev) {
        if (ev.battery.temp > 50) {
            if (!ev.dtcCodes.includes("P0A7F") && ev.battery.temp > 55) {
                ev.dtcCodes.push("P0A7F");
                this.addAlert(ev.id, "Thermal Anomaly Detected", `Battery Pack Overheat [DTC: P0A7F] - Module Temp is ${ev.battery.temp}°C.`, "critical");
                ev.status = "Critical";
            }
        }

        if (ev.performance.brakeWear > 80) {
            if (!ev.dtcCodes.includes("C1095") && ev.performance.brakeWear > 90) {
                ev.dtcCodes.push("C1095");
                this.addAlert(ev.id, "Brake System Degraded", `ABS Circuit Warning [DTC: C1095] - Brake wear exceeds safety threshold (${ev.performance.brakeWear.toFixed(1)}%).`, "warning");
            }
        }

        ["fl", "fr", "rl", "rr"].forEach(t => {
            const press = ev.performance.tirePressure[t];
            if (press < 24) {
                if (!ev.dtcCodes.includes(`C1201-${t.toUpperCase()}`) && press < 18) {
                    ev.dtcCodes.push(`C1201-${t.toUpperCase()}`);
                    this.addAlert(ev.id, "Critical Low Tire Pressure", `Tire pressure fault [DTC: C1201] on ${t.toUpperCase()} wheel: ${press} psi.`, "critical");
                    ev.status = "Critical";
                }
            }
        });

        if (ev.activeFaults.includes("motor_vibration")) {
            if (!ev.dtcCodes.includes("P0A1B")) {
                ev.dtcCodes.push("P0A1B");
                this.addAlert(ev.id, "Motor Control Malfunction", `Bearing Vibration Warning [DTC: P0A1B] - Motor bearing friction spike.`, "warning");
            }
        }

        // Fetch ML predictions
        const vibration = ev.activeFaults.includes("motor_vibration") ? 82.5 : (11.0 + Math.random() * 4.0);
        const payload = {
            soc: ev.battery.soc,
            soh: ev.battery.soh,
            temp: ev.battery.temp,
            voltage: ev.battery.voltage,
            current: ev.battery.current,
            cycles: ev.battery.cycles,
            speed: ev.performance.speed,
            rpm: ev.performance.motorRPM,
            mtemp: ev.performance.motorTemp,
            brake_wear: ev.performance.brakeWear,
            tire_pressure: ev.performance.tirePressure,
            suspension: ev.performance.suspensionDeflection,
            vibration: vibration
        };

        try {
            // Fetch request relative to domain (works with Vite proxy)
            const response = await fetch('/api/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                const result = await response.json();
                ev.predictive.failureProbability = result.failure_probability;
                ev.predictive.rul = result.rul;
                ev.predictive.ttf = result.ttf;
            } else {
                this.fallbackLocalRules(ev);
            }
        } catch (e) {
            this.fallbackLocalRules(ev);
        }
    }

    fallbackLocalRules(ev) {
        let penalty = 0;
        if (ev.battery.temp > 50) penalty += (ev.battery.temp - 50) * 2.5;
        if (ev.performance.brakeWear > 80) penalty += (ev.performance.brakeWear - 80) * 1.8;
        
        ["fl", "fr", "rl", "rr"].forEach(t => {
            const press = ev.performance.tirePressure[t];
            if (press < 24) penalty += (24 - press) * 3;
        });

        if (ev.activeFaults.includes("motor_vibration")) penalty += 45;

        const baseProb = Math.max(2, parseFloat((penalty + (100 - ev.battery.soh) * 0.4).toFixed(1)));
        ev.predictive.failureProbability = Math.min(99.9, baseProb);
        ev.predictive.rul = Math.max(0, Math.round((ev.battery.soh * 2.5) * (1 - ev.predictive.failureProbability / 100)));
        ev.predictive.ttf = Math.max(0, Math.round(ev.predictive.rul * 24 * (1 - ev.predictive.failureProbability / 150)));
    }

    addAlert(vehicleId, title, desc, severity) {
        const timestamp = new Date().toLocaleTimeString();
        const alert = {
            id: `AL-${Math.floor(Math.random() * 90000 + 10000)}`,
            vehicleId: vehicleId,
            title: title,
            desc: desc,
            severity: severity,
            time: timestamp
        };
        
        this.alertHistory.unshift(alert);
        if (this.alertHistory.length > 50) this.alertHistory.pop();
        
        const event = new CustomEvent("new_simulation_alert", { detail: alert });
        document.dispatchEvent(event);
    }

    injectFault(vehicleId, faultType) {
        const ev = this.vehicles.find(v => v.id === vehicleId);
        if (!ev) return;

        if (ev.activeFaults.includes(faultType)) return;
        
        ev.activeFaults.push(faultType);
        
        if (faultType === "battery_overheat") {
            ev.battery.temp = 56.5; 
            ev.battery.soh = Math.max(70, ev.battery.soh - 8);
            this.addAlert(vehicleId, "FAULT INJECTED: Thermal Runaway", `Battery thermal failure triggered manually. Core cell temperature rising past 55°C.`, "critical");
        } else if (faultType === "motor_vibration") {
            ev.performance.motorTemp = 82;
            this.addAlert(vehicleId, "FAULT INJECTED: Motor Vibrations", `Friction test load applied. Mechanical vibration feedback detected in motor housing.`, "warning");
        } else if (faultType === "tire_blowout") {
            ev.performance.tirePressure.fl = 16;
            this.addAlert(vehicleId, "FAULT INJECTED: Tire Blowout", `Simulated sharp deflation on Front-Left tire. Pressure dropped below 18 psi.`, "critical");
        } else if (faultType === "brake_failure") {
            ev.performance.brakeWear = 94.5;
            this.addAlert(vehicleId, "FAULT INJECTED: Brake Pad Failure", `Simulated extreme hydraulic wear. Brake pad friction layer depleted below 10% remaining thickness.`, "warning");
        }
        
        this.checkDiagnostics(ev);
    }

    resolveFault(vehicleId) {
        const ev = this.vehicles.find(v => v.id === vehicleId);
        if (!ev) return;

        ev.activeFaults = [];
        ev.dtcCodes = [];
        ev.status = "Active";
        
        ev.battery.temp = Math.floor(Math.random() * 5) + 31;
        ev.performance.tirePressure.fl = 33.2;
        ev.performance.tirePressure.fr = 32.8;
        ev.performance.tirePressure.rl = 33.0;
        ev.performance.tirePressure.rr = 33.5;
        ev.performance.brakeWear = Math.floor(Math.random() * 20) + 15;
        ev.performance.motorTemp = 48;
        
        ev.predictive.failureProbability = 2.4;
        ev.predictive.rul = 240;
        ev.predictive.ttf = 240 * 24;

        this.addAlert(vehicleId, "Maintenance Completed", `Vehicle ${vehicleId} diagnostic logs cleared. Sensors recalibrated and returned to Active Service.`, "success");
    }

    scheduleService(vehicleId) {
        const ev = this.vehicles.find(v => v.id === vehicleId);
        if (!ev) return;
        
        ev.status = "Maintenance";
        this.addAlert(vehicleId, "Service Scheduled", `Vehicle ${vehicleId} has been pulled from fleet operation and is routed to DBIT IT Lab Staging for repairs.`, "info");
        
        setTimeout(() => {
            this.resolveFault(vehicleId);
        }, 8000);
    }
}
