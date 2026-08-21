# IoE-Based Smart EV Fleet Monitoring & Predictive Maintenance Dashboard (React + Flask)

An end-to-end Internet of Everything (IoE) fleet telemetry portal and machine learning-driven diagnostics platform. This system utilizes Random Forest regression models to forecast Electric Vehicle (EV) Remaining Useful Life (RUL) and failure risk probabilities, displaying telemetry inside a premium industrial React-based dashboard.

Designed as an **IoE Lab Semester-VII Miniproject** for the **Department of Information Technology, Don Bosco Institute of Technology (DBIT)**.

---

## 👥 Project Contributors
*   **Smruti Alegaonkar** (Roll: 01)
*   **Shariya Ansari** (Roll: 03)
*   **Alston Coelho** (Roll: 16)
*   **Glynis D’Mello** (Roll: 18)
*   **Project Guide:** Prof. Janhavi Baikerikar

---

## 🏗️ System Architecture

The application is structured as a client-server system combining a Vite-powered React client dashboard with a Python-based Flask ML inference backend.

```
┌────────────────────────────────────────────────────────────────────────┐
│                     FRONTEND CLIENT (REACT / VITE)                     │
│                                                                        │
│   ┌────────────────────┐   ┌──────────────────┐   ┌────────────────┐   │
│   │    Leaflet Map     │   │    ApexCharts    │   │  FL Visualizer │   │
│   │ (Vehicle GPS Pins) │   │ (Health Metrics) │   │ (Edge Training)│   │
│   └─────────▲──────────┘   └────────▲─────────┘   └────────▲───────┘   │
│             │                       │                      │           │
│             └───────────────────────┼──────────────────────┘           │
│                                     │ (React State Updates)            │
│                        ┌────────────┴────────────┐                     │
│                        │    data-simulator.js    │                     │
│                        │ (10 EVs Mumbai routes)  │                     │
│                        └────────────┬────────────┘                     │
└─────────────────────────────────────┼──────────────────────────────────┘
                                      │ (HTTP POST Telemetry JSON via Proxy)
                                      ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         BACKEND SERVER (FLASK)                         │
│                                                                        │
│                       ┌───────────────────────────┐                    │
│                       │        app.py API         │                    │
│                       │    (POST /api/predict)    │                    │
│                       └─────────────┬─────────────┘                    │
│                                     │                                  │
│                    ┌────────────────┴────────────────┐                 │
│                    ▼                                 ▼                 │
│         [ rul_model.joblib ]               [ fail_prob_model.joblib ]  │
│       Random Forest Regressor                Random Forest Regressor   │
│         (Predicts RUL Days)                   (Predicts Failure %)     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Key Features

1.  **React-Driven State Management**: telematics and alerts from the EV simulation run continuously, and components (Map, charts, and values) update smoothly on every tick.
2.  **Model-Driven Predictive Maintenance**: Integrates two machine learning estimators (Random Forest Regressors) to predict Remaining Useful Life (RUL) and failure probability in real-time, matching telemetry input variables.
3.  **Mumbai Fleet GIS Tracker**: Plotted using Leaflet.js with dark-themed tiles. 10 simulated EVs route dynamically through landmarks around Mumbai Suburban (Kurla, Sakinaka, Powai Lake, Chembur, Bandra Reclamation).
4.  **DBIT AI Diagnostics Copilot**: Automatically generates formatted job cards, assigns student technicians, allocates repair bays in the DBIT staging lab, and creates step-by-step diagnostic actions whenever DTC codes trigger.
5.  **Green Fleet Sustainability Analytics**: Tracks cumulative carbon emissions offset (kg $\text{CO}_2$), diesel fuel cost savings (INR), and equivalent trees planted.
6.  **Federated Learning Visualizer**: Visualizes edge computing mechanics where individual vehicles train local parameters, encrypt updates, and aggregate them at the central server via `FedAvg`.
7.  **Interactive Fault Injector**: Allows presenters to trigger anomalies (thermal runway, motor friction/vibration, brake wear, low tire pressure) to demonstrate model response and diagnostic alarms.

---

## ⚙️ Technical Stack

*   **Frontend**: React (v19), Vite, CSS3 (Matte Black/Charcoal industrial theme), ES6 modules.
*   **Mapping & Data Viz**: Leaflet (Map overlays), React-ApexCharts (Donuts, line curves, and bar charts), FontAwesome.
*   **Backend Server**: Flask, Flask-CORS (Python 3).
*   **Machine Learning**: Scikit-Learn (Random Forest Regressors), Pandas, NumPy, Joblib (Serialization).

---

## 🚀 Setup & Execution

### 1. Prerequisites
Ensure you have Node.js and Python 3.8+ installed.

### 2. Backend Setup & Training
Install python libraries:
```bash
pip install flask pandas numpy scikit-learn joblib flask-cors
```
Train the Random Forest regressors and generate the model binaries:
```bash
python backend/train_model.py
```

### 3. Frontend Setup
Install npm packages:
```bash
npm install
```

### 4. Running the Application

#### A. Development Mode (Hot Module Replacement)
1. Start Flask API server:
```bash
python backend/app.py
```
2. Start Vite React development server in a separate terminal:
```bash
npm run dev
```
Open your browser and navigate to:
👉 **[http://localhost:5173](http://localhost:5173)** *(Vite proxy will route backend API requests automatically to port 8000)*

#### B. Production Mode (Unified Flask Port)
Compile the React code:
```bash
npm run build
```
Run Flask server:
```bash
python backend/app.py
```
Open your browser and navigate to:
👉 **[http://localhost:8000](http://localhost:8000)** *(Serves compiled static files from `/dist`)*

---

## 📁 File Structure

```
IOE_Project_Sem7/
├── backend/
│   ├── models/
│   │   ├── fail_prob_model.joblib  # Trained model binary
│   │   └── rul_model.joblib       # Trained model binary
│   ├── app.py                     # Flask server and prediction API
│   └── train_model.py             # ML preprocessing & training script
├── src/
│   ├── assets/                    # Static UI images & assets
│   ├── App.jsx                    # Main React Component
│   ├── index.css                  # Carbon grid stylesheet
│   ├── main.jsx                   # React Entrypoint
│   └── data-simulator.js          # Telemetry simulator class module
├── public/                        # Public assets
├── dist/                          # Compiled React build (production)
├── vite.config.js                 # Vite config and proxy settings
├── package.json                   # Node packages dependencies
└── README.md                      # Documentation
```
