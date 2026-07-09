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


# ---- V5 orbital simulator data -------------------------------------------
# Daily aggregation + storm catalog computed from omni_processed.csv at
# startup. Uses Python's round() (correctly-rounded) rather than np/pandas
# round: SYM-H daily minima land on x.x5 halfway values often enough that the
# rounding rule is visible in the output.

REGIME_BY_CODE = {-1: 'unknown', 0: 'slow', 1: 'fast', 2: 'cme'}


def _round(x, nd):
    return None if pd.isna(x) else round(float(x), nd)


def _regime_mode(codes):
    m = codes.mode()  # ties resolved by smallest code (mode() sorts)
    return REGIME_BY_CODE.get(int(m.iloc[0]), 'unknown') if len(m) else 'unknown'


def build_orbital_data():
    by_day = df.groupby(df['datetime'].dt.date)
    agg = pd.DataFrame({
        'v':     by_day['flow_speed_kms'].mean(),
        'n':     by_day['proton_density_ncc'].mean(),
        'B':     by_day['imf_mag_scalar_nT'].mean(),
        'Bz':    by_day['bz_gsm_nT'].mean(),
        'Kp':    by_day['kp'].max(),
        'Dst':   by_day['sym_h_nT'].min(),
        'Pdyn':  by_day['pdyn_computed_nPa'].mean(),
        'storm': by_day['storm_flag'].max(),
    })
    regimes = by_day['sw_type_code'].agg(_regime_mode)
    daily = [{
        't':      f'{day}T00:00:00Z',
        'v':      _round(row['v'], 1),
        'n':      _round(row['n'], 2),
        'B':      _round(row['B'], 1),
        'Bz':     _round(row['Bz'], 1),
        'Kp':     None if pd.isna(row['Kp']) else int(round(float(row['Kp']))),
        'Dst':    _round(row['Dst'], 1),
        'Pdyn':   _round(row['Pdyn'], 3),
        'storm':  0 if pd.isna(row['storm']) else int(row['storm']),
        'regime': regimes[day],
    } for day, row in agg.iterrows()]

    # Storm events: contiguous hourly runs of SYM-H < -50 nT lasting >= 3 h.
    # peak_* fields and sw_type are sampled at the SYM-H minimum hour.
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
    return daily, storms


ORBITAL_DAILY, ORBITAL_STORMS = build_orbital_data()


@app.route('/api/orbital/daily')
def get_orbital_daily():
    return jsonify(ORBITAL_DAILY)


@app.route('/api/orbital/storms')
def get_orbital_storms():
    return jsonify(ORBITAL_STORMS)


@app.route('/api/range')
def get_range():
    return jsonify({
        'min': df['datetime'].min().strftime('%Y-%m-%dT%H:%M:%S'),
        'max': df['datetime'].max().strftime('%Y-%m-%dT%H:%M:%S'),
    })


if __name__ == '__main__':
    app.run(debug=True, port=5000)
