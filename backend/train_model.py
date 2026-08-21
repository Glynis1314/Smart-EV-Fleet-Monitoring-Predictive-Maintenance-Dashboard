# IoE EV Predictive Maintenance - Machine Learning Training Pipeline
# Downloads or synthesizes the EVIoT-PredictiveMaint dataset,
# trains Random Forest Regressors, and saves them for the Flask API.

import os
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
import joblib

def generate_synthetic_data(num_records=50000):
    print(f"Generating {num_records} high-fidelity synthetic EVIoT telemetry records...")
    
    np.random.seed(42)
    
    # 1. Base Variables
    soh = np.random.uniform(70.0, 100.0, num_records) # 70% to 100% SOH
    cycles = (100.0 - soh) * np.random.uniform(5.0, 7.0, num_records) + np.random.normal(50, 10, num_records)
    cycles = np.clip(cycles, 10, 350).astype(int)
    
    soc = np.random.uniform(10.0, 98.0, num_records) # 10% to 98% SoC
    speed = np.random.uniform(0.0, 80.0, num_records) # 0 to 80 km/h
    rpm = speed * 85.0 + np.random.normal(0, 100, num_records)
    rpm = np.clip(rpm, 0, 7000)
    
    # Temperatures rise with speed/load and environmental factors
    temp = 28.0 + (speed * 0.1) + (100.0 - soc) * 0.05 + np.random.normal(0, 2, num_records) # battery temp
    mtemp = 35.0 + (rpm * 0.005) + np.random.normal(0, 3, num_records) # motor temp
    
    # Introduce some battery anomalies/overheat samples intentionally
    overheat_indices = np.random.choice(num_records, int(num_records * 0.02), replace=False)
    temp[overheat_indices] = np.random.uniform(52.0, 68.0, len(overheat_indices))
    
    # Voltages and current flow
    voltage = 380.0 + (soc * 0.4) - (temp - 30.0) * 0.15 + np.random.normal(0, 1, num_records)
    current = (speed * 0.8) + (temp - 30.0) * 0.5 + np.random.normal(0, 2, num_records)
    current[overheat_indices] *= np.random.uniform(1.2, 1.5, len(overheat_indices))
    
    # Mechanical wear
    brake_wear = np.random.uniform(10.0, 98.0, num_records)
    
    # Tire pressure (normally 32 psi, some leaks)
    tire_pressure = np.random.normal(32, 1.5, num_records)
    leak_indices = np.random.choice(num_records, int(num_records * 0.03), replace=False)
    tire_pressure[leak_indices] = np.random.uniform(8.0, 20.0, len(leak_indices))
    
    suspension = np.random.uniform(2.0, 12.0, num_records)
    
    # Vibrations index (high vibration indicates motor bearing faults)
    vibration = np.random.uniform(5.0, 30.0, num_records)
    vibration_indices = np.random.choice(num_records, int(num_records * 0.02), replace=False)
    vibration[vibration_indices] = np.random.uniform(65.0, 95.0, len(vibration_indices))
    mtemp[vibration_indices] += np.random.uniform(15.0, 25.0, len(vibration_indices))
    
    # 2. Target Columns Calculations (Physical Rules Mapping)
    base_rul = (soh - 65.0) * 8.0 
    base_rul = np.clip(base_rul, 0, 300)
    
    # Penalties to RUL
    brake_penalty = np.where(brake_wear > 80.0, (brake_wear - 80.0) * 2.0, 0)
    vibration_penalty = np.where(vibration > 50.0, (vibration - 50.0) * 1.5, 0)
    temp_penalty = np.where(temp > 50.0, (temp - 50.0) * 3.0, 0)
    
    rul = base_rul - brake_penalty - vibration_penalty - temp_penalty + np.random.normal(0, 5, num_records)
    rul = np.clip(rul, 0, 280).astype(int)
    
    # Failure Probability Risk (0% to 100%)
    p_temp = np.where(temp > 50.0, (temp - 50.0) * 3.5, 0)
    p_vibration = np.where(vibration > 50.0, (vibration - 50.0) * 1.6, 0)
    p_tire = np.where(tire_pressure < 22.0, (22.0 - tire_pressure) * 4.0, 0)
    p_brake = np.where(brake_wear > 85.0, (brake_wear - 85.0) * 2.5, 0)
    p_soh = (100.0 - soh) * 0.8
    
    failure_prob = p_temp + p_vibration + p_tire + p_brake + p_soh + np.random.normal(1.5, 0.5, num_records)
    failure_prob = np.clip(failure_prob, 1.0, 99.9)
    
    # Create DataFrame
    df = pd.DataFrame({
        'soc': soc, 'soh': soh, 'temp': temp, 'voltage': voltage, 'current': current, 'cycles': cycles,
        'speed': speed, 'rpm': rpm, 'mtemp': mtemp, 'brake_wear': brake_wear, 'tire_pressure': tire_pressure,
        'suspension': suspension, 'vibration': vibration,
        'rul': rul, 'failure_prob': failure_prob
    })
    
    return df

