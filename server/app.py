from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
import numpy as np
import os

app = Flask(__name__)
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
df = pd.read_csv(os.path.join(BASE_DIR, 'omni_processed.csv'), parse_dates=['datetime'])
df = df.sort_values('datetime').reset_index(drop=True)

COLS = [
    'datetime', 'flow_speed_kms', 'proton_density_ncc', 'bz_gsm_nT',
    'pdyn_computed_nPa', 'dst_omni', 'kp', 'storm_flag', 'imf_mag_scalar_nT',
    'ae_index_nT', 'sym_h_nT',
]


@app.route('/api/data')
def get_data():
    start = request.args.get('start', '2003-10-25')
    end   = request.args.get('end',   '2003-11-10')
    mask  = (df['datetime'] >= start) & (df['datetime'] <= end)
    subset = df.loc[mask, COLS].copy()
    subset['datetime'] = subset['datetime'].dt.strftime('%Y-%m-%dT%H:%M:%S')
    return jsonify(subset.replace({np.nan: None}).to_dict('records'))


@app.route('/api/storms')
def get_storms():
    sdf = df[df['storm_flag'] == 1].copy()
    sdf['group'] = (sdf.index.to_series().diff().fillna(1) > 1).cumsum()
    events = []
    for _, g in sdf.groupby('group'):
        events.append({
            'start':   g['datetime'].min().strftime('%Y-%m-%dT%H:%M:%S'),
            'end':     g['datetime'].max().strftime('%Y-%m-%dT%H:%M:%S'),
            'min_dst': float(g['dst_omni'].min()),
            'max_kp':  float(g['kp'].max()),
        })
    return jsonify(events)


@app.route('/api/range')
def get_range():
    return jsonify({
        'min': df['datetime'].min().strftime('%Y-%m-%dT%H:%M:%S'),
        'max': df['datetime'].max().strftime('%Y-%m-%dT%H:%M:%S'),
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
