"""Generate POA golden cases for test/fixtures-poa.json. Dev-only, run once: python3 scripts/gen-poa-reference.py

Independent of public/js/calc.js where it matters: declination (Spencer 1971), extraterrestrial
irradiance, incidence angle, isotropic sky diffuse and ground-reflected diffuse all come from pvlib.
Shared with calc.js by design (the method in docs/NEXT.md task 2): Klein recommended day per month,
Collares-Pereira & Rabl / Liu-Jordan hourly apportioning of daily global and diffuse.
"""
import json, math
from pathlib import Path
import numpy as np
import pvlib

ROOT = Path(__file__).resolve().parent.parent
grid = json.loads((ROOT / 'public/data/ph-grid.json').read_text())
DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
KLEIN_DAY = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344]
STEP_H = 0.25
ALBEDO = 0.2

def cell_lookup(field, lat, lon):
    fi, fj = (lat - grid['lat0']) / grid['step'], (lon - grid['lon0']) / grid['step']
    i, j = int(fi), int(fj); ty, tx = fi - i, fj - j
    c = lambda a, b: np.array(grid[field][a * grid['nLon'] + b])
    return (1-ty)*(1-tx)*c(i,j) + (1-ty)*tx*c(i,j+1) + ty*(1-tx)*c(i+1,j) + ty*tx*c(i+1,j+1)

def poa_month(ghi, dif, tilt, azimuth, lat, month):
    n = KLEIN_DAY[month - 1]
    decl = float(pvlib.solarposition.declination_spencer71(n))
    phi = math.radians(lat)
    ws = math.acos(-math.tan(phi) * math.tan(decl))
    a = 0.409 + 0.5016 * math.sin(ws - math.pi / 3)
    b = 0.6609 - 0.4767 * math.sin(ws - math.pi / 3)
    hours = np.arange(-ws * 12 / math.pi + STEP_H / 2, ws * 12 / math.pi, STEP_H)  # solar hours from noon
    w = hours * math.pi / 12
    w = w[np.abs(w) < ws]
    den = math.sin(ws) - ws * math.cos(ws)
    rt = (math.pi / 24) * (a + b * np.cos(w)) * (np.cos(w) - math.cos(ws)) / den
    rd = (math.pi / 24) * (np.cos(w) - math.cos(ws)) / den
    rt, rd = rt / rt.sum(), rd / rd.sum()          # normalise so a day sums to the daily value
    I, Id = rt * ghi, rd * dif                       # kWh/m2 per step-weight; scale to kW/m2 below
    Ib = np.maximum(I - Id, 0)
    cosz = np.sin(decl) * np.sin(phi) + np.cos(decl) * np.cos(phi) * np.cos(w)
    zen = np.degrees(np.arccos(np.clip(cosz, -1, 1)))
    # compass solar azimuth (0 = north, clockwise) from hour angle
    sin_az = -np.cos(decl) * np.sin(w)
    cos_az = np.sin(decl) * np.cos(phi) - np.cos(decl) * np.sin(phi) * np.cos(w)
    saz = np.degrees(np.arctan2(sin_az, cos_az)) % 360
    proj = pvlib.irradiance.aoi_projection(tilt, 180 + azimuth, zen, saz)   # our 0=S -> pvlib 180=S
    rb = np.maximum(proj, 0) / np.maximum(cosz, math.cos(math.radians(85)))
    beam_t = Ib * rb
    sky = pvlib.irradiance.isotropic(tilt, Id)
    ground = pvlib.irradiance.get_ground_diffuse(tilt, I, albedo=ALBEDO)
    daily = float(np.sum(beam_t + sky + ground))    # rt, rd sum to 1, so this is kWh/m2/day
    return daily * DAYS[month - 1]

CASES = [  # name, lat, lon, tilt, azimuth (0 = south, 90 = west, -90 = east)
    ('Manila tilt 10 south', 14.6, 121.0, 10, 0),
    ('Manila tilt 15 east', 14.6, 121.0, 15, -90),
    ('Davao tilt 5 north', 7.1, 125.6, 5, 180),
    ('Laoag tilt 20 south', 18.2, 120.6, 20, 0),
]
out = []
for name, lat, lon, tilt, az in CASES:
    ghi, dif = cell_lookup('ghi', lat, lon), cell_lookup('dif', lat, lon)
    for month in (1, 7):
        out.append(dict(name=name, month=month, lat=lat, tilt=tilt, azimuth=az, days=DAYS[month-1],
                        ghi=round(float(ghi[month-1]), 3), dif=round(float(dif[month-1]), 3),
                        kwhPerM2=round(poa_month(ghi[month-1], dif[month-1], tilt, az, lat, month), 3)))
meta = dict(generator='scripts/gen-poa-reference.py', pvlib=pvlib.__version__, albedo=ALBEDO,
            note='ghi, dif in kWh/m2/day from public/data/ph-grid.json (2001-2020 NASA POWER); kwhPerM2 per month')
(ROOT / 'test/fixtures-poa.json').write_text(json.dumps(dict(meta=meta, cases=out), indent=1))
for c in out: print(c['name'], c['month'], c['ghi'], c['dif'], c['kwhPerM2'])
