# IoE Smart EV Dashboard Backend Server
# Serves built static React client files (from dist/) and handles ML inference requests.

import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import joblib

# Setup absolute paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Serves the compiled React files from /dist
STATIC_DIR = os.path.join(os.path.dirname(BASE_DIR), 'dist')

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path='')
CORS(app) # Allow cross-origin requests for Vite dev servers

# Load Machine Learning models
try:
    rul_model_path = os.path.join(BASE_DIR, 'models', 'rul_model.joblib')
    fail_prob_model_path = os.path.join(BASE_DIR, 'models', 'fail_prob_model.joblib')
    
    print(f"Loading models from:\n - {rul_model_path}\n - {fail_prob_model_path}")
    rul_model = joblib.load(rul_model_path)
    fail_prob_model = joblib.load(fail_prob_model_path)
    print("Machine learning models loaded successfully!")
    models_available = True
except Exception as e:
    print(f"WARNING: Failed to load models: {str(e)}")
    print("Server will fall back to rule-based calculations if models aren't trained.")
    models_available = False
    rul_model = None
    fail_prob_model = None

@app.route('/')
def serve_index():
    if os.path.exists(os.path.join(app.static_folder, 'index.html')):
        return send_from_directory(app.static_folder, 'index.html')
    else:
        return jsonify({
            'status': 'success',
            'message': 'Flask server is running. React frontend is not compiled yet. Run npm run build or use Vite dev server on port 5173.'
        })

@app.route('/<path:path>')
def serve_static(path):
    if os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    return jsonify({'error': 'Static file not found'}), 404

@app.route('/api/predict', methods=['POST'])
def predict():
    if not models_available:
        return jsonify({
            'status': 'fallback',
            'error': 'ML models are not loaded. Run train_model.py first.'
        }), 503

    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Invalid request body, JSON required'}), 400

        # Unpack variables with sensible defaults matching EVSimulator structure
        soc = float(data.get('soc', 80.0))
        soh = float(data.get('soh', 98.0))
        temp = float(data.get('temp', 32.0))
        voltage = float(data.get('voltage', 400.0))
        current = float(data.get('current', 20.0))
        cycles = int(data.get('cycles', 100))
        
        speed = float(data.get('speed', 40.0))
        rpm = float(data.get('rpm', 3400.0))
        mtemp = float(data.get('mtemp', 50.0))
        brake_wear = float(data.get('brake_wear', 25.0))
        
        tp = data.get('tire_pressure', 33.0)
        if isinstance(tp, dict):
            tire_pressure = float(min(tp.values()))
        else:
            tire_pressure = float(tp)
            
        suspension = float(data.get('suspension', 5.0))
        vibration = float(data.get('vibration', 12.0))

        # Assemble the 13-feature array matching train_model.py
        features = [[
            soc, soh, temp, voltage, current, cycles,
            speed, rpm, mtemp, brake_wear, tire_pressure,
            suspension, vibration
        ]]

        # Run model inference
        predicted_rul = float(rul_model.predict(features)[0])
        predicted_fail_prob = float(fail_prob_model.predict(features)[0])

        return jsonify({
            'status': 'success',
            'rul': round(predicted_rul),
            'ttf': round(predicted_rul * 24),
            'failure_probability': round(predicted_fail_prob, 1)
        })

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f"Inference failed: {str(e)}"
        }), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000, debug=True)
