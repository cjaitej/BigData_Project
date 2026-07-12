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
    'ae_index_nT', 'sym_h_nT', 'proton_temp_K', 'sw_type',
    'bz_norm', 'speed_norm', 'density_norm', 'ae_norm', 'pdyn_norm', 'imf_norm',
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


# Storm catalog, computed at startup
def _round(x, nd):
    return None if pd.isna(x) else round(float(x), nd)


def build_storm_catalog():
    # Contiguous hourly runs of SYM-H < -50 nT lasting >= 3 h
    below = df['sym_h_nT'] < -50
    run_id = (below != below.shift()).cumsum()
    storms = []
    for _, run in df[below].groupby(run_id[below]):
        if len(run) < 3:
            continue
        peak = run.loc[run['sym_h_nT'].idxmin()]
        peak_dst = float(run['sym_h_nT'].min())
        storms.append({
            'id':             len(storms) + 1,
            'start':          run['datetime'].iloc[0].strftime('%Y-%m-%dT%H:%M:%SZ'),
            'end':            run['datetime'].iloc[-1].strftime('%Y-%m-%dT%H:%M:%SZ'),
            'peak_time':      peak['datetime'].strftime('%Y-%m-%dT%H:%M:%SZ'),
            'peak_dst_nT':    round(peak_dst, 1),
            'duration_hrs':   int(len(run)),
            'intensity':      'severe' if peak_dst <= -200 else 'intense' if peak_dst <= -100 else 'moderate',
            'peak_kp':        _round(peak['kp'], 1),
            'peak_speed_kms': None if pd.isna(peak['flow_speed_kms']) else float(peak['flow_speed_kms']),
            'sw_type':        None if pd.isna(peak['sw_type']) else peak['sw_type'],
        })
    return storms


ORBITAL_STORMS = build_storm_catalog()


@app.route('/api/orbital/storms')
def get_orbital_storms():
    return jsonify(ORBITAL_STORMS)


# Mean Kp/AE/electric-field by calendar month (Russell-McPherron effect)
def build_seasonal(start=None, end=None):
    sub_df = df
    if start is not None:
        sub_df = sub_df[sub_df['datetime'] >= start]
    if end is not None:
        sub_df = sub_df[sub_df['datetime'] <= end]
    out = []
    for m in range(1, 13):
        sub = sub_df[sub_df['datetime'].dt.month == m]
        out.append({
            'month': m,
            'meanKp': _round(sub['kp'].mean(), 2),
            'meanAE': _round(sub['ae_index_nT'].mean(), 1),
            'meanElectricField': _round(sub['electric_field_mVm'].mean(), 3),
            'n': int(len(sub)),
        })
    return out


SEASONAL = build_seasonal()


@app.route('/api/seasonal')
def get_seasonal():
    # No params = precomputed full-dataset default
    start = request.args.get('start')
    end = request.args.get('end')
    if start is None and end is None:
        return jsonify(SEASONAL)
    return jsonify(build_seasonal(start, end))


# Every hour classified by driver type, Bz direction, and storm outcome
def build_escalation_flow(start=None, end=None):
    sub_df = df
    if start is not None:
        sub_df = sub_df[sub_df['datetime'] >= start]
    if end is not None:
        sub_df = sub_df[sub_df['datetime'] <= end]
    rows = []
    g = sub_df.groupby(['sw_type', 'bz_southward', 'storm_flag']).size()
    for (t, south, storm), count in g.items():
        rows.append({
            'sw_type': t,
            'bz_southward': bool(south),
            'storm_flag': bool(storm),
            'count': int(count),
        })
    return rows


ESCALATION_FLOW = build_escalation_flow()


@app.route('/api/escalation_flow')
def get_escalation_flow():
    # No params = precomputed full-dataset default
    start = request.args.get('start')
    end = request.args.get('end')
    if start is None and end is None:
        return jsonify(ESCALATION_FLOW)
    return jsonify(build_escalation_flow(start, end))


@app.route('/api/range')
def get_range():
    return jsonify({
        'min': df['datetime'].min().strftime('%Y-%m-%dT%H:%M:%S'),
        'max': df['datetime'].max().strftime('%Y-%m-%dT%H:%M:%S'),
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
