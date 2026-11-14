"""Independent POA reference for test/fixtures-poa-perez.json (ticket #54). Dev-only:
    python3 -m pip install pvlib && python3 scripts/gen-poa-perez.py

test/fixtures-poa.json shares calc.js's mean-day hourly apportioning (Collares-Pereira and Rabl, Liu-Jordan) and its
isotropic sky, so it checks geometry, not the model. This reference shares neither:
- every day of the month, hour by hour (15-minute steps), not one mean day;
- the month's GHI spread over the hours in proportion to pvlib's Ineichen clear-sky GHI, then scaled to the monthly mean;
- beam and diffuse split per step by pvlib's Erbs model, diffuse then scaled to the monthly mean diffuse;
- sky diffuse on the tilted plane by Perez (1990), the usual reference model, and also isotropic for comparison.
Inputs are the grid's monthly means at three sites, written into the fixture so the test needs no grid lookup.
"""
import json
from pathlib import Path
import numpy as np
import pandas as pd
import pvlib

ROOT = Path(__file__).resolve().parent.parent
grid = json.loads((ROOT / 'public/data/ph-grid.json').read_text())
ALBEDO = 0.2
SITES = {'Manila': (14.6, 121.0), 'Laoag': (18.2, 120.6), 'Davao': (7.1, 125.6)}
TILTS = [5, 10, 20, 30]
FACINGS = {'south': 0, 'east': -90, 'west': 90}        # calc.js convention: 0 south, 90 west
MONTHS = [1, 4, 7, 10]
DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

def lookup(field, lat, lon):
    fi, fj = (lat - grid['lat0']) / grid['step'], (lon - grid['lon0']) / grid['step']
    i, j = int(fi), int(fj); ty, tx = fi - i, fj - j
    c = lambda a, b: np.array(grid[field][a * grid['nLon'] + b])
    return (1-ty)*(1-tx)*c(i, j) + (1-ty)*tx*c(i, j+1) + ty*(1-tx)*c(i+1, j) + ty*tx*c(i+1, j+1)

def month_poa(lat, lon, month, ghi_mean, dif_mean, tilt, az_calc):
    loc = pvlib.location.Location(lat, lon, tz='Asia/Manila')
    times = pd.date_range(f'2026-{month:02d}-01', periods=DAYS[month-1] * 96, freq='15min', tz='Asia/Manila') + pd.Timedelta('7min30s')
    sp = loc.get_solarposition(times)
    cs = loc.get_clearsky(times, model='ineichen', solar_position=sp)
    up = sp['apparent_zenith'] < 90
    dt = 0.25   # hours per step
    ghi = cs['ghi'].where(up, 0.0)
    ghi = ghi * (ghi_mean * DAYS[month-1] * 1000 / (ghi.sum() * dt))          # W/m2 so the month sums to the mean
    dni_extra = pvlib.irradiance.get_extra_radiation(times)
    erbs = pvlib.irradiance.erbs(ghi, sp['zenith'], times)
    dhi = erbs['dhi'].where(up, 0.0)
    dhi = (dhi * (dif_mean * DAYS[month-1] * 1000 / (dhi.sum() * dt))).clip(upper=ghi)
    cosz = np.cos(np.radians(sp['zenith'])).clip(lower=np.cos(np.radians(85)))
    dni = ((ghi - dhi) / cosz).where(up, 0.0)
    out = {}
    for model in ('perez', 'isotropic'):
        kw = dict(dni_extra=dni_extra, airmass=pvlib.atmosphere.get_relative_airmass(sp['apparent_zenith'])) if model == 'perez' else {}
        t = pvlib.irradiance.get_total_irradiance(tilt, 180 + az_calc, sp['apparent_zenith'], sp['azimuth'], dni, ghi, dhi,
                                                  albedo=ALBEDO, model=model, **kw)
        out[model] = float(t['poa_global'].fillna(0).sum() * dt / 1000)      # kWh/m2 for the month
    return out

cases = []
for site, (lat, lon) in SITES.items():
    g, d = lookup('ghi', lat, lon), lookup('dif', lat, lon)
    for m in MONTHS:
        for tilt in TILTS:
            for face, az in FACINGS.items():
                r = month_poa(lat, lon, m, g[m-1], d[m-1], tilt, az)
                cases.append({'site': site, 'lat': lat, 'month': m, 'tilt': tilt, 'facing': face, 'azimuth': az,
                              'ghi': round(float(g[m-1]), 4), 'dif': round(float(d[m-1]), 4),
                              'perez': round(r['perez'], 3), 'isotropic': round(r['isotropic'], 3)})
out = {'generated_by': 'scripts/gen-poa-perez.py', 'pvlib': pvlib.__version__, 'note': 'kWh/m2 per month, POA global', 'cases': cases}
(ROOT / 'test/fixtures-poa-perez.json').write_text(json.dumps(out, indent=1) + '\n')
print(f'{len(cases)} cases written, pvlib {pvlib.__version__}')