def load_and_preprocess_dataset(filepath):
    print(f"Loading Kaggle dataset from {filepath}...")
    df = pd.read_csv(filepath)
    
    # Strip whitespace and lowercase all column headers
    df.columns = [c.lower().strip() for c in df.columns]
    
    # Matching rules for columns
    def find_col(patterns):
        for c in df.columns:
            for p in patterns:
                if p in c:
                    return c
        return None

    col_mappings = {
        'soc': (['soc', 'charge'], 'soc'),
        'soh': (['soh', 'health'], 'soh'),
        'temp': (['battery_temp', 'battery temp', 'temp'], 'temp'),
        'voltage': (['voltage', 'volt'], 'voltage'),
        'current': (['current', 'amp'], 'current'),
        'cycles': (['cycle', 'charge_cycle'], 'cycles'),
        'speed': (['speed', 'velocity'], 'speed'),
        'rpm': (['rpm', 'motor_rpm'], 'rpm'),
        'mtemp': (['motor_temp', 'motor temp', 'mtemp'], 'mtemp'),
        'brake_wear': (['brake', 'pad_wear'], 'brake_wear'),
        'tire_pressure': (['tire', 'pressure'], 'tire_pressure'),
        'suspension': (['suspension', 'deflection'], 'suspension'),
        'vibration': (['vibration', 'bearing'], 'vibration'),
        'rul': (['rul', 'remaining_useful_life', 'remaining useful life'], 'rul'),
        'failure_prob': (['fail', 'probability', 'prob'], 'failure_prob')
    }

    final_df = pd.DataFrame()
    missing_cols = []
    
    for key, (patterns, target_name) in col_mappings.items():
        found = find_col(patterns)
        if found:
            final_df[target_name] = df[found]
        else:
            missing_cols.append(target_name)
            
    if missing_cols:
        print(f"WARNING: The following columns were not found in the CSV and will be filled with standard defaults: {missing_cols}")
        for col in missing_cols:
            if col == 'vibration':
                final_df['vibration'] = np.random.uniform(10.0, 22.0, len(df))
            elif col == 'suspension':
                final_df['suspension'] = np.random.uniform(4.0, 8.0, len(df))
            elif col == 'cycles':
                final_df['cycles'] = np.random.randint(50, 200, len(df))
            elif col == 'rpm':
                final_df['rpm'] = (final_df['speed'] * 85 if 'speed' in final_df else np.random.uniform(1000, 4000, len(df)))
            else:
                raise ValueError(f"CRITICAL: Required target column '{col}' is missing in the dataset. Training aborted.")

    # Convert all columns to numeric, replacing any anomalies with zero
    for col in final_df.columns:
        final_df[col] = pd.to_numeric(final_df[col], errors='coerce').fillna(0)
        
    return final_df

def train_and_export():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(script_dir, 'models')
    os.makedirs(models_dir, exist_ok=True)
    
    df = None
    
    paths_to_check = [
        'EVIoT-PredictiveMaint.csv',
        'backend/EVIoT-PredictiveMaint.csv',
        'archive/EVIoT-PredictiveMaint.csv',
        'backend/archive/EVIoT-PredictiveMaint.csv',
        os.path.join(script_dir, 'EVIoT-PredictiveMaint.csv'),
        os.path.join(os.path.dirname(script_dir), 'EVIoT-PredictiveMaint.csv'),
        os.path.join(script_dir, 'archive', 'EVIoT-PredictiveMaint.csv'),
        os.path.join(os.path.dirname(script_dir), 'archive', 'EVIoT-PredictiveMaint.csv')
    ]
    
    csv_found_path = None
    for p in paths_to_check:
        if os.path.exists(p):
            csv_found_path = p
            break
            
    if csv_found_path:
        try:
            df = load_and_preprocess_dataset(csv_found_path)
        except Exception as e:
            print(f"Error loading CSV file {csv_found_path}: {str(e)}. Falling back to synthetic data.")
            df = None
            
    if df is None:
        print("Kaggle CSV dataset not found. Running high-fidelity simulation data synthesis...")
        df = generate_synthetic_data(num_records=50000)
    
    # Prepare Features and Targets
    feature_cols = ['soc', 'soh', 'temp', 'voltage', 'current', 'cycles', 'speed', 'rpm', 'mtemp', 'brake_wear', 'tire_pressure', 'suspension', 'vibration']
    X = df[feature_cols]
    y_rul = df['rul']
    y_fail = df['failure_prob']
    
    # 1. Train RUL Model
    print("Training Remaining Useful Life (RUL) Regressor Model...")
    X_train, X_test, y_train, y_test = train_test_split(X, y_rul, test_size=0.2, random_state=42)
    
    rul_model = RandomForestRegressor(n_estimators=40, max_depth=12, random_state=42, n_jobs=-1)
    rul_model.fit(X_train, y_train)
    
    y_pred = rul_model.predict(X_test)
    print(f"RUL Model Evaluation:")
    print(f"  R2 Score: {r2_score(y_test, y_pred):.4f}")
    print(f"  Mean Absolute Error: {mean_absolute_error(y_test, y_pred):.2f} days")
    
    joblib.dump(rul_model, os.path.join(models_dir, 'rul_model.joblib'), compress=3)
    print(f"Saved RUL model to {os.path.join(models_dir, 'rul_model.joblib')}")
    
    # 2. Train Failure Probability Model
    print("Training Failure Probability Predictor Model...")
    X_train_f, X_test_f, y_train_f, y_test_f = train_test_split(X, y_fail, test_size=0.2, random_state=42)
    
    fail_model = RandomForestRegressor(n_estimators=40, max_depth=12, random_state=42, n_jobs=-1)
    fail_model.fit(X_train_f, y_train_f)
    
    y_pred_f = fail_model.predict(X_test_f)
    print(f"Failure Probability Model Evaluation:")
    print(f"  R2 Score: {r2_score(y_test_f, y_pred_f):.4f}")
    print(f"  Mean Absolute Error: {mean_absolute_error(y_test_f, y_pred_f):.2f}%")
    
    joblib.dump(fail_model, os.path.join(models_dir, 'fail_prob_model.joblib'), compress=3)
    print(f"Saved Failure Probability model to {os.path.join(models_dir, 'fail_prob_model.joblib')}")
    
    print("\nMachine Learning Training Pipeline Complete!")

if __name__ == "__main__":
    train_and_export()
